#!/usr/bin/env node
import { parseArgs } from "./args.js";
import { KieClient, KieError } from "./client.js";
import { loadConfig } from "./config.js";
import { GENERATE_BOOLEANS, runGenerate, runRaw } from "./commands/generate.js";
import { runConfig, runCredits, runKey, runLedger, runModels, runUpload } from "./commands/misc.js";
import { runSkill } from "./commands/skill.js";
import { runStatus, runWait } from "./commands/tasks.js";
import { redact, resolveKey } from "./keystore.js";
import { out, type Mode } from "./output.js";
import { banner, makeStyle, colorsEnabled } from "./ui.js";

const VERSION = "0.5.1";

const HELP = `Usage:
  kie key set|check|delete                     Store the API key (macOS Keychain / 0600 file)
  kie credits                                  Balance + today's spend vs daily budget
  kie models [--kind image|video]              Curated catalog (JSON)
  kie image <model> --prompt "..." [opts]      Generate an image, wait, download
  kie video <model> --prompt "..." [opts]      Generate a video, wait, download
  kie run <model-id> --input '{json}' --max-credits N   Any Market model (escape hatch)
  kie status <taskId>                          One poll, no download
  kie wait <taskId> [--out dir]                Poll until done, download, settle ledger
  kie upload <file>                            Upload a local file → temporary URL for --ref/--image
  kie ledger [--limit 20]                      Local spend log (real creditsConsumed)
  kie config [get] | config set <key> <value>  dailyBudget, maxCreditsPerTask, outDir, pollSeconds, waitTimeoutSeconds
  kie skill install [--agent claude|codex|cursor|gemini|all] [--project] [--force]
                                               Install the kie-media agent skill (Claude Code, Codex, Cursor, Gemini CLI)

Generation options:
  --prompt <text>        --ref <url> (repeatable)   --image <url>   --end-image <url>
  --aspect 16:9          --resolution 1K|2K|4K|720p  --duration <s>  --sound   --fast
  --format png|jpg       --set key=value (repeatable, raw model field)
  --out <dir>            --name <base>   --no-wait   --timeout <s>   --poll <s>   --no-download
  --max-credits <n>      Accept spending up to n credits on this task (required when no estimate)
  --dry-run              Print the exact request, send nothing
  --quiet                Suppress progress on stderr
  --json                 Force machine output (default when stdout is not a terminal)
  --pretty / --no-color  Force human output / disable colors (NO_COLOR is honoured too)

Output contract: pretty tables in a terminal; JSON on stdout + messages on stderr when piped or with --json.
Exit codes: 0 ok · 1 task failed · 2 usage · 3 blocked by spend guard · 4 timed out · 5 API/auth error
`;

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv, new Set([...GENERATE_BOOLEANS, "no-download", "help", "version", "color", "no-color", "pretty", "project", "force"]));
  const command = args.positionals.shift();
  const color = args.flags["no-color"] || args.flags.color === false ? false : undefined;
  const mode: Mode | undefined = args.flags.json ? "json" : args.flags.pretty ? "pretty" : undefined;
  if (!command || command === "help" || args.flags.help) {
    const pretty = mode === "pretty" || (mode !== "json" && process.stdout.isTTY);
    if (pretty) process.stdout.write("\n" + banner(makeStyle(color ?? colorsEnabled(process.stdout)), VERSION) + "\n");
    process.stdout.write(HELP);
    return 0;
  }
  if (command === "version" || args.flags.version) {
    process.stdout.write(`kie ${VERSION}\n`);
    return 0;
  }

  const config = loadConfig();
  let key: string | null = null;
  const output = out({ redact: (s) => redact(s, key), quiet: Boolean(args.flags.quiet), mode, color });

  // Commands that must work without a key.
  if (command === "skill") return runSkill(args, { output });
  if (command === "key" || command === "config" || command === "models") {
    const lazy = () => {
      key = resolveKey().key;
      return new KieClient({ apiKey: key });
    };
    if (command === "key") return runKey(args, { client: lazy, config, output });
    if (command === "config") return runConfig(args, { client: lazy, config, output });
    return runModels(args, { client: lazy, config, output });
  }

  key = resolveKey().key;
  const client = new KieClient({ apiKey: key });
  const deps = { client, config, output };
  const lazyDeps = { client: () => client, config, output };

  switch (command) {
    case "credits":
      return runCredits(args, lazyDeps);
    case "image":
      return runGenerate("image", args, deps);
    case "video":
      return runGenerate("video", args, deps);
    case "run":
      return runRaw(args, deps);
    case "status":
      return runStatus(args, deps);
    case "wait":
      return runWait(args, deps);
    case "upload":
      return runUpload(args, lazyDeps);
    case "ledger":
      return runLedger(args, lazyDeps);
    default:
      output.error(`Unknown command "${command}". Run \`kie help\`.`);
      return 2;
  }
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    // The key is never part of error messages we build, but redact defensively anyway.
    const safe = message.replace(/Bearer\s+\S+/g, "Bearer [REDACTED]");
    process.stderr.write(`error: ${safe}\n`);
    process.exit(err instanceof KieError ? 5 : 2);
  });
