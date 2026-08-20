/**
 * Thin HTTP client for KIE.ai. Talks ONLY to:
 *   - https://api.kie.ai            (tasks, credits)
 *   - https://kieai.redpandaai.co   (KIE's official file-upload host)
 * and to the result URLs KIE returns (for downloads).
 *
 * It never sends a `callBackUrl`: results are polled, so nothing about your
 * generations is pushed to any third-party endpoint.
 */
export const API_BASE = "https://api.kie.ai/api/v1";
export const UPLOAD_BASE = "https://kieai.redpandaai.co";

export interface KieEnvelope<T> {
  code: number;
  msg?: string;
  message?: string;
  data: T;
}

export type TaskState = "waiting" | "queuing" | "generating" | "success" | "fail";

export interface TaskStatus {
  taskId: string;
  model: string;
  state: TaskState;
  resultUrls: string[];
  creditsConsumed: number | null;
  failCode?: string;
  failMsg?: string;
  progress?: number;
  raw: unknown;
}

export class KieError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly apiCode?: number,
  ) {
    super(message);
    this.name = "KieError";
  }
}

export interface ClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  apiBase?: string;
  uploadBase?: string;
}

export class KieClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly apiBase: string;
  private readonly uploadBase: string;

  constructor(private readonly opts: ClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.apiBase = (opts.apiBase ?? API_BASE).replace(/\/+$/, "");
    this.uploadBase = (opts.uploadBase ?? UPLOAD_BASE).replace(/\/+$/, "");
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<KieEnvelope<T>> {
    const url = `${this.apiBase}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.opts.apiKey}`,
      ...(init.headers as Record<string, string> | undefined),
    };
    if (init.body && typeof init.body === "string") headers["Content-Type"] = "application/json";

    const res = await this.fetchImpl(url, { ...init, headers, signal: AbortSignal.timeout(this.timeoutMs) });
    let body: KieEnvelope<T>;
    try {
      body = (await res.json()) as KieEnvelope<T>;
    } catch {
      throw new KieError(`HTTP ${res.status}: KIE returned a non-JSON response.`, res.status);
    }
    const msg = body.msg ?? body.message ?? "unknown error";
    if (!res.ok) throw new KieError(`HTTP ${res.status}: ${msg}`, res.status, body.code);
    // KIE signals application errors with HTTP 200 + code !== 200.
    if (body.code !== 200) throw new KieError(`KIE error ${body.code}: ${msg}`, res.status, body.code);
    return body;
  }

  /** GET /chat/credit → remaining credits. */
  async credits(): Promise<number> {
    const res = await this.request<number>("/chat/credit");
    return Number(res.data);
  }

  /** POST /jobs/createTask (Market API). Deliberately no callBackUrl. */
  async createTask(model: string, input: Record<string, unknown>): Promise<string> {
    const res = await this.request<{ taskId: string }>("/jobs/createTask", {
      method: "POST",
      body: JSON.stringify({ model, input }),
    });
    if (!res.data?.taskId) throw new KieError("createTask succeeded but returned no taskId.", 200, res.code);
    return res.data.taskId;
  }

  /** GET /jobs/recordInfo (Market API). */
  async taskStatus(taskId: string): Promise<TaskStatus> {
    const res = await this.request<MarketRecord>(`/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`);
    return normalizeMarket(res.data);
  }

  /** POST /veo/generate — Veo 3 lives on its own endpoints. */
  async veoGenerate(body: Record<string, unknown>): Promise<string> {
    const res = await this.request<{ taskId: string }>("/veo/generate", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.data?.taskId) throw new KieError("veo/generate returned no taskId.", 200, res.code);
    return res.data.taskId;
  }

  /** GET /veo/record-info. */
  async veoStatus(taskId: string): Promise<TaskStatus> {
    const res = await this.request<VeoRecord>(`/veo/record-info?taskId=${encodeURIComponent(taskId)}`);
    return normalizeVeo(res.data);
  }

  /** Uploads a local file to KIE's temporary storage (auto-deleted after ~3 days). Returns a public URL. */
  async upload(bytes: Uint8Array, filename: string, contentType: string): Promise<string> {
    const form = new FormData();
    form.append("file", new Blob([bytes as unknown as BlobPart], { type: contentType }), filename);
    form.append("uploadPath", "kie-cli");
    const res = await this.fetchImpl(`${this.uploadBase}/api/file-stream-upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.opts.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs * 3),
    });
    let body: KieEnvelope<{ fileUrl?: string; downloadUrl?: string }> & { success?: boolean };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      throw new KieError(`HTTP ${res.status}: upload returned a non-JSON response.`, res.status);
    }
    const url = body.data?.fileUrl ?? body.data?.downloadUrl;
    if (!res.ok || !url) {
      throw new KieError(`HTTP ${res.status}: ${body.msg ?? body.message ?? "upload failed"}`, res.status, body.code);
    }
    return url;
  }

  /** Downloads a result URL into memory (result URLs are public, short-lived, no auth). */
  async download(url: string, maxBytes = 512 * 1024 * 1024): Promise<{ bytes: Uint8Array; contentType: string | null }> {
    const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(this.timeoutMs * 5), redirect: "follow" });
    if (!res.ok) throw new KieError(`HTTP ${res.status}: could not download result.`, res.status);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > maxBytes) throw new KieError(`Result is ${len} bytes, over the ${maxBytes} byte limit.`, 200);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new KieError(`Result exceeds the ${maxBytes} byte limit.`, 200);
    return { bytes: buf, contentType: res.headers.get("content-type") };
  }
}

// ---- response normalisation -------------------------------------------------

interface MarketRecord {
  taskId: string;
  model: string;
  state: TaskState;
  resultJson?: string | null;
  failCode?: string;
  failMsg?: string;
  progress?: number;
  creditsConsumed?: number;
}

export function normalizeMarket(d: MarketRecord): TaskStatus {
  let resultUrls: string[] = [];
  if (d.resultJson) {
    try {
      const parsed = JSON.parse(d.resultJson) as { resultUrls?: string[] };
      resultUrls = Array.isArray(parsed.resultUrls) ? parsed.resultUrls : [];
    } catch {
      resultUrls = [];
    }
  }
  return {
    taskId: d.taskId,
    model: d.model,
    state: d.state,
    resultUrls,
    creditsConsumed: typeof d.creditsConsumed === "number" ? d.creditsConsumed : null,
    failCode: d.failCode || undefined,
    failMsg: d.failMsg || undefined,
    progress: d.progress,
    raw: d,
  };
}

interface VeoRecord {
  taskId: string;
  successFlag: 0 | 1 | 2 | 3;
  errorMessage?: string;
  errorCode?: string;
  response?: { resultUrls?: string[]; originUrls?: string[] } | null;
  creditsConsumed?: number;
}

export function normalizeVeo(d: VeoRecord): TaskStatus {
  const state: TaskState = d.successFlag === 1 ? "success" : d.successFlag === 0 ? "generating" : "fail";
  return {
    taskId: d.taskId,
    model: "veo3",
    state,
    resultUrls: d.response?.resultUrls ?? [],
    creditsConsumed: typeof d.creditsConsumed === "number" ? d.creditsConsumed : null,
    failCode: d.errorCode || undefined,
    failMsg: d.errorMessage || undefined,
    raw: d,
  };
}
