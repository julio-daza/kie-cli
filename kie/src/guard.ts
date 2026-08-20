import type { KieConfig } from "./config.js";
import type { LedgerEntry } from "./ledger.js";
import { spentToday } from "./ledger.js";

/**
 * Spend guard, evaluated BEFORE any task is created. Three independent checks:
 *  1. per-task cap      — only enforceable when the model has a known estimate
 *  2. daily budget      — from the ledger (real creditsConsumed + pending estimates)
 *  3. account balance   — refuse if the estimate exceeds what is left
 * Unknown estimates are allowed only when the caller opted in with --max-credits
 * (an explicit, per-invocation ceiling the agent has to state out loud).
 */
export interface GuardInput {
  estimate: number | null;
  maxCredits?: number; // explicit per-invocation ceiling
  balance: number | null;
  ledger: LedgerEntry[];
  config: KieConfig;
  now?: Date;
}

export interface GuardResult {
  ok: boolean;
  reason?: string;
  spentToday: number;
  remainingToday: number;
}

export function checkSpend(g: GuardInput): GuardResult {
  const spent = spentToday(g.ledger, g.now);
  const remainingToday = Math.max(0, g.config.dailyBudget - spent);
  const base = { spentToday: spent, remainingToday };

  if (g.balance !== null && g.balance <= 0) {
    return { ok: false, reason: "Account balance is 0 credits. Top up at https://kie.ai before generating.", ...base };
  }

  const ceiling = g.maxCredits ?? g.config.maxCreditsPerTask;

  if (g.estimate === null) {
    if (g.maxCredits === undefined) {
      return {
        ok: false,
        reason:
          "This model has no known credit estimate. Re-run with --max-credits <n> to state the most you accept " +
          "to spend on this task (the real cost is recorded afterwards), or use --dry-run to inspect the request.",
        ...base,
      };
    }
    if (g.maxCredits > remainingToday) {
      return {
        ok: false,
        reason: `--max-credits ${g.maxCredits} exceeds today's remaining budget (${remainingToday} of ${g.config.dailyBudget}). Raise it with \`kie config set dailyBudget <n>\` if intended.`,
        ...base,
      };
    }
    if (g.balance !== null && g.maxCredits > g.balance) {
      return { ok: false, reason: `--max-credits ${g.maxCredits} exceeds the account balance (${g.balance}).`, ...base };
    }
    return { ok: true, ...base };
  }

  if (g.estimate > ceiling) {
    return {
      ok: false,
      reason: `Estimated ${g.estimate} credits exceeds the per-task cap of ${ceiling}. Pass --max-credits ${g.estimate} to accept.`,
      ...base,
    };
  }
  if (g.estimate > remainingToday) {
    return {
      ok: false,
      reason: `Estimated ${g.estimate} credits exceeds today's remaining budget (${remainingToday} of ${g.config.dailyBudget}).`,
      ...base,
    };
  }
  if (g.balance !== null && g.estimate > g.balance) {
    return { ok: false, reason: `Estimated ${g.estimate} credits exceeds the account balance (${g.balance}).`, ...base };
  }
  return { ok: true, ...base };
}
