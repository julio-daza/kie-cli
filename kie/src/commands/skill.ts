import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bool, str, type ParsedArgs } from "../args.js";
import type { Output } from "../output.js";

/**
 * `kie skill` — installs the bundled `kie-media` agent skill where coding agents look for it:
 *   claude → ~/.claude/skills/kie-media   (project: ./.claude/skills/kie-media)
 *   codex  → ~/.agents/skills/kie-media   (project: ./.agents/skills/kie-media)
 *   cursor → ~/.cursor/skills/kie-media   (project: ./.cursor/skills/kie-media)
 *   gemini → ~/.gemini/skills/kie-media   (project: ./.gemini/skills/kie-media)
 * Codex, Cursor and Gemini CLI all read ~/.agents/skills too, so `--agent codex` alone already
 * covers the three; the explicit folders exist for people who only use one of them.
 * The skill ships inside the npm package (skills/kie-media), so no network is needed.
 */
export type Agent = "claude" | "codex" | "cursor" | "gemini";
export const AGENTS: Agent[] = ["claude", "codex", "cursor", "gemini"];
export const AGENT_LABEL: Record<Agent, string> = { claude: "Claude Code", codex: "Codex", cursor: "Cursor", gemini: "Gemini CLI" };
const AGENT_DIR: Record<Agent, string> = { claude: ".claude", codex: ".agents", cursor: ".cursor", gemini: ".gemini" };
export const SKILL_NAME = "kie-media";

interface Deps {
  output: Output;
  /** Overridable for tests. */
  home?: string;
  cwd?: string;
  source?: string;
}

/** Where the bundled skill lives relative to this file (dist/src/commands → package root). */
export function bundledSkillDir(): string {
  return resolve(fileURLToPath(new URL("../../../skills/" + SKILL_NAME + "/", import.meta.url)));
}

export function targetDir(agent: Agent, scope: "global" | "project", home: string, cwd: string): string {
  const base = scope === "global" ? home : cwd;
  return join(base, AGENT_DIR[agent], "skills", SKILL_NAME);
}

function parseAgents(value: string | undefined): Agent[] {
  if (!value || value === "all" || value === "both") return AGENTS;
  const picked = value.split(",").map((s) => s.trim()) as Agent[];
  for (const a of picked) if (!AGENTS.includes(a)) throw new Error(`--agent must be one of: ${[...AGENTS, "all"].join(", ")} (got "${a}")`);
  return picked;
}

export async function runSkill(args: ParsedArgs, deps: Deps): Promise<number> {
  const { output } = deps;
  const sub = args.positionals[0];
  const source = deps.source ?? bundledSkillDir();
  const skillFile = join(source, "SKILL.md");

  if (!existsSync(skillFile)) {
    output.error(`Bundled skill not found at ${source}. Reinstall @uxdata-co/kie.`);
    return 5;
  }

  switch (sub) {
    case "install": {
      const agents = parseAgents(str(args.flags, "agent"));
      const scope = bool(args.flags, "project") ? "project" : "global";
      const force = bool(args.flags, "force");
      const home = deps.home ?? homedir();
      const cwd = deps.cwd ?? process.cwd();
      const results: { agent: Agent; path: string; status: "installed" | "updated" | "skipped" }[] = [];

      for (const agent of agents) {
        const dest = targetDir(agent, scope, home, cwd);
        const exists = existsSync(dest) || isDanglingSymlink(dest);
        if (exists && !force) {
          results.push({ agent, path: dest, status: "skipped" });
          continue;
        }
        if (exists) rmSync(dest, { recursive: true, force: true });
        mkdirSync(resolve(dest, ".."), { recursive: true });
        cpSync(source, dest, { recursive: true });
        results.push({ agent, path: dest, status: exists ? "updated" : "installed" });
      }

      output.json({ skill: SKILL_NAME, scope, results }, { kind: "skill" });
      const skipped = results.filter((r) => r.status === "skipped");
      if (skipped.length) output.info(`Already present: ${skipped.map((r) => r.agent).join(", ")}. Re-run with --force to overwrite.`);
      const done = results.filter((r) => r.status !== "skipped");
      if (done.length) output.success(`Skill ready. Start a new ${done.map((r) => AGENT_LABEL[r.agent]).join(" / ")} session and ask for an image.`);
      return 0;
    }
    case "path":
      output.json({ source, targets: Object.fromEntries(AGENTS.map((a) => [a, targetDir(a, "global", deps.home ?? homedir(), deps.cwd ?? process.cwd())])) });
      return 0;
    case "show":
      process.stdout.write(readFileSync(skillFile, "utf8"));
      return 0;
    default:
      output.error("Usage: kie skill install [--agent claude|codex|cursor|gemini|all] [--project] [--force] | kie skill path | kie skill show");
      return 2;
  }
}

function isDanglingSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}
