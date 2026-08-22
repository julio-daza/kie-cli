import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Writes the `kie mcp` server into each desktop app's MCP configuration.
 * Uses the absolute Node binary + absolute script path because GUI apps do not inherit the
 * shell PATH (nvm, volta, homebrew…), which is the #1 reason local MCP servers fail to start.
 */
export type App = "claude" | "codex" | "cursor";
export const APPS: App[] = ["claude", "codex", "cursor"];
export const APP_LABEL: Record<App, string> = { claude: "Claude Desktop", codex: "Codex", cursor: "Cursor" };

export interface ServerSpec {
  command: string;
  args: string[];
}

/** The exact process a desktop app must spawn to get this very installation of kie. */
export function serverSpec(execPath = process.execPath, entry?: string): ServerSpec {
  const script = entry ?? resolve(fileURLToPath(new URL("../index.js", import.meta.url)));
  return { command: execPath, args: [script, "mcp"] };
}

export function configPath(app: App, home = homedir(), os = platform(), env: NodeJS.ProcessEnv = process.env): string {
  switch (app) {
    case "claude":
      if (os === "darwin") return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
      if (os === "win32") return join(env.APPDATA ?? join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
      return join(home, ".config", "Claude", "claude_desktop_config.json");
    case "codex":
      return join(home, ".codex", "config.toml");
    case "cursor":
      return join(home, ".cursor", "mcp.json");
  }
}

/** Merge into a JSON file with a `mcpServers` map (Claude Desktop, Cursor). */
export function mergeJsonConfig(existing: string | null, spec: ServerSpec): string {
  let doc: Record<string, unknown> = {};
  if (existing && existing.trim()) {
    try {
      doc = JSON.parse(existing) as Record<string, unknown>;
    } catch {
      throw new Error("Existing config is not valid JSON; fix it or remove it first.");
    }
  }
  const servers = (doc.mcpServers && typeof doc.mcpServers === "object" ? doc.mcpServers : {}) as Record<string, unknown>;
  servers.kie = { command: spec.command, args: spec.args };
  doc.mcpServers = servers;
  return JSON.stringify(doc, null, 2) + "\n";
}

/** Replace or append the `[mcp_servers.kie]` table in Codex's TOML config. */
export function mergeTomlConfig(existing: string | null, spec: ServerSpec): string {
  const q = (s: string) => JSON.stringify(s); // TOML basic strings share JSON escaping for our purposes
  const block = `[mcp_servers.kie]\ncommand = ${q(spec.command)}\nargs = [${spec.args.map(q).join(", ")}]\n`;
  const src = existing ?? "";
  const re = /(^|\n)\[mcp_servers\.kie\]\n(?:(?!\[)[^\n]*\n?)*/;
  if (re.test(src)) return src.replace(re, (_m, lead: string) => `${lead}${block}`);
  const sep = src.length === 0 || src.endsWith("\n\n") ? "" : src.endsWith("\n") ? "\n" : "\n\n";
  return `${src}${sep}${block}`;
}

export interface InstallResult {
  app: App;
  path: string;
  status: "written";
}

export function installMcp(apps: App[], spec: ServerSpec, home = homedir()): InstallResult[] {
  const results: InstallResult[] = [];
  for (const app of apps) {
    const path = configPath(app, home);
    const existing = existsSync(path) ? readFileSync(path, "utf8") : null;
    const next = app === "codex" ? mergeTomlConfig(existing, spec) : mergeJsonConfig(existing, spec);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, next, { mode: 0o600 });
    results.push({ app, path, status: "written" });
  }
  return results;
}
