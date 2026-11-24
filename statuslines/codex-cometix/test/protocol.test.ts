import assert from "node:assert/strict";
import { PassThrough, Writable } from "node:stream";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import type { RenderVariant, StatuslineState, UiTree } from "../src/protocol/types.js";
import "./register-source.js";

const { handleJsonRpcLine, startMcpServer } = await import("../src/protocol/mcp-server.js");
const { CODEX_LIMITS, ENTRYPOINTS, inspectUiTree } = await import("../src/protocol/types.js");
const STATE_KEY = "com.openai/codex-statusline-state";

type Render = (state: StatuslineState, variant: RenderVariant) => UiTree;
const renderEmpty: Render = () => null;

function request(method: string, params?: object, id: number | string = 1): string {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

function response<T>(line: string, render = renderEmpty): T {
  const reply = handleJsonRpcLine(line, render, "1.2.3");
  assert.notEqual(reply, null);
  return JSON.parse(reply!) as T;
}

function read(uri: string, render: Render, state?: StatuslineState) {
  return response<{ result: { contents: { uri: string; mimeType: string; text: string }[] } }>(
    request("resources/read", { uri, _meta: { [STATE_KEY]: state } }), render,
  ).result.contents[0]!;
}

test("initialize negotiates the Codex MCP version and ping echoes string IDs", () => {
  assert.deepEqual(response(request("initialize", { protocolVersion: "2024-11-05" }, "connect")), {
    jsonrpc: "2.0",
    id: "connect",
    result: {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {}, resources: {} },
      serverInfo: { name: ENTRYPOINTS.SERVER_NAME, version: "1.2.3" },
    },
  });
  assert.deepEqual(response(request("ping", undefined, 0)), { jsonrpc: "2.0", id: 0, result: {} });
});

test("tools/list advertises exactly one statusline entrypoint for each variant", () => {
  const expected = [
    [ENTRYPOINTS.STANDARD_TOOL, ENTRYPOINTS.STANDARD_TITLE, ENTRYPOINTS.STANDARD_URI],
    [ENTRYPOINTS.WHALE_TOOL, ENTRYPOINTS.WHALE_TITLE, ENTRYPOINTS.WHALE_URI],
  ] as const;
  assert.deepEqual(response(request("tools/list")), {
    jsonrpc: "2.0", id: 1, result: { tools: expected.map(([name, title, resourceUri]) => ({
      name, title,
      inputSchema: { type: "object", properties: {} },
      _meta: { "openai/ui": { entrypoints: [{ type: "statusline", resourceUri }] } },
    })) },
  });
  const { result } = response<{ result: { resources: { uri: string; mimeType: string }[] } }>(request("resources/list"));
  assert.deepEqual(result.resources.map((item) => [item.uri, item.mimeType]),
    expected.map(([, , uri]) => [uri, "application/json"]));
  assert.deepEqual(response(request("resources/templates/list")), {
    jsonrpc: "2.0", id: 1, result: { resourceTemplates: [] },
  });
  for (const [name, , uri] of expected) {
    const tool = response<{ result: { content: { type: string; text: string }[] } }>(request("tools/call", { name }));
    assert.equal(tool.result.content[0]?.type, "text");
    assert.ok(tool.result.content[0]?.text.includes(uri));
  }
});

test("resources/read routes the URI and passes the Codex snapshot to render", () => {
  const state: StatuslineState = { app: { cli_version: "0.172.0", display_mode: "standard" } };
  const seen: [StatuslineState, RenderVariant][] = [];
  const render: Render = (snapshot, variant) => {
    seen.push([snapshot, variant]);
    return { type: "text", children: [`${variant} · 大肥鱼`] };
  };
  const standard = read(ENTRYPOINTS.STANDARD_URI, render, state);
  const whale = read(ENTRYPOINTS.WHALE_URI, render);
  assert.deepEqual(seen, [[state, "standard"], [{}, "whale"]]);
  assert.deepEqual(standard, {
    uri: ENTRYPOINTS.STANDARD_URI, mimeType: "application/json",
    text: JSON.stringify({ type: "text", children: ["standard · 大肥鱼"] }),
  });
  assert.deepEqual(JSON.parse(whale.text), { type: "text", children: ["whale · 大肥鱼"] });
});

