import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { configDir } from "./config.js";

/**
 * Append-only local ledger (JSON lines). Every task the CLI creates is recorded,
 * and when it completes the REAL `creditsConsumed` reported by KIE is written back.
 * The daily budget guard reads from here, so it works even for models without a
 * known price table.
 */
export interface LedgerEntry {
  ts: string; // ISO timestamp
  event: "created" | "completed" | "failed";
  taskId: string;
  model: string;
  kind: "image" | "video" | "raw";
  estimate: number | null;
  credits: number | null; // real credits consumed (only on completed/failed)
  files?: string[];
  error?: string;
}

export function ledgerPath(): string {
  return join(configDir(), "ledger.jsonl");
}

export function appendLedger(entry: LedgerEntry): void {
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  appendFileSync(ledgerPath(), JSON.stringify(entry) + "\n", { mode: 0o600 });
}

export function readLedger(): LedgerEntry[] {
  if (!existsSync(ledgerPath())) return [];
  return readFileSync(ledgerPath(), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as LedgerEntry);
}

/**
 * Credits known to be spent today (UTC). Uses real `credits` when the task is
 * settled, and the estimate for tasks still in flight so a burst of pending tasks
 * cannot blow past the budget before any of them reports back.
 */
export function spentToday(entries: LedgerEntry[], now: Date = new Date()): number {
  const day = now.toISOString().slice(0, 10);
  const settled = new Map<string, number>();
  const pending = new Map<string, number>();
  for (const e of entries) {
    if (!e.ts.startsWith(day)) continue;
    if (e.event === "created") {
      pending.set(e.taskId, e.estimate ?? 0);
    } else {
      pending.delete(e.taskId);
      settled.set(e.taskId, e.credits ?? 0);
    }
  }
  let total = 0;
  for (const v of settled.values()) total += v;
  for (const v of pending.values()) total += v;
  return total;
}
