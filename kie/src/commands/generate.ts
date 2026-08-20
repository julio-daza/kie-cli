import { bool, list, num, str, type ParsedArgs } from "../args.js";
import { findModel, MODELS, parseSetFlags, type BuiltRequest, type GenericInput, type Kind } from "../catalog.js";
import type { KieClient } from "../client.js";
import type { KieConfig } from "../config.js";
import { checkSpend } from "../guard.js";
import { appendLedger, readLedger } from "../ledger.js";
import type { Output } from "../output.js";
import { waitForTask } from "./tasks.js";

export const GENERATE_BOOLEANS = new Set(["sound", "fast", "dry-run", "wait", "no-wait", "json", "quiet"]);

export interface GenerateDeps {
  client: KieClient;
  config: KieConfig;
  output: Output;
}

function genericFromArgs(args: ParsedArgs): GenericInput {
  const f = args.flags;
  return {
    prompt: str(f, "prompt") ?? "",
    refs: list(f, "ref"),
    image: str(f, "image"),
    endImage: str(f, "end-image"),
    aspect: str(f, "aspect"),
    resolution: str(f, "resolution"),
    duration: num(f, "duration"),
    sound: f.sound === undefined ? undefined : bool(f, "sound"),
    fast: f.fast === undefined ? undefined : bool(f, "fast"),
    format: str(f, "format"),
    extra: parseSetFlags(list(f, "set")),
  };
}

/** `kie image <model> ...` and `kie video <model> ...` */
export async function runGenerate(kind: Kind, args: ParsedArgs, deps: GenerateDeps): Promise<number> {
  const name = args.positionals[0];
  if (!name) {
    deps.output.error(`Usage: kie ${kind} <model> --prompt "..." [options]. Models: ${MODELS.filter((m) => m.kind === kind).map((m) => m.name).join(", ")}`);
    return 2;
  }
  const spec = findModel(name);
  if (!spec) {
    deps.output.error(`Unknown model "${name}". Run \`kie models\` or use \`kie run <model-id> --input '{...}'\`.`);
    return 2;
  }
  if (spec.kind !== kind) {
    deps.output.error(`"${name}" is a ${spec.kind} model. Use \`kie ${spec.kind} ${name} ...\`.`);
    return 2;
  }
  const built = spec.build(genericFromArgs(args));
  return submit(built, kind, args, deps);
}

/** `kie run <model-id> --input '{json}'` — escape hatch for any Market model. */
export async function runRaw(args: ParsedArgs, deps: GenerateDeps): Promise<number> {
  const model = args.positionals[0];
  const inputRaw = str(args.flags, "input");
  if (!model || !inputRaw) {
    deps.output.error(`Usage: kie run <model-id> --input '{"prompt":"..."}' --max-credits <n>`);
    return 2;
  }
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(inputRaw) as Record<string, unknown>;
  } catch {
    deps.output.error("--input must be valid JSON.");
    return 2;
  }
  if ("callBackUrl" in input) {
    deps.output.error("callBackUrl is not allowed: this CLI never sends callbacks.");
    return 2;
  }
  return submit({ model, family: "market", input, estimate: null }, "raw", args, deps);
}

async function submit(built: BuiltRequest, kind: Kind | "raw", args: ParsedArgs, deps: GenerateDeps): Promise<number> {
  const { client, config, output } = deps;
  const maxCredits = num(args.flags, "max-credits");
  const dryRun = bool(args.flags, "dry-run");

  const request = built.family === "veo" ? built.input : { model: built.model, input: built.input };

  if (dryRun) {
    output.json({ dryRun: true, family: built.family, endpoint: built.family === "veo" ? "/veo/generate" : "/jobs/createTask", request, estimate: built.estimate });
    return 0;
  }

  let balance: number | null = null;
  try {
    balance = await client.credits();
  } catch (e) {
    output.warn(`Could not read balance (${(e as Error).message}); continuing with ledger-only guard.`);
  }

  const guard = checkSpend({ estimate: built.estimate, maxCredits, balance, ledger: readLedger(), config });
  if (!guard.ok) {
    output.error(`Spend guard blocked the request: ${guard.reason}`);
    output.info(`Today: ${guard.spentToday} credits used, ${guard.remainingToday} remaining. Balance: ${balance ?? "unknown"}.`);
    return 3;
  }

  const taskId = built.family === "veo" ? await client.veoGenerate(built.input) : await client.createTask(built.model, built.input);

  appendLedger({
    ts: new Date().toISOString(),
    event: "created",
    taskId,
    model: built.model,
    kind,
    estimate: built.estimate ?? maxCredits ?? null,
    credits: null,
  });

  const shouldWait = args.flags["no-wait"] ? false : true;
  if (!shouldWait) {
    output.json({ taskId, model: built.model, family: built.family, estimate: built.estimate, state: "submitted" });
    output.info(`Submitted. Check with: kie wait ${taskId}${built.family === "veo" ? " --family veo" : ""}`);
    return 0;
  }

  return waitForTask(taskId, built.family, args, deps, built.model);
}

