import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { KieClient } from "../src/client.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { configPath, installMcp, mergeJsonConfig, mergeTomlConfig, serverSpec } from "../src/mcp/install.js";
import { ERR, LineParser, serialize } from "../src/mcp/protocol.js";
import { createMcpServer } from "../src/mcp/server.js";

let dir: string;
const saved = { ...process.env };
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kie-mcp-"));
  process.env.KIE_CONFIG_DIR = dir;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

/** Same scripted KIE backend as the flow tests. */
function scriptedFetch(opts: { balance?: number } = {}) {
  const urls: string[] = [];
  let polls = 0;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    urls.push(url);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    if (url.endsWith("/chat/credit")) return json({ code: 200, data: opts.balance ?? 500 });
    if (url.endsWith("/jobs/createTask")) {
      assert.equal("callBackUrl" in JSON.parse(init.body as string), false);
      return json({ code: 200, data: { taskId: "task_mcp00001" } });
    }
    if (url.includes("/jobs/recordInfo")) {
      polls++;
      if (polls === 1) return json({ code: 200, data: { taskId: "task_mcp00001", model: "nano-banana-2", state: "generating" } });
      return json({ code: 200, data: { taskId: "task_mcp00001", model: "nano-banana-2", state: "success", resultJson: JSON.stringify({ resultUrls: ["https://cdn.kie/out.png"] }), creditsConsumed: 8 } });
    }
    if (url === "https://cdn.kie/out.png") return new Response(png, { status: 200, headers: { "content-type": "image/png" } });
    throw new Error(`unexpected URL ${url}`);
  }) as typeof fetch;
  return { impl, urls };
}

function server(opts: { balance?: number; config?: typeof DEFAULT_CONFIG } = {}) {
  const f = scriptedFetch(opts);
  const s = createMcpServer({ client: new KieClient({ apiKey: "k", fetchImpl: f.impl }), config: opts.config ?? { ...DEFAULT_CONFIG, pollSeconds: 0 }, version: "test" });
  return { s, f };
}

const req = (id: number, method: string, params?: unknown) => ({ jsonrpc: "2.0" as const, id, method, params });

test("protocol: line parser handles partial chunks, blank lines and bad JSON", () => {
  const p = new LineParser();
  assert.deepEqual(p.push('{"jsonrpc":"2.0","id":1,"me'), []);
  const out = p.push('thod":"ping"}\n\n{not json}\n{"jsonrpc":"1.0","method":"x"}\n');
  assert.equal(out[0]!.message?.method, "ping");
  assert.equal(out[1]!.error?.error?.code, ERR.PARSE);
  assert.equal(out[2]!.error?.error?.code, ERR.INVALID_REQUEST);
  assert.ok(serialize(req(1, "ping")).endsWith("\n"));
});

test("initialize negotiates a supported protocol version and advertises tools", async () => {
  const { s } = server();
  const res = await s.handle(req(1, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } }));
  const r = res!.result as { protocolVersion: string; capabilities: { tools: unknown }; serverInfo: { name: string }; instructions: string };
  assert.equal(r.protocolVersion, "2025-03-26");
  assert.equal(r.serverInfo.name, "kie");
  assert.ok(r.capabilities.tools);
  assert.match(r.instructions, /max_credits/);
  const unknown = await s.handle(req(2, "initialize", { protocolVersion: "1999-01-01" }));
  assert.equal((unknown!.result as { protocolVersion: string }).protocolVersion, "2025-06-18");
  assert.equal(await s.handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  assert.deepEqual((await s.handle(req(3, "ping")))!.result, {});
});

test("tools/list exposes the kie tools with JSON schemas; video requires max_credits", async () => {
  const { s } = server();
  const r = (await s.handle(req(1, "tools/list")))!.result as { tools: { name: string; inputSchema: { required?: string[] } }[] };
  const names = r.tools.map((t) => t.name);
  assert.deepEqual(names, ["kie_credits", "kie_models", "kie_generate_image", "kie_generate_video", "kie_task_status", "kie_wait_task", "kie_upload", "kie_ledger"]);
  assert.ok(r.tools.find((t) => t.name === "kie_generate_video")!.inputSchema.required!.includes("max_credits"));
});

test("unknown method and unknown tool are JSON-RPC errors", async () => {
  const { s } = server();
  assert.equal((await s.handle(req(1, "resources/list")))!.error!.code, ERR.METHOD_NOT_FOUND);
  assert.equal((await s.handle(req(2, "tools/call", { name: "nope", arguments: {} })))!.error!.code, ERR.INVALID_PARAMS);
});

test("kie_credits returns balance + budget as text", async () => {
  const { s } = server({ balance: 321 });
  const r = (await s.handle(req(1, "tools/call", { name: "kie_credits", arguments: {} })))!.result as { content: { type: string; text: string }[]; isError?: boolean };
  assert.equal(r.isError, undefined);
  assert.equal(JSON.parse(r.content[0]!.text).balance, 321);
});

