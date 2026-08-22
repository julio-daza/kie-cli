/**
 * Minimal JSON-RPC 2.0 framing for MCP over stdio (newline-delimited JSON), with no
 * dependencies. Only what a tools-only server needs: parse requests/notifications, write
 * responses. stdout is reserved for protocol messages; anything else must go to stderr.
 */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const ERR = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
} as const;

export function ok(id: JsonRpcResponse["id"], result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function fail(id: JsonRpcResponse["id"], code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } };
}

/** Splits a byte stream into complete lines and parses each as JSON-RPC. */
export class LineParser {
  private buffer = "";

  /** Feed a chunk; returns parsed messages (or parse errors to send back). */
  push(chunk: string): Array<{ message?: JsonRpcRequest; error?: JsonRpcResponse }> {
    this.buffer += chunk;
    const out: Array<{ message?: JsonRpcRequest; error?: JsonRpcResponse }> = [];
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as JsonRpcRequest;
        if (!parsed || parsed.jsonrpc !== "2.0" || typeof parsed.method !== "string") {
          out.push({ error: fail((parsed as { id?: JsonRpcResponse["id"] })?.id ?? null, ERR.INVALID_REQUEST, "Invalid JSON-RPC request") });
          continue;
        }
        out.push({ message: parsed });
      } catch {
        out.push({ error: fail(null, ERR.PARSE, "Parse error") });
      }
    }
    return out;
  }
}

export function serialize(msg: JsonRpcResponse | JsonRpcRequest): string {
  return JSON.stringify(msg) + "\n";
}
