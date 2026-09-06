import assert from "node:assert/strict";
import { test } from "node:test";
import { findModel, MODELS, parseSetFlags, type GenericInput } from "../src/catalog.js";

const g = (over: Partial<GenericInput> = {}): GenericInput => ({ prompt: "a red bike", refs: [], extra: {}, ...over });

/** Per-kind fixture so every model's build() runs without throwing during the smoke loop. */
function fixtureFor(kind: string): GenericInput {
  if (kind === "video") return g({ image: "https://x/img.png" });
  if (kind === "audio") return g({ text: "hello there", voice: "Rachel" });
  if (kind === "lipsync") return g({ image: "https://x/img.png", video: "https://x/vid.mp4", audio: "https://x/a.mp3", prompt: "talk" });
  return g({ image: "https://x/img.png" });
}

test("every model builds a request without a callBackUrl", () => {
  for (const m of MODELS) {
    const built = m.build(fixtureFor(m.kind));
    assert.equal("callBackUrl" in built.input, false, m.name);
    assert.ok(built.model.length > 0);
  }
});

test("nano-banana-2 maps refs to image_input and estimates by resolution", () => {
  const b = findModel("nano-banana-2")!.build(g({ refs: ["https://x/a.png"], resolution: "4K", aspect: "16:9" }));
  assert.equal(b.model, "nano-banana-2");
  assert.deepEqual(b.input.image_input, ["https://x/a.png"]);
  assert.equal(b.input.resolution, "4K");
  assert.equal(b.estimate, 18);
  assert.throws(() => findModel("nano-banana-2")!.build(g({ resolution: "8K" })), /--resolution must be one of/);
});

test("seedream-v4 switches to the edit model when refs are given", () => {
  const spec = findModel("seedream-v4")!;
  assert.equal(spec.build(g()).model, "bytedance/seedream-v4-text-to-image");
  const edit = spec.build(g({ refs: ["https://x/a.png"], aspect: "9:16" }));
  assert.equal(edit.model, "bytedance/seedream-v4-edit");
  assert.equal(edit.input.image_size, "portrait_16_9");
  assert.deepEqual(edit.input.image_urls, ["https://x/a.png"]);
});

test("kling-3.0 validates duration and frame ordering", () => {
  const spec = findModel("kling-3.0")!;
  const b = spec.build(g({ image: "https://x/1.png", endImage: "https://x/2.png", duration: 10, sound: true }));
  assert.deepEqual(b.input.image_urls, ["https://x/1.png", "https://x/2.png"]);
  assert.equal(b.input.duration, "10");
  assert.equal(b.input.sound, true);
  assert.throws(() => spec.build(g({ duration: 20 })), /3\.\.15/);
  assert.throws(() => spec.build(g({ endImage: "https://x/2.png" })), /--end-image requires --image/);
});

test("minimax-h3 picks the sub-model from the inputs and prices per second", () => {
  const spec = findModel("minimax-h3")!;
  assert.equal(spec.build(g()).model, "minimax-h3/text-to-video");
  assert.equal(spec.build(g({ image: "https://x/1.png" })).model, "minimax-h3/image-to-video");
  assert.equal(spec.build(g({ refs: ["https://x/1.png"] })).model, "minimax-h3/reference-to-video");
  assert.throws(() => spec.build(g({ image: "u", refs: ["v"] })), /either --image/);
  // Aug 2026 rates, halved: 768P = 8 credits/s, 2K = 13 credits/s.
  const cheap = spec.build(g({ duration: 6 }));
  assert.equal(cheap.input.resolution, "768P");
  assert.equal(cheap.estimate, 48);
  assert.equal(spec.build(g({ duration: 6, resolution: "2k" })).estimate, 78);
  // First five reference images are free, each extra one costs 4 credits.
  const refs = Array.from({ length: 7 }, (_, i) => `https://x/${i}.png`);
  assert.equal(spec.build(g({ duration: 4, refs })).estimate, 8 * 4 + 8);
  assert.throws(() => spec.build(g({ refs: Array.from({ length: 10 }, (_, i) => `https://x/${i}.png`) })), /at most 9/);
});

test("seedance-2.5 prices per second and accepts the model-picked duration", () => {
  const spec = findModel("seedance-2.5")!;
  assert.equal(spec.build(g({ duration: 5 })).estimate, 63 * 5);
  assert.equal(spec.build(g({ duration: 5, resolution: "480p" })).estimate, 28 * 5);
  assert.equal(spec.build(g({ duration: 5, resolution: "1080p" })).estimate, 114 * 5);
  assert.equal(spec.build(g({ duration: -1 })).estimate, null);
  assert.throws(() => spec.build(g({ duration: 40 })), /4\.\.30/);
});