test("kie_generate_image runs the full flow, returns the path and inlines the image", async () => {
  const { s, f } = server();
  const out = join(dir, "media");
  const r = (await s.handle(req(1, "tools/call", { name: "kie_generate_image", arguments: { model: "nano-banana-2", prompt: "a cat", aspect: "16:9", out, name: "cat" } })))!.result as {
    content: { type: string; text?: string; data?: string; mimeType?: string }[];
    isError?: boolean;
  };
  assert.equal(r.isError, undefined);
  const text = JSON.parse(r.content[0]!.text!);
  assert.equal(text.state, "success");
  assert.equal(text.creditsConsumed, 8);
  assert.ok(text.files[0].endsWith("cat.png"));
  const img = r.content.find((c) => c.type === "image")!;
  assert.equal(img.mimeType, "image/png");
  assert.ok(img.data!.length > 20);
  for (const u of f.urls) assert.match(u, /^https:\/\/(api\.kie\.ai|cdn\.kie)\//);
});

test("spend guard block surfaces as isError with the reason and nothing sent", async () => {
  const { s, f } = server({ config: { ...DEFAULT_CONFIG, dailyBudget: 5, pollSeconds: 0 } });
  const r = (await s.handle(req(1, "tools/call", { name: "kie_generate_image", arguments: { model: "nano-banana-2", prompt: "x" } })))!.result as { content: { text?: string }[]; isError?: boolean };
  assert.equal(r.isError, true);
  assert.match(r.content.map((c) => c.text).join("\n"), /Spend guard blocked/);
  assert.match(r.content.map((c) => c.text).join("\n"), /exit code 3/);
  assert.equal(f.urls.some((u) => u.endsWith("/jobs/createTask")), false);
});

test("dry_run returns the request without sending", async () => {
  const { s, f } = server();
  const r = (await s.handle(req(1, "tools/call", { name: "kie_generate_video", arguments: { model: "kling-3.0", prompt: "x", max_credits: 50, dry_run: true } })))!.result as { content: { text?: string }[] };
  const text = JSON.parse(r.content[0]!.text!);
  assert.equal(text.dryRun, true);
  assert.equal(text.request.model, "kling-3.0/video");
  assert.equal(f.urls.length, 0);
});

test("install: config paths per app and JSON/TOML merge keep other servers", () => {
  const spec = serverSpec("/usr/local/bin/node", "/opt/kie/dist/src/index.js");
  assert.deepEqual(spec, { command: "/usr/local/bin/node", args: ["/opt/kie/dist/src/index.js", "mcp"] });
  assert.equal(configPath("claude", "/h", "darwin"), "/h/Library/Application Support/Claude/claude_desktop_config.json");
  assert.equal(configPath("claude", "/h", "linux"), "/h/.config/Claude/claude_desktop_config.json");
  assert.equal(configPath("claude", "/h", "win32", { APPDATA: "C:\\Users\\j\\AppData\\Roaming" }), join("C:\\Users\\j\\AppData\\Roaming", "Claude", "claude_desktop_config.json"));
  assert.equal(configPath("codex", "/h"), "/h/.codex/config.toml");
  assert.equal(configPath("cursor", "/h"), "/h/.cursor/mcp.json");

  const merged = JSON.parse(mergeJsonConfig('{"mcpServers":{"other":{"command":"x"}},"theme":"dark"}', spec));
  assert.deepEqual(merged.mcpServers.other, { command: "x" });
  assert.deepEqual(merged.mcpServers.kie, spec);
  assert.equal(merged.theme, "dark");
  assert.throws(() => mergeJsonConfig("{broken", spec), /not valid JSON/);

  const toml = mergeTomlConfig('model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "y"\n', spec);
  assert.match(toml, /\[mcp_servers\.other\]\ncommand = "y"/);
  assert.match(toml, /\[mcp_servers\.kie\]\ncommand = "\/usr\/local\/bin\/node"\nargs = \["\/opt\/kie\/dist\/src\/index\.js", "mcp"\]/);
  const again = mergeTomlConfig(toml, { command: "/new/node", args: ["/new/index.js", "mcp"] });
  assert.equal((again.match(/\[mcp_servers\.kie\]/g) ?? []).length, 1);
  assert.match(again, /command = "\/new\/node"/);
  assert.match(again, /\[mcp_servers\.other\]/);
});

test("installMcp writes all three configs under the given home", () => {
  const home = mkdtempSync(join(tmpdir(), "kie-mcp-home-"));
  writeFileSync(join(home, ".codex") + "", "", { flag: "a" }); // ensure we can handle a pre-existing file? no: remove
  rmSync(join(home, ".codex"));
  const spec = serverSpec("/n", "/s.js");
  const res = installMcp(["claude", "codex", "cursor"], spec, home);
  assert.equal(res.length, 3);
  assert.deepEqual(JSON.parse(readFileSync(configPath("cursor", home), "utf8")).mcpServers.kie, spec);
  assert.match(readFileSync(configPath("codex", home), "utf8"), /\[mcp_servers\.kie\]/);
  rmSync(home, { recursive: true, force: true });
});
