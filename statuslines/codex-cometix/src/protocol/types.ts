/**
 * Exact Codex CLI v0.171+ / v0.172+ custom statusline wire contract
 * plus shared internal interfaces between collectors, config, MCP server, and design renderer.
 */

// ---------------------------------------------------------------------------
// Codex Wire Types (mirrors codex-rs/skills/.../references/statusline.d.ts)
// ---------------------------------------------------------------------------

export type HexRgb = `#${string}`;

export type ThemeColor = "primary" | "surface" | "accent";

export type AnsiColor =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white";

export type StatusColor =
  | "status-model"
  | "status-path"
  | "status-branch"
  | "status-state"
  | "status-usage"
  | "status-limit"
  | "status-metadata"
  | "status-mode"
  | "status-thread"
  | "status-progress";

export type Color = ThemeColor | AnsiColor | StatusColor | HexRgb;

export type TextWeight = "normal" | "bold";
export type RowWrap = "nowrap" | "wrap";

export interface TextProps {
  color?: Color | null;
  weight?: TextWeight | null;
  italic?: boolean | null;
  underline?: boolean | null;
}

export interface LinkProps {
  href: string;
  title?: string | null;
}

export interface RowProps {
  gap: number;
  background?: Color | null;
  wrap?: RowWrap;
}

export type UiElement =
  | { type: "text"; props?: TextProps; children: Array<UiElement | null> }
  | { type: "link"; props: LinkProps; children: Array<UiElement | null> }
  | { type: "row"; props: RowProps; children: Array<UiElement | null> }
  | { type: "bold"; children: Array<UiElement | null> }
  | { type: "italic"; children: Array<UiElement | null> }
  | { type: "underline"; children: Array<UiElement | null> }
  | string;

export type UiTree = UiElement | null;

export type RunState = "starting" | "ready" | "working" | "waiting" | "thinking";

export interface RateLimitWindow {
  used_percent: number;
  window_minutes: number | null;
  resets_at: number | null;
}

export interface RateLimitSnapshot {
  limit_id: string;
  limit_name: string | null;
  primary_limit: RateLimitWindow | null;
  secondary_limit: RateLimitWindow | null;
}

export interface Account {
  rate_limits: RateLimitSnapshot[];
  workspace?: { headline: string };
}

export interface ModelInfo {
  access_program?: "standard" | "daybreak_blue" | "daybreak_red";
  display_name: string;
  id?: string;
  provider: string;
  reasoning_level?: string;
  service_tier?: string;
  service_tier_display_name?: string;
}

export interface ContextUsage {
  context_window_size?: number;
  used_tokens?: number;
  used_percentage?: number;
}

export interface TokenUsage {
  total_input_tokens: number;
  cache_read_input_tokens: number;
  cache_write_input_tokens: number;
  other_input_tokens: number;
  output_tokens: number;
}

export interface CostUsage {
  total_cost_usd?: number;
  total_credits?: number;
}

export interface UsageInfo {
  context: ContextUsage;
  total?: TokenUsage;
  cost?: CostUsage;
}

export interface ThreadState {
  id: string;
  name: string | null;
  agent: { state: RunState };
  model: ModelInfo;
  workspace: { cwd: string };
  usage: UsageInfo;
  approval?: { policy: string; reviewer: string };
  permissions?: { display_name: string; type: string; [key: string]: unknown };
}

export interface StatuslineState {
  account?: Account;
  app?: { cli_version: string; display_mode: "standard" | "raw" };
  config?: { statusline_items: string[]; profile?: string };
  thread?: ThreadState;
}

// ---------------------------------------------------------------------------
// Codex Protocol Constants & Tree Validation
// ---------------------------------------------------------------------------

export const CODEX_LIMITS = {
  MAX_JSON_BYTES: 64 * 1024,
  MAX_TEXT_BYTES: 16 * 1024,
  MAX_NODES: 256,
  MAX_DEPTH: 16,
} as const;

export const ENTRYPOINTS = {
  SERVER_NAME: "codex-cometix",
  STANDARD_TOOL: "statusline",
  STANDARD_TITLE: "Cometix Studio · 双行仪表盘",
  STANDARD_URI: "ui://codex-cometix/standard",
  WHALE_TOOL: "statusline-whale",
  WHALE_TITLE: "Cometix Studio · DS大肥鱼热舞版",
  WHALE_URI: "ui://codex-cometix/whale",
} as const;

export type RenderVariant = "standard" | "whale";

export interface TreeStats {
  nodes: number;
  maxDepth: number;
  textBytes: number;
  jsonBytes: number;
  valid: boolean;
  reason?: string;
}

