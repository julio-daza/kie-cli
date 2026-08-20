import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { deleteKey, mask, redact, resolveKey, storeKey } from "../src/keystore.js";

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
