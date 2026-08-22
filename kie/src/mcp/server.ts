import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { parseArgs } from "../args.js";
import type { KieClient } from "../client.js";
import { MODELS } from "../catalog.js";
import type { KieConfig } from "../config.js";
import { runGenerate, GENERATE_BOOLEANS } from "../commands/generate.js";
import { runCredits, runLedger, runModels, runUpload } from "../commands/misc.js";
import { runStatus, runWait } from "../commands/tasks.js";
import type { Output, View } from "../output.js";
import { makeStyle } from "../ui.js";
import { ERR, fail, ok, type JsonRpcRequest, type JsonRpcResponse } from "./protocol.js";

/**
 * MCP server (tools only) that wraps the CLI commands. Every tool goes through exactly the
 * same code path as the terminal — same catalog, same spend guard, same ledger — so the daily
 * budget is shared no matter which door a request comes through. stdio only, on purpose:
 * a network server holding a paid key is the thing this project exists to avoid.
 */
export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const SERVER_NAME = "kie";

export interface McpDeps {
  client: KieClient;
  config: KieConfig;
  version: string;
  /** Max bytes of an image to inline into tool results as base64. */
  inlineImageBytes?: number;
  log?: (message: string) => void;
}

// ---- tool catalog ----------------------------------------------------------

const IMAGE_MODELS = MODELS.filter((m) => m.kind === "image").map((m) => m.name);
const VIDEO_MODELS = MODELS.filter((m) => m.kind === "video").map((m) => m.name);

