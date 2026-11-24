import type { Color, PaletteId } from "../protocol/types.js";

/**
 * Semantic color palette for all 3 skins (editorial, pill, plain).
 * Every palette is hand-tuned as a cohesive light or dark visual system.
 */
export interface Palette {
  id: PaletteId;
  mode: "light" | "dark" | "adaptive";
  /** Anchor focal badge for Model + Reasoning Effort (editorial & pill) */
  badgeModelBg: Color | null;
  badgeModelFg: Color;
  badgeEffortFg: Color;
  /** Subtle surface for pill skin modules */
  pillBg: Color | null;
  pillBgAlt: Color | null;
  /** Run-state semantic chips */
  stateReadyBg: Color | null;
  stateReadyFg: Color;
  stateWorkBg: Color | null;
  stateWorkFg: Color;
  stateThinkBg: Color | null;
  stateThinkFg: Color;
  stateWaitBg: Color | null;
  stateWaitFg: Color;
  /** Workspace & Git */
  dir: Color;
  gitBranch: Color;
  gitClean: Color;
  gitDirty: Color;
  gitAheadBehind: Color;
  gitAdd: Color;
  gitDel: Color;
  /** Gauges & telemetry */
  ctxOk: Color;
  ctxWarn: Color;
  ctxCrit: Color;
  barTrack: Color;
  sparkline: Color;
  cache: Color;
  quota5h: Color;
  quota7d: Color;
  paceFast: Color;
  paceSlow: Color;
  paceEven: Color;
  /** Cost & Timing */
  cost: Color;
  costToday: Color;
  timing: Color;
  tps: Color;
  /** Structural typography */
  sep: Color;
  muted: Color;
  text: Color;
  /** DS Fat Fish pixel-art palette tuned for contrast against light vs dark canvas */
  whale: {
    body: Color;
    bodyDeep: Color;
    highlight: Color;
    belly: Color;
    outline: Color;
    eye: Color;
    blush: Color;
    tear: Color;
    heart: Color;
    sparkle: Color;
    bubble: Color;
    note: Color;
  };
}

const WHALE_LIGHT = {
  body: "#3B5BDB",
  bodyDeep: "#2B44B8",
  highlight: "#748FFC",
  belly: "#F1F5FF",
  outline: "#1B2559",
  eye: "#111827",
  blush: "#F06595",
  tear: "#0CA6E9",
  heart: "#E03131",
  sparkle: "#D97706",
  bubble: "#228BE6",
  note: "#AE3EC9",
} as const;

const WHALE_DARK = {
  body: "#4D6BFE",
  bodyDeep: "#3651D9",
  highlight: "#8CA2FF",
  belly: "#EDF2FF",
  outline: "#18224D",
  eye: "#0F172A",
  blush: "#FF7AA2",
  tear: "#38BDF8",
  heart: "#FB7185",
  sparkle: "#FBBF24",
  bubble: "#7DD3FC",
  note: "#E879F9",
} as const;