test("kling-o3 routes by input and prices by resolution and audio", () => {
  const spec = findModel("kling-o3")!;
  assert.equal(spec.build(g()).model, "kling-3.0-omni/text-to-video");
  const i2v = spec.build(g({ image: "https://x/1.png", endImage: "https://x/2.png", duration: 5 }));
  assert.equal(i2v.model, "kling-3.0-omni/image-to-video");
  assert.deepEqual(i2v.input.image_urls, ["https://x/1.png", "https://x/2.png"]);
  assert.equal(i2v.estimate, 14 * 5); // 720p, no audio
  assert.equal(spec.build(g({ duration: 5, sound: true })).estimate, 18 * 5);
  assert.equal(spec.build(g({ duration: 5, resolution: "1080p", sound: true })).estimate, 23 * 5);
  assert.equal(spec.build(g({ duration: 5, resolution: "4k" })).estimate, 67 * 5);
  const r2v = spec.build(g({ refs: ["https://x/a.png"] }));
  assert.equal(r2v.model, "kling-3.0-omni/reference-to-video");
  assert.deepEqual(r2v.input.image_urls, ["https://x/a.png"]);
  assert.throws(() => spec.build(g({ duration: 16 })), /3\.\.15/);
});

test("wan-3.0 switches to Video Prime with --fast and keeps frame/ref modes apart", () => {
  const spec = findModel("wan-3.0")!;
  const b = spec.build(g({ duration: 5 }));
  assert.equal(b.model, "wan/3-0-video");
  assert.equal(b.input.resolution, "720P");
  assert.equal(b.input.audio, true);
  assert.equal(b.estimate, 16 * 5);
  assert.equal(spec.build(g({ fast: true })).model, "wan/3-0-video-prime");
  assert.equal(spec.build(g({ duration: 5, resolution: "480p" })).estimate, 8 * 5);
  assert.equal(spec.build(g({ duration: -1 })).estimate, null);
  assert.throws(() => spec.build(g({ image: "u", refs: ["v"] })), /cannot be combined/);
});

test("gemini-omni-1.1 uses a flat per-generation price and a fixed duration set", () => {
  const spec = findModel("gemini-omni-1.1")!;
  const b = spec.build(g({ duration: 8 }));
  assert.equal(b.model, "google/gemini-omni-flash-1-1");
  assert.equal(b.input.duration, "8");
  assert.equal(b.estimate, 105);
  assert.equal(spec.build(g({ duration: 4, resolution: "4k" })).estimate, 147);
  assert.equal(spec.build(g({ duration: 10 })).estimate, 126);
  assert.throws(() => spec.build(g({ duration: 5 })), /must be 4, 6, 8 or 10/);
  assert.throws(() => spec.build(g({ image: "u", refs: ["v"] })), /mutually exclusive/);
});

test("grok-image-2 switches to the edit model when refs are given", () => {
  const spec = findModel("grok-image-2")!;
  const t2i = spec.build(g());
  assert.equal(t2i.model, "grok-imagine-image-2-0/text-to-image");
  assert.equal(t2i.input.aspect_ratio, "1:1");
  assert.equal(t2i.estimate, 4);
  const edit = spec.build(g({ refs: ["https://x/a.png"] }));
  assert.equal(edit.model, "grok-imagine-image-2-0/image-edit");
  assert.equal(edit.input.aspect_ratio, "auto");
  assert.deepEqual(edit.input.image_urls, ["https://x/a.png"]);
  assert.throws(() => spec.build(g({ aspect: "auto" })), /--aspect must be one of/);
});

test("resolution and aspect matching is case-insensitive and canonicalised", () => {
  assert.equal(findModel("nano-banana-2")!.build(g({ resolution: "4k" })).input.resolution, "4K");
  assert.equal(findModel("wan-3.0")!.build(g({ resolution: "1080p" })).input.resolution, "1080P");
});

test("veo3 uses its own family and camelCase fields", () => {
  const b = findModel("veo3")!.build(g({ fast: true, aspect: "9:16" }));
  assert.equal(b.family, "veo");
  assert.equal(b.input.model, "veo3_fast");
  assert.equal(b.input.aspectRatio, "9:16");
});

test("eleven-v2 and eleven-turbo map text/voice and fall back to --prompt", () => {
  for (const name of ["eleven-v2", "eleven-turbo"]) {
    const spec = findModel(name)!;
    const b = spec.build(g({ text: "Hello", voice: "Rachel" }));
    assert.deepEqual(b.input, { text: "Hello", voice: "Rachel" });
    assert.equal(b.estimate, null);
    // --prompt fallback for --text
    const fallback = spec.build(g({ prompt: "Hi", voice: "Rachel" }));
    assert.equal(fallback.input.text, "Hi");
    // missing text
    assert.throws(() => spec.build(g({ prompt: "", voice: "Rachel" })), /--text/);
    // missing voice
    assert.throws(() => spec.build(g({ text: "Hi" })), /--voice/);
  }
  assert.equal(findModel("eleven-v2")!.build(g({ text: "hi", voice: "Rachel" })).model, "elevenlabs/text-to-speech-multilingual-v2");
  assert.equal(findModel("eleven-turbo")!.build(g({ text: "hi", voice: "Rachel" })).model, "elevenlabs/text-to-speech-turbo-2-5");
});