export function inspectUiTree(tree: UiTree): TreeStats {
  const json = JSON.stringify(tree);
  const jsonBytes = Buffer.byteLength(json, "utf8");
  if (tree === null) {
    return { nodes: 0, maxDepth: 0, textBytes: 0, jsonBytes, valid: true };
  }

  let nodes = 0;
  let maxDepth = 0;
  let textBytes = 0;
  const stack: Array<{ node: UiElement; depth: number }> = [{ node: tree, depth: 0 }];

  while (stack.length > 0) {
    const current = stack.pop()!;
    nodes += 1;
    if (current.depth > maxDepth) maxDepth = current.depth;
    if (typeof current.node === "string") {
      textBytes += Buffer.byteLength(current.node, "utf8");
      continue;
    }
    if (current.node.type === "row") {
      const gap = current.node.props.gap;
      if (!Number.isSafeInteger(gap) || gap < 0) {
        return {
          nodes,
          maxDepth,
          textBytes,
          jsonBytes,
          valid: false,
          reason: `Invalid row gap: ${String(gap)}`,
        };
      }
    }
    for (const child of current.node.children) {
      if (child !== null) {
        stack.push({ node: child, depth: current.depth + 1 });
      }
    }
  }

  if (jsonBytes > CODEX_LIMITS.MAX_JSON_BYTES) {
    return { nodes, maxDepth, textBytes, jsonBytes, valid: false, reason: `JSON ${jsonBytes}B > 64KiB` };
  }
  if (nodes > CODEX_LIMITS.MAX_NODES) {
    return { nodes, maxDepth, textBytes, jsonBytes, valid: false, reason: `Nodes ${nodes} > 256` };
  }
  if (maxDepth > CODEX_LIMITS.MAX_DEPTH) {
    return { nodes, maxDepth, textBytes, jsonBytes, valid: false, reason: `Depth ${maxDepth} > 16` };
  }
  if (textBytes > CODEX_LIMITS.MAX_TEXT_BYTES) {
    return { nodes, maxDepth, textBytes, jsonBytes, valid: false, reason: `Text ${textBytes}B > 16KiB` };
  }
  return { nodes, maxDepth, textBytes, jsonBytes, valid: true };
}

// ---------------------------------------------------------------------------
// Shared Configuration & Collector Contracts
// ---------------------------------------------------------------------------

export type SkinId = "editorial" | "pill" | "plain";

export type PaletteId =
  | "gruvbox-light"
  | "gruvbox-dark"
  | "catppuccin-latte"
  | "catppuccin-mocha"
  | "tokyo-night"
  | "rose-pine"
  | "nord"
  | "terminal";

export type GlyphMode = "nerd" | "unicode" | "ascii";
export type PercentMode = "used" | "remaining";

export interface ModelPriceRate {
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
}

export interface UserConfig {
  skin: SkinId;
  palette: PaletteId;
  glyphs: GlyphMode;
  percentMode: PercentMode;
  barWidth: number;
  quotaBarWidth: number;
  modules: {
    git: boolean;
    cache: boolean;
    sparkline: boolean;
    cost: boolean;
    todayCost: boolean;
    timer: boolean;
    tps: boolean;
    quotas: boolean;
  };
  pricingOverrides: Record<string, ModelPriceRate>;
}

export interface GitSnapshot {
  isRepo: boolean;
  branch: string;
  detached: boolean;
  dirty: boolean;
  staged: boolean;
  untracked: boolean;
  ahead: number;
  behind: number;
  added: number;
  deleted: number;
  worktree: boolean;
  updatedAt: number;
}

export interface QuotaMetric {
  label: "5h" | "7d";
  usedPct: number;
  remainingPct: number;
  windowMinutes: number;
  resetsAt: number | null;
  resetText: string | null;
  /** Signed difference vs uniform elapsed fraction: +12 means 12pp faster than uniform pace */
  paceDeltaPct: number | null;
}

export interface CostMetric {
  sessionUsd: number;
  todayUsd: number;
  estimated: boolean;
}

export interface RenderContext {
  state: StatuslineState;
  config: UserConfig;
  variant: RenderVariant;
  nowMs: number;
  git: GitSnapshot | null;
  context: {
    usedPct: number | null;
    remainingPct: number | null;
    usedTokens: number | null;
    windowSize: number | null;
    sparklineSamples: number[];
    deltaTokens: number | null;
  };
  cache: {
    hitPct: number | null;
    cachedTokens: number;
    totalInputTokens: number;
  };
  quotas: QuotaMetric[];
  cost: CostMetric | null;
  timing: {
    turnElapsedSec: number | null;
    sessionElapsedSec: number;
    outputTps: number | null;
  };
  animationTick: number;
}

export type StatuslineRenderer = (ctx: RenderContext) => UiTree;
