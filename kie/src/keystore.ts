import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configDir } from "./config.js";

/**
 * API key storage. Resolution order:
 *   1. KIE_API_KEY env var — ONLY if KIE_ALLOW_ENV_KEY=1 (explicit opt-in; env vars leak into
 *      child processes, shell history and agent transcripts).
 *   2. macOS Keychain (service "kie-cli") — the default on darwin.
 *   3. ~/.config/kie/key with mode 0600 — Linux/Windows fallback.
 *
 * The key never gets printed, logged or written anywhere else.
 */
const SERVICE = "kie-cli";
const ACCOUNT = "api-key";

export type KeySource = "env" | "keychain" | "file" | "none";

function keyFile(): string {
  return join(configDir(), "key");
}

function useKeychain(): boolean {
  return process.platform === "darwin" && process.env.KIE_DISABLE_KEYCHAIN !== "1";
}

function keychainRead(): string | null {
  try {
    const out = execFileSync("security", ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const value = out.toString("utf8").trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function keychainWrite(value: string): void {
  // -U updates in place if the item already exists.
  execFileSync("security", ["add-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w", value, "-U"], {
    stdio: "ignore",
  });
}

function keychainDelete(): boolean {
  try {
    execFileSync("security", ["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function resolveKey(): { key: string; source: KeySource } {
  const envKey = process.env.KIE_API_KEY;
  if (envKey) {
    if (process.env.KIE_ALLOW_ENV_KEY === "1") return { key: envKey.trim(), source: "env" };
    throw new Error(
      "KIE_API_KEY is set but env keys are disabled. Store it safely with `kie key set`, " +
        "or opt in explicitly with KIE_ALLOW_ENV_KEY=1 (not recommended for agent sessions).",
    );
  }
  if (useKeychain()) {
    const k = keychainRead();
    if (k) return { key: k, source: "keychain" };
  }
  if (existsSync(keyFile())) {
    const k = readFileSync(keyFile(), "utf8").trim();
    if (k) return { key: k, source: "file" };
  }
  throw new Error("No API key configured. Run `kie key set` (paste the key when prompted).");
}

export function storeKey(value: string): KeySource {
  const key = value.trim();
  if (!key) throw new Error("Refusing to store an empty key.");
  if (useKeychain()) {
    keychainWrite(key);
    return "keychain";
  }
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  writeFileSync(keyFile(), key + "\n", { mode: 0o600 });
  chmodSync(keyFile(), 0o600);
  return "file";
}

export function deleteKey(): KeySource[] {
  const removed: KeySource[] = [];
  if (useKeychain() && keychainDelete()) removed.push("keychain");
  if (existsSync(keyFile())) {
    unlinkSync(keyFile());
    removed.push("file");
  }
  return removed;
}

/** Masks a key for display: first 4 + last 4 chars. */
export function mask(key: string): string {
  if (key.length <= 10) return "*".repeat(key.length);
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** Removes any occurrence of the key from a message before it reaches stdout/stderr. */
export function redact(message: string, key: string | null): string {
  if (!key) return message;
  return message.split(key).join("[REDACTED]");
}
