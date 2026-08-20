/**
 * Pre-rendered terminal transcripts (HTML strings) so line breaks survive Astro's
 * whitespace handling. Classes are styled in Terminal.astro.
 */
const L = (cls: string, s: string) => `<span class="${cls}">${s}</span>`;

const LOGO = [
  ["g1", "            ╭─●─╮            "],
  ["g1", "           ╱     ╲           "],
  ["g2", "          ╱  ╱╲   ╲          "],
  ["g2", "         ╱  ╱  ╲ ╲ ╲         "],
  ["g3", "        ╱  ╱────╲ ╲ ╲        "],
  ["g3", "       ╱  ╱      ╲   ╲       "],
  ["g4", "  ●───╯  ╱        ╲ ╲ ╰───●  "],
] as const;

const TAGLINE = [
  "",
  "",
  `${L("w", "kie")} ${L("dim", "v0.2.0")}`,
  L("b", "KIE.ai media generation for agents &amp; humans"),
  L("dim", "images · video · zero dependencies · spend-guarded"),
  "",
  "",
];

export const heroTerminal = [
  ...LOGO.map(([c, line], i) => `${L(c, line)}    ${TAGLINE[i]}`),
  "",
  `${L("p", "$")} kie credits`,
  `${L("dim", "╭─ ")}${L("b", "▲ kie")}  credits ${L("dim", "──────────────────────────────────╮")}`,
  `${L("dim", "│")}  ${L("dim", "balance        ")}  ${L("w", "980 credits")}  ${L("dim", "≈ US$4.90")}          ${L("dim", "│")}`,
  `${L("dim", "│")}  ${L("dim", "today          ")}  16 / 200  ${L("b", "██")}${L("dim", "██████████████████████")} 8%  ${L("dim", "│")}`,
  `${L("dim", "│")}  ${L("dim", "remaining today")}  184 credits                    ${L("dim", "│")}`,
  L("dim", "╰──────────────────────────────────────────────────────╯"),
  "",
  `${L("p", "$")} kie image nano-banana-2 --prompt "isometric coffee shop" --aspect 16:9`,
  `${L("b", "⠹")} nano-banana-2  generating 40%  task_c0ffee12 ${L("dim", "14s")}`,
  `${L("dim", "╭─ ")}${L("b", "▲ kie")}  generation complete ${L("dim", "────────────────────────╮")}`,
  `${L("dim", "│")}  ${L("dim", "state  ")}  ${L("ok", "success")}                                   ${L("dim", "│")}`,
  `${L("dim", "│")}  ${L("dim", "credits")}  ${L("w", "8")}                                         ${L("dim", "│")}`,
  `${L("dim", "│")}  ${L("dim", "files  ")}  ${L("b", "kie-media/nano-banana-2-c0ffee12.png")}      ${L("dim", "│")}`,
  L("dim", "╰──────────────────────────────────────────────────────╯"),
].join("\n");

export const guardTerminal = [
  `${L("p", "$")} kie video kling-3.0 --prompt "drone shot over a fjord"`,
  `${L("err", "✖ Spend guard blocked the request:")} This model has no known credit`,
  `  estimate. Re-run with ${L("w", "--max-credits &lt;n&gt;")} to state the most you accept`,
  `  to spend on this task.`,
  L("dim", "Today: 16 credits used, 184 remaining. Balance: 980."),
  `${L("p", "$")} echo $?`,
  L("warn", "3"),
].join("\n");
