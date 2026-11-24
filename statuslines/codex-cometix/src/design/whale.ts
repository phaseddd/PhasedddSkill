import type { Color, UiElement } from "../protocol/types.js";
import type { Palette } from "./palettes.js";

/**
 * Hand-sculpted DeepSeek Fat Fish (蓝色大肥鱼) pixel-art sprite engine.
 *
 * Canvas: 6 vertical pixels × 14 horizontal columns → rendered into EXACTLY 3 terminal rows
 * (matching Codex CLI v0.172.0's hard 3-row statusline viewport ceiling with zero clipping!)
 * via Unicode half-blocks (`▀`, `▄`, `█`) and truecolor fg + `row.background` RLE runs.
 *
 * Pixel palette key:
 *   '.' = transparent (terminal canvas shows through)
 *   'B' = DeepSeek royal blue body
 *   'D' = deep royal blue contour / tail / fin shadow
 *   'H' = glossy forehead highlight
 *   'W' = chubby cream-white belly
 *   'E' = dark eye
 *   'P' = rosy pink cheek blush
 *   'T' = bright cyan tear drop (为什么你在流泪)
 *   'R' = coral-red heart (我真的特别爱你)
 *   'Y' = golden beat sparkle
 *   'O' = lazy idle bubble
 *   'M' = electric beat music accent
 */

export const WHALE_WIDTH = 14;
export const WHALE_ROWS = 3;
export const WHALE_PIXEL_ROWS = WHALE_ROWS * 2;

type PixelKey = "." | "B" | "D" | "H" | "W" | "E" | "P" | "T" | "R" | "Y" | "O" | "M";

export interface WhaleFrame {
  name: string;
  /** Exactly 6 strings of length 14 */
  pixels: readonly string[];
}

// ---------------------------------------------------------------------------
// IDLE: Lazy horizontal chubby DeepSeek blue whale floating & blowing bubbles
// ---------------------------------------------------------------------------

export const WHALE_IDLE_FRAMES: readonly WhaleFrame[] = [
  {
    name: "idle-float-1",
    pixels: [
      "....O.........",
      "..BBHHBBB....D",
      ".BBEBBBBBB..DD",
      ".BPBBBBBBBBDD.",
      "..BWWWWWWBBD.D",
      "...DDDDDB.....",
    ],
  },
  {
    name: "idle-float-2",
    pixels: [
      "...O..........",
      "....O........D",
      "..BBHHBBB...DD",
      ".BBEBBBBBBBDD.",
      ".BPWWWWWWBBD.D",
      "..BDDDDDB.....",
    ],
  },
  {
    name: "idle-blink",
    pixels: [
      ".....O........",
      "..BBHHBBB...D.",
      ".BBBBBBBBB.DD.",
      ".BPBBBBBBBBDD.",
      "..BWWWWWWBBD..",
      "...DDDDDB...D.",
    ],
  },
  {
    name: "idle-float-3",
    pixels: [
      "....O.........",
      "...O........D.",
      "..BBHHBBB..DD.",
      ".BBEBBBBBBBDD.",
      ".BPWWWWWWBBD..",
      "..BDDDDDB...D.",
    ],
  },
];

// ---------------------------------------------------------------------------
// WORKING / THINKING: 8-Beat Pure-Pixel《落泪》Dance Choreography (1 FPS)
// Pops upright on its chubby tail, shaking belly with pixel hearts, tears & beats!
// ---------------------------------------------------------------------------

export const WHALE_DANCE_FRAMES: readonly WhaleFrame[] = [
  // Beat 0: Lean LEFT, left fin raised pointing + floating red heart (我真的)
  {
    name: "dance-1-love-left",
    pixels: [
      ".RR..BHHB..Y..",
      ".RR.BBBBBB....",
      "DBBEBBBBEBD...",
      "..BPWWWWPB..D.",
      "...BWWWWWWB...",
      "...DD....DD...",
    ],
  },
  // Beat 1: Sway RIGHT, right fin raised + double red hearts (特别爱你)
  {
    name: "dance-2-love-right",
    pixels: [
      "..R..BHHB..RR.",
      "....BBBBBB.RR.",
      "...BBEBBBBEBD.",
      ".D..BPWWWWPB..",
      "...BWWWWWWB...",
      "....DD..DD....",
    ],
  },
  // Beat 2: Both fins clutching cheeks + sparkling tears forming (为什么)
  {
    name: "dance-3-why-tears",
    pixels: [
      "..Y..BHHB..Y..",
      "...BEBBBBEB...",
      "..DBTWWWWPBD..",
      "..DBTWWWWTBD..",
      "...BWWWWWWB...",
      "...DD....DD...",
    ],
  },
  // Beat 3: Squat beat! Twin cyan tear waterfalls + fat belly shake (你在流泪)
  {
    name: "dance-4-crying-squash",
    pixels: [
      ".R...BHHBB..R.",
      "...BBBBBBBB...",
      ".DBBEBBBBEBBD.",
      "D.BPTWWWWTPB.D",
      "..B.TWWWWBTB..",
      "..DD.BBBB.DD..",
    ],
  },
  // Beat 4: DJ beat left — wipe tear + throw heart + music accent
  {
    name: "dance-5-wipe-left",
    pixels: [
      "M.RR.BHHB...Y.",
      "..RR.BBBBBB...",
      "..DBBEBBBBEB..",
      ".D.BPTWWWPBD..",
      "...BTWWWWWWB..",
      "....DD..DD....",
    ],
  },
  // Beat 5: DJ hype jump! Both fins flung wide, hearts & tears flying symmetrically
  {
    name: "dance-6-jump-hype",
    pixels: [
      ".R.Y.BHHB.Y.R.",
      ".D..BEBBBBEB.D",
      "D..BPTWWWWTPBD",
      "...BTWWWWWWBT.",
      "....BBBBBBBB..",
      "...D........D.",
    ],
  },
  // Beat 6: Cheeky left hip sway + wink + tear & heart groove
  {
    name: "dance-7-sway-left",
    pixels: [
      "..R..BHHBB..M.",
      "..BBBBBBB.....",
      ".BBEBBBBBB..Y.",
      "DBPTWWWWPBD...",
      "..BTWWWWWWB...",
      "..DD...DD.....",
    ],
  },
  // Beat 7: Cheeky right hip sway + hug fins + twin tears loop back
  {
    name: "dance-8-sway-right",
    pixels: [
      "..Y...BHHBB.R.",
      ".....BBBBBBB..",
      ".M..BEBBBBEB..",
      "...BPTWWWWTPBD",
      "...BTWWWWWWB..",
      ".....DD..DD...",
    ],
  },
];

