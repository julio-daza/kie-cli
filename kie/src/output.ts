import { basename } from "node:path";
import { brandTag, colorsEnabled, elapsed, formatCell, makeStyle, meter, panel, SPINNER, table, type Column, type Style } from "./ui.js";

/**
 * All user-facing output goes through here. Two modes:
 *   - "json"   — machine contract: JSON on stdout, messages on stderr. Used when stdout is
 *                not a TTY (agents, pipes) or with --json.
 *   - "pretty" — tables/panels for humans in a terminal.
 * The key is redacted in both.
 */
export type Mode = "json" | "pretty";

/** Hint that lets pretty mode choose a renderer for a result. */
export type View =
  | { kind: "models" }
  | { kind: "credits" }
  | { kind: "ledger" }
  | { kind: "task" }
  | { kind: "status" }
  | { kind: "dry-run" }
  | { kind: "submitted" }
  | { kind: "upload" }
  | { kind: "key" }
  | { kind: "config" }
  | { kind: "skill" };

export interface Output {
  mode: Mode;
  style: Style;
  json(value: unknown, view?: View): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  success(message: string): void;
  /** Live single-line progress (spinner) in pretty mode; plain lines otherwise. */
  progress(message: string, startedAt?: number): void;
  /** Clears the live progress line, if any. */
  endProgress(): void;
}

export interface OutputOptions {
  redact: (s: string) => string;
  quiet?: boolean;
  mode?: Mode;
  color?: boolean;
  stdout?: NodeJS.WriteStream;
  stderr?: NodeJS.WriteStream;
}

export function out(opts: OutputOptions): Output {
  const stdout = opts.stdout ?? process.stdout;
  const stderr = opts.stderr ?? process.stderr;
  const mode: Mode = opts.mode ?? (stdout.isTTY ? "pretty" : "json");
  const style = makeStyle(opts.color ?? (mode === "pretty" && colorsEnabled(stderr)));
  const r = opts.redact;
  let spin = 0;
  let liveLine = false;

  const clearLive = () => {
    if (liveLine && stderr.isTTY) stderr.write("\r[2K");
    liveLine = false;
  };
  const line = (stream: NodeJS.WriteStream, s: string) => {
    clearLive();
    stream.write(r(s) + "\n");
  };

  return {
    mode,
    style,
    json(value, view) {
      if (mode === "json") {
        line(stdout, JSON.stringify(value, null, 2));
        return;
      }
      line(stdout, render(value, view, style));
    },
    info: (m) => !opts.quiet && line(stderr, mode === "pretty" ? style.dim(m) : m),
    warn: (m) => line(stderr, mode === "pretty" ? style.yellow("⚠ " + m) : "warning: " + m),
    error: (m) => line(stderr, mode === "pretty" ? style.red("✖ " + m) : "error: " + m),
    success: (m) => !opts.quiet && line(stderr, mode === "pretty" ? style.green("✔ " + m) : m),
    progress(m, startedAt) {
      if (opts.quiet) return;
      const t = startedAt ? style.dim(` ${elapsed(Date.now() - startedAt)}`) : "";
      if (mode === "pretty" && stderr.isTTY) {
        const frame = style.brand(SPINNER[spin++ % SPINNER.length]!);
        stderr.write(`\r[2K${frame} ${r(m)}${t}`);
        liveLine = true;
      } else {
        stderr.write(`… ${r(m)}\n`);
      }
    },
    endProgress: clearLive,
  };
}

// ---------------------------------------------------------------- renderers

type Rec = Record<string, unknown>;
const s = (v: unknown) => formatCell(v);

function termWidth(): number {
  return Math.max(60, process.stdout.columns ?? 120);
}

function render(value: unknown, view: View | undefined, style: Style): string {
  const v = value as Rec;
  switch (view?.kind) {
    case "models":
      return renderModels(value as Rec[], style);
    case "credits":
      return renderCredits(v, style);
    case "ledger":
      return renderLedger(v, style);
    case "task":
      return renderTask(v, style);
    case "status":
      return renderStatus(v, style);
    case "dry-run":
      return renderDryRun(v, style);
    case "submitted":
      return panel(`${brandTag(style)}  task submitted`, [["task", style.bold(s(v.taskId))], ["model", s(v.model)], ["estimate", v.estimate === null ? style.dim("unknown") : `${s(v.estimate)} credits`]], style);
    case "upload":
      return panel(`${brandTag(style)}  uploaded`, [["url", style.cyan(s(v.url))], ["note", style.dim(s(v.note))]], style);
    case "key":
      return panel(`${brandTag(style)}  api key`, [
        ["source", s(v.source)],
        ["key", s(v.key)],
        ["valid", v.valid ? style.green("yes") : style.red("no")],
        ["balance", v.balance === null ? style.dim("—") : `${s(v.balance)} credits`],
      ], style);
    case "skill": {
      const rows = (v.results as Rec[]).map((r) => {
        const st = r.status === "skipped" ? style.yellow("skipped") : style.green(s(r.status));
        return [r.agent === "claude" ? "Claude Code" : "Codex", `${st}  ${style.dim(s(r.path))}`] as [string, string];
      });
      return panel(`${brandTag(style)}  skill ${s(v.skill)} ${style.dim(`(${s(v.scope)})`)}`, rows, style);
    }
    case "config":
      return panel(`${brandTag(style)}  config  ${style.dim(s(v.path))}`, Object.entries(v).filter(([k]) => k !== "path").map(([k, val]) => [k, s(val)] as [string, string]), style);
    default:
      return genericRender(value, style);
  }
}

