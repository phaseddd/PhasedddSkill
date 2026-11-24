import { createInterface } from "node:readline";
import { CODEX_LIMITS, ENTRYPOINTS, inspectUiTree } from "./types.js";
import type { RenderVariant, StatuslineState, UiTree } from "./types.js";

type Render = (state: StatuslineState, variant: RenderVariant) => UiTree;
type Reply = { result: object } | { error: { code: number; message: string } };

export interface McpServerOptions {
  render: Render;
  serverVersion?: string;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

const STATE_KEY = "com.openai/codex-statusline-state";
const MIME_TYPE = "application/json";
const PROVIDERS = [
  { variant: "standard", name: ENTRYPOINTS.STANDARD_TOOL, title: ENTRYPOINTS.STANDARD_TITLE, uri: ENTRYPOINTS.STANDARD_URI },
  { variant: "whale", name: ENTRYPOINTS.WHALE_TOOL, title: ENTRYPOINTS.WHALE_TITLE, uri: ENTRYPOINTS.WHALE_URI },
] as const;

function record(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function error(code: number, message: string): Reply {
  return { error: { code, message } };
}

function uiText(render: Render, state: StatuslineState, variant: RenderVariant): string {
  try {
    const text = JSON.stringify(render(state, variant));
    // Inspect the serialized tree, including the result of any custom toJSON method.
    if (typeof text === "string" && Buffer.byteLength(text, "utf8") <= CODEX_LIMITS.MAX_JSON_BYTES
      && inspectUiTree(JSON.parse(text) as UiTree).valid) {
      return text;
    }
  } catch {
    // A failed render can recover on the next poll.
  }
  return "null";
}

function dispatch(method: string, params: Record<string, unknown>, render: Render, version: string): Reply {
  switch (method) {
    case "initialize":
      return { result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: ENTRYPOINTS.SERVER_NAME, version },
      } };
    case "ping":
      return { result: {} };
    case "tools/list":
      return { result: { tools: PROVIDERS.map(({ name, title, uri }) => ({
        name,
        title,
        inputSchema: { type: "object", properties: {} },
        _meta: { "openai/ui": { entrypoints: [{ type: "statusline", resourceUri: uri }] } },
      })) } };
    case "tools/call": {
      const provider = PROVIDERS.find(({ name }) => name === params.name);
      if (!provider) return error(-32602, "Unknown tool name");
      return { result: { content: [{ type: "text", text: `The statusline resource is ${provider.uri}.` }] } };
    }
    case "resources/list":
      return { result: { resources: PROVIDERS.map(({ name, title, uri }) => ({ name, title, uri, mimeType: MIME_TYPE })) } };
    case "resources/templates/list":
      return { result: { resourceTemplates: [] } };
    case "resources/read": {
      const provider = PROVIDERS.find(({ uri }) => uri === params.uri);
      if (!provider) return error(-32602, "Unknown resource URI");
      const state = record(record(params._meta)?.[STATE_KEY]) ?? {};
      const text = uiText(render, state, provider.variant);
      return { result: { contents: [{ uri: provider.uri, mimeType: MIME_TYPE, text }] } };
    }
    default:
      return error(-32601, "Method not found");
  }
}

export function handleJsonRpcLine(line: string, render: Render, serverVersion = "1.0.0"): string | null {
  line = line.trim();
  if (!line) return null;
  const reply = (id: string | number | null, body: Reply) => JSON.stringify({ jsonrpc: "2.0", id, ...body });

  let message: Record<string, unknown> | undefined;
  try {
    message = record(JSON.parse(line));
  } catch {
    return reply(null, error(-32700, "Parse error"));
  }
  if (message?.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return reply(null, error(-32600, "Invalid request"));
  }
  if (!Object.hasOwn(message, "id")) return null;
  const { id, method } = message;
  if (typeof id !== "string" && (typeof id !== "number" || !Number.isInteger(id))) {
    return reply(null, error(-32600, "Invalid request ID"));
  }
  const params = message.params === undefined ? {} : record(message.params);
  if (!params) return reply(id, error(-32602, "Invalid parameters"));
  return reply(id, dispatch(method, params, render, serverVersion));
}

export function startMcpServer(options: McpServerOptions): void {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const reader = createInterface({ input, terminal: false, crlfDelay: Infinity });
  const close = () => reader.close();
  reader.on("error", close);
  output.on("error", close);

  void (async () => {
    try {
      for await (const line of reader) {
        const response = handleJsonRpcLine(line, options.render, options.serverVersion);
        if (response === null) continue;
        // The write callback keeps requests ordered and bounds the output queue.
        await new Promise<void>((resolve, reject) => {
          output.write(`${response}\n`, (error) => error ? reject(error) : resolve());
        });
      }
    } catch {
      close();
    }
  })();
}
