/**
 * Terminal UI helpers: colors, the KIE brand banner, tables and panels.
 * Pure functions returning strings — no I/O — so they are easy to test.
 */
export interface Palette {
  enabled: boolean;
}

const ESC = "[";

export function colorsEnabled(stream: NodeJS.WriteStream = process.stderr): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined) return process.env.FORCE_COLOR !== "0";
  return Boolean(stream.isTTY);
}

export function makeStyle(enabled: boolean) {
  const wrap = (open: string, close = "39") => (s: string) => (enabled ? `${ESC}${open}m${s}${ESC}${close}m` : s);
  const rgb = (r: number, g: number, b: number) => (enabled ? (s: string) => `${ESC}38;2;${r};${g};${b}m${s}${ESC}39m` : (s: string) => s);
  return {
    bold: wrap("1", "22"),
    dim: wrap("2", "22"),
    italic: wrap("3", "23"),
    red: wrap("31"),
    green: wrap("32"),
    yellow: wrap("33"),
    cyan: wrap("36"),
    gray: wrap("90"),
    white: wrap("97"),
    brand: rgb(0, 168, 255), // KIE cyan-blue (top of the logo gradient)
    brandDeep: rgb(30, 64, 216), // bottom of the gradient
    rgb,
  };
}
export type Style = ReturnType<typeof makeStyle>;

// ---------------------------------------------------------------- banner

/** KIE's "A" mark: an open triangle traced like a circuit, with nodes at the vertices. */
const LOGO = [
  "            ╭─●─╮            ",
  "           ╱     ╲           ",
  "          ╱  ╱╲   ╲          ",
  "         ╱  ╱  ╲ ╲ ╲         ",
  "        ╱  ╱────╲ ╲ ╲        ",
  "       ╱  ╱      ╲   ╲       ",
  "  ●───╯  ╱        ╲ ╲ ╰───●  ",
];

const GRADIENT: [number, number, number][] = [
  [0, 176, 255],
  [0, 156, 245],
  [10, 136, 235],
  [16, 116, 228],
  [22, 96, 222],
  [26, 80, 218],
  [30, 64, 216],
];

export function banner(style: Style, version: string): string {
  const art = LOGO.map((line, i) => {
    const [r, g, b] = GRADIENT[Math.min(i, GRADIENT.length - 1)]!;
    return style.rgb(r, g, b)(line);
  });
  const text = [
    "",
    "",
    `${style.bold(style.white("kie"))} ${style.dim(`v${version}`)}`,
    style.brand("KIE.ai media generation for agents & humans"),
    style.dim("images · video · zero dependencies · spend-guarded"),
    "",
    "",
  ];
  return art.map((line, i) => `${line}    ${text[i] ?? ""}`).join("\n") + "\n";
}

/** One-line brand prefix used on pretty outputs. */
export function brandTag(style: Style): string {
  return style.brand("▲ kie");
}

// ---------------------------------------------------------------- layout

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\[[0-9;]*m/g;
export const visibleLength = (s: string): number => [...s.replace(ANSI_RE, "")].length;

function pad(s: string, width: number, align: "left" | "right" = "left"): string {
  const gap = Math.max(0, width - visibleLength(s));
  return align === "right" ? " ".repeat(gap) + s : s + " ".repeat(gap);
}

export function truncate(s: string, max: number): string {
  const chars = [...s];
  return chars.length <= max ? s : chars.slice(0, Math.max(0, max - 1)).join("") + "…";
}

export interface Column {
  key: string;
  header: string;
  align?: "left" | "right";
  max?: number;
  format?: (value: unknown, row: Record<string, unknown>) => string;
}

export function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.map(formatCell).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

/** Box-drawing table. Wide text is truncated per column (`max`) so it never wraps. */
export function table(rows: Record<string, unknown>[], columns: Column[], style: Style, maxWidth?: number): string {
  const cells = rows.map((row) =>
    columns.map((c) => {
      const raw = c.format ? c.format(row[c.key], row) : formatCell(row[c.key]);
      return c.max ? truncate(raw, c.max) : raw;
    }),
  );
  const widths = columns.map((c, i) => Math.max(visibleLength(c.header), ...cells.map((r) => visibleLength(r[i]!))));
  // Shrink the widest columns until the table fits `maxWidth` (borders + 2 padding per column).
  const frame = columns.length * 3 + 1;
  const total = () => widths.reduce((a, b) => a + b, 0) + frame;
  while (maxWidth && total() > maxWidth) {
    const i = widths.indexOf(Math.max(...widths));
    if (widths[i]! <= 6) break;
    widths[i]!--;
  }
  for (const r of cells) for (let i = 0; i < r.length; i++) r[i] = truncate(r[i]!, widths[i]!);
  const line = (l: string, m: string, r: string) => style.dim(l + widths.map((w) => "─".repeat(w + 2)).join(m) + r);
  const row = (vals: string[], head = false) =>
    style.dim("│") +
    vals.map((v, i) => " " + pad(head ? style.bold(v) : v, widths[i]!, columns[i]!.align) + " ").join(style.dim("│")) +
    style.dim("│");
  const out = [line("┌", "┬", "┐"), row(columns.map((c) => c.header), true), line("├", "┼", "┤")];
  if (cells.length === 0) out.push(row(columns.map((_, i) => pad(style.dim(i === 0 ? "(empty)" : ""), widths[i]!))));
  for (const r of cells) out.push(row(r));
  out.push(line("└", "┴", "┘"));
  return out.join("\n");
}

/** Key/value panel with a title bar. */
export function panel(title: string, entries: [string, string][], style: Style): string {
  const keyWidth = Math.max(...entries.map(([k]) => visibleLength(k)), 0);
  const lines = entries.map(([k, v]) => `  ${style.dim(pad(k, keyWidth))}  ${v}`);
  const width = Math.max(visibleLength(title) + 4, ...lines.map(visibleLength)) + 2;
  const top = style.dim("╭─ ") + style.bold(title) + style.dim(" " + "─".repeat(Math.max(0, width - visibleLength(title) - 4)) + "╮");
  const bottom = style.dim("╰" + "─".repeat(width) + "╯");
  return [top, ...lines.map((l) => style.dim("│") + pad(l, width) + style.dim("│")), bottom].join("\n");
}

/** Horizontal meter, e.g. daily budget usage. */
export function meter(used: number, total: number, style: Style, width = 24): string {
  const ratio = total > 0 ? Math.min(1, used / total) : 0;
  const filled = Math.round(ratio * width);
  const color = ratio >= 0.9 ? style.red : ratio >= 0.6 ? style.yellow : style.brand;
  return color("█".repeat(filled)) + style.dim("░".repeat(width - filled)) + ` ${Math.round(ratio * 100)}%`;
}

export const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}
