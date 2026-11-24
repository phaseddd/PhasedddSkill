import type { Color, UiElement, UiTree } from "../protocol/types.js";

/**
 * Faithful terminal ANSI truecolor renderer mirroring Codex v0.172.0's UiTree layout semantics:
 * - `row(gap: >=10000, wrap: "wrap")` acts as vertical stack
 * - Outer `row(nowrap)` aligns left & right columns side-by-side (right flush to viewport edge!)
 * - Supports `#RRGGBB` fg/bg, named ANSI/semantic colors, bold/italic/underline, and wide CJK glyphs.
 */

const ESC = "\x1b[";
const RESET = "\x1b[0m";

interface Paint {
  fg: Color | null;
  bg: Color | null;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

const DEFAULT_PAINT: Paint = {
  fg: null,
  bg: null,
  bold: false,
  italic: false,
  underline: false,
};

interface Cell {
  ch: string;
  width: number;
  paint: Paint;
}

const SEMANTIC_RGB: Record<string, [number, number, number]> = {
  primary: [60, 56, 54],
  surface: [251, 241, 199],
  accent: [7, 102, 120],
  black: [40, 40, 40],
  red: [157, 0, 6],
  green: [66, 123, 88],
  yellow: [181, 118, 20],
  blue: [7, 102, 120],
  magenta: [143, 63, 113],
  cyan: [66, 123, 88],
  white: [235, 219, 178],
  "status-model": [7, 102, 120],
  "status-path": [181, 118, 20],
  "status-branch": [143, 63, 113],
  "status-state": [175, 58, 3],
  "status-usage": [121, 116, 14],
  "status-limit": [7, 102, 120],
  "status-metadata": [124, 111, 100],
  "status-mode": [143, 63, 113],
  "status-thread": [60, 56, 54],
  "status-progress": [66, 123, 88],
};

function parseColor(color: Color | null): [number, number, number] | null {
  if (!color) return null;
  if (color.startsWith("#") && color.length === 7) {
    const r = Number.parseInt(color.slice(1, 3), 16);
    const g = Number.parseInt(color.slice(3, 5), 16);
    const b = Number.parseInt(color.slice(5, 7), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return [r, g, b];
    }
  }
  return SEMANTIC_RGB[color] ?? null;
}

function charDisplayWidth(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp === 0) return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6)
  ) {
    return 2;
  }
  return 1;
}

function paintToAnsi(paint: Paint): string {
  const codes: string[] = ["0"];
  if (paint.bold) codes.push("1");
  if (paint.italic) codes.push("3");
  if (paint.underline) codes.push("4");
  const fg = parseColor(paint.fg);
  if (fg) codes.push(`38;2;${fg[0]};${fg[1]};${fg[2]}`);
  const bg = parseColor(paint.bg);
  if (bg) codes.push(`48;2;${bg[0]};${bg[1]};${bg[2]}`);
  return `${ESC}${codes.join(";")}m`;
}

function samePaint(a: Paint, b: Paint): boolean {
  return (
    a.fg === b.fg &&
    a.bg === b.bg &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline
  );
}

interface LayoutBox {
  rows: Cell[][];
  width: number;
}

function makeSpaces(count: number, paint: Paint): Cell[] {
  const out: Cell[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ ch: " ", width: 1, paint });
  }
  return out;
}

function rowWidth(cells: Cell[]): number {
  return cells.reduce((sum, c) => sum + c.width, 0);
}

