import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CONFIG } from "../src/config.js";
import { checkSpend } from "../src/guard.js";
import { spentToday, type LedgerEntry } from "../src/ledger.js";

const now = new Date("2026-08-20T15:00:00Z");
const e = (over: Partial<LedgerEntry>): LedgerEntry => ({
  ts: "2026-08-20T10:00:00Z",
  event: "created",
  taskId: "t1",
  model: "m",
  kind: "image",
  estimate: null,
  credits: null,
  ...over,
});

test("spentToday counts settled credits and pending estimates, ignores other days", () => {
  const ledger = [
    e({ taskId: "a", estimate: 10 }),
    e({ taskId: "a", event: "completed", credits: 12 }),
    e({ taskId: "b", estimate: 30 }), // still pending → estimate counts
    e({ taskId: "old", ts: "2026-08-19T10:00:00Z", event: "completed", credits: 999 }),
  ];
  assert.equal(spentToday(ledger, now), 42);
});

test("known estimate under caps passes", () => {
  const r = checkSpend({ estimate: 8, balance: 500, ledger: [], config: DEFAULT_CONFIG, now });
  assert.equal(r.ok, true);
});

test("known estimate over per-task cap is blocked unless --max-credits raises it", () => {
  const cfg = { ...DEFAULT_CONFIG, maxCreditsPerTask: 10 };
  assert.match(checkSpend({ estimate: 18, balance: 500, ledger: [], config: cfg, now }).reason!, /per-task cap/);
  assert.equal(checkSpend({ estimate: 18, maxCredits: 18, balance: 500, ledger: [], config: cfg, now }).ok, true);
});

test("unknown estimate requires explicit --max-credits", () => {
  const r = checkSpend({ estimate: null, balance: 500, ledger: [], config: DEFAULT_CONFIG, now });
  assert.equal(r.ok, false);
  assert.match(r.reason!, /--max-credits/);
  assert.equal(checkSpend({ estimate: null, maxCredits: 40, balance: 500, ledger: [], config: DEFAULT_CONFIG, now }).ok, true);
});

test("daily budget blocks once the ledger is exhausted", () => {
  const ledger = [e({ taskId: "a", event: "completed", credits: 195 })];
  const r = checkSpend({ estimate: 8, balance: 500, ledger, config: DEFAULT_CONFIG, now });
  assert.equal(r.ok, false);
  assert.match(r.reason!, /remaining budget \(5 of 200\)/);
});

test("balance is respected", () => {
  assert.match(checkSpend({ estimate: 8, balance: 0, ledger: [], config: DEFAULT_CONFIG, now }).reason!, /balance is 0/);
  assert.match(checkSpend({ estimate: 8, balance: 5, ledger: [], config: DEFAULT_CONFIG, now }).reason!, /account balance/);
});