const TOOLS = [
  {
    name: "kie_credits",
    description: "Account balance on KIE.ai plus today's spend against the local daily budget. Call this before the first generation of a session.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "kie_models",
    description: "List the curated models with the flags each supports. Use the `model` alias in kie_generate_image / kie_generate_video.",
    inputSchema: { type: "object", properties: { kind: { type: "string", enum: ["image", "video"] } }, additionalProperties: false },
  },
  {
    name: "kie_generate_image",
    description:
      "Generate an image on KIE.ai, wait for it, download it and return the local file path (and the image itself when small enough). " +
      "Models: " + IMAGE_MODELS.join(", ") + ". nano-banana-2 has a verified price (1K=8, 2K=12, 4K=18 credits); other models require max_credits. " +
      "Blocked by the spend guard → isError with the reason; nothing was sent. Never retry with a higher cap without asking the user.",
    inputSchema: {
      type: "object",
      required: ["model", "prompt"],
      properties: {
        model: { type: "string", enum: IMAGE_MODELS },
        prompt: { type: "string" },
        refs: { type: "array", items: { type: "string" }, description: "Reference image URLs (edit / style). Use kie_upload for local files." },
        aspect: { type: "string", description: "e.g. 1:1, 16:9, 9:16, 4:3, 3:4" },
        resolution: { type: "string", description: "1K | 2K | 4K" },
        format: { type: "string", enum: ["png", "jpg"] },
        out: { type: "string", description: "Output directory (default from config, ./kie-media)" },
        name: { type: "string", description: "Base filename" },
        max_credits: { type: "number", description: "Most credits you accept to spend on this task" },
        dry_run: { type: "boolean", description: "Return the exact request without sending it" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "kie_generate_video",
    description:
      "Generate a video on KIE.ai, wait for it, download it and return the local file path. Models: " + VIDEO_MODELS.join(", ") +
      ". Video has no verified price: max_credits is REQUIRED — ask the user for the cap (start ≤ 80). Images first; only make video after the user approves the look.",
    inputSchema: {
      type: "object",
      required: ["model", "prompt", "max_credits"],
      properties: {
        model: { type: "string", enum: VIDEO_MODELS },
        prompt: { type: "string" },
        image: { type: "string", description: "First-frame / source image URL" },
        end_image: { type: "string", description: "Last-frame image URL" },
        refs: { type: "array", items: { type: "string" }, description: "Reference image URLs" },
        duration: { type: "number", description: "Seconds" },
        aspect: { type: "string" },
        resolution: { type: "string", description: "480p | 720p | 1080p (model dependent)" },
        sound: { type: "boolean" },
        fast: { type: "boolean", description: "Cheaper variant where available (veo3_fast)" },
        out: { type: "string" },
        name: { type: "string" },
        max_credits: { type: "number" },
        dry_run: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "kie_task_status",
    description: "One status poll for a task id, no download.",
    inputSchema: { type: "object", required: ["task_id"], properties: { task_id: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "kie_wait_task",
    description: "Wait for a task to finish, download the result and settle the ledger (use after a timeout).",
    inputSchema: { type: "object", required: ["task_id"], properties: { task_id: { type: "string" }, out: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "kie_upload",
    description: "Upload a local file to KIE's temporary storage (deleted after ~3 days) and return a URL usable as refs/image.",
    inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "kie_ledger",
    description: "Local spend log with the real credits consumed per task.",
    inputSchema: { type: "object", properties: { limit: { type: "number" } }, additionalProperties: false },
  },
] as const;

export type ToolName = (typeof TOOLS)[number]["name"];

// ---- output capture ---------------------------------------------------------

interface Captured {
  results: unknown[];
  messages: string[];
}

function captureOutput(c: Captured): Output {
  return {
    mode: "json",
    style: makeStyle(false),
    json: (v: unknown, _view?: View) => {
      c.results.push(v);
    },
    info: (m) => c.messages.push(m),
    warn: (m) => c.messages.push("warning: " + m),
    error: (m) => c.messages.push("error: " + m),
    success: (m) => c.messages.push(m),
    progress: () => {},
    endProgress: () => {},
  };
}

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

function imageContent(files: string[], maxBytes: number): Array<{ type: "image"; data: string; mimeType: string }> {
  const out: Array<{ type: "image"; data: string; mimeType: string }> = [];
  for (const f of files) {
    const mime = MIME[extname(f).toLowerCase()];
    if (!mime) continue;
    try {
      if (statSync(f).size > maxBytes) continue;
      out.push({ type: "image", data: readFileSync(f).toString("base64"), mimeType: mime });
    } catch {
      /* unreadable → skip, the path is still reported */
    }
  }
  return out;
}

// ---- argument → argv mapping ------------------------------------------------

type Args = Record<string, unknown>;

function argv(a: Args, positionals: string[], map: Record<string, string>, booleans: string[] = []): string[] {
  const out = [...positionals];
  for (const [key, flag] of Object.entries(map)) {
    const v = a[key];
    if (v === undefined || v === null) continue;
    if (booleans.includes(key)) {
      if (v === true) out.push(`--${flag}`);
      continue;
    }
    if (Array.isArray(v)) for (const item of v) out.push(`--${flag}`, String(item));
    else out.push(`--${flag}`, String(v));
  }
  out.push("--json", "--quiet");
  return out;
}

const GEN_MAP = {
  prompt: "prompt",
  refs: "ref",
  image: "image",
  end_image: "end-image",
  aspect: "aspect",
  resolution: "resolution",
  duration: "duration",
  sound: "sound",
  fast: "fast",
  format: "format",
  out: "out",
  name: "name",
  max_credits: "max-credits",
  dry_run: "dry-run",
};
const GEN_BOOLS = ["sound", "fast", "dry_run"];

// ---- server -----------------------------------------------------------------

export function createMcpServer(deps: McpDeps) {
  const inlineMax = deps.inlineImageBytes ?? 1_500_000;
  const log = deps.log ?? (() => {});

  async function callTool(name: string, a: Args): Promise<{ content: unknown[]; isError?: boolean }> {
    const cap: Captured = { results: [], messages: [] };
    const output = captureOutput(cap);
    const deps3 = { client: deps.client, config: deps.config, output };
    const lazy = { client: () => deps.client, config: deps.config, output };
    let code: number;

    switch (name as ToolName) {
      case "kie_credits":
        code = await runCredits(parseArgs([]), lazy);
        break;
      case "kie_models":
        code = await runModels(parseArgs(argv(a, [], { kind: "kind" })), lazy);
        break;
      case "kie_generate_image":
        code = await runGenerate("image", parseArgs(argv(a, [String(a.model)], GEN_MAP, GEN_BOOLS), GENERATE_BOOLEANS), deps3);
        break;
      case "kie_generate_video":
        code = await runGenerate("video", parseArgs(argv(a, [String(a.model)], GEN_MAP, GEN_BOOLS), GENERATE_BOOLEANS), deps3);
        break;
      case "kie_task_status":
        code = await runStatus(parseArgs(argv(a, [String(a.task_id)], {})), deps3);
        break;
      case "kie_wait_task":
        code = await runWait(parseArgs(argv(a, [String(a.task_id)], { out: "out" })), deps3);
        break;
      case "kie_upload":
        code = await runUpload(parseArgs(argv(a, [String(a.path)], {})), lazy);
        break;
      case "kie_ledger":
        code = await runLedger(parseArgs(argv(a, [], { limit: "limit" })), lazy);
        break;
      default:
        throw new ToolError(ERR.METHOD_NOT_FOUND, `Unknown tool: ${name}`);
    }

    const result = cap.results.at(-1);
    const content: unknown[] = [];
    if (result !== undefined) content.push({ type: "text", text: JSON.stringify(result, null, 2) });
    if (code === 0 && result && typeof result === "object" && Array.isArray((result as { files?: string[] }).files)) {
      content.push(...imageContent((result as { files: string[] }).files, inlineMax));
    }
    if (code !== 0) {
      const why = cap.messages.filter((m) => m.startsWith("error:")).join("\n") || `exit code ${code}`;
      content.push({ type: "text", text: `${why}\n(exit code ${code}: ${EXIT[code] ?? "error"})` });
      return { content, isError: true };
    }
    return { content };
  }

  async function handle(msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const id = msg.id ?? null;
    const isNotification = msg.id === undefined;
    try {
      switch (msg.method) {
        case "initialize": {
          const requested = (msg.params as { protocolVersion?: string } | undefined)?.protocolVersion;
          const protocolVersion = requested && PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
          return ok(id, {
            protocolVersion,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: SERVER_NAME, version: deps.version },
            instructions:
              "kie generates images and video on KIE.ai with the API key kept in the user's OS keystore. " +
              "Call kie_credits first. Images before video; video requires max_credits — ask the user for the cap. " +
              "A spend-guard block (isError, exit code 3) means nothing was sent: report the reason, never raise the cap on your own. " +
              "Return local file paths to the user, never KIE URLs (they expire in 24h).",
          });
        }
        case "notifications/initialized":
        case "notifications/cancelled":
          return null;
        case "ping":
          return ok(id, {});
        case "tools/list":
          return ok(id, { tools: TOOLS });
        case "tools/call": {
          const p = msg.params as { name?: string; arguments?: Args } | undefined;
          if (!p?.name) return fail(id, ERR.INVALID_PARAMS, "tools/call requires params.name");
          if (!TOOLS.some((t) => t.name === p.name)) return fail(id, ERR.INVALID_PARAMS, `Unknown tool: ${p.name}`);
          log(`tools/call ${p.name}`);
          return ok(id, await callTool(p.name, p.arguments ?? {}));
        }
        default:
          if (isNotification) return null;
          return fail(id, ERR.METHOD_NOT_FOUND, `Method not found: ${msg.method}`);
      }
    } catch (err) {
      if (err instanceof ToolError) return fail(id, err.code, err.message);
      const message = err instanceof Error ? err.message : String(err);
      // Tool execution failures are reported as tool results, not protocol errors (per MCP spec).
      if (msg.method === "tools/call") return ok(id, { content: [{ type: "text", text: message }], isError: true });
      return fail(id, ERR.INTERNAL, message);
    }
  }

  return { handle, tools: TOOLS };
}

class ToolError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

const EXIT: Record<number, string> = {
  1: "task failed on KIE's side",
  2: "usage error",
  3: "blocked by the spend guard — nothing was sent",
  4: "timed out, task still running",
  5: "API/auth error",
};