function renderModels(rows: Rec[], style: Style): string {
  const cols: Column[] = [
    { key: "name", header: "model", format: (v) => style.bold(style.brand(s(v))) },
    { key: "kind", header: "kind" },
    { key: "label", header: "description", max: 58 },
    { key: "supports", header: "flags", max: 60, format: (v) => (Array.isArray(v) ? v.map((f) => "--" + String(f).split(" ")[0]).join(" ") : s(v)) },
  ];
  const notes = rows.filter((r) => r.notes).map((r) => `  ${style.dim("·")} ${style.bold(s(r.name))}: ${style.dim(s(r.notes))}`);
  return [`${brandTag(style)}  ${style.bold("models")}`, table(rows, cols, style, termWidth()), ...notes, style.dim(`  docs: kie models --json | jq '.[].docs'`)].join("\n");
}

function renderCredits(v: Rec, style: Style): string {
  const spent = Number(v.spentToday);
  const budget = Number(v.dailyBudget);
  return panel(`${brandTag(style)}  credits`, [
    ["balance", style.bold(`${s(v.balance)} credits`) + style.dim(`  ≈ US$${(Number(v.balance) * 0.005).toFixed(2)}`)],
    ["today", `${spent} / ${budget}  ${meter(spent, budget, style)}`],
    ["remaining today", `${s(v.remainingToday)} credits`],
  ], style);
}

function renderLedger(v: Rec, style: Style): string {
  const entries = (v.entries as Rec[]) ?? [];
  const cols: Column[] = [
    { key: "ts", header: "time", format: (t) => String(t).replace("T", " ").slice(0, 16) },
    { key: "event", header: "event", format: (e) => (e === "completed" ? style.green(s(e)) : e === "failed" ? style.red(s(e)) : style.yellow(s(e))) },
    { key: "taskId", header: "task", max: 18 },
    { key: "model", header: "model", max: 34 },
    { key: "estimate", header: "est.", align: "right" },
    { key: "credits", header: "credits", align: "right", format: (c) => (c === null || c === undefined ? style.dim("—") : style.bold(s(c))) },
    { key: "files", header: "files", max: 40, format: (f) => (Array.isArray(f) && f.length ? f.map((x) => basename(String(x))).join(", ") : "—") },
  ];
  return [`${brandTag(style)}  ${style.bold("ledger")}  ${style.dim(s(v.path))}`, table(entries, cols, style, termWidth()), `  spent today: ${style.bold(s(v.spentToday))} credits`].join("\n");
}

function renderTask(v: Rec, style: Style): string {
  const ok = v.state === "success";
  const files = (v.files as string[] | undefined) ?? [];
  const entries: [string, string][] = [
    ["task", s(v.taskId)],
    ["model", s(v.model)],
    ["state", ok ? style.green("success") : style.red(s(v.state))],
    ["credits", v.creditsConsumed === null || v.creditsConsumed === undefined ? style.dim("not reported") : style.bold(`${s(v.creditsConsumed)}`)],
  ];
  if (files.length) files.forEach((f, i) => entries.push([i === 0 ? "files" : "", style.cyan(f)]));
  else if (Array.isArray(v.resultUrls) && v.resultUrls.length) (v.resultUrls as string[]).forEach((u, i) => entries.push([i === 0 ? "urls" : "", u]));
  if (v.failMsg || v.failCode) entries.push(["reason", style.red(`${s(v.failMsg ?? "")} ${v.failCode ? style.dim(`(${s(v.failCode)})`) : ""}`.trim())]);
  if (v.timedOut) entries.push(["note", style.yellow("timed out — task still running on KIE")]);
  return panel(`${brandTag(style)}  ${ok ? "generation complete" : "generation " + s(v.state)}`, entries, style);
}

function renderStatus(v: Rec, style: Style): string {
  const stateColor = v.state === "success" ? style.green : v.state === "fail" ? style.red : style.yellow;
  const entries: [string, string][] = [
    ["task", s(v.taskId)],
    ["model", s(v.model)],
    ["state", stateColor(s(v.state)) + (v.progress !== undefined ? style.dim(`  ${s(v.progress)}%`) : "")],
    ["credits", v.creditsConsumed === null ? style.dim("—") : s(v.creditsConsumed)],
  ];
  if (Array.isArray(v.resultUrls) && v.resultUrls.length) (v.resultUrls as string[]).forEach((u, i) => entries.push([i === 0 ? "urls" : "", u]));
  if (v.failMsg) entries.push(["reason", style.red(s(v.failMsg))]);
  return panel(`${brandTag(style)}  task status`, entries, style);
}

function renderDryRun(v: Rec, style: Style): string {
  const body = JSON.stringify(v.request, null, 2)
    .split("\n")
    .map((l) => "  " + l.replace(/"([^"]+)":/g, (_, k: string) => style.brand(`"${k}"`) + ":"))
    .join("\n");
  return [
    panel(`${brandTag(style)}  dry run ${style.dim("(nothing sent)")}`, [
      ["endpoint", `${style.bold("POST")} ${s(v.endpoint)}`],
      ["estimate", v.estimate === null ? style.dim("unknown — pass --max-credits to run") : `${s(v.estimate)} credits`],
    ], style),
    body,
  ].join("\n");
}

/** Fallback: arrays of objects → table, objects → panel, scalars → text. */
function genericRender(value: unknown, style: Style): string {
  if (Array.isArray(value) && value.length && typeof value[0] === "object") {
    const keys = [...new Set(value.flatMap((r) => Object.keys(r as Rec)))];
    return table(value as Rec[], keys.map((k) => ({ key: k, header: k, max: 48 })), style, termWidth());
  }
  if (value && typeof value === "object") {
    return panel(brandTag(style), Object.entries(value as Rec).map(([k, v]) => [k, s(v)] as [string, string]), style);
  }
  return s(value);
}
