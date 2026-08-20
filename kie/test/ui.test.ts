import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { out } from "../src/output.js";
import { banner, makeStyle, meter, panel, table, truncate, visibleLength } from "../src/ui.js";

const plain = makeStyle(false);
const color = makeStyle(true);

test("table renders box-drawing with aligned columns and truncation", () => {
  const t = table(
    [
      { name: "nano-banana-2", kind: "image", label: "a very long description that should be cut off here" },
      { name: "veo3", kind: "video", label: "short" },
    ],
    [
      { key: "name", header: "model" },
      { key: "kind", header: "kind" },
      { key: "label", header: "description", max: 20 },
    ],
    plain,
  );
  const lines = t.split("\n");
  assert.equal(lines[0]!.startsWith("┌"), true);
  assert.equal(lines.at(-1)!.startsWith("└"), true);
  assert.ok(lines[3]!.includes("a very long descrip…"));
  const widths = new Set(lines.map((l) => [...l].length));
  assert.equal(widths.size, 1, "all rows share the same width");
});

test("table shrinks to maxWidth by truncating the widest columns", () => {
  const t = table(
    [{ a: "x".repeat(80), b: "y".repeat(40), c: "z" }],
    [{ key: "a", header: "A" }, { key: "b", header: "B" }, { key: "c", header: "C" }],
    plain,
    60,
  );
  for (const line of t.split("\n")) assert.ok([...line].length <= 60, `${[...line].length} > 60`);
  assert.ok(t.includes("…"));
});

test("table handles empty rows", () => {
  const t = table([], [{ key: "a", header: "A" }], plain);
  assert.ok(t.includes("(empty)"));
});

test("visibleLength ignores ANSI codes so colored cells stay aligned", () => {
  assert.equal(visibleLength(color.bold("abc")), 3);
  assert.equal(visibleLength(color.rgb(1, 2, 3)("ñandú")), 5);
  const t = table([{ a: color.green("ok"), b: "x" }], [{ key: "a", header: "A" }, { key: "b", header: "B" }], color);
  const widths = new Set(t.split("\n").map(visibleLength));
  assert.equal(widths.size, 1);
});

test("panel, meter, truncate, banner", () => {
  const p = panel("credits", [["balance", "980"], ["today", "16 / 200"]], plain);
  assert.ok(p.startsWith("╭─ credits"));
  assert.ok(p.trimEnd().endsWith("╯"));
  assert.equal(meter(50, 100, plain, 10), "█████░░░░░ 50%");
  assert.equal(meter(0, 0, plain, 4), "░░░░ 0%");
  assert.equal(truncate("abcdef", 4), "abc…");
  assert.ok(banner(plain, "0.2.0").includes("●"));
  assert.ok(banner(plain, "0.2.0").includes("v0.2.0"));
});

function fakeStream(): NodeJS.WriteStream & { data: string } {
  const s = new PassThrough() as unknown as NodeJS.WriteStream & { data: string };
  s.data = "";
  s.on("data", (c: Buffer) => (s.data += c.toString()));
  Object.defineProperty(s, "isTTY", { value: false });
  return s;
}

test("json mode emits parseable JSON regardless of view hint", () => {
  const stdout = fakeStream();
  const o = out({ redact: (x) => x, mode: "json", stdout, stderr: fakeStream() });
  o.json({ balance: 1, spentToday: 0, dailyBudget: 200, remainingToday: 200 }, { kind: "credits" });
  assert.deepEqual(JSON.parse(stdout.data), { balance: 1, spentToday: 0, dailyBudget: 200, remainingToday: 200 });
});

test("pretty mode renders panels/tables and redacts the key", () => {
  const stdout = fakeStream();
  const o = out({ redact: (x) => x.split("sk-secret").join("[REDACTED]"), mode: "pretty", color: false, stdout, stderr: fakeStream() });
  o.json([{ name: "m", kind: "image", label: "desc", supports: ["prompt"], docs: "sk-secret" }], { kind: "models" });
  assert.ok(stdout.data.includes("┌"));
  assert.ok(stdout.data.includes("--prompt"));
  o.json({ taskId: "t", model: "m", state: "success", creditsConsumed: 8, files: ["a.png"] }, { kind: "task" });
  assert.ok(stdout.data.includes("generation complete"));
  assert.ok(stdout.data.includes("a.png"));
  o.json({ url: "https://x/sk-secret" }, { kind: "upload" });
  assert.ok(!stdout.data.includes("sk-secret"));
});
