import { LocalModelsRegistry } from "../config/models-cache.js";
import { estimateTokenCostUsd, resolveModelPrice } from "../config/pricing.js";
import type {
  QuotaMetric, RateLimitSnapshot, RenderContext, RenderVariant, StatuslineState, UserConfig,
} from "../protocol/types.js";
import { GitCollector } from "./git.js";
import { CostLedger } from "./ledger.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SAMPLES = 8;
const TPS_SAMPLE_WEIGHT = 0.35;

interface ThreadMetrics {
  startedAt: number;
  turnStartedAt: number | null;
  outputSample: { tokens: number; nowMs: number } | null;
  outputTps: number | null;
  samples: number[];
  tick: number;
}

function clamp(value: number, max: number): number {
  return Math.min(max, Math.max(0, value));
}

function counter(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function formatResetTime(resetsAtSec: number, nowMs: number): string {
  const date = new Date(resetsAtSec * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const time = `${hour}:${minute}`;
  return Math.abs(date.getTime() - nowMs) <= DAY_MS ? time : `${WEEKDAYS[date.getDay()]} ${time}`;
}

export function computePaceDeltaPct(
  usedPct: number,
  windowMinutes: number | null,
  resetsAtSec: number | null,
  nowMs: number,
): number | null {
  if (windowMinutes === null || windowMinutes <= 0 || !Number.isFinite(windowMinutes)
    || resetsAtSec === null || !Number.isFinite(resetsAtSec) || !Number.isFinite(nowMs) || !Number.isFinite(usedPct)) {
    return null;
  }
  const windowSec = windowMinutes * 60;
  const elapsed = clamp((windowSec - (resetsAtSec - nowMs / 1000)) / windowSec, 1);
  return Math.round(usedPct - elapsed * 100);
}

function quotaWindows(snapshot: RateLimitSnapshot, nowMs: number): QuotaMetric[] {
  const metrics: QuotaMetric[] = [];
  for (const window of [snapshot?.primary_limit, snapshot?.secondary_limit]) {
    if (!window || !Number.isFinite(window.used_percent)) continue;
    const minutes = window.window_minutes;
    const label = minutes === 300 ? "5h" : minutes === 10080 ? "7d" : null;
    if (label === null || minutes === null || metrics.some((metric) => metric.label === label)) continue;
    const usedPct = clamp(window.used_percent, 100);
    const reset = counter(window.resets_at);
    const resetText = reset === null ? null : formatResetTime(reset, nowMs) || null;
    const resetsAt = resetText === null ? null : reset;
    metrics.push({
      label,
      usedPct,
      remainingPct: 100 - usedPct,
      windowMinutes: minutes,
      resetsAt,
      resetText,
      paceDeltaPct: computePaceDeltaPct(usedPct, minutes, resetsAt, nowMs),
    });
  }
  if (metrics[0]?.label === "7d" && metrics.length === 2) metrics.reverse();
  return metrics;
}

function selectQuotas(snapshots: unknown, nowMs: number): QuotaMetric[] {
  if (!Array.isArray(snapshots)) return [];
  let fallback: QuotaMetric[] = [];
  for (const snapshot of snapshots as RateLimitSnapshot[]) {
    if (fallback.length && snapshot?.limit_id !== "codex") continue;
    const metrics = quotaWindows(snapshot, nowMs);
    if (!metrics.length) continue;
    if (snapshot.limit_id === "codex") return metrics;
    fallback = metrics;
  }
  return fallback;
}

function updateTiming(
  metrics: ThreadMetrics,
  active: boolean,
  outputTokens: number | null,
  nowMs: number,
): RenderContext["timing"] {
  const sample = metrics.outputSample;
  if (!active) {
    metrics.turnStartedAt = null;
    metrics.outputSample = null;
    metrics.outputTps = null;
  } else {
    metrics.turnStartedAt ??= nowMs;
    if (outputTokens === null) {
      metrics.outputSample = null;
      metrics.outputTps = null;
    } else if (!sample || outputTokens < sample.tokens || nowMs < sample.nowMs) {
      metrics.outputSample = { tokens: outputTokens, nowMs };
      metrics.outputTps = null;
    } else if (nowMs > sample.nowMs) {
      const currentTps = (outputTokens - sample.tokens) * 1000 / (nowMs - sample.nowMs);
      const previousTps = metrics.outputTps;
      metrics.outputTps = previousTps === null ? currentTps
        : previousTps + (currentTps - previousTps) * TPS_SAMPLE_WEIGHT;
      metrics.outputSample = { tokens: outputTokens, nowMs };
    }
  }
  return {
    turnElapsedSec: metrics.turnStartedAt === null ? null : Math.max(0, (nowMs - metrics.turnStartedAt) / 1000),
    sessionElapsedSec: Math.max(0, (nowMs - metrics.startedAt) / 1000),
    outputTps: metrics.outputTps,
  };
}

export class SessionTracker {
  private readonly git: GitCollector;
  private readonly ledger: CostLedger;
  private readonly modelsRegistry: LocalModelsRegistry;
  private readonly threads = new Map<string, ThreadMetrics>();
  private noThreadTick = 0;

  constructor(options: { git?: GitCollector; ledger?: CostLedger; modelsRegistry?: LocalModelsRegistry } = {}) {
    this.git = options.git ?? new GitCollector();
    this.ledger = options.ledger ?? new CostLedger();
    this.modelsRegistry = options.modelsRegistry ?? new LocalModelsRegistry();
  }

  buildRenderContext(
    state: StatuslineState,
    config: UserConfig,
    variant: RenderVariant,
    nowMs = Date.now(),
  ): RenderContext {
    const thread = state.thread;
    const threadId = typeof thread?.id === "string" ? thread.id : "";
    let metrics = this.threads.get(threadId);
    if (threadId && !metrics) {
      metrics = { startedAt: nowMs, turnStartedAt: null, outputSample: null, outputTps: null, samples: [], tick: 0 };
      this.threads.set(threadId, metrics);
    }

    const cachedModel = this.modelsRegistry.resolveModelMetadata(thread?.model?.id, thread?.model?.display_name);
    const context = thread?.usage?.context;
    const usedTokens = counter(context?.used_tokens);
    const windowSize = counter(context?.context_window_size) ?? counter(cachedModel?.contextWindow);
    const tokenPct = windowSize && usedTokens !== null ? (usedTokens / windowSize) * 100 : null;
    const reportedPct = context?.used_percentage;
    const pct = typeof reportedPct === "number" && Number.isFinite(reportedPct) ? reportedPct : tokenPct;
    const usedPct = pct === null ? null : clamp(pct, 100);

    let deltaTokens: number | null = null;
    if (metrics && usedTokens !== null) {
      const previous = metrics.samples.at(-1);
      if (previous !== undefined) deltaTokens = usedTokens - previous;
      if (usedTokens !== previous) {
        metrics.samples.push(usedTokens);
        if (metrics.samples.length > MAX_SAMPLES) metrics.samples.shift();
      }
    }

    const usage = thread?.usage?.total;
    const totalInputTokens = counter(usage?.total_input_tokens) ?? 0;
    const cachedTokens = counter(usage?.cache_read_input_tokens) ?? 0;
    const hitPct = totalInputTokens > 0 ? Math.round(clamp(cachedTokens / totalInputTokens * 100, 100)) : null;
    const nativeCost = counter(thread?.usage?.cost?.total_cost_usd);
    const mergedPricing = this.modelsRegistry.getMergedPricingOverrides(config.pricingOverrides, nowMs);
    const sessionUsd = nativeCost ?? (usage ? estimateTokenCostUsd(
      usage, resolveModelPrice(thread?.model?.id, thread?.model?.display_name, mergedPricing),
    ) : null);
    const cost = sessionUsd === null ? null : {
      sessionUsd,
      todayUsd: this.ledger.record(threadId, sessionUsd, nowMs),
      estimated: nativeCost === null,
    };

    const runState = thread?.agent?.state;
    const timing = metrics
      ? updateTiming(metrics, runState === "working" || runState === "thinking", counter(usage?.output_tokens), nowMs)
      : { turnElapsedSec: null, sessionElapsedSec: 0, outputTps: null };

    return {
      state,
      config,
      variant,
      nowMs,
      git: config.modules.git ? this.git.get(thread?.workspace?.cwd, nowMs) : null,
      context: {
        usedPct,
        remainingPct: usedPct === null ? null : 100 - usedPct,
        usedTokens,
        windowSize,
        sparklineSamples: metrics ? [...metrics.samples] : [],
        deltaTokens,
      },
      cache: { hitPct, cachedTokens, totalInputTokens },
      quotas: selectQuotas(state.account?.rate_limits, nowMs),
      cost,
      timing,
      animationTick: metrics ? ++metrics.tick : ++this.noThreadTick,
    };
  }

  dispose(): void {
    this.git.dispose();
    this.ledger.flushSync();
    this.threads.clear();
  }
}
