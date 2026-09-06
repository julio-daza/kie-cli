import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { parseArgs } from "../src/args.js";
import { KieClient } from "../src/client.js";
import { GENERATE_BOOLEANS, runGenerate } from "../src/commands/generate.js";
import { runModels } from "../src/commands/misc.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { readLedger } from "../src/ledger.js";
import type { Output } from "../src/output.js";
import { makeStyle } from "../src/ui.js";

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
    mode: "json",
    style: makeStyle(false),
    stdout,
    stderr,
    success: (m) => stderr.push(m),
    endProgress: () => {},
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

/** Scripted KIE backend for audio/lipsync outputs: credits → createTask → success → mp3 download. */
function scriptedFetchAudio(opts: { balance?: number } = {}) {
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
      return json({ code: 200, data: { taskId: "task_audio0001" } });
    }
    if (url.includes("/jobs/recordInfo")) {
      polls++;
      if (polls === 1) return json({ code: 200, data: { taskId: "task_audio0001", model: "eleven-v2", state: "generating", progress: 40 } });
      return json({ code: 200, data: { taskId: "task_audio0001", model: "eleven-v2", state: "success", resultJson: JSON.stringify({ resultUrls: ["https://cdn.kie/out.mp3"] }), creditsConsumed: 3 } });
    }
    if (url === "https://cdn.kie/out.mp3") return new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), { status: 200, headers: { "content-type": "audio/mpeg" } });
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

test("audio flow: kie speak downloads an .mp3 and settles the ledger with kind audio", async () => {
  const f = scriptedFetchAudio();
  const output = capture();
  const args = parseArgs(["eleven-v2", "--text", "hola mundo", "--voice", "Rachel", "--max-credits", "5", "--out", join(dir, "media"), "--name", "greet", "--poll", "2"], GENERATE_BOOLEANS);
  const client = new KieClient({ apiKey: "k", fetchImpl: f.impl });
  const code = await runGenerate("audio", args, { client, config: { ...DEFAULT_CONFIG, pollSeconds: 0 }, output });

  assert.equal(code, 0);
  const result = output.stdout.at(-1) as { state: string; files: string[] };
  assert.equal(result.state, "success");
  assert.ok(result.files[0]!.endsWith("greet.mp3"));

  const ledger = readLedger();
  assert.deepEqual(ledger.map((e) => e.event), ["created", "completed"]);
  assert.equal(ledger[0]!.kind, "audio");
});

test("lipsync without --max-credits is blocked (no estimate available)", async () => {
  const f = scriptedFetchAudio();
  const output = capture();
  const args = parseArgs(["infinitalk", "--image", "https://x/a.png", "--audio", "https://x/a.mp3", "--prompt", "talk"], GENERATE_BOOLEANS);
  const code = await runGenerate("lipsync", args, { client: new KieClient({ apiKey: "k", fetchImpl: f.impl }), config: DEFAULT_CONFIG, output });
  assert.equal(code, 3);
  assert.match(output.stderr.join("\n"), /--max-credits/);
  assert.equal(f.urls.some((u) => u.endsWith("/jobs/createTask")), false);
});

test("wrong-kind check: an audio model rejected via `kie image`", async () => {
  const f = scriptedFetchAudio();
  const output = capture();
  const args = parseArgs(["eleven-v2", "--text", "x", "--voice", "Rachel"], GENERATE_BOOLEANS);
  const code = await runGenerate("image", args, { client: new KieClient({ apiKey: "k", fetchImpl: f.impl }), config: DEFAULT_CONFIG, output });
  assert.equal(code, 2);
  assert.match(output.stderr.join("\n"), /eleven-v2.*audio/);
  assert.match(output.stderr.join("\n"), /kie speak eleven-v2/);
});

test("wrong-kind check: a lipsync model rejected via `kie video`", async () => {
  const f = scriptedFetchAudio();
  const output = capture();
  const args = parseArgs(["infinitalk", "--image", "https://x/a.png", "--audio", "https://x/a.mp3", "--prompt", "talk"], GENERATE_BOOLEANS);
  const code = await runGenerate("video", args, { client: new KieClient({ apiKey: "k", fetchImpl: f.impl }), config: DEFAULT_CONFIG, output });
  assert.equal(code, 2);
  assert.match(output.stderr.join("\n"), /infinitalk.*lipsync/);
  assert.match(output.stderr.join("\n"), /kie lipsync infinitalk/);
});

test("kie models --kind audio lists only the two ElevenLabs TTS models", async () => {
  const output = capture();
  const args = parseArgs(["--kind", "audio"]);
  const code = await runModels(args, { client: () => { throw new Error("runModels must not touch the network"); }, config: DEFAULT_CONFIG, output });
  assert.equal(code, 0);
  const rows = output.stdout[0] as { name: string; kind: string }[];
  assert.deepEqual(rows.map((r) => r.name).sort(), ["eleven-turbo", "eleven-v2"]);
  for (const r of rows) assert.equal(r.kind, "audio");
});

test("kie models --kind lipsync lists only the three lipsync models", async () => {
  const output = capture();
  const args = parseArgs(["--kind", "lipsync"]);
  const code = await runModels(args, { client: () => { throw new Error("runModels must not touch the network"); }, config: DEFAULT_CONFIG, output });
  assert.equal(code, 0);
  const rows = output.stdout[0] as { name: string; kind: string }[];
  assert.deepEqual(rows.map((r) => r.name).sort(), ["infinitalk", "kling-avatar", "volcengine-lipsync"]);
  for (const r of rows) assert.equal(r.kind, "lipsync");
});

test("--dry-run: kie speak eleven-v2 sends nothing and prints the expected request", async () => {
  const f = scriptedFetchAudio();
  const output = capture();
  const args = parseArgs(["eleven-v2", "--text", "hola mundo", "--voice", "Rachel", "--dry-run"], GENERATE_BOOLEANS);
  const code = await runGenerate("audio", args, { client: new KieClient({ apiKey: "k", fetchImpl: f.impl }), config: DEFAULT_CONFIG, output });
  assert.equal(code, 0);
  assert.equal(f.urls.some((u) => u.endsWith("/jobs/createTask")), false);
  const result = output.stdout[0] as { dryRun: boolean; request: { model: string; input: Record<string, unknown> } };
  assert.equal(result.dryRun, true);
  assert.equal(result.request.model, "elevenlabs/text-to-speech-multilingual-v2");
  assert.deepEqual(Object.keys(result.request.input).sort(), ["text", "voice"]);
});

test("--dry-run: kie lipsync infinitalk sends nothing and prints the expected request", async () => {
  const f = scriptedFetchAudio();
  const output = capture();
  const args = parseArgs(
    ["infinitalk", "--image", "https://x/a.png", "--audio", "https://x/a.mp3", "--prompt", "talk", "--max-credits", "50", "--dry-run"],
    GENERATE_BOOLEANS,
  );
  const code = await runGenerate("lipsync", args, { client: new KieClient({ apiKey: "k", fetchImpl: f.impl }), config: DEFAULT_CONFIG, output });
  assert.equal(code, 0);
  assert.equal(f.urls.some((u) => u.endsWith("/jobs/createTask")), false);
  const result = output.stdout[0] as { dryRun: boolean; request: { model: string; input: Record<string, unknown> } };
  assert.equal(result.dryRun, true);
  assert.equal(result.request.model, "infinitalk/from-audio");
  assert.deepEqual(Object.keys(result.request.input).sort(), ["audio_url", "image_url", "prompt", "resolution"]);
  assert.equal(result.request.input.resolution, "480p");
});
