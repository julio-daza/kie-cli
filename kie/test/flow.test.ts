import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { parseArgs } from "../src/args.js";
import { KieClient } from "../src/client.js";
import { GENERATE_BOOLEANS, runGenerate } from "../src/commands/generate.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { readLedger } from "../src/ledger.js";
import type { Output } from "../src/output.js";

let dir: string;
const saved = { ...process.env };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kie-flow-"));
  process.env.KIE_CONFIG_DIR = dir;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

function capture(): Output & { stdout: unknown[]; stderr: string[] } {
  const stdout: unknown[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    json: (v) => stdout.push(v),
    info: (m) => stderr.push(m),
    warn: (m) => stderr.push("warning: " + m),
    error: (m) => stderr.push("error: " + m),
    progress: (m) => stderr.push(m),
  };
}

/** Scripted KIE backend: credits → createTask → generating → success → binary download. */
function scriptedFetch(opts: { balance?: number; failTask?: boolean } = {}) {
  const urls: string[] = [];
  let polls = 0;
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    urls.push(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.endsWith("/chat/credit")) return json({ code: 200, data: opts.balance ?? 500 });
    if (url.endsWith("/jobs/createTask")) {
      const body = JSON.parse(init.body as string);
      assert.equal("callBackUrl" in body, false);
      return json({ code: 200, data: { taskId: "task_abc12345" } });
    }
    if (url.includes("/jobs/recordInfo")) {
      polls++;
      if (polls === 1) return json({ code: 200, data: { taskId: "task_abc12345", model: "nano-banana-2", state: "generating", progress: 40 } });
      if (opts.failTask) return json({ code: 200, data: { taskId: "task_abc12345", model: "nano-banana-2", state: "fail", failMsg: "content policy", creditsConsumed: 0 } });
      return json({ code: 200, data: { taskId: "task_abc12345", model: "nano-banana-2", state: "success", resultJson: JSON.stringify({ resultUrls: ["https://cdn.kie/out.png"] }), creditsConsumed: 8 } });
    }
    if (url === "https://cdn.kie/out.png") return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200, headers: { "content-type": "image/png" } });
    throw new Error(`unexpected URL ${url}`);
  }) as typeof fetch;
  return { impl, urls };
}

test("image flow: guard passes, task created, polled, downloaded, ledger settled with real credits", async () => {
  const f = scriptedFetch();
  const output = capture();
  const args = parseArgs(["nano-banana-2", "--prompt", "a cat", "--out", join(dir, "media"), "--name", "cat", "--poll", "2"], GENERATE_BOOLEANS);
  const client = new KieClient({ apiKey: "k", fetchImpl: f.impl });
  const code = await runGenerate("image", args, { client, config: { ...DEFAULT_CONFIG, pollSeconds: 0 }, output });

  assert.equal(code, 0);
  const result = output.stdout.at(-1) as { state: string; files: string[]; creditsConsumed: number };
  assert.equal(result.state, "success");
  assert.equal(result.creditsConsumed, 8);
  assert.equal(result.files.length, 1);
  assert.ok(result.files[0]!.endsWith("cat.png"));
  assert.ok(existsSync(result.files[0]!));
  assert.equal(readFileSync(result.files[0]!).length, 4);

  // Only KIE hosts were contacted.
  for (const u of f.urls) assert.match(u, /^https:\/\/(api\.kie\.ai|cdn\.kie)\//);

  const ledger = readLedger();
  assert.deepEqual(ledger.map((e) => e.event), ["created", "completed"]);
  assert.equal(ledger[1]!.credits, 8);
});

test("spend guard blocks before anything is sent when the daily budget is exhausted", async () => {
  const f = scriptedFetch();
  const output = capture();
  const args = parseArgs(["nano-banana-2", "--prompt", "a cat"], GENERATE_BOOLEANS);
  const client = new KieClient({ apiKey: "k", fetchImpl: f.impl });
  const code = await runGenerate("image", args, { client, config: { ...DEFAULT_CONFIG, dailyBudget: 5 }, output });
  assert.equal(code, 3);
  assert.equal(f.urls.some((u) => u.endsWith("/jobs/createTask")), false);
  assert.equal(readLedger().length, 0);
});

test("video without --max-credits is blocked (no estimate available)", async () => {
  const f = scriptedFetch();
  const output = capture();
  const args = parseArgs(["kling-3.0", "--prompt", "a drone shot"], GENERATE_BOOLEANS);
  const code = await runGenerate("video", args, { client: new KieClient({ apiKey: "k", fetchImpl: f.impl }), config: DEFAULT_CONFIG, output });
  assert.equal(code, 3);
  assert.match(output.stderr.join("\n"), /--max-credits/);
  assert.equal(f.urls.some((u) => u.endsWith("/jobs/createTask")), false);
});

test("failed task is settled in the ledger at its real (zero) cost and exits 1", async () => {
  const f = scriptedFetch({ failTask: true });
  const output = capture();
  const args = parseArgs(["nano-banana-2", "--prompt", "x", "--poll", "2"], GENERATE_BOOLEANS);
  const code = await runGenerate("image", args, { client: new KieClient({ apiKey: "k", fetchImpl: f.impl }), config: DEFAULT_CONFIG, output });
  assert.equal(code, 1);
  const ledger = readLedger();
  assert.equal(ledger.at(-1)!.event, "failed");
  assert.equal(ledger.at(-1)!.credits, 0);
});

test("--dry-run sends nothing", async () => {
  const f = scriptedFetch();
  const output = capture();
  const args = parseArgs(["nano-banana-2", "--prompt", "x", "--dry-run"], GENERATE_BOOLEANS);
  const code = await runGenerate("image", args, { client: new KieClient({ apiKey: "k", fetchImpl: f.impl }), config: DEFAULT_CONFIG, output });
  assert.equal(code, 0);
  assert.equal(f.urls.length, 0);
  assert.equal((output.stdout[0] as { dryRun: boolean }).dryRun, true);
});