test("volcengine-lipsync sends video_url/audio_url/mode and rejects a bad --format", () => {
  const spec = findModel("volcengine-lipsync")!;
  const b = spec.build(g({ video: "https://x/v.mp4", audio: "https://x/a.mp3" }));
  assert.equal(b.model, "volcengine/video-to-video-lip-sync");
  assert.deepEqual(b.input, { video_url: "https://x/v.mp4", audio_url: "https://x/a.mp3", mode: "lite" });
  assert.equal(b.estimate, null);
  assert.throws(() => spec.build(g({ audio: "https://x/a.mp3" })), /--video/);
  assert.throws(() => spec.build(g({ video: "https://x/v.mp4", audio: "https://x/a.mp3", format: "ultra" })), /--format must be one of/);
});

test("infinitalk requires image+audio+prompt and validates resolution oneOf", () => {
  const spec = findModel("infinitalk")!;
  const b = spec.build(g({ image: "https://x/p.png", audio: "https://x/a.mp3", prompt: "talk" }));
  assert.equal(b.model, "infinitalk/from-audio");
  assert.deepEqual(b.input, { image_url: "https://x/p.png", audio_url: "https://x/a.mp3", prompt: "talk", resolution: "480p" });
  assert.throws(() => spec.build(g({ audio: "https://x/a.mp3", prompt: "talk" })), /--image/);
  assert.throws(() => spec.build(g({ image: "https://x/p.png", prompt: "talk" })), /--audio/);
  assert.throws(() => spec.build(g({ image: "https://x/p.png", audio: "https://x/a.mp3", prompt: "" })), /--prompt/);
  assert.equal(spec.build(g({ image: "https://x/p.png", audio: "https://x/a.mp3", prompt: "talk", resolution: "720p" })).input.resolution, "720p");
  assert.throws(() => spec.build(g({ image: "https://x/p.png", audio: "https://x/a.mp3", prompt: "talk", resolution: "4k" })), /--resolution must be one of/);
});

test("kling-avatar requires image+audio+prompt", () => {
  const spec = findModel("kling-avatar")!;
  const b = spec.build(g({ image: "https://x/p.png", audio: "https://x/a.mp3", prompt: "talk" }));
  assert.equal(b.model, "kling/ai-avatar-standard");
  assert.deepEqual(b.input, { image_url: "https://x/p.png", audio_url: "https://x/a.mp3", prompt: "talk" });
  assert.throws(() => spec.build(g({ audio: "https://x/a.mp3", prompt: "talk" })), /--image/);
  assert.throws(() => spec.build(g({ image: "https://x/p.png", prompt: "talk" })), /--audio/);
  assert.throws(() => spec.build(g({ image: "https://x/p.png", audio: "https://x/a.mp3", prompt: "" })), /--prompt/);
});

test("topaz-upscale coerces upscale_factor to a string and rejects bad values", () => {
  const spec = findModel("topaz-upscale")!;
  const withNumericSet = spec.build(g({ image: "https://x/u.png", extra: { upscale_factor: 2 } }));
  assert.strictEqual(withNumericSet.input.upscale_factor, "2");
  assert.equal(typeof withNumericSet.input.upscale_factor, "string");
  const four = spec.build(g({ image: "https://x/u.png", extra: { upscale_factor: 4 } }));
  assert.strictEqual(four.input.upscale_factor, "4");
  const def = spec.build(g({ image: "https://x/u.png" }));
  assert.strictEqual(def.input.upscale_factor, "2");
  assert.throws(() => spec.build(g({ image: "https://x/u.png", extra: { upscale_factor: 3 } })), /upscale_factor/);
  assert.throws(() => spec.build(g()), /--image/);
});

test("recraft-remove-bg sends field 'image' and never image_url", () => {
  const spec = findModel("recraft-remove-bg")!;
  const b = spec.build(g({ image: "https://x/u.png" }));
  assert.equal(b.model, "recraft/remove-background");
  assert.equal(b.input.image_url, undefined);
  assert.deepEqual(b.input, { image: "https://x/u.png" });
  assert.throws(() => spec.build(g()), /--image/);
});

test("all 7 new audio/lipsync/fx models have estimate: null", () => {
  const names = ["eleven-v2", "eleven-turbo", "volcengine-lipsync", "infinitalk", "kling-avatar", "topaz-upscale", "recraft-remove-bg"];
  for (const name of names) {
    const spec = findModel(name)!;
    assert.equal(spec.build(fixtureFor(spec.kind)).estimate, null, name);
  }
});

test("--set merges raw fields but never callBackUrl", () => {
  assert.deepEqual(parseSetFlags(["mode=pro", "seed=42", "flag=true"]), { mode: "pro", seed: 42, flag: true });
  assert.throws(() => parseSetFlags(["callBackUrl=https://evil"]), /never sends callbacks/);
  const b = findModel("kling-3.0")!.build(g({ extra: { mode: "pro" } }));
  assert.equal(b.input.mode, "pro");
});
