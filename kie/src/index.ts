#!/usr/bin/env node
import { parseArgs } from "./args.js";
import { KieClient, KieError } from "./client.js";
import { loadConfig } from "./config.js";
import { GENERATE_BOOLEANS, runGenerate, runRaw } from "./commands/generate.js";
import { runConfig, runCredits, runKey, runLedger, runModels, runUpload } from "./commands/misc.js";
import { runStatus, runWait } from "./commands/tasks.js";
import { redact, resolveKey } from "./keystore.js";
import { out } from "./output.js";

const HELP = `kie — KIE.ai media generation for agents (images & video), zero dependencies.

Usage:
  kie key set|check|delete                     Store the API key (macOS Keychain / 0600 file)
  kie credits                                  Balance + today's spend vs daily budget
  kie models [--kind image|video]              Curated catalog (JSON)
  kie image <model> --prompt "..." [opts]      Generate an image, wait, download
  kie video <model> --prompt "..." [opts]      Generate a video, wait, download
  kie run <model-id> --input '{json}' --max-credits N   Any Market model (escape hatch)
  kie status <taskId>                          One poll, no download
  kie wait <taskId> [--out dir]                Poll until done, download, settle ledger
  kie upload <file>                            Upload a local file → temporary URL for --ref/--image
  kie ledger [--limit 20]                      Local spend log (real creditsConsumed)
  kie config [get] | config set <key> <value>  dailyBudget, maxCreditsPerTask, outDir, pollSeconds, waitTimeoutSeconds

Generation options:
  --prompt <text>        --ref <url> (repeatable)   --image <url>   --end-image <url>
  --aspect 16:9          --resolution 1K|2K|4K|720p  --duration <s>  --sound   --fast
  --format png|jpg       --set key=value (repeatable, raw model field)
  --out <dir>            --name <base>   --no-wait   --timeout <s>   --poll <s>   --no-download
  --max-credits <n>      Accept spending up to n credits on this task (required when no estimate)
  --dry-run              Print the exact request, send nothing
  --quiet                Suppress progress on stderr

Output contract: JSON on stdout, messages on stderr.
Exit codes: 0 ok · 1 task failed · 2 usage · 3 blocked by spend guard · 4 timed out · 5 API/auth error
`;

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv, new Set([...GENERATE_BOOLEANS, "no-download", "help", "version"]));
  const command = args.positionals.shift();
  if (!command || command === "help" || args.flags.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (command === "version" || args.flags.version) {
    process.stdout.write("kie 0.1.0\n");
    return 0;
  }

  const config = loadConfig();
  let key: string | null = null;
  const output = out({ redact: (s) => redact(s, key), quiet: Boolean(args.flags.quiet) });

  // Commands that must work without a key.
  if (command === "key" || command === "config" || command === "models") {
    const lazy = () => {
      key = resolveKey().key;
      return new KieClient({ apiKey: key });
    };
    if (command === "key") return runKey(args, { client: lazy, config, output });
    if (command === "config") return runConfig(args, { client: lazy, config, output });
    return runModels(args, { client: lazy, config, output });
  }

  key = resolveKey().key;
  const client = new KieClient({ apiKey: key });
  const deps = { client, config, output };
  const lazyDeps = { client: () => client, config, output };

  switch (command) {
    case "credits":
      return runCredits(args, lazyDeps);
    case "image":
      return runGenerate("image", args, deps);
    case "video":
      return runGenerate("video", args, deps);
    case "run":
      return runRaw(args, deps);
    case "status":
      return runStatus(args, deps);
    case "wait":
      return runWait(args, deps);
    case "upload":
      return runUpload(args, lazyDeps);
    case "ledger":
      return runLedger(args, lazyDeps);
    default:
      output.error(`Unknown command "${command}". Run \`kie help\`.`);
      return 2;
  }
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    // The key is never part of error messages we build, but redact defensively anyway.
    const safe = message.replace(/Bearer\s+\S+/g, "Bearer [REDACTED]");
    process.stderr.write(`error: ${safe}\n`);
    process.exit(err instanceof KieError ? 5 : 2);
  });
