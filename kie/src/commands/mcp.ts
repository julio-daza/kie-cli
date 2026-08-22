import { homedir } from "node:os";
import { str, type ParsedArgs } from "../args.js";
import { KieClient } from "../client.js";
import type { KieConfig } from "../config.js";
import { resolveKey } from "../keystore.js";
import type { Output } from "../output.js";
import { APPS, APP_LABEL, installMcp, serverSpec, type App } from "../mcp/install.js";
import { LineParser, serialize } from "../mcp/protocol.js";
import { createMcpServer } from "../mcp/server.js";

interface Deps {
  config: KieConfig;
  output: Output;
  version: string;
}

/**
 * `kie mcp`                → run the MCP server on stdio (what desktop apps spawn)
 * `kie mcp install --app`  → write the server into Claude Desktop / Codex / Cursor config
 * `kie mcp config`         → print the JSON snippet for manual setup
 */
export async function runMcp(args: ParsedArgs, deps: Deps): Promise<number> {
  const sub = args.positionals[0];
  const { output } = deps;

  if (sub === "install") {
    const raw = str(args.flags, "app") ?? "all";
    const apps: App[] = raw === "all" ? APPS : (raw.split(",").map((s) => s.trim()) as App[]);
    for (const a of apps) if (!APPS.includes(a)) {
      output.error(`--app must be one of: ${[...APPS, "all"].join(", ")} (got "${a}")`);
      return 2;
    }
    const spec = serverSpec();
    const results = installMcp(apps, spec, homedir());
    output.json({ server: spec, results: results.map((r) => ({ app: r.app, label: APP_LABEL[r.app], path: r.path, status: r.status })) }, { kind: "mcp" });
    output.success(`Restart ${apps.map((a) => APP_LABEL[a]).join(" / ")} to pick up the "kie" MCP server.`);
    output.info("Claude Code: run `claude mcp add kie -- " + [spec.command, ...spec.args].join(" ") + "`");
    return 0;
  }

  if (sub === "config") {
    const spec = serverSpec();
    output.json({ mcpServers: { kie: spec } });
    return 0;
  }

  if (sub !== undefined) {
    output.error("Usage: kie mcp | kie mcp install [--app claude|codex|cursor|all] | kie mcp config");
    return 2;
  }

  // ---- serve on stdio ----
  const { key } = resolveKey();
  const client = new KieClient({ apiKey: key });
  const server = createMcpServer({
    client,
    config: deps.config,
    version: deps.version,
    log: (m) => process.stderr.write(`[kie mcp] ${m}\n`),
  });
  const parser = new LineParser();
  const write = (msg: Parameters<typeof serialize>[0]) => process.stdout.write(serialize(msg));
  const inFlight = new Set<Promise<void>>();

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    for (const item of parser.push(chunk)) {
      if (item.error) {
        write(item.error);
        continue;
      }
      if (item.message) {
        const p = server
          .handle(item.message)
          .then((res) => {
            if (res) write(res);
          })
          .finally(() => inFlight.delete(p));
        inFlight.add(p);
      }
    }
  });

  // When the client closes stdin, finish what is already running (a generation may be
  // mid-flight) and only then exit, so no response is lost and the ledger is settled.
  await new Promise<void>((resolve) => {
    const done = () => void Promise.allSettled([...inFlight]).then(() => resolve());
    process.stdin.on("end", done);
    process.stdin.on("close", done);
  });
  return 0;
}