function layoutElement(node: UiElement | null, maxWidth: number, paint: Paint): LayoutBox {
  if (node === null) return { rows: [], width: 0 };

  if (typeof node === "string") {
    const lines = node.split("\n");
    const rows: Cell[][] = [];
    let w = 0;
    for (const line of lines) {
      const cells: Cell[] = [];
      let cw = 0;
      for (const ch of line) {
        const display = ch === "\u00A0" ? " " : ch;
        const dw = charDisplayWidth(display);
        cells.push({ ch: display, width: dw, paint });
        cw += dw;
      }
      rows.push(cells);
      if (cw > w) w = cw;
    }
    return { rows, width: w };
  }

  if (node.type === "bold") {
    return layoutInline(node.children, maxWidth, { ...paint, bold: true });
  }
  if (node.type === "italic") {
    return layoutInline(node.children, maxWidth, { ...paint, italic: true });
  }
  if (node.type === "underline" || node.type === "link") {
    return layoutInline(node.children, maxWidth, { ...paint, underline: true });
  }
  if (node.type === "text") {
    const nextPaint: Paint = {
      ...paint,
      fg: node.props?.color ?? paint.fg,
      bold: node.props?.weight === "bold" ? true : node.props?.weight === "normal" ? false : paint.bold,
      italic: node.props?.italic ?? paint.italic,
      underline: node.props?.underline ?? paint.underline,
    };
    return layoutInline(node.children, maxWidth, nextPaint);
  }

  // Row node
  const nextPaint: Paint = {
    ...paint,
    bg: node.props.background ?? paint.bg,
  };
  const gap = node.props.gap;
  const wrap = node.props.wrap ?? "nowrap";
  const children = node.children.filter((c): c is UiElement => c !== null);

  // Vertical stack convention: wrap + huge gap (>= 1000) renders each child on its own row
  if (wrap === "wrap" && gap >= 1000) {
    const allRows: Cell[][] = [];
    let w = 0;
    for (const child of children) {
      const box = layoutElement(child, maxWidth, nextPaint);
      for (const r of box.rows) {
        allRows.push(r);
        const rw = rowWidth(r);
        if (rw > w) w = rw;
      }
    }
    return { rows: allRows, width: w };
  }

  // Two-column flush-right convention matching Codex ui_tree/render.rs layout_band:
  // Reserve the right column's width first so the left column wraps inside (maxWidth - gap - rightWidth).
  const isTwoColFlex =
    wrap === "nowrap" &&
    children.length === 2 &&
    typeof children[0] !== "string" &&
    children[0]!.type === "row" &&
    children[0]!.props.gap >= 1000;

  if (isTwoColFlex) {
    const rightBox = layoutElement(children[1]!, maxWidth, nextPaint);
    const leftBudget = Math.max(16, maxWidth - gap - rightBox.width);
    const leftBox = layoutElement(children[0]!, leftBudget, nextPaint);
    const height = Math.max(leftBox.rows.length, rightBox.rows.length);
    const rightStart = Math.max(leftBox.width + gap, maxWidth - rightBox.width);
    const outRows: Cell[][] = [];
    let maxW = 0;

    for (let y = 0; y < height; y++) {
      const lr = leftBox.rows[y] ?? [];
      const rr = rightBox.rows[y] ?? [];
      const lw = rowWidth(lr);
      const pad = Math.max(gap, rightStart - lw);
      const combined = [...lr, ...makeSpaces(pad, nextPaint), ...rr];
      const cw = rowWidth(combined);
      if (cw > maxW) maxW = cw;
      outRows.push(combined);
    }
    return { rows: outRows, width: maxW };
  }

  const childBoxes = children.map((c) => layoutElement(c, maxWidth, nextPaint));

  // Standard horizontal row (with optional wrap)
  const outRows: Cell[][] = [];
  let currentLine: Cell[] = [];
  let currentW = 0;
  let maxW = 0;

  for (const box of childBoxes) {
    if (box.rows.length === 0) continue;
    const flat = box.rows[0] ?? [];
    const bw = rowWidth(flat);

    if (wrap === "wrap" && currentW > 0 && currentW + gap + bw > maxWidth) {
      outRows.push(currentLine);
      if (currentW > maxW) maxW = currentW;
      currentLine = [...flat];
      currentW = bw;
    } else {
      if (currentW > 0 && gap > 0) {
        currentLine.push(...makeSpaces(gap, nextPaint));
        currentW += gap;
      }
      currentLine.push(...flat);
      currentW += bw;
    }
  }
  if (currentLine.length > 0) {
    outRows.push(currentLine);
    if (currentW > maxW) maxW = currentW;
  }
  return { rows: outRows, width: maxW };
}

function layoutInline(children: Array<UiElement | null>, maxWidth: number, paint: Paint): LayoutBox {
  const outRows: Cell[][] = [[]];
  let maxW = 0;

  for (const child of children) {
    if (child === null) continue;
    const box = layoutElement(child, maxWidth, paint);
    for (let i = 0; i < box.rows.length; i++) {
      if (i > 0) outRows.push([]);
      const target = outRows[outRows.length - 1]!;
      target.push(...box.rows[i]!);
      const w = rowWidth(target);
      if (w > maxW) maxW = w;
    }
  }
  return { rows: outRows, width: maxW };
}

export function renderUiTreeToAnsi(tree: UiTree, width = 112, canvasBg: Color | null = null): string {
  if (tree === null) return "";
  const basePaint: Paint = { ...DEFAULT_PAINT, bg: canvasBg };
  const box = layoutElement(tree, width, basePaint);
  const lines: string[] = [];

  for (const cells of box.rows) {
    let out = "";
    let active: Paint | null = null;
    let col = 0;

    for (const cell of cells) {
      if (col + cell.width > width) break;
      if (!active || !samePaint(active, cell.paint)) {
        out += paintToAnsi(cell.paint);
        active = cell.paint;
      }
      out += cell.ch;
      col += cell.width;
    }
    if (canvasBg && col < width) {
      if (!active || !samePaint(active, basePaint)) {
        out += paintToAnsi(basePaint);
        active = basePaint;
      }
      out += " ".repeat(width - col);
    }
    if (active) out += RESET;
    lines.push(out);
  }
  return lines.join("\n");
}
