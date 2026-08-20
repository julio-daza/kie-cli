/**
 * Curated model catalog. Only models whose request shape was verified against
 * KIE's docs are listed; anything else can still be called with `kie run`.
 *
 * Credit estimates are intentionally sparse: KIE does not publish per-model
 * prices in its API docs, only on kie.ai/pricing. Where an estimate is missing
 * the CLI relies on the daily-budget guard, which uses the real
 * `creditsConsumed` reported by the API after each task.
 */
export type Kind = "image" | "video";
export type Family = "market" | "veo";

export interface GenericInput {
  prompt: string;
  /** Reference images (edit / style / multimodal reference). */
  refs: string[];
  /** First frame (video) or single source image. */
  image?: string;
  /** Last frame (video). */
  endImage?: string;
  aspect?: string;
  resolution?: string;
  duration?: number;
  sound?: boolean;
  fast?: boolean;
  format?: string;
  /** Raw extra fields from --set key=value, merged last. */
  extra: Record<string, unknown>;
}

export interface BuiltRequest {
  model: string;
  family: Family;
  input: Record<string, unknown>;
  estimate: number | null;
}

export interface ModelSpec {
  /** Alias the user types. */
  name: string;
  kind: Kind;
  label: string;
  docs: string;
  /** Generic flags this model understands (for `kie models`). */
  supports: string[];
  build: (g: GenericInput) => BuiltRequest;
  notes?: string;
}

const clean = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

function need(value: string | undefined, what: string): string {
  if (!value) throw new Error(`Missing required ${what}.`);
  return value;
}

function oneOf(value: string | undefined, allowed: string[], flag: string, fallback?: string): string | undefined {
  const v = value ?? fallback;
  if (v === undefined) return undefined;
  if (!allowed.includes(v)) throw new Error(`--${flag} must be one of: ${allowed.join(", ")} (got "${v}")`);
  return v;
}

const SEEDREAM_SIZE: Record<string, string> = {
  "1:1": "square_hd",
  "4:3": "landscape_4_3",
  "3:4": "portrait_4_3",
  "3:2": "landscape_3_2",
  "2:3": "portrait_3_2",
  "16:9": "landscape_16_9",
  "9:16": "portrait_16_9",
  "21:9": "landscape_21_9",
};

