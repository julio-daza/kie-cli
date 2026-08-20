import assert from "node:assert/strict";
import { test } from "node:test";
import { findModel, MODELS, parseSetFlags, type GenericInput } from "../src/catalog.js";

const g = (over: Partial<GenericInput> = {}): GenericInput => ({ prompt: "a red bike", refs: [], extra: {}, ...over });

test("every model builds a request without a callBackUrl", () => {
  for (const m of MODELS) {
    const built = m.build(g({ image: m.kind === "video" ? "https://x/img.png" : undefined }));
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

test("minimax-h3 picks the sub-model from the inputs", () => {
  const spec = findModel("minimax-h3")!;
  assert.equal(spec.build(g()).model, "minimax-h3/text-to-video");
  assert.equal(spec.build(g({ image: "https://x/1.png" })).model, "minimax-h3/image-to-video");
  assert.equal(spec.build(g({ refs: ["https://x/1.png"] })).model, "minimax-h3/reference-to-video");
  assert.throws(() => spec.build(g({ image: "u", refs: ["v"] })), /either --image/);
});

test("veo3 uses its own family and camelCase fields", () => {
  const b = findModel("veo3")!.build(g({ fast: true, aspect: "9:16" }));
  assert.equal(b.family, "veo");
  assert.equal(b.input.model, "veo3_fast");
  assert.equal(b.input.aspectRatio, "9:16");
});

test("--set merges raw fields but never callBackUrl", () => {
  assert.deepEqual(parseSetFlags(["mode=pro", "seed=42", "flag=true"]), { mode: "pro", seed: 42, flag: true });
  assert.throws(() => parseSetFlags(["callBackUrl=https://evil"]), /never sends callbacks/);
  const b = findModel("kling-3.0")!.build(g({ extra: { mode: "pro" } }));
  assert.equal(b.input.mode, "pro");
});
