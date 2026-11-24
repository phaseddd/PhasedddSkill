import {
  CODEX_LIMITS,
  inspectUiTree,
  type Color,
  type QuotaMetric,
  type RenderContext,
  type RunState,
  type SkinId,
  type UiElement,
  type UiTree,
} from "../protocol/types.js";
import { buildProgressBar, buildSparkline, getGlyphs, pickContextRing, type GlyphSet } from "./glyphs.js";
import { getPalette, type Palette } from "./palettes.js";
import { renderWhaleColumn } from "./whale.js";

const NBSP = "\u00A0";

// ---------------------------------------------------------------------------
// Primitive UiTree Builders (Node-count disciplined!)
// ---------------------------------------------------------------------------

function span(text: string, color?: Color | null, bold = false): UiElement {
  if (!text) return "";
  if (!color && !bold) return text;
  return {
    type: "text",
    props: {
      ...(color ? { color } : {}),
      ...(bold ? { weight: "bold" as const } : {}),
    },
    children: [text],
  };
}

function inline(children: Array<UiElement | null>): UiElement {
  const filtered = children.filter((c): c is UiElement => c !== null && c !== "");
  if (filtered.length === 0) return "";
  if (filtered.length === 1) return filtered[0]!;
  return { type: "text", children: filtered };
}

function row(
  children: Array<UiElement | null>,
  gap = 0,
  background: Color | null = null,
  wrap: "nowrap" | "wrap" = "nowrap",
): UiElement {
  const filtered = children.filter((c): c is UiElement => c !== null && c !== "");
  return {
    type: "row",
    props: {
      gap,
      ...(background ? { background } : {}),
      wrap,
    },
    children: filtered,
  };
}

function vstack(rows: Array<UiElement | null>): UiElement {
  const filtered = rows.filter((r): r is UiElement => r !== null && r !== "");
  if (filtered.length === 1) return filtered[0]!;
  return {
    type: "row",
    props: { gap: 10000, wrap: "wrap" },
    children: filtered,
  };
}

function chip(
  children: Array<UiElement | null>,
  bg: Color | null,
  skin: SkinId,
  glyphs: GlyphSet,
): UiElement {
  const inner = children.filter((c): c is UiElement => c !== null && c !== "");
  if (inner.length === 0) return "";
  if (!bg || skin === "plain") {
    return inline(inner);
  }
  const body = row([inline([NBSP, ...inner, NBSP])], 0, bg, "nowrap");
  if (skin === "pill" && glyphs.pillLeft && glyphs.pillRight) {
    return row([span(glyphs.pillLeft, bg), body, span(glyphs.pillRight, bg)], 0, null, "nowrap");
  }
  return body;
}

// ---------------------------------------------------------------------------
// Formatting Helpers (Editorial precision & balanced widths)
// ---------------------------------------------------------------------------

