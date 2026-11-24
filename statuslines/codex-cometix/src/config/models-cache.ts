import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ModelPriceRate } from "../protocol/types.js";

/**
 * Local Codex model metadata reader (`$CODEX_HOME/models_cache.json` or `~/.codex/models_cache.json`)
 * plus optional external pricing file (`$CODEX_HOME/cometix-prices.json`,
 * supporting both direct ModelPriceRate maps and agy-zh-pack `data/prices.json` tiered format).
 *
 * Uses bigint stat mtime caching (committed ONLY after successful parse so transient Windows read
 * errors retry cleanly on the next 1s poll) and evaluates date-tiered rates dynamically at query time.
 */

export interface CachedModelMetadata {
  slug: string;
  displayName?: string;
  contextWindow?: number;
  effectiveContextWindowPercent?: number;
  pricing?: ModelPriceRate;
}

interface ParsedPriceTier {
  untilDate: string | null;
  rate: ModelPriceRate;
}

function normalizeModelKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/(claude-(?:opus|sonnet|haiku)-\d+)\.(?=\d)/g, "$1-");
}

function isNonNegNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function extractPriceRate(raw: unknown): ModelPriceRate | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;

  if (
    isNonNegNum(obj.inputPerMillion) &&
    isNonNegNum(obj.cachedInputPerMillion) &&
    isNonNegNum(obj.outputPerMillion)
  ) {
    return {
      inputPerMillion: obj.inputPerMillion,
      cachedInputPerMillion: obj.cachedInputPerMillion,
      outputPerMillion: obj.outputPerMillion,
    };
  }

  const input = obj.input_per_million ?? obj.input_cost_per_million ?? obj.in;
  const cached = obj.cached_input_per_million ?? obj.cache_read_per_million ?? obj.cache ?? input;
  const output = obj.output_per_million ?? obj.output_cost_per_million ?? obj.out;
  if (isNonNegNum(input) && isNonNegNum(cached) && isNonNegNum(output)) {
    return {
      inputPerMillion: input,
      cachedInputPerMillion: cached,
      outputPerMillion: output,
    };
  }

  return undefined;
}

function parsePriceTiers(entry: unknown): ParsedPriceTier[] {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
  const obj = entry as Record<string, unknown>;
  const direct = extractPriceRate(obj);
  if (direct) return [{ untilDate: null, rate: direct }];

  // agy-zh-pack format: { t: [ ["2027-01-01", { in, cache, out }], [null, { in, cache, out }] ] }
  const tiers: ParsedPriceTier[] = [];
  if (Array.isArray(obj.t)) {
    for (const tier of obj.t) {
      if (!Array.isArray(tier) || tier.length < 2) continue;
      const [untilDate, rawRates] = tier;
      const rate = extractPriceRate(rawRates);
      if (rate && (untilDate === null || typeof untilDate === "string")) {
        tiers.push({ untilDate, rate });
      }
    }
  }
  return tiers;
}

/**
 * Matches agy-zh-pack's pricing day boundary (08:00 UTC / Pacific midnight).
 */
function pricingDateKey(nowMs: number): string {
  const shifted = new Date(nowMs - 8 * 60 * 60 * 1000);
  const valid = Number.isNaN(shifted.getTime()) ? new Date() : shifted;
  return valid.toISOString().slice(0, 10);
}

function codexHomeDir(): string {
  return process.env.CODEX_HOME || join(homedir(), ".codex");
}

export function getCodexModelsCachePath(): string {
  return process.env.CODEX_MODELS_CACHE_PATH || join(codexHomeDir(), "models_cache.json");
}

export function getExternalPricesPath(): string {
  return process.env.CODEX_COMETIX_PRICES || join(codexHomeDir(), "cometix-prices.json");
}

export class LocalModelsRegistry {
  private readonly modelsCachePath: string | undefined;
  private readonly externalPricesPath: string | undefined;
  private modelsCacheVer: string | undefined;
  private externalPricesVer: string | undefined;
  private cachedModels = new Map<string, CachedModelMetadata>();
  private externalPriceTiers = new Map<string, ParsedPriceTier[]>();

  constructor(options: { modelsCachePath?: string; externalPricesPath?: string } = {}) {
    this.modelsCachePath = options.modelsCachePath;
    this.externalPricesPath = options.externalPricesPath;
  }

  private resolveModelsPath(): string {
    return this.modelsCachePath ?? getCodexModelsCachePath();
  }

  private resolvePricesPath(): string {
    return this.externalPricesPath ?? getExternalPricesPath();
  }

