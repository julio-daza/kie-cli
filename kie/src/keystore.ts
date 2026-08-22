import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configDir } from "./config.js";

/**
 * API key storage. Resolution order:
 *   1. KIE_API_KEY env var — ONLY if KIE_ALLOW_ENV_KEY=1 (explicit opt-in; env vars leak into
 *      child processes, shell history and agent transcripts).
 *   2. The OS keystore:
 *        macOS   → Keychain (`/usr/bin/security`, service "kie-cli")
 *        Windows → DPAPI, user scope (the ciphertext lives in ~/.config/kie/key.dpapi and can
 *                  only be decrypted by the same Windows user on the same machine)
 *        Linux   → Secret Service via `secret-tool` (GNOME Keyring / KWallet) when installed
 *   3. ~/.config/kie/key with mode 0600 — fallback when no keystore is available.
 *
 * The key never gets printed, logged or written anywhere else. All system tools are invoked
 * by absolute path or through `/usr/bin/env` so this also works when spawned by a GUI app
 * with an empty environment (MCP servers).
 */
const SERVICE = "kie-cli";
const ACCOUNT = "api-key";

export type KeySource = "env" | "keychain" | "dpapi" | "secret-service" | "file" | "none";

/** Shell-out seam, injectable for tests on platforms we cannot run in CI. */
export interface Exec {
  (file: string, args: string[], input?: string): string;
}

const defaultExec: Exec = (file, args, input) =>
  execFileSync(file, args, { stdio: [input === undefined ? "ignore" : "pipe", "pipe", "ignore"], input, windowsHide: true }).toString("utf8");

export interface KeystoreEnv {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  exec?: Exec;
}

function keyFile(): string {
  return join(configDir(), "key");
}
function dpapiFile(): string {
  return join(configDir(), "key.dpapi");
}

// ---- macOS Keychain ----------------------------------------------------------