test("JSON-RPC returns standard errors and skips notification responses", () => {
  const cases: [string, number, number | null][] = [
    ["{ bad json", -32700, null],
    ["null", -32600, null],
    ['[{"jsonrpc":"2.0","id":1,"method":"ping"}]', -32600, null],
    ['{"jsonrpc":"1.0","id":1,"method":"ping"}', -32600, null],
    ['{"jsonrpc":"2.0","id":null,"method":"ping"}', -32600, null],
    [request("nonexistent"), -32601, 1],
    [request("tools/call", { name: "missing" }), -32602, 1],
    [request("resources/read", { uri: "ui://missing" }), -32602, 1],
    [request("resources/read", []), -32602, 1],
  ];
  for (const [line, code, id] of cases) {
    const info = response<{ jsonrpc: string; id: number | null; error: { code: number } }>(line);
    assert.equal(info.jsonrpc, "2.0");
    assert.equal(info.id, id);
    assert.equal(info.error.code, code);
  }
  for (const method of ["notifications/initialized", "notifications/cancelled", "ping", "resources/read"]) {
    const line = JSON.stringify({ jsonrpc: "2.0", method });
    assert.equal(handleJsonRpcLine(line, () => assert.fail("Notifications must not render")), null);
  }
  assert.equal(handleJsonRpcLine("  \r\n", renderEmpty), null);
});

test("oversized, invalid, and failing UI trees produce a valid null tree", () => {
  const row = (children: UiTree[]): UiTree => ({ type: "row", props: { gap: 0 }, children });
  let deep: UiTree = "leaf";
  for (let level = 0; level <= CODEX_LIMITS.MAX_DEPTH; level += 1) deep = row([deep]);
  const cycle: UiTree = { type: "bold", children: [] };
  cycle.children.push(cycle);
  const invalid: Render[] = [
    () => row(Array<string>(CODEX_LIMITS.MAX_NODES).fill("a")),
    () => "鱼".repeat(Math.floor(CODEX_LIMITS.MAX_TEXT_BYTES / 3) + 1),
    () => ({ type: "link", props: { href: "x".repeat(CODEX_LIMITS.MAX_JSON_BYTES) }, children: ["link"] }),
    () => deep,
    () => ({ type: "row", props: { gap: -1 }, children: [] }),
    () => cycle,
    () => { throw new Error("render failed"); },
  ];
  for (const render of invalid) {
    const { text } = read(ENTRYPOINTS.STANDARD_URI, render);
    assert.equal(text, "null");
    assert.equal(inspectUiTree(JSON.parse(text)).valid, true);
  }

  const atLimit = row(Array<string>(CODEX_LIMITS.MAX_NODES - 1).fill("a"));
  const { text } = read(ENTRYPOINTS.STANDARD_URI, () => atLimit);
  assert.deepEqual(JSON.parse(text), atLimit);
  assert.equal(inspectUiTree(JSON.parse(text)).nodes, CODEX_LIMITS.MAX_NODES);
});

test("stdio serves fragmented lines in order and keeps stdout limited to responses", { timeout: 3000 }, async () => {
  const lines: string[] = [];
  const input = new PassThrough();
  let finish!: () => void;
  const done = new Promise<void>((resolve) => { finish = resolve; });
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString("utf8"));
      callback();
      if (lines.length === 2) finish();
    },
  });
  startMcpServer({ render: renderEmpty, input, output });
  const ping = request("ping");
  input.write(ping.slice(0, 15));
  input.end(`${ping.slice(15)}\r\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n${request("ping", undefined, 2)}\n`);
  await done;
  await setImmediate();
  assert.ok(lines.every((line) => line.endsWith("\n") && !line.slice(0, -1).includes("\n")));
  assert.deepEqual(lines.map((line) => JSON.parse(line)), [
    { jsonrpc: "2.0", id: 1, result: {} },
    { jsonrpc: "2.0", id: 2, result: {} },
  ]);
});