export function formatCompactTokens(tokens: number): string {
  const abs = Math.abs(tokens);
  const sign = tokens < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    const val = abs / 1_000_000;
    return `${sign}${val >= 10 ? val.toFixed(0) : val.toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    const val = abs / 1_000;
    return `${sign}${val >= 100 ? Math.round(val) : val >= 10 ? val.toFixed(0) : val.toFixed(1)}k`;
  }
  return `${sign}${Math.round(abs)}`;
}

export function formatUsd(amount: number): string {
  if (amount >= 100) return `$${amount.toFixed(0)}`;
  if (amount >= 10) return `$${amount.toFixed(1)}`;
  if (amount >= 0.01) return `$${amount.toFixed(2)}`;
  if (amount > 0) return `$${amount.toFixed(3)}`;
  return "$0.00";
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  if (m < 60) return remS === 0 ? `${m}m` : `${m}m${String(remS).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h${String(remM).padStart(2, "0")}m`;
}

function truncateMiddleOrEnd(text: string, maxLen: number): string {
  const chars = Array.from(text);
  if (chars.length <= maxLen) return text;
  return `${chars.slice(0, Math.max(1, maxLen - 1)).join("")}…`;
}

function basenameDir(cwd: string): string {
  const norm = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!norm) return cwd;
  const parts = norm.split("/");
  return truncateMiddleOrEnd(parts[parts.length - 1] || norm, 16);
}

function shortModelName(raw: string): string {
  return truncateMiddleOrEnd(raw.trim() || "Codex", 20);
}

function heatColor(usedPct: number, ok: Color, warn: Color, crit: Color): Color {
  if (usedPct >= 85) return crit;
  if (usedPct >= 60) return warn;
  return ok;
}

// ---------------------------------------------------------------------------
// Modular Section Renderers (Node-efficient & typographically balanced)
// ---------------------------------------------------------------------------

function renderModelAnchor(ctx: RenderContext, p: Palette, g: GlyphSet): UiElement {
  const model = ctx.state.thread?.model;
  const name = shortModelName(model?.display_name ?? model?.id ?? "Codex");
  const effort = model?.reasoning_level;
  const rawTier = model?.service_tier_display_name || model?.service_tier || "";
  const normTier = rawTier.trim().toLowerCase();
  const fast =
    normTier && normTier !== "default" && normTier !== "normal" && normTier !== "standard"
      ? rawTier.trim()
      : null;

  const skin = ctx.config.skin;
  const hasBadgeBg = skin !== "plain" && p.badgeModelBg !== null;
  const iconPrefix = g.model ? `${g.model}${NBSP}` : "";
  const effortSuffix = [effort, fast ? `${g.effort}${fast}` : null].filter(Boolean).join(NBSP);

  if (skin === "plain") {
    return inline([
      span(`${iconPrefix}${name}`, p.ctxOk, true),
      ...(effortSuffix ? [span(`${NBSP}${g.dot}${NBSP}${effortSuffix}`, p.dir, true)] : []),
    ]);
  }

  return chip(
    [
      span(`${iconPrefix}${name}`, hasBadgeBg ? p.badgeModelFg : p.ctxOk, true),
      ...(effortSuffix
        ? [span(`${NBSP}${g.dot}${NBSP}${effortSuffix}`, hasBadgeBg ? p.badgeEffortFg : p.dir, true)]
        : []),
    ],
    p.badgeModelBg,
    skin,
    g,
  );
}

function renderRunState(ctx: RenderContext, p: Palette, g: GlyphSet): UiElement | null {
  const runState: RunState | undefined = ctx.state.thread?.agent.state;
  if (!runState) return null;

  const tick = ctx.animationTick;
  let glyph: string;
  let label: string;
  let fg: Color;
  let bg: Color | null;

  switch (runState) {
    case "working":
      glyph = g.stateWorking[tick % g.stateWorking.length]!;
      label = "working";
      fg = p.stateWorkFg;
      bg = p.stateWorkBg;
      break;
    case "thinking":
      glyph = g.stateThinking[tick % g.stateThinking.length]!;
      label = `think${NBSP}${NBSP}`;
      fg = p.stateThinkFg;
      bg = p.stateThinkBg;
      break;
    case "waiting":
      glyph = g.stateWaiting;
      label = "waiting";
      fg = p.stateWaitFg;
      bg = p.stateWaitBg;
      break;
    case "starting":
      glyph = g.stateStarting;
      label = "booting";
      fg = p.muted;
      bg = p.pillBg;
      break;
    case "ready":
    default:
      glyph = g.stateReady;
      label = `ready${NBSP}${NBSP}`;
      fg = p.stateReadyFg;
      bg = p.stateReadyBg;
      break;
  }

  const content = span(`${glyph}${NBSP}${label}`, fg, runState === "working" || runState === "thinking");
  if (ctx.config.skin === "plain") return content;
  return chip([content], bg, ctx.config.skin, g);
}

function renderDirectory(ctx: RenderContext, p: Palette, g: GlyphSet): UiElement | null {
  const cwd = ctx.state.thread?.workspace.cwd;
  if (!cwd) return null;
  const name = basenameDir(cwd);
  const icon = g.dir ? `${g.dir}${NBSP}` : "";
  const content = span(`${icon}${name}`, p.dir, true);
  return ctx.config.skin === "pill" ? chip([content], p.pillBg, "pill", g) : content;
}

function renderGit(ctx: RenderContext, p: Palette, g: GlyphSet): UiElement | null {
  if (!ctx.config.modules.git) return null;
  const git = ctx.git;
  if (!git || !git.isRepo || !git.branch) return null;

  const branchName = truncateMiddleOrEnd(git.branch, 15);
  const parts: UiElement[] = [
    span(`${g.git ? `${g.git}${NBSP}` : ""}${git.detached ? "@" : ""}${branchName}`, p.gitBranch, true),
  ];

  let flags = "";
  if (git.dirty) flags += g.gitDirty;
  if (git.staged) flags += g.gitStaged;
  if (git.untracked) flags += g.gitUntracked;
  parts.push(flags ? span(`${NBSP}${flags}`, p.gitDirty) : span(`${NBSP}${g.gitClean}`, p.gitClean));

  if (git.ahead > 0 || git.behind > 0) {
    const ab = `${git.ahead > 0 ? `${g.ahead}${git.ahead}` : ""}${git.behind > 0 ? `${g.behind}${git.behind}` : ""}`;
    parts.push(span(`${NBSP}${ab}`, p.gitAheadBehind));
  }

  if (git.added > 0 || git.deleted > 0) {
    if (git.added > 0) parts.push(span(`${NBSP}+${git.added}`, p.gitAdd));
    if (git.deleted > 0) parts.push(span(`${git.added > 0 ? "/" : NBSP}-${git.deleted}`, p.gitDel));
  }

  const content = inline(parts);
  return ctx.config.skin === "pill" ? chip([content], p.pillBg, "pill", g) : content;
}

function renderContext(ctx: RenderContext, p: Palette, g: GlyphSet, compact = false): UiElement | null {
  const { usedPct, remainingPct, usedTokens, sparklineSamples } = ctx.context;
  if (usedPct === null) return null;

  const displayPct =
    ctx.config.percentMode === "remaining" && remainingPct !== null ? remainingPct : usedPct;
  const color = heatColor(usedPct, p.ctxOk, p.ctxWarn, p.ctxCrit);
  const ring = pickContextRing(usedPct, g);
  const barLen = compact ? 5 : Math.min(5, ctx.config.barWidth);
  const bar = buildProgressBar(displayPct, barLen, g);

  const parts: UiElement[] = [
    span(`${ring ? `${ring}${NBSP}` : `ctx${NBSP}`}${g.barFrameLeft}${bar.filled}`, color),
  ];
  if (bar.empty) {
    parts.push(span(`${bar.empty}${g.barFrameRight}`, p.barTrack));
  } else {
    parts.push(span(g.barFrameRight, color));
  }
  parts.push(span(`${NBSP}${Math.round(displayPct)}%`, color, true));

  if (usedTokens !== null) {
    parts.push(span(`${NBSP}${g.dot}${NBSP}${formatCompactTokens(usedTokens)}`, p.muted));
  }

  if (ctx.config.modules.sparkline && !compact && sparklineSamples.length >= 2) {
    const spark = buildSparkline(sparklineSamples.slice(-5), g);
    if (spark) {
      parts.push(span(`${NBSP}${spark}`, p.sparkline));
    }
  }

  const content = inline(parts);
  return ctx.config.skin === "pill" ? chip([content], p.pillBg, "pill", g) : content;
}

function renderCache(ctx: RenderContext, p: Palette, g: GlyphSet): UiElement | null {
  if (!ctx.config.modules.cache) return null;
  if (ctx.cache.hitPct === null) return null;
  const icon = g.cache ? `${g.cache}${NBSP}` : "";
  const content = inline([
    span(`${icon}${ctx.cache.hitPct}%`, p.cache, true),
    span(`${NBSP}hit`, p.muted),
  ]);
  return ctx.config.skin === "pill" ? chip([content], p.pillBg, "pill", g) : content;
}

function renderQuota(
  q: QuotaMetric,
  ctx: RenderContext,
  p: Palette,
  g: GlyphSet,
  compact = false,
): UiElement {
  const displayPct = ctx.config.percentMode === "remaining" ? q.remainingPct : q.usedPct;
  const baseColor = q.label === "5h" ? p.quota5h : p.quota7d;
  const fillColor = heatColor(q.usedPct, baseColor, p.ctxWarn, p.ctxCrit);
  const icon = q.label === "5h" ? g.quota5h : g.quota7d;
  const barLen = compact ? 3 : Math.min(4, ctx.config.quotaBarWidth);
  const bar = buildProgressBar(displayPct, barLen, g);

  const parts: UiElement[] = [
    span(`${icon ? `${icon}${NBSP}` : ""}${q.label}${NBSP}${bar.filled}`, fillColor),
  ];
  if (bar.empty) {
    parts.push(span(bar.empty, p.barTrack));
  }
  parts.push(span(`${NBSP}${Math.round(displayPct)}%`, fillColor, true));

  if (q.resetText) {
    parts.push(span(`${NBSP}${q.resetText}`, p.muted));
  }

  if (q.paceDeltaPct !== null) {
    const abs = Math.abs(q.paceDeltaPct);
    if (abs <= 2) {
      parts.push(span(`${NBSP}${g.paceEven}`, p.paceEven));
    } else if (q.paceDeltaPct > 0) {
      parts.push(span(`${NBSP}${g.paceFast}${abs}%`, p.paceFast, abs >= 15));
    } else {
      parts.push(span(`${NBSP}${g.paceSlow}${abs}%`, p.paceSlow));
    }
  }

  const content = inline(parts);
  return ctx.config.skin === "pill" ? chip([content], p.pillBg, "pill", g) : content;
}

function renderCost(ctx: RenderContext, p: Palette, g: GlyphSet): UiElement | null {
  if (!ctx.config.modules.cost) return null;
  if (!ctx.cost) return null;
  const prefix = ctx.cost.estimated ? "~" : "";
  const icon = g.cost && g.cost !== "$" ? `${g.cost}${NBSP}` : "";
  const parts: UiElement[] = [span(`${icon}${prefix}${formatUsd(ctx.cost.sessionUsd)}`, p.cost, true)];
  if (ctx.config.modules.todayCost && ctx.cost.todayUsd > 0) {
    parts.push(span(`${NBSP}${g.dot}${NBSP}${formatUsd(ctx.cost.todayUsd)}${NBSP}day`, p.costToday));
  }
  const content = inline(parts);
  return ctx.config.skin === "pill" ? chip([content], p.pillBgAlt, "pill", g) : content;
}

function renderTiming(ctx: RenderContext, p: Palette, g: GlyphSet): UiElement | null {
  const parts: UiElement[] = [];
  const isActive =
    ctx.state.thread?.agent.state === "working" || ctx.state.thread?.agent.state === "thinking";

  if (ctx.config.modules.timer) {
    const sec =
      isActive && ctx.timing.turnElapsedSec !== null
        ? ctx.timing.turnElapsedSec
        : ctx.timing.sessionElapsedSec;
    if (sec > 0 || isActive) {
      parts.push(
        span(
          `${g.timer ? `${g.timer}${NBSP}` : ""}${formatDuration(sec)}`,
          isActive ? p.stateWorkFg : p.timing,
          isActive,
        ),
      );
    }
  }

  if (ctx.config.modules.tps && ctx.timing.outputTps !== null && ctx.timing.outputTps > 0) {
    const dot = parts.length > 0 ? `${NBSP}${g.dot}${NBSP}` : "";
    const speedIcon = g.speed ? `${g.speed}${NBSP}` : "";
    parts.push(span(`${dot}${speedIcon}${Math.round(ctx.timing.outputTps)}${NBSP}t/s`, p.tps));
  }

  if (parts.length === 0) return null;
  const content = inline(parts);
  return ctx.config.skin === "pill" ? chip([content], p.pillBgAlt, "pill", g) : content;
}

function joinSegments(items: Array<UiElement | null>, skin: SkinId, p: Palette, g: GlyphSet): UiElement {
  const filtered = items.filter((item): item is UiElement => item !== null && item !== "");
  if (filtered.length === 0) return "";
  if (skin === "pill") {
    return row(filtered, 1, null, "wrap");
  }
  const withSep: UiElement[] = [];
  for (let i = 0; i < filtered.length; i++) {
    if (i > 0) {
      withSep.push(span(g.sep, p.sep));
    }
    withSep.push(filtered[i]!);
  }
  return row(withSep, 1, null, "wrap");
}

// ---------------------------------------------------------------------------
// Public Statusline Renderer (Standard 2-Line + DS Fat Fish 5-Row Edition)
// ---------------------------------------------------------------------------

function buildTree(ctx: RenderContext, compact: boolean): UiTree {
  const p = getPalette(ctx.config.palette);
  const g = getGlyphs(ctx.config.glyphs);
  const skin = ctx.config.skin;

  const modelNode = renderModelAnchor(ctx, p, g);
  const stateNode = renderRunState(ctx, p, g);
  const dirNode = renderDirectory(ctx, p, g);
  const gitNode = renderGit(ctx, p, g);
  const costNode = renderCost(ctx, p, g);
  const timingNode = renderTiming(ctx, p, g);

  const ctxNode = renderContext(ctx, p, g, compact);
  const cacheNode = renderCache(ctx, p, g);
  const quotaNodes = ctx.config.modules.quotas
    ? ctx.quotas.map((q) => renderQuota(q, ctx, p, g, compact))
    : [];

  // Standard 2-line precision instrument dashboard
  if (ctx.variant === "standard") {
    const line1Left = joinSegments([modelNode, stateNode, dirNode, gitNode], skin, p, g);
    const line2Left = joinSegments([ctxNode, cacheNode, ...quotaNodes], skin, p, g);
    const hasRight = costNode !== null || timingNode !== null;

    if (!hasRight) {
      return vstack([line1Left, line2Left]);
    }

    const leftCol = vstack([line1Left, line2Left]);
    const rightCol = vstack([
      costNode ?? timingNode ?? NBSP,
      costNode && timingNode ? timingNode : NBSP,
    ]);

    return row([leftCol, rightCol], 2, null, "nowrap");
  }

  // DS Fat Fish Edition: Exact 3-row alignment matching Codex v0.172.0's 3-row statusline ceiling!
  const isActive =
    ctx.state.thread?.agent.state === "working" ||
    ctx.state.thread?.agent.state === "thinking";

  const whaleLine1 = joinSegments([modelNode, stateNode, dirNode, gitNode], skin, p, g);
  const whaleLine2 = joinSegments([ctxNode, cacheNode, ...quotaNodes], skin, p, g);
  const whaleLine3 = joinSegments([costNode, timingNode], skin, p, g);

  const hasLine2 = ctxNode !== null || cacheNode !== null || quotaNodes.length > 0;
  const hasLine3 = costNode !== null || timingNode !== null;
  const leftRows: Array<UiElement | null> = [
    whaleLine1,
    hasLine2 ? whaleLine2 : hasLine3 ? whaleLine3 : NBSP,
    hasLine2 && hasLine3 ? whaleLine3 : NBSP,
  ];

  const { node: whaleCol } = renderWhaleColumn(isActive, ctx.animationTick, p);
  return row([vstack(leftRows), whaleCol], 2, null, "nowrap");
}

export function renderStatusline(ctx: RenderContext): UiTree {
  const tree = buildTree(ctx, false);
  const stats = inspectUiTree(tree);
  if (stats.valid) {
    return tree;
  }

  // Automatic node-budget safeguard if exotic config pushes over 256 nodes.
  const compactTree = buildTree(
    {
      ...ctx,
      config: {
        ...ctx.config,
        skin: ctx.config.skin === "pill" ? "editorial" : ctx.config.skin,
        modules: { ...ctx.config.modules, sparkline: false },
      },
    },
    true,
  );
  if (inspectUiTree(compactTree).valid) {
    return compactTree;
  }

  const fallbackModel = ctx.state.thread?.model.display_name ?? "Codex";
  const pct = ctx.context.usedPct !== null ? ` · ctx ${Math.round(ctx.context.usedPct)}%` : "";
  const state = ctx.state.thread?.agent.state ? ` · ${ctx.state.thread.agent.state}` : "";
  const safeTree: UiTree = `${fallbackModel}${pct}${state}`;
  if (inspectUiTree(safeTree).nodes <= CODEX_LIMITS.MAX_NODES) {
    return safeTree;
  }
  return "Codex";
}
