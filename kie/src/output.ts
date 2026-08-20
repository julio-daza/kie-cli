/**
 * All user-facing output goes through here so the key can be redacted in one
 * place and agents get a predictable contract: machine-readable JSON on stdout,
 * human chatter on stderr.
 */
export interface Output {
  json(value: unknown): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  progress(message: string): void;
}

export function out(opts: { redact: (s: string) => string; quiet?: boolean }): Output {
  const r = opts.redact;
  return {
    json: (v) => process.stdout.write(r(JSON.stringify(v, null, 2)) + "\n"),
    info: (m) => !opts.quiet && process.stderr.write(r(m) + "\n"),
    warn: (m) => process.stderr.write("warning: " + r(m) + "\n"),
    error: (m) => process.stderr.write("error: " + r(m) + "\n"),
    progress: (m) => !opts.quiet && process.stderr.write("… " + r(m) + "\n"),
  };
}
