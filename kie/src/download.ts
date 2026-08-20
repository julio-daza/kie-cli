import { mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { KieClient } from "./client.js";

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
};

function safeSlug(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "result";
}

/**
 * Downloads every result URL to `outDir`. KIE result URLs expire (~24 h), so
 * the CLI always persists results locally instead of handing agents a link.
 */
export async function downloadResults(
  client: KieClient,
  urls: string[],
  outDir: string,
  baseName: string,
): Promise<string[]> {
  mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]!;
    const { bytes, contentType } = await client.download(url);
    const fromUrl = extname(new URL(url).pathname);
    const ext = (contentType && EXT_BY_TYPE[contentType.split(";")[0]!.trim()]) || fromUrl || ".bin";
    const suffix = urls.length > 1 ? `-${i + 1}` : "";
    const file = join(outDir, `${safeSlug(baseName)}${suffix}${ext}`);
    writeFileSync(file, bytes);
    files.push(file);
  }
  return files;
}
