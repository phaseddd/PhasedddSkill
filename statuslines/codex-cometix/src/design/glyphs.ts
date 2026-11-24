import type { GlyphMode } from "../protocol/types.js";

/**
 * Curated glyph tables for Nerd Font (Maple Mono NF CN / NF v3), Unicode, and ASCII.
 * Every Nerd Font codepoint here is verified single-cell width from CCometixLine's NF v3 set.
 */
export interface GlyphSet {
  model: string;
  effort: string;
  dir: string;
  git: string;
  gitClean: string;
  gitDirty: string;
  gitStaged: string;
  gitUntracked: string;
  ahead: string;
  behind: string;
  cache: string;
  quota5h: string;
  quota7d: string;
  cost: string;
  today: string;
  timer: string;
  speed: string;
  sep: string;
  dot: string;
  pillLeft: string;
  pillRight: string;
  paceFast: string;
  paceSlow: string;
  paceEven: string;
  stateReady: string;
  stateWorking: readonly string[];
  stateThinking: readonly string[];
  stateWaiting: string;
  stateStarting: string;
  barFrameLeft: string;
  barFrameRight: string;
  barFull: string;
  barPartials: readonly string[];
  barEmpty: string;
  contextRings: readonly string[];
  sparkLevels: readonly string[];
}

const NERD_GLYPHS: GlyphSet = {
  model: "\u{f135}",       // fa-rocket (classic NF v2/v3 core, 100% present in Maple Mono NF CN)
  effort: "\u{f0e7}",      // fa-bolt
  dir: "\u{f024b}",        // md-folder (verified rendered in Maple Mono NF CN)
  git: "\u{f02a2}",        // md-git
  gitClean: "✓",
  gitDirty: "●",
  gitStaged: "+",
  gitUntracked: "?",
  ahead: "↑",
  behind: "↓",
  cache: "\u{f1c0}",       // fa-database
  quota5h: "\u{f0520}",    // md-timer-outline
  quota7d: "\u{f073}",     // fa-calendar
  cost: "\u{f0d6}",        // fa-money (classic NF core, avoids double '$' next to $0.42)
  today: "∑",
  timer: "\u{f017}",       // fa-clock-o (classic NF core)
  speed: "\u{f0e4}",       // fa-tachometer (classic NF core)
  sep: "│",
  dot: "·",
  pillLeft: "\u{e0b6}",    // 
  pillRight: "\u{e0b4}",   // 
  paceFast: "⇡",
  paceSlow: "⇣",
  paceEven: "≈",
  stateReady: "●",
  stateWorking: ["⠋", "⠙", "⠸", "⠴", "⠦", "⠇"],
  stateThinking: ["✦", "✧", "✶", "✧"],
  stateWaiting: "◌",
  stateStarting: "◦",
  barFrameLeft: "▕",
  barFrameRight: "▏",
  barFull: "█",
  barPartials: ["▏", "▎", "▍", "▌", "▋", "▊", "▉"],
  barEmpty: "░",
  contextRings: [
    "\u{f0a9e}",
    "\u{f0a9f}",
    "\u{f0aa0}",
    "\u{f0aa1}",
    "\u{f0aa2}",
    "\u{f0aa3}",
    "\u{f0aa4}",
    "\u{f0aa5}",
  ],
  sparkLevels: ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"],
};

const UNICODE_GLYPHS: GlyphSet = {
  model: "◆",
  effort: "⚡",
  dir: "▣",
  git: "⎇",
  gitClean: "✓",
  gitDirty: "●",
  gitStaged: "+",
  gitUntracked: "?",
  ahead: "↑",
  behind: "↓",
  cache: "≈",
  quota5h: "◷",
  quota7d: "◶",
  cost: "$",
  today: "∑",
  timer: "⏱",
  speed: "»",
  sep: "│",
  dot: "·",
  pillLeft: "",
  pillRight: "",
  paceFast: "⇡",
  paceSlow: "⇣",
  paceEven: "≈",
  stateReady: "●",
  stateWorking: ["◐", "◓", "◑", "◒"],
  stateThinking: ["✦", "✧"],
  stateWaiting: "◌",
  stateStarting: "◦",
  barFrameLeft: "▕",
  barFrameRight: "▏",
  barFull: "█",
  barPartials: ["▏", "▎", "▍", "▌", "▋", "▊", "▉"],
  barEmpty: "░",
  contextRings: ["○", "◔", "◑", "◕", "●"],
  sparkLevels: ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"],
};

