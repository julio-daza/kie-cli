import { basename } from "node:path";
import { bool, num, str, type ParsedArgs } from "../args.js";
import type { Family } from "../catalog.js";
import type { KieClient, TaskStatus } from "../client.js";
import type { KieConfig } from "../config.js";
import { downloadResults } from "../download.js";
import { appendLedger, readLedger } from "../ledger.js";
import type { Output } from "../output.js";

interface Deps {
  client: KieClient;
  config: KieConfig;
  output: Output;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function familyFor(args: ParsedArgs, taskId: string): Family {
  const explicit = str(args.flags, "family");
  if (explicit === "veo" || explicit === "market") return explicit;
  const fromLedger = readLedger().find((e) => e.taskId === taskId && e.event === "created");
  return fromLedger?.model.startsWith("veo3") ? "veo" : "market";
}

async function fetchStatus(client: KieClient, taskId: string, family: Family): Promise<TaskStatus> {
  return family === "veo" ? client.veoStatus(taskId) : client.taskStatus(taskId);
}

/** `kie status <taskId>` — single poll, no download. */
export async function runStatus(args: ParsedArgs, deps: Deps): Promise<number> {
  const taskId = args.positionals[0];
  if (!taskId) {
    deps.output.error("Usage: kie status <taskId> [--family veo]");
    return 2;
  }
  const s = await fetchStatus(deps.client, taskId, familyFor(args, taskId));
  deps.output.json({ taskId: s.taskId, model: s.model, state: s.state, progress: s.progress, creditsConsumed: s.creditsConsumed, resultUrls: s.resultUrls, failCode: s.failCode, failMsg: s.failMsg }, { kind: "status" });
  return s.state === "fail" ? 1 : 0;
}

/** `kie wait <taskId> [--out dir] [--timeout s]` — poll until done, download, settle ledger. */
export async function runWait(args: ParsedArgs, deps: Deps): Promise<number> {
  const taskId = args.positionals[0];
  if (!taskId) {
    deps.output.error("Usage: kie wait <taskId> [--out ./dir] [--timeout 900] [--family veo]");
    return 2;
  }
  const family = familyFor(args, taskId);
  const model = readLedger().find((e) => e.taskId === taskId && e.event === "created")?.model ?? "unknown";
  return waitForTask(taskId, family, args, deps, model);
}

export async function waitForTask(taskId: string, family: Family, args: ParsedArgs, deps: Deps, model: string): Promise<number> {
  const { client, config, output } = deps;
  const timeoutS = num(args.flags, "timeout") ?? config.waitTimeoutSeconds;
  const pollS = Math.max(2, num(args.flags, "poll") ?? config.pollSeconds);
  const outDir = str(args.flags, "out") ?? config.outDir;
  const name = str(args.flags, "name") ?? `${basename(model).replace(/[^a-zA-Z0-9.-]+/g, "-")}-${taskId.slice(-8)}`;
  const noDownload = bool(args.flags, "no-download");
  const started = Date.now();

  let last: TaskStatus | null = null;
  while (Date.now() - started < timeoutS * 1000) {
    last = await fetchStatus(client, taskId, family);
    if (last.state === "success" || last.state === "fail") break;
    output.progress(`${model}  ${last.state}${last.progress !== undefined ? ` ${last.progress}%` : ""}  ${taskId}`, started);
    await sleep(pollS * 1000);
  }

  output.endProgress();
  if (!last || (last.state !== "success" && last.state !== "fail")) {
    output.warn(`Timed out after ${timeoutS}s; the task keeps running on KIE. Resume with: kie wait ${taskId}`);
    output.json({ taskId, model, state: last?.state ?? "unknown", timedOut: true }, { kind: "task" });
    return 4;
  }

  if (last.state === "fail") {
    appendLedger({ ts: new Date().toISOString(), event: "failed", taskId, model, kind: "raw", estimate: null, credits: last.creditsConsumed ?? 0, error: last.failMsg });
    output.json({ taskId, model, state: "fail", failCode: last.failCode, failMsg: last.failMsg, creditsConsumed: last.creditsConsumed }, { kind: "task" });
    output.error(`Task failed: ${last.failMsg ?? last.failCode ?? "unknown reason"}`);
    return 1;
  }

  let files: string[] = [];
  if (!noDownload && last.resultUrls.length) {
    output.progress(`downloading ${last.resultUrls.length} file${last.resultUrls.length > 1 ? "s" : ""}…`, started);
    files = await downloadResults(client, last.resultUrls, outDir, name);
    output.endProgress();
  }
  appendLedger({ ts: new Date().toISOString(), event: "completed", taskId, model, kind: "raw", estimate: null, credits: last.creditsConsumed, files });
  output.json({ taskId, model, state: "success", creditsConsumed: last.creditsConsumed, files, resultUrls: last.resultUrls, note: "resultUrls expire in ~24h; use files." }, { kind: "task" });
  return 0;
}