  private refreshModelsCache(): void {
    const filePath = this.resolveModelsPath();
    try {
      const stat = statSync(filePath, { bigint: true, throwIfNoEntry: false });
      if (!stat?.isFile()) {
        this.modelsCacheVer = undefined;
        this.cachedModels.clear();
        return;
      }
      const ver = `${filePath}:${stat.mtimeNs}/${stat.ctimeNs}/${stat.ino}/${stat.size}`;
      if (ver === this.modelsCacheVer) return;

      const parsed = JSON.parse(readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")) as {
        models?: unknown[];
      };
      const next = new Map<string, CachedModelMetadata>();
      if (Array.isArray(parsed?.models)) {
        for (const item of parsed.models) {
          if (!item || typeof item !== "object" || Array.isArray(item)) continue;
          const m = item as Record<string, unknown>;
          const slug = typeof m.slug === "string" ? m.slug.trim() : "";
          if (!slug) continue;
          const displayName = typeof m.display_name === "string" ? m.display_name.trim() : undefined;
          const contextWindow =
            typeof m.context_window === "number" && Number.isFinite(m.context_window) && m.context_window > 0
              ? m.context_window
              : undefined;
          const effectiveContextWindowPercent =
            typeof m.effective_context_window_percent === "number" &&
            Number.isFinite(m.effective_context_window_percent)
              ? m.effective_context_window_percent
              : undefined;
          const pricing = extractPriceRate(m.pricing ?? m.cost ?? m.billing);
          const meta: CachedModelMetadata = {
            slug,
            displayName,
            contextWindow,
            effectiveContextWindowPercent,
            pricing,
          };
          next.set(normalizeModelKey(slug), meta);
          if (displayName) {
            next.set(normalizeModelKey(displayName), meta);
          }
        }
      }
      this.cachedModels = next;
      // Commit cache version ONLY after read + parse succeed so transient errors retry.
      this.modelsCacheVer = ver;
    } catch {
      // Never block or throw on transient read errors or corrupt local cache.
    }
  }

  private refreshExternalPrices(): void {
    const filePath = this.resolvePricesPath();
    try {
      const stat = statSync(filePath, { bigint: true, throwIfNoEntry: false });
      if (!stat?.isFile()) {
        this.externalPricesVer = undefined;
        this.externalPriceTiers.clear();
        return;
      }
      const ver = `${filePath}:${stat.mtimeNs}/${stat.ctimeNs}/${stat.ino}/${stat.size}`;
      if (ver === this.externalPricesVer) return;

      const parsed = JSON.parse(readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")) as Record<
        string,
        unknown
      >;
      const sourceMap =
        parsed && typeof parsed.models === "object" && parsed.models !== null && !Array.isArray(parsed.models)
          ? (parsed.models as Record<string, unknown>)
          : parsed;
      const next = new Map<string, ParsedPriceTier[]>();

      for (const [key, val] of Object.entries(sourceMap ?? {})) {
        const tiers = parsePriceTiers(val);
        if (tiers.length > 0) {
          next.set(normalizeModelKey(key), tiers);
        }
      }
      this.externalPriceTiers = next;
      this.externalPricesVer = ver;
    } catch {
      // Never throw; allow retry on next poll if transient.
    }
  }

  resolveModelMetadata(modelId?: string, displayName?: string): CachedModelMetadata | null {
    this.refreshModelsCache();
    for (const candidate of [modelId, displayName]) {
      if (!candidate) continue;
      const exact = this.cachedModels.get(normalizeModelKey(candidate));
      if (exact) return exact;
    }
    return null;
  }

  getMergedPricingOverrides(
    userOverrides?: Record<string, ModelPriceRate>,
    nowMs = Date.now(),
  ): Record<string, ModelPriceRate> {
    this.refreshModelsCache();
    this.refreshExternalPrices();
    const merged: Record<string, ModelPriceRate> = {};

    // 1. Lowest dynamic priority: pricing fields in models_cache.json (if ever supplied)
    for (const [key, meta] of this.cachedModels.entries()) {
      if (meta.pricing) merged[key] = meta.pricing;
    }

    // 2. External cometix-prices.json (evaluate date tiers dynamically at query time)
    const todayKey = pricingDateKey(nowMs);
    for (const [key, tiers] of this.externalPriceTiers.entries()) {
      const active = tiers.find((t) => t.untilDate === null || todayKey < t.untilDate);
      if (active) merged[key] = active.rate;
    }

    // 3. Highest priority: explicit user pricingOverrides (normalized so case variants overwrite!)
    if (userOverrides) {
      for (const [rawKey, rate] of Object.entries(userOverrides)) {
        const norm = normalizeModelKey(rawKey);
        if (norm) merged[norm] = rate;
      }
    }
    return merged;
  }
}