export const PALETTES: Record<PaletteId, Palette> = {
  /**
   * Default — hand-crafted for warm parchment / Gruvbox Light (#fbf1c7) terminals.
   * Inspired by Swiss editorial typography + tactile studio instrumentation.
   */
  "gruvbox-light": {
    id: "gruvbox-light",
    mode: "light",
    badgeModelBg: "#3C3836",
    badgeModelFg: "#FBF1C7",
    badgeEffortFg: "#FABD2F",
    pillBg: "#EBDBB2",
    pillBgAlt: "#E4D3A8",
    stateReadyBg: "#E3E8C8",
    stateReadyFg: "#427B58",
    stateWorkBg: "#F6DFB8",
    stateWorkFg: "#AF3A03",
    stateThinkBg: "#EAD8E2",
    stateThinkFg: "#8F3F71",
    stateWaitBg: "#F3E2B3",
    stateWaitFg: "#B57614",
    dir: "#B57614",
    gitBranch: "#8F3F71",
    gitClean: "#427B58",
    gitDirty: "#AF3A03",
    gitAheadBehind: "#076678",
    gitAdd: "#79740E",
    gitDel: "#9D0006",
    ctxOk: "#076678",
    ctxWarn: "#B57614",
    ctxCrit: "#9D0006",
    barTrack: "#D5C4A1",
    sparkline: "#427B58",
    cache: "#427B58",
    quota5h: "#076678",
    quota7d: "#8F3F71",
    paceFast: "#AF3A03",
    paceSlow: "#427B58",
    paceEven: "#7C6F64",
    cost: "#79740E",
    costToday: "#9D5B10",
    timing: "#665C54",
    tps: "#076678",
    sep: "#BDAE93",
    muted: "#7C6F64",
    text: "#3C3836",
    whale: WHALE_LIGHT,
  },

  "gruvbox-dark": {
    id: "gruvbox-dark",
    mode: "dark",
    badgeModelBg: "#458588",
    badgeModelFg: "#FBF1C7",
    badgeEffortFg: "#FABD2F",
    pillBg: "#3C3836",
    pillBgAlt: "#504945",
    stateReadyBg: "#343D2C",
    stateReadyFg: "#B8BB26",
    stateWorkBg: "#4D3422",
    stateWorkFg: "#FE8019",
    stateThinkBg: "#44303B",
    stateThinkFg: "#D3869B",
    stateWaitBg: "#4B3D24",
    stateWaitFg: "#FABD2F",
    dir: "#FABD2F",
    gitBranch: "#D3869B",
    gitClean: "#B8BB26",
    gitDirty: "#FE8019",
    gitAheadBehind: "#83A598",
    gitAdd: "#B8BB26",
    gitDel: "#FB4934",
    ctxOk: "#83A598",
    ctxWarn: "#FABD2F",
    ctxCrit: "#FB4934",
    barTrack: "#504945",
    sparkline: "#8EC07C",
    cache: "#8EC07C",
    quota5h: "#83A598",
    quota7d: "#D3869B",
    paceFast: "#FE8019",
    paceSlow: "#8EC07C",
    paceEven: "#A89984",
    cost: "#B8BB26",
    costToday: "#FABD2F",
    timing: "#BDAE93",
    tps: "#83A598",
    sep: "#665C54",
    muted: "#A89984",
    text: "#EBDBB2",
    whale: WHALE_DARK,
  },

  "catppuccin-latte": {
    id: "catppuccin-latte",
    mode: "light",
    badgeModelBg: "#1E66F5",
    badgeModelFg: "#EFF1F5",
    badgeEffortFg: "#F9E2AF",
    pillBg: "#E6E9EF",
    pillBgAlt: "#DCE0E8",
    stateReadyBg: "#DCEEE0",
    stateReadyFg: "#40A02B",
    stateWorkBg: "#FCE5D8",
    stateWorkFg: "#FE640B",
    stateThinkBg: "#ECE0F8",
    stateThinkFg: "#8839EF",
    stateWaitBg: "#F9ECD6",
    stateWaitFg: "#DF8E1D",
    dir: "#DF8E1D",
    gitBranch: "#8839EF",
    gitClean: "#40A02B",
    gitDirty: "#FE640B",
    gitAheadBehind: "#04A5E5",
    gitAdd: "#40A02B",
    gitDel: "#D20F39",
    ctxOk: "#179299",
    ctxWarn: "#DF8E1D",
    ctxCrit: "#D20F39",
    barTrack: "#CCD0DA",
    sparkline: "#179299",
    cache: "#40A02B",
    quota5h: "#1E66F5",
    quota7d: "#8839EF",
    paceFast: "#FE640B",
    paceSlow: "#40A02B",
    paceEven: "#7C7F93",
    cost: "#179299",
    costToday: "#DF8E1D",
    timing: "#6C6F85",
    tps: "#1E66F5",
    sep: "#BCC0CC",
    muted: "#7C7F93",
    text: "#4C4F69",
    whale: WHALE_LIGHT,
  },

  "catppuccin-mocha": {
    id: "catppuccin-mocha",
    mode: "dark",
    badgeModelBg: "#313244",
    badgeModelFg: "#89B4FA",
    badgeEffortFg: "#F9E2AF",
    pillBg: "#313244",
    pillBgAlt: "#45475A",
    stateReadyBg: "#263831",
    stateReadyFg: "#A6E3A1",
    stateWorkBg: "#3D2D27",
    stateWorkFg: "#FAB387",
    stateThinkBg: "#362B45",
    stateThinkFg: "#CBA6F7",
    stateWaitBg: "#3D3729",
    stateWaitFg: "#F9E2AF",
    dir: "#F9E2AF",
    gitBranch: "#CBA6F7",
    gitClean: "#A6E3A1",
    gitDirty: "#FAB387",
    gitAheadBehind: "#89DCEB",
    gitAdd: "#A6E3A1",
    gitDel: "#F38BA8",
    ctxOk: "#94E2D5",
    ctxWarn: "#F9E2AF",
    ctxCrit: "#F38BA8",
    barTrack: "#45475A",
    sparkline: "#94E2D5",
    cache: "#A6E3A1",
    quota5h: "#89B4FA",
    quota7d: "#CBA6F7",
    paceFast: "#FAB387",
    paceSlow: "#A6E3A1",
    paceEven: "#9399B2",
    cost: "#94E2D5",
    costToday: "#F9E2AF",
    timing: "#A6ADC8",
    tps: "#89DCEB",
    sep: "#585B70",
    muted: "#9399B2",
    text: "#CDD6F4",
    whale: WHALE_DARK,
  },

  "tokyo-night": {
    id: "tokyo-night",
    mode: "dark",
    badgeModelBg: "#292E42",
    badgeModelFg: "#7AA2F7",
    badgeEffortFg: "#E0AF68",
    pillBg: "#24283B",
    pillBgAlt: "#2F3549",
    stateReadyBg: "#223331",
    stateReadyFg: "#9ECE6A",
    stateWorkBg: "#3A2B24",
    stateWorkFg: "#FF9E64",
    stateThinkBg: "#2F2640",
    stateThinkFg: "#BB9AF7",
    stateWaitBg: "#383223",
    stateWaitFg: "#E0AF68",
    dir: "#E0AF68",
    gitBranch: "#BB9AF7",
    gitClean: "#9ECE6A",
    gitDirty: "#FF9E64",
    gitAheadBehind: "#7DCFFF",
    gitAdd: "#9ECE6A",
    gitDel: "#F7768E",
    ctxOk: "#2AC3DE",
    ctxWarn: "#E0AF68",
    ctxCrit: "#F7768E",
    barTrack: "#3B4261",
    sparkline: "#73DACA",
    cache: "#73DACA",
    quota5h: "#7AA2F7",
    quota7d: "#BB9AF7",
    paceFast: "#FF9E64",
    paceSlow: "#9ECE6A",
    paceEven: "#787C99",
    cost: "#73DACA",
    costToday: "#E0AF68",
    timing: "#9AA5CE",
    tps: "#7DCFFF",
    sep: "#414868",
    muted: "#787C99",
    text: "#C0CAF5",
    whale: WHALE_DARK,
  },

  "rose-pine": {
    id: "rose-pine",
    mode: "dark",
    badgeModelBg: "#26233A",
    badgeModelFg: "#EBBCBA",
    badgeEffortFg: "#F6C177",
    pillBg: "#26233A",
    pillBgAlt: "#312E47",
    stateReadyBg: "#22323A",
    stateReadyFg: "#9CCFD8",
    stateWorkBg: "#3B2832",
    stateWorkFg: "#EB6F92",
    stateThinkBg: "#312840",
    stateThinkFg: "#C4A7E7",
    stateWaitBg: "#393129",
    stateWaitFg: "#F6C177",
    dir: "#F6C177",
    gitBranch: "#C4A7E7",
    gitClean: "#9CCFD8",
    gitDirty: "#EBBCBA",
    gitAheadBehind: "#31748F",
    gitAdd: "#9CCFD8",
    gitDel: "#EB6F92",
    ctxOk: "#9CCFD8",
    ctxWarn: "#F6C177",
    ctxCrit: "#EB6F92",
    barTrack: "#403D52",
    sparkline: "#9CCFD8",
    cache: "#9CCFD8",
    quota5h: "#EBBCBA",
    quota7d: "#C4A7E7",
    paceFast: "#EB6F92",
    paceSlow: "#9CCFD8",
    paceEven: "#908CAA",
    cost: "#F6C177",
    costToday: "#EBBCBA",
    timing: "#908CAA",
    tps: "#9CCFD8",
    sep: "#524F67",
    muted: "#908CAA",
    text: "#E0DEF4",
    whale: WHALE_DARK,
  },

  nord: {
    id: "nord",
    mode: "dark",
    badgeModelBg: "#3B4252",
    badgeModelFg: "#88C0D0",
    badgeEffortFg: "#EBCB8B",
    pillBg: "#3B4252",
    pillBgAlt: "#434C5E",
    stateReadyBg: "#33423D",
    stateReadyFg: "#A3BE8C",
    stateWorkBg: "#4A3A36",
    stateWorkFg: "#D08770",
    stateThinkBg: "#43394A",
    stateThinkFg: "#B48EAD",
    stateWaitBg: "#494336",
    stateWaitFg: "#EBCB8B",
    dir: "#EBCB8B",
    gitBranch: "#B48EAD",
    gitClean: "#A3BE8C",
    gitDirty: "#D08770",
    gitAheadBehind: "#81A1C1",
    gitAdd: "#A3BE8C",
    gitDel: "#BF616A",
    ctxOk: "#88C0D0",
    ctxWarn: "#EBCB8B",
    ctxCrit: "#BF616A",
    barTrack: "#4C566A",
    sparkline: "#8FBCBB",
    cache: "#A3BE8C",
    quota5h: "#88C0D0",
    quota7d: "#B48EAD",
    paceFast: "#D08770",
    paceSlow: "#A3BE8C",
    paceEven: "#81A1C1",
    cost: "#8FBCBB",
    costToday: "#EBCB8B",
    timing: "#D8DEE9",
    tps: "#88C0D0",
    sep: "#4C566A",
    muted: "#9AA5B8",
    text: "#ECEFF4",
    whale: WHALE_DARK,
  },

  /**
   * Adaptive fallback using Codex native semantic theme colors.
   */
  terminal: {
    id: "terminal",
    mode: "adaptive",
    badgeModelBg: null,
    badgeModelFg: "status-model",
    badgeEffortFg: "accent",
    pillBg: null,
    pillBgAlt: null,
    stateReadyBg: null,
    stateReadyFg: "green",
    stateWorkBg: null,
    stateWorkFg: "yellow",
    stateThinkBg: null,
    stateThinkFg: "magenta",
    stateWaitBg: null,
    stateWaitFg: "cyan",
    dir: "status-path",
    gitBranch: "status-branch",
    gitClean: "green",
    gitDirty: "yellow",
    gitAheadBehind: "cyan",
    gitAdd: "green",
    gitDel: "red",
    ctxOk: "status-progress",
    ctxWarn: "yellow",
    ctxCrit: "red",
    barTrack: "status-metadata",
    sparkline: "cyan",
    cache: "green",
    quota5h: "status-limit",
    quota7d: "magenta",
    paceFast: "yellow",
    paceSlow: "green",
    paceEven: "status-metadata",
    cost: "status-usage",
    costToday: "yellow",
    timing: "status-metadata",
    tps: "cyan",
    sep: "status-metadata",
    muted: "status-metadata",
    text: "primary",
    whale: WHALE_DARK,
  },
};

export function getPalette(id: PaletteId): Palette {
  return PALETTES[id] ?? PALETTES["gruvbox-dark"];
}
