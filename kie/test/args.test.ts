import assert from "node:assert/strict";
import { test } from "node:test";
import { bool, list, num, parseArgs, str } from "../src/args.js";

test("parses positionals, values, equals form and repeats", () => {
  const a = parseArgs(["image", "nano-banana-2", "--prompt", "a cat", "--ref=u1", "--ref", "u2", "--aspect", "16:9"]);
  assert.deepEqual(a.positionals, ["image", "nano-banana-2"]);
  assert.equal(str(a.flags, "prompt"), "a cat");
  assert.deepEqual(list(a.flags, "ref"), ["u1", "u2"]);
  assert.equal(str(a.flags, "aspect"), "16:9");
});

test("booleans do not swallow the next token", () => {
  const a = parseArgs(["video", "kling-3.0", "--sound", "--prompt", "x"], new Set(["sound"]));
  assert.equal(bool(a.flags, "sound"), true);
  assert.equal(str(a.flags, "prompt"), "x");
});

test("--no-<bool> negates a known boolean", () => {
  const a = parseArgs(["--no-sound"], new Set(["sound"]));
  assert.equal(bool(a.flags, "sound"), false);
});

test("num validates", () => {
  const a = parseArgs(["--duration", "abc"]);
  assert.throws(() => num(a.flags, "duration"), /must be a number/);
});

test("--text/--voice/--audio/--video parse as string flags without swallowing the next flag", () => {
  const a = parseArgs(["speak", "eleven-v2", "--text", "Hello there", "--voice", "Rachel", "--max-credits", "5"]);
  assert.equal(str(a.flags, "text"), "Hello there");
  assert.equal(str(a.flags, "voice"), "Rachel");
  assert.equal(str(a.flags, "max-credits"), "5");

  const b = parseArgs(["lipsync", "infinitalk", "--audio", "a.mp3", "--video", "v.mp4", "--prompt", "talk"]);
  assert.equal(str(b.flags, "audio"), "a.mp3");
  assert.equal(str(b.flags, "video"), "v.mp4");
  assert.equal(str(b.flags, "prompt"), "talk");
});