function resolvePixelColor(key: PixelKey, palette: Palette): Color | null {
  const w = palette.whale;
  switch (key) {
    case ".":
      return null;
    case "B":
      return w.body;
    case "D":
      return w.bodyDeep;
    case "H":
      return w.highlight;
    case "W":
      return w.belly;
    case "E":
      return w.eye;
    case "P":
      return w.blush;
    case "T":
      return w.tear;
    case "R":
      return w.heart;
    case "Y":
      return w.sparkle;
    case "O":
      return w.bubble;
    case "M":
      return w.note;
  }
}

interface CellToken {
  ch: string;
  fg: Color | null;
  bg: Color | null;
}

function encodeHalfBlockCell(top: Color | null, bottom: Color | null): CellToken {
  if (top === null && bottom === null) {
    return { ch: "\u00A0", fg: null, bg: null };
  }
  if (top !== null && bottom === null) {
    return { ch: "▀", fg: top, bg: null };
  }
  if (top === null && bottom !== null) {
    return { ch: "▄", fg: bottom, bg: null };
  }
  if (top === bottom) {
    return { ch: "█", fg: top, bg: null };
  }
  return { ch: "▀", fg: top, bg: bottom };
}

interface RunSegment {
  text: string;
  fg: Color | null;
  bg: Color | null;
}

/**
 * Compresses a single terminal row (2 pixel rows) into minimal RLE UiElements.
 * Adjacent transparent / fg-only runs stay flat inside a single text node to save nodes.
 */
function buildWhaleTerminalRow(topRow: string, bottomRow: string, palette: Palette): UiElement {
  const runs: RunSegment[] = [];
  for (let x = 0; x < WHALE_WIDTH; x++) {
    const topKey = (topRow[x] ?? ".") as PixelKey;
    const botKey = (bottomRow[x] ?? ".") as PixelKey;
    const token = encodeHalfBlockCell(
      resolvePixelColor(topKey, palette),
      resolvePixelColor(botKey, palette),
    );
    const prev = runs[runs.length - 1];
    if (prev && prev.fg === token.fg && prev.bg === token.bg) {
      prev.text += token.ch;
    } else {
      runs.push({ text: token.ch, fg: token.fg, bg: token.bg });
    }
  }

  const rowChildren: UiElement[] = [];
  let inlineBuf: UiElement[] = [];

  const flushInline = () => {
    if (inlineBuf.length === 0) return;
    if (inlineBuf.length === 1) {
      rowChildren.push(inlineBuf[0]!);
    } else {
      rowChildren.push({ type: "text", children: inlineBuf });
    }
    inlineBuf = [];
  };

  for (const run of runs) {
    if (run.bg === null) {
      if (run.fg === null) {
        inlineBuf.push(run.text);
      } else {
        inlineBuf.push({
          type: "text",
          props: { color: run.fg },
          children: [run.text],
        });
      }
    } else {
      flushInline();
      rowChildren.push({
        type: "row",
        props: { gap: 0, background: run.bg, wrap: "nowrap" },
        children: [
          run.fg === null
            ? run.text
            : { type: "text", props: { color: run.fg }, children: [run.text] },
        ],
      });
    }
  }
  flushInline();

  if (rowChildren.length === 1 && typeof rowChildren[0] !== "string" && rowChildren[0]!.type === "row") {
    return rowChildren[0]!;
  }

  return {
    type: "row",
    props: { gap: 0, wrap: "nowrap" },
    children: rowChildren,
  };
}

export function selectWhaleFrame(isActive: boolean, tick: number): WhaleFrame {
  const safeTick = Math.max(0, Math.floor(tick));
  if (isActive) {
    return WHALE_DANCE_FRAMES[safeTick % WHALE_DANCE_FRAMES.length]!;
  }
  return WHALE_IDLE_FRAMES[safeTick % WHALE_IDLE_FRAMES.length]!;
}

/**
 * Renders the 3-row vertical stack of the DS Fat Fish using Codex's wrap+large-gap column pattern.
 * Width is fixed at WHALE_WIDTH (14 cols) and height is 3 rows — zero clipping in Codex v0.172.0!
 */
export function renderWhaleColumn(
  isActive: boolean,
  tick: number,
  palette: Palette,
): { node: UiElement; frameName: string } {
  const frame = selectWhaleFrame(isActive, tick);
  const rows: UiElement[] = [];
  for (let r = 0; r < WHALE_ROWS; r++) {
    const top = frame.pixels[r * 2] ?? ".".repeat(WHALE_WIDTH);
    const bot = frame.pixels[r * 2 + 1] ?? ".".repeat(WHALE_WIDTH);
    rows.push(buildWhaleTerminalRow(top, bot, palette));
  }
  return {
    frameName: frame.name,
    node: {
      type: "row",
      props: { gap: 10000, wrap: "wrap" },
      children: rows,
    },
  };
}
