import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ENTRYPOINTS } from "../protocol/types.js";
import type { RenderVariant } from "../protocol/types.js";

export interface InstallOptions {
  configTomlPath?: string;
  bundlePath: string;
  nodePath?: string;
  defaultVariant?: RenderVariant;
  removeLegacyPython?: boolean;
  legacyPythonPath?: string;
}

interface Span { start: number; end: number }
interface Table extends Span { path: string[] }
interface Assignment extends Table {
  scope: string[];
  value: Span;
  outerStart: number;
  commas?: { before?: number; after?: number };
}
interface Edit extends Span { text: string }

const FEATURE = ["features", "tui_extensions_statusline"];
const PROVIDER = ["tui", "status_line_provider"];
const LEGACY_SERVER = "local-session-status";

function isPrefix(prefix: string[], path: string[]): boolean {
  return prefix.length <= path.length && prefix.every((part, index) => part === path[index]);
}

function samePath(left: string[], right: string[]): boolean {
  return left.length === right.length && isPrefix(left, right);
}

function lineEnd(source: string, start: number): number {
  const newline = source.indexOf("\n", start);
  return newline === -1 ? source.length : newline + 1;
}

function skipSpaces(source: string, start: number): number {
  while (source[start] === " " || source[start] === "\t") start += 1;
  return start;
}

function quotedEnd(source: string, start: number): number {
  const quote = source[start]!;
  const triple = quote.repeat(3);
  const multiline = source.startsWith(triple, start);
  for (let pos = start + (multiline ? 3 : 1); pos < source.length; pos += 1) {
    if (quote === '"' && source[pos] === "\\") {
      pos += 1;
    } else if (source[pos] === quote) {
      if (!multiline) return pos + 1;
      if (source.startsWith(triple, pos)) {
        let end = pos + 3;
        while (end < pos + 5 && source[end] === quote) end += 1;
        return end;
      }
    } else if (!multiline && source[pos] === "\n") {
      break;
    }
  }
  throw new SyntaxError(`Unterminated TOML string at offset ${start}`);
}

