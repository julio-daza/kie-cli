/**
 * Curated model catalog. Only models whose request shape was verified against
 * KIE's docs are listed; anything else can still be called with `kie run`.
 *
 * Credit estimates come from KIE's published price list (product-update mail of
 * Aug 30 2026, list price US$0.005/credit). They are pre-flight numbers for the
 * spend guard only; the ledger always settles on the real `creditsConsumed`
 * returned by the API. Where an estimate is missing (unknown price, or a
 * duration the model decides itself) the caller must pass --max-credits.
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

/** Matches case-insensitively and returns the canonical spelling KIE expects (e.g. "2k" → "4K"). */
function oneOf(value: string | undefined, allowed: string[], flag: string, fallback?: string): string | undefined {
  const v = value ?? fallback;
  if (v === undefined) return undefined;
  const hit = allowed.find((a) => a.toLowerCase() === v.toLowerCase());
  if (!hit) throw new Error(`--${flag} must be one of: ${allowed.join(", ")} (got "${v}")`);
  return hit;
}

/**
 * Per-second pricing: credits = rate × duration. Returns null when the duration is
 * model-decided (-1) so the guard falls back to an explicit --max-credits.
 */
function perSecond(rate: number, duration: number): number | null {
  if (duration < 0) return null;
  return Math.ceil(rate * duration);
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
  {
    name: "grok-image-2",
    kind: "image",
    label: "xAI Grok Imagine Image 2.0 — text-to-image, or edit when --ref is given",
    docs: "https://docs.kie.ai/market/grok-imagine-image-2-0/text-to-image",
    supports: ["prompt", "ref (≤5 images, switches to edit model)", "aspect (1:1|2:3|3:2|16:9|9:16, auto when editing)"],
    notes: "4 credits per image (verified Aug 2026). Masked region edits need the segment-map / segment-edit models via `kie run`.",
    build: (g) => {
      const isEdit = g.refs.length > 0;
      if (g.refs.length > 5) throw new Error("Grok Imagine Image 2.0 accepts at most 5 --ref images.");
      const allowed = isEdit ? ["1:1", "2:3", "3:2", "16:9", "9:16", "auto"] : ["1:1", "2:3", "3:2", "16:9", "9:16"];
      return {
        model: isEdit ? "grok-imagine-image-2-0/image-edit" : "grok-imagine-image-2-0/text-to-image",
        family: "market",
        input: clean({
          prompt: need(g.prompt, "--prompt"),
          aspect_ratio: oneOf(g.aspect, allowed, "aspect", isEdit ? "auto" : "1:1"),
          image_urls: isEdit ? g.refs : undefined,
          ...g.extra,
        }),
        estimate: 4,
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
    supports: ["prompt", "image (first frame)", "end-image", "ref (reference images)", "duration (4-30, -1 = model picks)", "resolution (480p|720p|1080p)", "aspect", "sound"],
    notes:
      "1080p added Aug 2026. Per second, no video input: 480p=28, 720p=63, 1080p=114 credits " +
      "(1080p reflects a 28% promo until 2026-09-17). Feeding a video via --set reference_video_urls costs less " +
      "(17/38/68.5 per s), so the estimate is deliberately on the high side.",
    build: (g) => {
      if (g.endImage && !g.image) throw new Error("--end-image requires --image.");
      const duration = g.duration ?? 5;
      if (duration !== -1 && (duration < 4 || duration > 30)) {
        throw new Error("--duration must be 4..30 seconds for Seedance 2.5 (or -1 to let the model pick).");
      }
      const resolution = oneOf(g.resolution, ["480p", "720p", "1080p"], "resolution", "720p")!;
      const rate: Record<string, number> = { "480p": 28, "720p": 63, "1080p": 114 };
      return {
        model: "bytedance/seedance-2-5",
        family: "market",
        input: clean({
          prompt: need(g.prompt, "--prompt"),
          first_frame_url: g.image,
          last_frame_url: g.endImage,
          reference_image_urls: g.refs.length ? g.refs : undefined,
          generate_audio: g.sound ?? false,
          resolution,
          aspect_ratio: oneOf(g.aspect, ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"], "aspect", "16:9"),
          duration,
          ...g.extra,
        }),
        estimate: perSecond(rate[resolution]!, duration),
      };
    },
  },
  {
    name: "minimax-h3",
    kind: "video",
    label: "MiniMax H3 (Hailuo 03) — text / image / reference-to-video, 4–15 s",
    docs: "https://docs.kie.ai/market/minimax-h3/reference-to-video",
    supports: ["prompt", "image (first frame)", "end-image", "ref (1-9 reference images)", "duration (4-15)", "resolution (768P|2K)", "aspect"],
    notes:
      "Prices halved Aug 2026: 768P=8 credits/s, 2K=13 credits/s, plus 4 credits per reference image beyond the " +
      "first five (input audio is free). KIE's own default is 2K; this CLI defaults to 768P to keep drafts cheap.",
    build: (g) => {
      const duration = g.duration ?? 6;
      if (duration < 4 || duration > 15) throw new Error("--duration must be 4..15 seconds for MiniMax H3.");
      if (g.image && g.refs.length) throw new Error("Use either --image (image-to-video) or --ref (reference-to-video), not both.");
      const resolution = oneOf(g.resolution, ["768P", "2K"], "resolution", "768P")!;
      const rate = resolution === "2K" ? 13 : 8;
      let model = "minimax-h3/text-to-video";
      const input: Record<string, unknown> = { prompt: need(g.prompt, "--prompt"), duration, resolution };
      if (g.image) {
        model = "minimax-h3/image-to-video";
        input.first_frame_url = g.image;
        if (g.endImage) input.last_frame_url = g.endImage;
      } else if (g.refs.length) {
        if (g.refs.length > 9) throw new Error("MiniMax H3 accepts at most 9 --ref images.");
        model = "minimax-h3/reference-to-video";
        input.reference_image_urls = g.refs;
        input.aspect_ratio = oneOf(g.aspect, ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], "aspect", "adaptive");
      } else {
        input.aspect_ratio = oneOf(g.aspect, ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], "aspect", "16:9");
      }
      // First five reference images are free; each extra one is 4 credits.
      const extraImages = 4 * Math.max(0, g.refs.length - 5);
      return { model, family: "market", input: clean({ ...input, ...g.extra }), estimate: rate * duration + extraImages };
    },
  },
  {
    name: "kling-o3",
    kind: "video",
    label: "Kling O3 (Kling 3.0 Omni) — text / image / reference-to-video up to 4K, native audio, 3–15 s",
    docs: "https://docs.kie.ai/market/kling/v3-omni-text-to-video",
    supports: ["prompt", "image (first frame)", "end-image", "ref (≤7 subject images)", "duration (3-15)", "resolution (720p|1080p|4k)", "aspect (16:9|9:16|1:1)", "sound"],
    notes:
      "Per second — 720p: 14 mute / 18 with audio; 1080p: 18 / 23; 4k: 67 either way. " +
      "Feeding a source video (--set video_urls=[\"…\"] on reference-to-video) is billed higher (20 / 27 / 67 per s) " +
      "and is not covered by the estimate, so pass --max-credits in that case.",
    build: (g) => {
      if (g.endImage && !g.image) throw new Error("--end-image requires --image.");
      if (g.image && g.refs.length) throw new Error("Use either --image (image-to-video) or --ref (reference-to-video), not both.");
      const duration = g.duration ?? 5;
      if (!Number.isInteger(duration) || duration < 3 || duration > 15) {
        throw new Error("--duration must be a whole number of seconds, 3..15, for Kling O3.");
      }
      const resolution = oneOf(g.resolution, ["720p", "1080p", "4k"], "resolution", "720p")!;
      const sound = g.sound ?? false;
      const rate: Record<string, [number, number]> = { "720p": [14, 18], "1080p": [18, 23], "4k": [67, 67] };
      let model = "kling-3.0-omni/text-to-video";
      const input: Record<string, unknown> = { prompt: need(g.prompt, "--prompt") };
      if (g.image) {
        model = "kling-3.0-omni/image-to-video";
        input.image_urls = [g.image, g.endImage].filter((x): x is string => Boolean(x));
      } else if (g.refs.length) {
        if (g.refs.length > 7) throw new Error("Kling O3 accepts at most 7 --ref images.");
        model = "kling-3.0-omni/reference-to-video";
        input.image_urls = g.refs;
      }
      return {
        model,
        family: "market",
        input: clean({
          ...input,
          duration,
          resolution,
          aspect_ratio: oneOf(g.aspect, ["16:9", "9:16", "1:1"], "aspect", "16:9"),
          audio: sound,
          ...g.extra,
        }),
        estimate: perSecond(rate[resolution]![sound ? 1 : 0], duration),
      };
    },
  },
  {
    name: "wan-3.0",
    kind: "video",
    label: "Alibaba Wan 3.0 — text / frames / multimodal-reference-to-video up to 30 s; --fast for Video Prime",
    docs: "https://docs.kie.ai/market/wan/3-0-video",
    supports: ["prompt", "image (first frame)", "end-image", "ref (≤10 reference images)", "duration (2-30, -1 = model picks)", "resolution (480P|720P|1080P)", "aspect", "sound", "fast"],
    notes:
      "Per second: 480P=8, 720P=16, 1080P=32 credits, same for Video Prime (--fast). KIE's own default is 1080P; " +
      "this CLI defaults to 720P. Reference videos/audio/files/links go through --set (reference_video_urls, …).",
    build: (g) => {
      if (g.endImage && !g.image) throw new Error("--end-image requires --image.");
      if (g.image && g.refs.length) throw new Error("Wan 3.0: --image (first/last frame) cannot be combined with --ref (reference mode).");
      const duration = g.duration ?? 5;
      if (duration !== -1 && (duration < 2 || duration > 30)) {
        throw new Error("--duration must be 2..30 seconds for Wan 3.0 (or -1 to let the model pick).");
      }
      if (g.refs.length > 10) throw new Error("Wan 3.0 accepts at most 10 --ref images.");
      const resolution = oneOf(g.resolution, ["480P", "720P", "1080P"], "resolution", "720P")!;
      const rate: Record<string, number> = { "480P": 8, "720P": 16, "1080P": 32 };
      return {
        model: g.fast ? "wan/3-0-video-prime" : "wan/3-0-video",
        family: "market",
        input: clean({
          prompt: need(g.prompt, "--prompt"),
          first_frame_url: g.image,
          last_frame_url: g.endImage,
          reference_image_urls: g.refs.length ? g.refs : undefined,
          resolution,
          aspect_ratio: oneOf(g.aspect, ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"], "aspect", "adaptive"),
          duration,
          audio: g.sound ?? true,
          ...g.extra,
        }),
        estimate: perSecond(rate[resolution]!, duration),
      };
    },
  },
  {
    name: "gemini-omni-1.1",
    kind: "video",
    label: "Google Gemini Omni 1.1 Flash — text / refs / frames-to-video, 360p–4K, 4|6|8|10 s",
    docs: "https://docs.kie.ai/market/google/gemini-omni-flash-1-1",
    supports: ["prompt", "image (first frame)", "end-image", "ref (≤7 reference images)", "duration (4|6|8|10)", "resolution (360p|720p|1080p|4k)", "aspect (16:9|9:16)"],
    notes:
      "Flat price per generation, no video input — 360p/720p/1080p: 63/84/105/126 credits for 4/6/8/10 s; " +
      "4k: 147/168/189/210. Passing a source video (--set video_list=[…]) is billed flat at 168 (or 252 at 4k) " +
      "and makes the model choose the duration, so use --max-credits there.",
    build: (g) => {
      if (g.endImage && !g.image) throw new Error("--end-image requires --image.");
      if (g.image && g.refs.length) {
        throw new Error("Gemini Omni 1.1: --image (first frame) is mutually exclusive with --ref (reference images).");
      }
      if (g.refs.length > 7) throw new Error("Gemini Omni 1.1 accepts at most 7 --ref images.");
      const duration = String(g.duration ?? 8);
      if (!["4", "6", "8", "10"].includes(duration)) throw new Error("--duration must be 4, 6, 8 or 10 seconds for Gemini Omni 1.1.");
      const resolution = oneOf(g.resolution, ["360p", "720p", "1080p", "4k"], "resolution", "720p")!;
      const price: Record<string, Record<string, number>> = {
        sd: { "4": 63, "6": 84, "8": 105, "10": 126 },
        "4k": { "4": 147, "6": 168, "8": 189, "10": 210 },
      };
      return {
        model: "google/gemini-omni-flash-1-1",
        family: "market",
        input: clean({
          prompt: need(g.prompt, "--prompt"),
          image_urls: g.refs.length ? g.refs : undefined,
          first_frame_url: g.image,
          last_frame_url: g.endImage,
          duration,
          aspect_ratio: oneOf(g.aspect, ["16:9", "9:16"], "aspect", "16:9"),
          resolution,
          ...g.extra,
        }),
        estimate: price[resolution === "4k" ? "4k" : "sd"]![duration]!,
      };
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
