import assert from "node:assert/strict";
import { test } from "node:test";
import { KieClient, KieError, normalizeMarket, normalizeVeo } from "../src/client.js";

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(responder: (url: string, init: RequestInit) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    const r = responder(url, init);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

test("createTask posts model+input with Bearer auth, to api.kie.ai only, without callBackUrl", async () => {
  const f = fakeFetch(() => ({ body: { code: 200, msg: "success", data: { taskId: "task_1" } } }));
  const c = new KieClient({ apiKey: "sk-test", fetchImpl: f.impl });
  const id = await c.createTask("nano-banana-2", { prompt: "hi" });
  assert.equal(id, "task_1");
  const call = f.calls[0]!;
  assert.equal(call.url, "https://api.kie.ai/api/v1/jobs/createTask");
  assert.equal((call.init.headers as Record<string, string>).Authorization, "Bearer sk-test");
  const sent = JSON.parse(call.init.body as string);
  assert.deepEqual(sent, { model: "nano-banana-2", input: { prompt: "hi" } });
  assert.equal("callBackUrl" in sent, false);
});

test("HTTP 200 with code !== 200 is an error (KIE convention)", async () => {
  const f = fakeFetch(() => ({ body: { code: 402, msg: "not enough credits", data: null } }));
  const c = new KieClient({ apiKey: "k", fetchImpl: f.impl });
  await assert.rejects(c.createTask("m", {}), (err: unknown) => err instanceof KieError && err.apiCode === 402);
});

test("HTTP 401 surfaces as KieError with status", async () => {
  const f = fakeFetch(() => ({ status: 401, body: { code: 401, msg: "You do not have access permissions" } }));
  const c = new KieClient({ apiKey: "k", fetchImpl: f.impl });
  await assert.rejects(c.credits(), (err: unknown) => err instanceof KieError && err.httpStatus === 401);
});

test("credits returns a number", async () => {
  const f = fakeFetch(() => ({ body: { code: 200, msg: "success", data: 1234 } }));
  assert.equal(await new KieClient({ apiKey: "k", fetchImpl: f.impl }).credits(), 1234);
  assert.equal(f.calls[0]!.url, "https://api.kie.ai/api/v1/chat/credit");
});

test("taskStatus parses resultJson and creditsConsumed", async () => {
  const f = fakeFetch(() => ({
    body: { code: 200, data: { taskId: "t", model: "nano-banana-2", state: "success", resultJson: '{"resultUrls":["https://cdn/x.png"]}', creditsConsumed: 8 } },
  }));
  const s = await new KieClient({ apiKey: "k", fetchImpl: f.impl }).taskStatus("t");
  assert.equal(s.state, "success");
  assert.deepEqual(s.resultUrls, ["https://cdn/x.png"]);
  assert.equal(s.creditsConsumed, 8);
  assert.match(f.calls[0]!.url, /\/jobs\/recordInfo\?taskId=t$/);
});

test("normalizers tolerate missing/invalid result payloads", () => {
  assert.deepEqual(normalizeMarket({ taskId: "t", model: "m", state: "generating", resultJson: "not json" }).resultUrls, []);
  assert.equal(normalizeVeo({ taskId: "t", successFlag: 0 }).state, "generating");
  assert.equal(normalizeVeo({ taskId: "t", successFlag: 2, errorMessage: "policy" }).state, "fail");
  assert.deepEqual(normalizeVeo({ taskId: "t", successFlag: 1, response: { resultUrls: ["https://v/1.mp4"] } }).resultUrls, ["https://v/1.mp4"]);
});

test("upload goes to KIE's upload host with Bearer auth and returns the file URL", async () => {
  const f = fakeFetch(() => ({ body: { code: 200, success: true, data: { fileUrl: "https://tempfile.kie/x.png" } } }));
  const url = await new KieClient({ apiKey: "k", fetchImpl: f.impl }).upload(new Uint8Array([1, 2]), "x.png", "image/png");
  assert.equal(url, "https://tempfile.kie/x.png");
  assert.equal(f.calls[0]!.url, "https://kieai.redpandaai.co/api/file-stream-upload");
  assert.equal((f.calls[0]!.init.headers as Record<string, string>).Authorization, "Bearer k");
});
