/**
 * Minimal argv parser. No dependencies on purpose: fewer packages, smaller
 * supply-chain surface for a tool that holds a paid API key.
 *
 * Supports:  --flag value | --flag=value | --bool | repeated --flag a --flag b
 */
export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean | string[]>;
}

export function parseArgs(argv: string[], booleans: Set<string> = new Set()): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean | string[]> = {};

  const push = (key: string, value: string | boolean) => {
    const current = flags[key];
    if (current === undefined) {
      flags[key] = value;
    } else if (Array.isArray(current)) {
      current.push(String(value));
    } else {
      flags[key] = [String(current), String(value)];
    }
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      push(body.slice(0, eq), body.slice(eq + 1));
      continue;
    }
    if (booleans.has(body)) {
      push(body, true);
      continue;
    }
    if (body.startsWith("no-") && booleans.has(body.slice(3))) {
      flags[body.slice(3)] = false;
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      push(body, true);
    } else {
      push(body, next);
      i++;
    }
  }
  return { positionals, flags };
}

export function str(flags: ParsedArgs["flags"], key: string): string | undefined {
  const v = flags[key];
  if (v === undefined || typeof v === "boolean") return undefined;
  return Array.isArray(v) ? v[v.length - 1] : v;
}

export function list(flags: ParsedArgs["flags"], key: string): string[] {
  const v = flags[key];
  if (v === undefined || typeof v === "boolean") return [];
  return Array.isArray(v) ? v : [v];
}

export function bool(flags: ParsedArgs["flags"], key: string): boolean {
  const v = flags[key];
  if (v === undefined) return false;
  if (typeof v === "boolean") return v;
  const s = Array.isArray(v) ? v[v.length - 1] : v;
  return s === "true" || s === "1" || s === "yes";
}

export function num(flags: ParsedArgs["flags"], key: string): number | undefined {
  const s = str(flags, key);
  if (s === undefined) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`--${key} must be a number, got "${s}"`);
  return n;
}
