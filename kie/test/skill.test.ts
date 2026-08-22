import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { parseArgs } from "../src/args.js";
import { bundledSkillDir, runSkill, targetDir } from "../src/commands/skill.js";
import type { Output } from "../src/output.js";
import { makeStyle } from "../src/ui.js";

let home: string;
let source: string;

function capture(): Output & { stdout: unknown[]; stderr: string[] } {
  const stdout: unknown[] = [];
  const stderr: string[] = [];
  return {
    mode: "json",
    style: makeStyle(false),
    stdout,
    stderr,
    json: (v) => stdout.push(v),
    info: (m) => stderr.push(m),
    warn: (m) => stderr.push(m),
    error: (m) => stderr.push("error: " + m),
    success: (m) => stderr.push(m),
    progress: () => {},
    endProgress: () => {},
  };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "kie-skill-home-"));
  source = mkdtempSync(join(tmpdir(), "kie-skill-src-"));
  writeFileSync(join(source, "SKILL.md"), "---\nname: kie-media\ndescription: test\n---\nbody\n");
  mkdirSync(join(source, "references"));
  writeFileSync(join(source, "references", "kie-api.md"), "# api\n");
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(source, { recursive: true, force: true });
});

test("the bundled skill ships with the package", () => {
  assert.ok(existsSync(join(bundledSkillDir(), "SKILL.md")), bundledSkillDir());
  assert.match(readFileSync(join(bundledSkillDir(), "SKILL.md"), "utf8"), /^---\nname: kie-media/);
});

test("targets follow each agent's convention", () => {
  assert.equal(targetDir("claude", "global", "/h", "/p"), "/h/.claude/skills/kie-media");
  assert.equal(targetDir("codex", "global", "/h", "/p"), "/h/.agents/skills/kie-media");
  assert.equal(targetDir("claude", "project", "/h", "/p"), "/p/.claude/skills/kie-media");
  assert.equal(targetDir("codex", "project", "/h", "/p"), "/p/.agents/skills/kie-media");
  assert.equal(targetDir("cursor", "global", "/h", "/p"), "/h/.cursor/skills/kie-media");
  assert.equal(targetDir("gemini", "global", "/h", "/p"), "/h/.gemini/skills/kie-media");
});

test("install copies SKILL.md + references for all four agents by default", async () => {
  const output = capture();
  const code = await runSkill(parseArgs(["install"], new Set(["project", "force"])), { output, home, cwd: home, source });
  assert.equal(code, 0);
  for (const dir of [".claude", ".agents", ".cursor", ".gemini"]) {
    assert.ok(existsSync(join(home, dir, "skills", "kie-media", "SKILL.md")));
    assert.ok(existsSync(join(home, dir, "skills", "kie-media", "references", "kie-api.md")));
  }
  const res = output.stdout[0] as { results: { status: string }[] };
  assert.deepEqual(res.results.map((r) => r.status), ["installed", "installed", "installed", "installed"]);
});

test("install skips existing targets unless --force, and honours --agent", async () => {
  const output = capture();
  await runSkill(parseArgs(["install", "--agent", "codex"], new Set(["project", "force"])), { output, home, cwd: home, source });
  assert.equal(existsSync(join(home, ".claude")), false);
  writeFileSync(join(home, ".agents", "skills", "kie-media", "SKILL.md"), "old");

  const again = capture();
  await runSkill(parseArgs(["install", "--agent", "codex"], new Set(["project", "force"])), { output: again, home, cwd: home, source });
  assert.equal((again.stdout[0] as { results: { status: string }[] }).results[0]!.status, "skipped");
  assert.equal(readFileSync(join(home, ".agents", "skills", "kie-media", "SKILL.md"), "utf8"), "old");

  const forced = capture();
  await runSkill(parseArgs(["install", "--agent", "codex", "--force"], new Set(["project", "force"])), { output: forced, home, cwd: home, source });
  assert.equal((forced.stdout[0] as { results: { status: string }[] }).results[0]!.status, "updated");
  assert.match(readFileSync(join(home, ".agents", "skills", "kie-media", "SKILL.md"), "utf8"), /^---/);
});

test("--project installs into the current directory and bad --agent is rejected", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "kie-skill-proj-"));
  const output = capture();
  await runSkill(parseArgs(["install", "--project", "--agent", "claude"], new Set(["project", "force"])), { output, home, cwd, source });
  assert.ok(existsSync(join(cwd, ".claude", "skills", "kie-media", "SKILL.md")));
  rmSync(cwd, { recursive: true, force: true });
  await assert.rejects(runSkill(parseArgs(["install", "--agent", "windsurf"], new Set()), { output, home, cwd: home, source }), /--agent must be one of/);
});
