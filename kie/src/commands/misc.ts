import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { createInterface } from "node:readline";
import { str, type ParsedArgs } from "../args.js";
import { MODELS } from "../catalog.js";
import type { KieClient } from "../client.js";
import { configDir, loadConfig, saveConfig, type KieConfig } from "../config.js";
import { deleteKey, mask, resolveKey, storeKey } from "../keystore.js";
import { ledgerPath, readLedger, spentToday } from "../ledger.js";
import type { Output } from "../output.js";

interface Deps {
  client: () => KieClient; // lazy: key commands must work without a key
  config: KieConfig;
  output: Output;
}

export async function runCredits(_args: ParsedArgs, deps: Deps): Promise<number> {
  const balance = await deps.client().credits();
  const spent = spentToday(readLedger());
  deps.output.json({ balance, spentToday: spent, dailyBudget: deps.config.dailyBudget, remainingToday: Math.max(0, deps.config.dailyBudget - spent) }, { kind: "credits" });
  return 0;
}

export async function runModels(args: ParsedArgs, deps: Deps): Promise<number> {
  const kind = str(args.flags, "kind");
  const rows = MODELS.filter((m) => !kind || m.kind === kind).map((m) => ({ name: m.name, kind: m.kind, label: m.label, supports: m.supports, docs: m.docs, notes: m.notes }));
  deps.output.json(rows, { kind: "models" });
  return 0;
}

export async function runUpload(args: ParsedArgs, deps: Deps): Promise<number> {
  const file = args.positionals[0];
  if (!file) {
    deps.output.error("Usage: kie upload <local-file>   (returns a temporary public URL usable as --ref/--image)");
    return 2;
  }
  const bytes = readFileSync(file);
  const ext = extname(file).toLowerCase();
  const type: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".wav": "audio/wav" };
  const url = await deps.client().upload(new Uint8Array(bytes), basename(file), type[ext] ?? "application/octet-stream");
  deps.output.json({ url, note: "KIE deletes uploaded files after ~3 days." }, { kind: "upload" });
  return 0;
}

export async function runLedger(args: ParsedArgs, deps: Deps): Promise<number> {
  const limit = Number(str(args.flags, "limit") ?? 20);
  const entries = readLedger();
  deps.output.json({ path: ledgerPath(), spentToday: spentToday(entries), entries: entries.slice(-limit) }, { kind: "ledger" });
  return 0;
}

async function readSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return new Promise((resolve) => {
      let data = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (c) => (data += c));
      process.stdin.on("end", () => resolve(data));
    });
  }
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    // Mute echo: readline writes the prompt, we swallow the typed characters.
    const mutable = rl as unknown as { _writeToOutput: (s: string) => void };
    const original = mutable._writeToOutput.bind(rl);
    mutable._writeToOutput = (s: string) => {
      if (s.includes(prompt)) original(prompt);
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stderr.write("\n");
      resolve(answer);
    });
  });
}

export async function runKey(args: ParsedArgs, deps: Deps): Promise<number> {
  const sub = args.positionals[0];
  switch (sub) {
    case "set": {
      const value = await readSecret("Paste your KIE API key (input hidden): ");
      const where = storeKey(value);
      deps.output.success(`Key stored in ${where === "keychain" ? "macOS Keychain (service kie-cli)" : `${configDir()}/key (0600)`}.`);
      deps.output.info("Recommended: at https://kie.ai/api-key set hourly/daily caps and an IP whitelist for this key.");
      return 0;
    }
    case "check": {
      const { key, source } = resolveKey();
      let ok = false;
      let balance: number | null = null;
      try {
        balance = await deps.client().credits();
        ok = true;
      } catch {
        ok = false;
      }
      deps.output.json({ source, key: mask(key), valid: ok, balance }, { kind: "key" });
      return ok ? 0 : 1;
    }
    case "delete": {
      const removed = deleteKey();
      deps.output.json({ removed });
      return 0;
    }
    default:
      deps.output.error("Usage: kie key <set|check|delete>");
      return 2;
  }
}

export async function runConfig(args: ParsedArgs, deps: Deps): Promise<number> {
  const [sub, key, value] = args.positionals;
  const config = loadConfig();
  if (sub === "get" || sub === undefined) {
    deps.output.json({ path: `${configDir()}/config.json`, ...config }, { kind: "config" });
    return 0;
  }
  if (sub === "set" && key && value !== undefined) {
    if (!(key in config)) {
      deps.output.error(`Unknown setting "${key}". Settings: ${Object.keys(config).join(", ")}`);
      return 2;
    }
    const current = (config as unknown as Record<string, unknown>)[key];
    const next: unknown = typeof current === "number" ? Number(value) : value;
    if (typeof current === "number" && !Number.isFinite(next as number)) {
      deps.output.error(`${key} must be a number.`);
      return 2;
    }
    (config as unknown as Record<string, unknown>)[key] = next;
    const path = saveConfig(config);
    deps.output.json({ path, [key]: next });
    return 0;
  }
  deps.output.error("Usage: kie config [get] | kie config set <key> <value>");
  return 2;
}