export const MODELS: ModelSpec[] = [
  // ---------------------------------------------------------------- images
  {
    name: "nano-banana-2",
    kind: "image",
    label: "Google Nano Banana 2 (Gemini 3.1 Flash Image) — generate + edit with up to 14 refs",
    docs: "https://docs.kie.ai/market/google/nano-banana-2",
    supports: ["prompt", "ref", "aspect", "resolution (1K|2K|4K)", "format (png|jpg)"],
    notes: "Estimate: 1K=8, 2K=12, 4K=18 credits (verified Aug 2026).",
    build: (g) => {
      const resolution = oneOf(g.resolution, ["1K", "2K", "4K"], "resolution", "1K")!;
      const est: Record<string, number> = { "1K": 8, "2K": 12, "4K": 18 };
      return {
        model: "nano-banana-2",
        family: "market",
        input: clean({
          prompt: need(g.prompt, "--prompt"),
          image_input: g.refs,
          aspect_ratio: g.aspect ?? "1:1",
          resolution,
          output_format: oneOf(g.format, ["png", "jpg"], "format", "png"),
          ...g.extra,
        }),
        estimate: est[resolution] ?? null,
      };
    },
  },
  {
    name: "seedream-v4",
    kind: "image",
    label: "ByteDance Seedream V4 — text-to-image, or edit when --ref is given",
    docs: "https://docs.kie.ai/market/bytedance/seedream-v4-text-to-image",
    supports: ["prompt", "ref (switches to edit model)", "aspect", "resolution (1K|2K|4K)"],
    build: (g) => {
      const isEdit = g.refs.length > 0;
      const aspect = g.aspect ?? "1:1";
      const size = SEEDREAM_SIZE[aspect];
      if (!size) throw new Error(`--aspect must be one of: ${Object.keys(SEEDREAM_SIZE).join(", ")}`);
      return {
        model: isEdit ? "bytedance/seedream-v4-edit" : "bytedance/seedream-v4-text-to-image",
        family: "market",
        input: clean({
          prompt: need(g.prompt, "--prompt"),
          image_urls: isEdit ? g.refs : undefined,
          image_size: size,
          image_resolution: oneOf(g.resolution, ["1K", "2K", "4K"], "resolution", "1K"),
          ...g.extra,
        }),
        estimate: null,
      };
    },
  },
  // ---------------------------------------------------------------- video
  {
    name: "kling-3.0",
    kind: "video",
    label: "Kling 3.0 — text/image-to-video, native audio, 3–15 s",
    docs: "https://docs.kie.ai/market/kling/text-to-video",
    supports: ["prompt", "image (start)", "end-image", "duration (3-15)", "aspect (16:9|9:16|1:1)", "sound", "--set mode=pro"],
    build: (g) => {
      const frames = [g.image, g.endImage].filter((x): x is string => Boolean(x));
      if (g.endImage && !g.image) throw new Error("--end-image requires --image.");
      const duration = g.duration ?? 5;
      if (duration < 3 || duration > 15) throw new Error("--duration must be 3..15 seconds for Kling 3.0.");
      return {
        model: "kling-3.0/video",
        family: "market",
        input: clean({
          prompt: need(g.prompt, "--prompt"),
          image_urls: frames.length ? frames : undefined,
          duration: String(duration),
          aspect_ratio: oneOf(g.aspect, ["16:9", "9:16", "1:1"], "aspect", "16:9"),
          mode: "std",
          sound: g.sound ?? false,
          ...g.extra,
        }),
        estimate: null,
      };
    },
  },
  {
    name: "seedance-2.5",
    kind: "video",
    label: "ByteDance Seedance 2.5 — text/frames/multimodal-reference-to-video, 4–30 s",
    docs: "https://docs.kie.ai/market/bytedance/seedance-2-5",
    supports: ["prompt", "image (first frame)", "end-image", "ref (reference images)", "duration (4-30)", "resolution (480p|720p|1080p)", "aspect", "sound"],
    build: (g) => {
      if (g.endImage && !g.image) throw new Error("--end-image requires --image.");
      const duration = g.duration ?? 5;
      if (duration < 4 || duration > 30) throw new Error("--duration must be 4..30 seconds for Seedance 2.5.");
      return {
        model: "bytedance/seedance-2-5",
        family: "market",
        input: clean({
          prompt: need(g.prompt, "--prompt"),
          first_frame_url: g.image,
          last_frame_url: g.endImage,
          reference_image_urls: g.refs.length ? g.refs : undefined,
          generate_audio: g.sound ?? false,
          resolution: oneOf(g.resolution, ["480p", "720p", "1080p"], "resolution", "720p"),
          aspect_ratio: oneOf(g.aspect, ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"], "aspect", "16:9"),
          duration,
          ...g.extra,
        }),
        estimate: null,
      };
    },
  },
  {
    name: "minimax-h3",
    kind: "video",
    label: "MiniMax H3 (Hailuo 03) — text / image / reference-to-video, 4–15 s",
    docs: "https://docs.kie.ai/market/minimax-h3/reference-to-video",
    supports: ["prompt", "image (first frame)", "end-image", "ref (1-9 reference images)", "duration (4-15)", "aspect"],
    build: (g) => {
      const duration = g.duration ?? 6;
      if (duration < 4 || duration > 15) throw new Error("--duration must be 4..15 seconds for MiniMax H3.");
      if (g.image && g.refs.length) throw new Error("Use either --image (image-to-video) or --ref (reference-to-video), not both.");
      let model = "minimax-h3/text-to-video";
      const input: Record<string, unknown> = { prompt: need(g.prompt, "--prompt"), duration };
      if (g.image) {
        model = "minimax-h3/image-to-video";
        input.first_frame_url = g.image;
        if (g.endImage) input.last_frame_url = g.endImage;
      } else if (g.refs.length) {
        model = "minimax-h3/reference-to-video";
        input.reference_image_urls = g.refs;
        input.aspect_ratio = g.aspect ?? "16:9";
      } else {
        input.aspect_ratio = oneOf(g.aspect, ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], "aspect", "16:9");
      }
      return { model, family: "market", input: clean({ ...input, ...g.extra }), estimate: null };
    },
  },
  {
    name: "veo3",
    kind: "video",
    label: "Google Veo 3 — text/image-to-video (own endpoint); --fast for veo3_fast",
    docs: "https://docs.kie.ai/veo3-api/quickstart",
    supports: ["prompt", "image (1 frame)", "end-image", "aspect (16:9|9:16|Auto)", "fast"],
    notes: "Uses /veo/generate + /veo/record-info. 1080p only for 16:9.",
    build: (g) => {
      if (g.endImage && !g.image) throw new Error("--end-image requires --image.");
      const frames = [g.image, g.endImage].filter((x): x is string => Boolean(x));
      return {
        model: g.fast ? "veo3_fast" : "veo3",
        family: "veo",
        input: clean({
          prompt: need(g.prompt, "--prompt"),
          imageUrls: frames.length ? frames : undefined,
          model: g.fast ? "veo3_fast" : "veo3",
          aspectRatio: oneOf(g.aspect, ["16:9", "9:16", "Auto"], "aspect", "16:9"),
          enableTranslation: true,
          ...g.extra,
        }),
        estimate: null,
      };
    },
  },
];

export function findModel(name: string): ModelSpec | undefined {
  return MODELS.find((m) => m.name === name);
}

/** Parses `--set key=value` pairs; values are JSON when possible, strings otherwise. */
export function parseSetFlags(pairs: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq <= 0) throw new Error(`--set expects key=value, got "${pair}"`);
    const key = pair.slice(0, eq);
    const raw = pair.slice(eq + 1);
    if (key === "callBackUrl") throw new Error("callBackUrl is not allowed: this CLI never sends callbacks.");
    try {
      out[key] = JSON.parse(raw);
    } catch {
      out[key] = raw;
    }
  }
  return out;
}