const ASCII_GLYPHS: GlyphSet = {
  model: "*",
  effort: "",
  dir: "dir",
  git: "git",
  gitClean: "ok",
  gitDirty: "*",
  gitStaged: "+",
  gitUntracked: "?",
  ahead: "^",
  behind: "v",
  cache: "cache",
  quota5h: "5h",
  quota7d: "7d",
  cost: "$",
  today: "day",
  timer: "t",
  speed: "",
  sep: "|",
  dot: ".",
  pillLeft: "[",
  pillRight: "]",
  paceFast: "+",
  paceSlow: "-",
  paceEven: "=",
  stateReady: "o",
  stateWorking: ["|", "/", "-", "\\"],
  stateThinking: ["*", "+"],
  stateWaiting: ".",
  stateStarting: ".",
  barFrameLeft: "[",
  barFrameRight: "]",
  barFull: "=",
  barPartials: [],
  barEmpty: "-",
  contextRings: [],
  sparkLevels: ["_", ".", "-", "=", "^"],
};

export function getGlyphs(mode: GlyphMode): GlyphSet {
  switch (mode) {
    case "nerd":
      return NERD_GLYPHS;
    case "unicode":
      return UNICODE_GLYPHS;
    case "ascii":
      return ASCII_GLYPHS;
  }
}

export interface SubCellBarParts {
  filled: string;
  empty: string;
}

/**
 * Builds a high-precision 1/8-cell sub-block progress bar (`▕████▌░░░░░▏`).
 * Uses `░` / `-` for unfilled cells so Codex's whitespace collapser never shrinks the track.
 */
export function buildProgressBar(pct: number, width: number, glyphs: GlyphSet): SubCellBarParts {
  const safeWidth = Math.max(3, Math.min(24, Math.floor(width)));
  const clamped = Math.max(0, Math.min(100, pct));
  const exactCells = (clamped / 100) * safeWidth;
  const fullCells = Math.floor(exactCells);
  const remainder = exactCells - fullCells;

  let filled = glyphs.barFull.repeat(fullCells);
  let usedCells = fullCells;

  if (usedCells < safeWidth) {
    if (glyphs.barPartials.length > 0 && remainder > 0) {
      const idx = Math.min(
        glyphs.barPartials.length - 1,
        Math.floor(remainder * glyphs.barPartials.length),
      );
      if (remainder >= 1 / (glyphs.barPartials.length + 1)) {
        filled += glyphs.barPartials[idx]!;
        usedCells += 1;
      }
    } else if (clamped > 0 && fullCells === 0 && glyphs.barPartials.length > 0) {
      // Show a crisp hairline sliver even at 1% so non-zero usage is perceptible.
      filled += glyphs.barPartials[0]!;
      usedCells += 1;
    }
  }

  const emptyCount = Math.max(0, safeWidth - usedCells);
  const empty = glyphs.barEmpty.repeat(emptyCount);
  return { filled, empty };
}

export function pickContextRing(usedPct: number, glyphs: GlyphSet): string {
  const rings = glyphs.contextRings;
  if (rings.length === 0) return "";
  const ratio = Math.max(0, Math.min(1, usedPct / 100));
  const idx = Math.min(rings.length - 1, Math.floor(ratio * rings.length));
  return rings[idx]!;
}

export function buildSparkline(samples: readonly number[], glyphs: GlyphSet): string {
  if (samples.length < 2) return "";
  const levels = glyphs.sparkLevels;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const span = max - min;
  return samples
    .map((v) => {
      if (span <= 0) return levels[Math.floor(levels.length / 2)]!;
      const norm = (v - min) / span;
      const idx = Math.min(levels.length - 1, Math.floor(norm * levels.length));
      return levels[idx]!;
    })
    .join("");
}
