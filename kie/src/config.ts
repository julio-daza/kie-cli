import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Where the CLI keeps its local state (never the API key on macOS — see keystore.ts). */
export function configDir(): string {
  return process.env.KIE_CONFIG_DIR || join(homedir(), ".config", "kie");
}

export interface KieConfig {
  /** Hard cap on credits the CLI is allowed to spend per UTC day (measured from real `creditsConsumed`). */
  dailyBudget: number;
  /** Default per-task cap used when a model has a known estimate. */
  maxCreditsPerTask: number;
  /** Default output directory for downloaded media. */
  outDir: string;
  /** Polling interval in seconds for `wait`. */
  pollSeconds: number;
  /** Max seconds to wait for a task before giving up (the task keeps running server-side). */
  waitTimeoutSeconds: number;
}

export const DEFAULT_CONFIG: KieConfig = {
  dailyBudget: 200, // 200 credits ≈ US$1 at KIE's list price of $0.005/credit
  maxCreditsPerTask: 50,
  outDir: "./kie-media",
  pollSeconds: 5,
  waitTimeoutSeconds: 900,
};

export function loadConfig(): KieConfig {
  const file = join(configDir(), "config.json");
  if (!existsSync(file)) return { ...DEFAULT_CONFIG };
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<KieConfig>;
    return { ...DEFAULT_CONFIG, ...raw };
  } catch {
    throw new Error(`Could not parse ${file}. Fix or delete it.`);
  }
}

export function saveConfig(config: KieConfig): string {
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  const file = join(configDir(), "config.json");
  writeFileSync(file, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  return file;
}