const keychain = {
  read(exec: Exec): string | null {
    try {
      const v = exec("/usr/bin/security", ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"]).trim();
      return v || null;
    } catch {
      return null;
    }
  },
  write(exec: Exec, value: string): void {
    exec("/usr/bin/security", ["add-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w", value, "-U"]);
  },
  delete(exec: Exec): boolean {
    try {
      exec("/usr/bin/security", ["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT]);
      return true;
    } catch {
      return false;
    }
  },
};

// ---- Windows DPAPI -------------------------------------------------------------

function powershell(env: NodeJS.ProcessEnv): string {
  const root = env.SystemRoot ?? env.WINDIR ?? "C:\\Windows";
  return join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}
const PS_FLAGS = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command"];

const dpapi = {
  read(exec: Exec, env: NodeJS.ProcessEnv): string | null {
    if (!existsSync(dpapiFile())) return null;
    try {
      const blob = readFileSync(dpapiFile(), "utf8").trim();
      const script =
        "Add-Type -AssemblyName System.Security; " +
        `$b=[Convert]::FromBase64String('${blob}'); ` +
        "$p=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser); " +
        "[Console]::Out.Write([Text.Encoding]::UTF8.GetString($p))";
      const v = exec(powershell(env), [...PS_FLAGS, script]).trim();
      return v || null;
    } catch {
      return null;
    }
  },
  write(exec: Exec, env: NodeJS.ProcessEnv, value: string): void {
    // The secret goes in through stdin, never through the command line (visible in process lists).
    const script =
      "Add-Type -AssemblyName System.Security; " +
      "$s=[Console]::In.ReadToEnd().TrimEnd(); " +
      "$p=[System.Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($s),$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser); " +
      "[Console]::Out.Write([Convert]::ToBase64String($p))";
    const blob = exec(powershell(env), [...PS_FLAGS, script], value).trim();
    if (!blob) throw new Error("DPAPI returned an empty blob.");
    mkdirSync(configDir(), { recursive: true });
    writeFileSync(dpapiFile(), blob + "\n", { mode: 0o600 });
  },
  delete(): boolean {
    if (!existsSync(dpapiFile())) return false;
    unlinkSync(dpapiFile());
    return true;
  },
};

// ---- Linux Secret Service (libsecret) ------------------------------------------

const ST_ATTRS = ["service", SERVICE, "account", ACCOUNT];

const secretService = {
  available(exec: Exec): boolean {
    try {
      exec("/usr/bin/env", ["secret-tool", "--version"]);
      return true;
    } catch {
      return false;
    }
  },
  read(exec: Exec): string | null {
    try {
      const v = exec("/usr/bin/env", ["secret-tool", "lookup", ...ST_ATTRS]).trim();
      return v || null;
    } catch {
      return null;
    }
  },
  write(exec: Exec, value: string): void {
    exec("/usr/bin/env", ["secret-tool", "store", "--label=kie-cli API key", ...ST_ATTRS], value);
  },
  delete(exec: Exec): boolean {
    try {
      exec("/usr/bin/env", ["secret-tool", "clear", ...ST_ATTRS]);
      return true;
    } catch {
      return false;
    }
  },
};

// ---- backend selection ----------------------------------------------------------

type Backend = Exclude<KeySource, "env" | "file" | "none">;

function backend(k: Required<KeystoreEnv>): Backend | null {
  if (k.env.KIE_DISABLE_KEYCHAIN === "1") return null;
  if (k.platform === "darwin") return "keychain";
  if (k.platform === "win32") return "dpapi";
  if (k.platform === "linux" && secretService.available(k.exec)) return "secret-service";
  return null;
}

function resolveEnv(k: KeystoreEnv): Required<KeystoreEnv> {
  return { platform: k.platform ?? process.platform, env: k.env ?? process.env, exec: k.exec ?? defaultExec };
}

export function resolveKey(opts: KeystoreEnv = {}): { key: string; source: KeySource } {
  const k = resolveEnv(opts);
  const envKey = k.env.KIE_API_KEY;
  if (envKey) {
    if (k.env.KIE_ALLOW_ENV_KEY === "1") return { key: envKey.trim(), source: "env" };
    throw new Error(
      "KIE_API_KEY is set but env keys are disabled. Store it safely with `kie key set`, " +
        "or opt in explicitly with KIE_ALLOW_ENV_KEY=1 (not recommended for agent sessions).",
    );
  }
  const b = backend(k);
  if (b === "keychain") {
    const v = keychain.read(k.exec);
    if (v) return { key: v, source: "keychain" };
  } else if (b === "dpapi") {
    const v = dpapi.read(k.exec, k.env);
    if (v) return { key: v, source: "dpapi" };
  } else if (b === "secret-service") {
    const v = secretService.read(k.exec);
    if (v) return { key: v, source: "secret-service" };
  }
  if (existsSync(keyFile())) {
    const v = readFileSync(keyFile(), "utf8").trim();
    if (v) return { key: v, source: "file" };
  }
  throw new Error("No API key configured. Run `kie key set` (paste the key when prompted).");
}

export function storeKey(value: string, opts: KeystoreEnv = {}): KeySource {
  const key = value.trim();
  if (!key) throw new Error("Refusing to store an empty key.");
  const k = resolveEnv(opts);
  const b = backend(k);
  if (b === "keychain") {
    keychain.write(k.exec, key);
    return "keychain";
  }
  if (b === "dpapi") {
    dpapi.write(k.exec, k.env, key);
    return "dpapi";
  }
  if (b === "secret-service") {
    secretService.write(k.exec, key);
    return "secret-service";
  }
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  writeFileSync(keyFile(), key + "\n", { mode: 0o600 });
  chmodSync(keyFile(), 0o600);
  return "file";
}

export function deleteKey(opts: KeystoreEnv = {}): KeySource[] {
  const k = resolveEnv(opts);
  const removed: KeySource[] = [];
  const b = backend(k);
  if (b === "keychain" && keychain.delete(k.exec)) removed.push("keychain");
  if (b === "dpapi" && dpapi.delete()) removed.push("dpapi");
  if (b === "secret-service" && secretService.delete(k.exec)) removed.push("secret-service");
  if (existsSync(keyFile())) {
    unlinkSync(keyFile());
    removed.push("file");
  }
  return removed;
}

/** Human label for `kie key check` / `kie key set`. */
export function describeSource(source: KeySource): string {
  switch (source) {
    case "keychain":
      return "macOS Keychain (service kie-cli)";
    case "dpapi":
      return "Windows DPAPI (user scope), ciphertext in " + dpapiFile();
    case "secret-service":
      return "Linux Secret Service (secret-tool)";
    case "file":
      return `${keyFile()} (0600)`;
    case "env":
      return "KIE_API_KEY environment variable";
    default:
      return "none";
  }
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
