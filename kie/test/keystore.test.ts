import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { deleteKey, mask, redact, resolveKey, storeKey, type Exec } from "../src/keystore.js";

let dir: string;
const saved = { ...process.env };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kie-test-"));
  process.env.KIE_CONFIG_DIR = dir;
  process.env.KIE_DISABLE_KEYCHAIN = "1"; // keep tests off the real Keychain
  delete process.env.KIE_API_KEY;
  delete process.env.KIE_ALLOW_ENV_KEY;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

test("env key is rejected unless explicitly allowed", () => {
  process.env.KIE_API_KEY = "sk-env";
  assert.throws(() => resolveKey(), /env keys are disabled/);
  process.env.KIE_ALLOW_ENV_KEY = "1";
  assert.deepEqual(resolveKey(), { key: "sk-env", source: "env" });
});

test("file fallback stores with 0600 and round-trips", () => {
  assert.throws(() => resolveKey(), /No API key configured/);
  assert.equal(storeKey("  sk-file  "), "file");
  const mode = statSync(join(dir, "key")).mode & 0o777;
  assert.equal(mode, 0o600);
  assert.deepEqual(resolveKey(), { key: "sk-file", source: "file" });
  assert.deepEqual(deleteKey(), ["file"]);
  assert.throws(() => resolveKey(), /No API key configured/);
});

test("empty keys are refused", () => {
  assert.throws(() => storeKey("   "), /empty key/);
});

test("mask and redact never leak the key", () => {
  assert.equal(mask("sk-1234567890abcdef"), "sk-1…cdef");
  assert.equal(redact("Bearer sk-1234567890abcdef failed", "sk-1234567890abcdef"), "Bearer [REDACTED] failed");
});

/** Fake shell for platforms we can't run in CI: records calls, returns scripted output. */
function fakeExec(script: (file: string, args: string[], input?: string) => string) {
  const calls: { file: string; args: string[]; input?: string }[] = [];
  const exec: Exec = (file, args, input) => {
    calls.push({ file, args, input });
    return script(file, args, input);
  };
  return { exec, calls };
}

test("macOS: keychain via /usr/bin/security, never through a shell", () => {
  let stored = "";
  const f = fakeExec((file, args) => {
    assert.equal(file, "/usr/bin/security");
    if (args[0] === "add-generic-password") { stored = args[args.indexOf("-w") + 1]!; return ""; }
    if (args[0] === "find-generic-password") { if (!stored) throw new Error("not found"); return stored + "\n"; }
    if (args[0] === "delete-generic-password") { stored = ""; return ""; }
    throw new Error("unexpected " + args[0]);
  });
  const opts = { platform: "darwin" as const, env: {}, exec: f.exec };
  assert.equal(storeKey("sk-mac", opts), "keychain");
  assert.deepEqual(resolveKey(opts), { key: "sk-mac", source: "keychain" });
  assert.deepEqual(deleteKey(opts), ["keychain"]);
  assert.throws(() => resolveKey(opts), /No API key configured/);
});

test("Windows: DPAPI through powershell, secret passed via stdin, ciphertext file on disk", () => {
  let blob = "";
  const f = fakeExec((file, args, input) => {
    assert.match(file, /System32[\\/]WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe$/);
    assert.equal(args[0], "-NoProfile");
    const cmd = args.at(-1)!;
    if (cmd.includes("::Protect(")) { assert.equal(input, "sk-win"); blob = Buffer.from("enc:" + input).toString("base64"); return blob; }
    if (cmd.includes("::Unprotect(")) { assert.ok(cmd.includes(blob)); return Buffer.from(blob, "base64").toString().replace(/^enc:/, ""); }
    throw new Error("unexpected script");
  });
  const opts = { platform: "win32" as const, env: { SystemRoot: "C:\\Windows" }, exec: f.exec };
  assert.equal(storeKey("sk-win", opts), "dpapi");
  assert.equal(readFileSync(join(dir, "key.dpapi"), "utf8").trim(), blob);
  assert.deepEqual(resolveKey(opts), { key: "sk-win", source: "dpapi" });
  assert.ok(!f.calls.some((c) => c.args.some((a) => a.includes("sk-win"))), "secret must not appear in argv");
  assert.deepEqual(deleteKey(opts), ["dpapi"]);
  assert.equal(existsSync(join(dir, "key.dpapi")), false);
});

test("Linux: secret-tool when available, file fallback otherwise", () => {
  let stored = "";
  const f = fakeExec((file, args, input) => {
    assert.equal(file, "/usr/bin/env");
    assert.equal(args[0], "secret-tool");
    if (args[1] === "--version") return "0.21\n";
    if (args[1] === "store") { stored = input ?? ""; return ""; }
    if (args[1] === "lookup") { if (!stored) throw new Error("no"); return stored; }
    if (args[1] === "clear") { stored = ""; return ""; }
    throw new Error("unexpected");
  });
  const opts = { platform: "linux" as const, env: {}, exec: f.exec };
  assert.equal(storeKey("sk-lin", opts), "secret-service");
  assert.deepEqual(resolveKey(opts), { key: "sk-lin", source: "secret-service" });
  assert.deepEqual(deleteKey(opts), ["secret-service"]);

  const none = fakeExec(() => { throw new Error("ENOENT"); });
  const noTool = { platform: "linux" as const, env: {}, exec: none.exec };
  assert.equal(storeKey("sk-file", noTool), "file");
  assert.deepEqual(resolveKey(noTool), { key: "sk-file", source: "file" });
});