function decodeString(text: string): string | undefined {
  const quote = text[0];
  if (quote !== "'" && quote !== '"') return undefined;
  const multiline = text.startsWith(quote.repeat(3));
  const width = multiline ? 3 : 1;
  let value = text.slice(width, -width);
  if (multiline) value = value.replace(/^\r?\n/, "").replaceAll("\r\n", "\n");
  if (quote === "'") return value;

  const escapes: Record<string, string> = { '"': '"', "\\": "\\", b: "\b", t: "\t", n: "\n", f: "\f", r: "\r" };
  return value.replace(/\\(["\\btnfr]|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[ \t]*\n[ \t\n]*)/g,
    (_, escape: string) => {
      if (escape.startsWith("u") || escape.startsWith("U")) {
        return String.fromCodePoint(Number.parseInt(escape.slice(1), 16));
      }
      return escapes[escape] ?? "";
    });
}

function readKey(source: string, start: number): { path: string[]; end: number } {
  const path: string[] = [];
  let end = start;
  do {
    const pos = skipSpaces(source, end);
    if (source[pos] === '"' || source[pos] === "'") {
      end = quotedEnd(source, pos);
      path.push(decodeString(source.slice(pos, end))!);
    } else {
      const key = /^[A-Za-z0-9_-]+/.exec(source.slice(pos))?.[0];
      if (key === undefined) throw new SyntaxError(`Invalid TOML key at offset ${pos}`);
      path.push(key);
      end = pos + key.length;
    }
    end = skipSpaces(source, end);
    if (source[end] !== ".") return { path, end };
    end += 1;
  } while (true);
}

function readValue(source: string, start: number, inline: boolean): Span {
  const closing: string[] = [];
  let end = start;
  for (let pos = start; pos < source.length; pos += 1) {
    const char = source[pos]!;
    if (char === '"' || char === "'") {
      end = quotedEnd(source, pos);
      pos = end - 1;
      continue;
    }
    if (closing.length === 0 && (char === "#" || char === "\n" || char === "\r"
      || (inline && (char === "," || char === "}")))) break;
    if (char === "#") {
      pos = lineEnd(source, pos) - 1;
      continue;
    }
    if (char === "[" || char === "{") closing.push(char === "[" ? "]" : "}");
    if ((char === "]" || char === "}") && closing.pop() !== char) {
      throw new SyntaxError(`Unmatched TOML bracket at offset ${pos}`);
    }
    if (!/[ \t\r\n]/.test(char)) end = pos + 1;
  }
  if (end === start || closing.length) throw new SyntaxError(`Incomplete TOML value at offset ${start}`);
  return { start, end };
}

function readAssignment(source: string, start: number, scope: string[], inline: boolean): Assignment {
  const key = readKey(source, start);
  if (source[key.end] !== "=") throw new SyntaxError(`Expected TOML assignment at offset ${key.end}`);
  const value = readValue(source, skipSpaces(source, key.end + 1), inline);
  return {
    path: [...scope, ...key.path], scope, value, start, outerStart: start,
    end: inline ? value.end : lineEnd(source, value.end),
  };
}

function scanToml(source: string): { tables: Table[]; entries: Assignment[] } {
  const tables: Table[] = [];
  const entries: Assignment[] = [];
  let scope: string[] = [];
  let start = source.startsWith("\uFEFF") ? 1 : 0;
  while (start < source.length) {
    const pos = skipSpaces(source, start);
    if (source[pos] === "[") {
      const closer = source[pos + 1] === "[" ? "]]" : "]";
      const { path, end } = readKey(source, pos + closer.length);
      if (!source.startsWith(closer, end)) throw new SyntaxError(`Incomplete TOML table at offset ${start}`);
      scope = path;
      const next = lineEnd(source, end + closer.length);
      tables.push({ path, start, end: next });
      start = next;
    } else if (pos === source.length || /[#\r\n]/.test(source[pos]!)) {
      start = lineEnd(source, pos);
    } else {
      const entry = readAssignment(source, start, scope, false);
      entries.push(entry);
      start = entry.end;
    }
  }
  return { tables, entries };
}

function skipInlineTrivia(source: string, start: number): number {
  while (start < source.length) {
    if (source[start] === "#") start = lineEnd(source, start);
    else if (/[ \t\r\n]/.test(source[start]!)) start += 1;
    else break;
  }
  return start;
}

function inlineEntries(source: string, parent: Assignment): Assignment[] {
  const entries: Assignment[] = [];
  let start = skipInlineTrivia(source, parent.value.start + 1);
  let before: number | undefined;
  while (start < parent.value.end - 1) {
    const entry = readAssignment(source, start, parent.path, true);
    const comma = skipInlineTrivia(source, entry.end);
    const after = source[comma] === "," ? comma : undefined;
    entry.commas = { before, after };
    entry.outerStart = parent.outerStart;
    entries.push(entry);
    if (after === undefined) break;
    before = after;
    start = skipInlineTrivia(source, after + 1);
  }
  return entries;
}

function closestAssignment(source: string, entries: Assignment[], path: string[]): Assignment | undefined {
  for (const entry of entries) {
    if (!isPrefix(entry.path, path)) continue;
    if (!samePath(entry.path, path) && source[entry.value.start] === "{") {
      return closestAssignment(source, inlineEntries(source, entry), path) ?? entry;
    }
    return entry;
  }
  return undefined;
}

function findInlineInPath(source: string, entries: Assignment[], path: string[]): Assignment | undefined {
  for (const entry of entries) {
    if (entry.commas && isPrefix(path, entry.path)) return entry;
    if (isPrefix(entry.path, path) && source[entry.value.start] === "{") {
      const match = findInlineInPath(source, inlineEntries(source, entry), path);
      if (match) return match;
    }
  }
  return undefined;
}

function editAll(source: string, edits: Edit[]): string {
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  }
  return source;
}

function commentsIn(source: string, span: Span): string {
  let text = "";
  for (let pos = span.start; pos < span.end; pos += 1) {
    if (source[pos] === '"' || source[pos] === "'") {
      pos = quotedEnd(source, pos) - 1;
    } else if (source[pos] === "#") {
      const start = Math.max(span.start, source.lastIndexOf("\n", pos - 1) + 1);
      const end = Math.min(span.end, lineEnd(source, pos));
      text += source.slice(start, skipSpaces(source, start)) + source.slice(pos, end);
      pos = end - 1;
    }
  }
  return text;
}

function removePath(source: string, path: string[]): string {
  let document = scanToml(source);
  const direct = [...document.tables, ...document.entries].filter((entry) => isPrefix(path, entry.path));
  source = editAll(source, direct.map(({ start, end }) => ({ start, end, text: commentsIn(source, { start, end }) })));
  if (direct.length) document = scanToml(source);

  let nested = findInlineInPath(source, document.entries, path);
  while (nested) {
    const { start, end, outerStart, commas } = nested;
    const comma = commas?.after ?? commas?.before;
    const edits: Edit[] = [{ start, end, text: "" }];
    if (comma !== undefined) edits.push({ start: comma, end: comma + 1, text: "" });
    const comments = commentsIn(source, { start, end });
    if (comments) edits.push({ start: outerStart, end: outerStart, text: comments });
    source = editAll(source, edits);
    nested = findInlineInPath(source, scanToml(source).entries, path);
  }
  return source;
}

function basicString(value: string): string {
  return JSON.stringify(value).replace(/\u007f/g, "\\u007F");
}

function pathString(value: string): string {
  return /['\x00-\x1f\x7f]/.test(value) ? basicString(value) : `'${value}'`;
}

function keyString(path: string[]): string {
  return path.map((key) => /^[A-Za-z0-9_-]+$/.test(key) ? key : basicString(key)).join(".");
}

function insertLines(source: string, at: number, lines: string, newline: string): string {
  const before = source.slice(0, at);
  const prefix = before && before !== "\uFEFF" && !before.endsWith("\n") ? newline : "";
  return before + prefix + lines + newline + source.slice(at);
}

function setValue(source: string, path: string[], value: string): string {
  const { tables, entries } = scanToml(source);
  const closest = closestAssignment(source, entries, path);
  if (closest) {
    if (samePath(closest.path, path)) {
      const comments = commentsIn(source, closest.value);
      return editAll(source, [
        { ...closest.value, text: value },
        { start: closest.outerStart, end: closest.outerStart, text: comments },
      ]);
    }
    if (source[closest.value.start] !== "{") {
      throw new SyntaxError(`Expected TOML table at ${keyString(closest.path)}`);
    }
    const last = inlineEntries(source, closest).at(-1);
    const insertion = last?.commas?.after ?? last?.end ?? closest.value.start + 1;
    const added = `${keyString(path.slice(closest.path.length))} = ${value}`;
    const text = last ? `, ${added}` : ` ${added} `;
    return editAll(source, [{ start: insertion, end: insertion, text }]);
  }

  const newline = /\r?\n/.exec(source)?.[0] ?? "\n";
  const parent = path.slice(0, -1);
  const table = tables.find((candidate) => samePath(candidate.path, parent));
  if (table) {
    const last = entries.findLast((entry) => entry.scope === table.path);
    return insertLines(source, last?.end ?? table.end, `${keyString(path.slice(-1))} = ${value}`, newline);
  }

  // Dotted assignments already define their parent tables in TOML.
  const dotted = entries.find((entry) => entry.scope.length < parent.length && isPrefix(parent, entry.path));
  if (dotted) {
    return insertLines(source, dotted.end, `${keyString(path.slice(dotted.scope.length))} = ${value}`, newline);
  }

  const separator = source.replace(/^\uFEFF/, "") && !/(?:\r?\n){2}$/.test(source) ? newline : "";
  return insertLines(source, source.length, `${separator}[${keyString(parent)}]${newline}${keyString(path.slice(-1))} = ${value}`, newline);
}

export function updateCodexConfigToml(tomlContent: string, options: {
  serverName: string;
  toolName: string;
  nodePath: string;
  bundlePath: string;
  removeLegacyServers?: string[];
}): string {
  let source = tomlContent;
  for (const legacy of options.removeLegacyServers ?? []) {
    if (legacy !== options.serverName) source = removePath(source, ["mcp_servers", legacy]);
  }

  source = setValue(source, FEATURE, "true");
  const provider = closestAssignment(source, scanToml(source).entries, PROVIDER);
  if (!provider || !samePath(provider.path, PROVIDER)) source = removePath(source, PROVIDER);
  source = setValue(source, PROVIDER, `{ server = ${basicString(options.serverName)}, tool = ${basicString(options.toolName)} }`);

  const server = ["mcp_servers", options.serverName];
  for (const key of ["url", "bearer_token_env_var", "http_headers", "env_http_headers", "enabled"]) {
    source = removePath(source, [...server, key]);
  }
  source = setValue(source, [...server, "command"], pathString(options.nodePath));
  return setValue(source, [...server, "args"], `[${pathString(options.bundlePath)}]`);
}

export function removeCodexConfigToml(tomlContent: string, serverName: string): string {
  const key = [...PROVIDER, "server"];
  const provider = closestAssignment(tomlContent, scanToml(tomlContent).entries, key);
  const removeProvider = provider && samePath(provider.path, key)
    && decodeString(tomlContent.slice(provider.value.start, provider.value.end)) === serverName;
  const source = removeProvider ? removePath(tomlContent, PROVIDER) : tomlContent;
  return removePath(source, ["mcp_servers", serverName]);
}

function codexDirectory(): string {
  return process.env.CODEX_HOME || join(homedir(), ".codex");
}

function readConfig(filePath: string): string {
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

function writeConfig(filePath: string, content: string): void {
  let target = filePath;
  let mode = 0o600;
  try {
    target = realpathSync(filePath);
    mode = statSync(target).mode & 0o777;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}-${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, content, { encoding: "utf8", flag: "wx", mode });
    renameSync(temporary, target);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* The temporary file may not exist. */ }
    throw error;
  }
}

function resolveStableNodePath(explicit?: string): string {
  const candidate = explicit ?? process.execPath;
  try {
    return realpathSync(candidate);
  } catch {
    return candidate;
  }
}

export function installStatusline(options: InstallOptions): { configPath: string; removedLegacyFile: boolean } {
  const configPath = resolve(options.configTomlPath ?? join(codexDirectory(), "config.toml"));
  const current = readConfig(configPath);
  const next = updateCodexConfigToml(current, {
    serverName: ENTRYPOINTS.SERVER_NAME,
    toolName: options.defaultVariant === "whale" ? ENTRYPOINTS.WHALE_TOOL : ENTRYPOINTS.STANDARD_TOOL,
    nodePath: resolveStableNodePath(options.nodePath),
    bundlePath: resolve(options.bundlePath),
    removeLegacyServers: options.removeLegacyPython ? [LEGACY_SERVER] : [],
  });
  if (next !== current) writeConfig(configPath, next);

  let removedLegacyFile = false;
  if (options.removeLegacyPython) {
    const legacyPath = options.legacyPythonPath ?? join(codexDirectory(), "statuslines", "session-status.py");
    try {
      unlinkSync(legacyPath);
      removedLegacyFile = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return { configPath, removedLegacyFile };
}

export function uninstallStatusline(options: { configTomlPath?: string } = {}): { configPath: string; changed: boolean } {
  const configPath = resolve(options.configTomlPath ?? join(codexDirectory(), "config.toml"));
  const current = readConfig(configPath);
  const next = removeCodexConfigToml(current, ENTRYPOINTS.SERVER_NAME);
  if (next !== current) writeConfig(configPath, next);
  return { configPath, changed: next !== current };
}
