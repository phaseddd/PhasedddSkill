import type { ModelPriceRate, TokenUsage } from "../protocol/types.js";

function rate(inputPerMillion: number, cachedInputPerMillion: number, outputPerMillion: number): ModelPriceRate {
  return { inputPerMillion, cachedInputPerMillion, outputPerMillion };
}

const codexRate = rate(1.75, 0.175, 14);
const gpt5Rate = rate(1.25, 0.125, 10);
const codexMiniRate = rate(1.5, 0.375, 6);
const gpt6SolRate = rate(2, 0.2, 10);
const deepseekFlashRate = rate(0.15, 0.003, 0.6);
const deepseekV32Rate = rate(0.28, 0.028, 0.42);

// Standard text rates per million tokens, using the short-context tier where applicable.
// https://developers.openai.com/api/docs/models
// https://platform.claude.com/docs/en/about-claude/pricing
// https://ai.google.dev/gemini-api/docs/pricing
// https://api-docs.deepseek.com/quick_start/pricing/
export const BUILTIN_PRICING: Record<string, ModelPriceRate> = {
  "gpt-6": gpt6SolRate,
  "gpt-6-sol": gpt6SolRate,
  "gpt-6-astra": rate(10, 1, 50),
  "gpt-6-luna": rate(0.1, 0.01, 0.5),
  "gpt-6.1-sol": rate(2, 0.1, 10),
  "gpt-6.1-terra": rate(1, 0.05, 5),
  "gpt-6.2-astra": rate(8, 0.4, 40),
  "gpt-6.2-sol": rate(2, 0.1, 10),
  "gpt-5.6-sol": rate(4, 0.4, 20),
  "gpt-5.6-terra": rate(2, 0.2, 12),
  "gpt-5.6-luna": rate(0.2, 0.02, 1.2),
  "gpt-5.5": rate(5, 0.5, 30),
  "gpt-5.5-pro": rate(30, 30, 180),
  "gpt-5.4": rate(2.5, 0.25, 15),
  "gpt-5.4-pro": rate(30, 30, 180),
  "gpt-5.4-mini": rate(0.75, 0.075, 4.5),
  "gpt-5.4-nano": rate(0.2, 0.02, 1.25),
  "gpt-5.3": codexRate,
  "gpt-5.3-codex": codexRate,
  "gpt-5.2": codexRate,
  "gpt-5.2-codex": codexRate,
  "gpt-5.2-pro": rate(21, 21, 168),
  "gpt-5.1": gpt5Rate,
  "gpt-5.1-codex-mini": rate(0.25, 0.025, 2),
  "gpt-5": gpt5Rate,
  "gpt-5-pro": rate(15, 15, 120),
  "gpt-5-mini": rate(0.25, 0.025, 2),
  "gpt-5-nano": rate(0.05, 0.005, 0.4),
  o3: rate(2, 0.5, 8),
  "o3-mini": rate(1.1, 0.55, 4.4),
  "o3-pro": rate(20, 20, 80),
  "o4-mini": rate(1.1, 0.275, 4.4),
  codex: codexRate,
  "codex-mini": codexMiniRate,
  "codex-mini-latest": codexMiniRate,
  "gpt-5-codex": gpt5Rate,
  "gpt-5.1-codex": gpt5Rate,
  "gpt-5.1-codex-max": gpt5Rate,
  "claude-opus": rate(5, 0.5, 25),
  "claude-opus-4": rate(15, 1.5, 75),
  "claude-opus-4-5": rate(5, 0.5, 25),
  "claude-opus-4-6": rate(5, 0.5, 25),
  "claude-opus-4-7": rate(5, 0.5, 25),
  "claude-opus-4-8": rate(5, 0.5, 25),
  "claude-opus-5-5": rate(4, 0.2, 20),
  "claude-sonnet": rate(3, 0.3, 15),
  "claude-sonnet-5": rate(2, 0.2, 10),
  "claude-sonnet-5-5": rate(2, 0.1, 10),
  "claude-haiku": rate(1, 0.1, 5),
  "claude-haiku-5-5": rate(0.1, 0.01, 0.5),
  "claude-3-opus": rate(15, 1.5, 75),
  "claude-3-5-sonnet": rate(3, 0.3, 15),
  "claude-3-7-sonnet": rate(3, 0.3, 15),
  "claude-3-5-haiku": rate(0.8, 0.08, 4),
  "claude-3-haiku": rate(0.25, 0.03, 1.25),
  "gemini-2.5-pro": rate(1.25, 0.125, 10),
  "gemini-2.5-flash": rate(0.3, 0.03, 2.5),
  "gemini-2.5-flash-lite": rate(0.1, 0.01, 0.4),
  // DeepSeek exposes peak and off-peak prices. The estimate uses off-peak rates.
  deepseek: deepseekFlashRate,
  "deepseek-flash": deepseekFlashRate,
  "deepseek-v4-flash": deepseekFlashRate,
  "deepseek-v4-pro": rate(0.66, 0.022, 1.98),
  "deepseek-v3.2": deepseekV32Rate,
  "deepseek-chat": deepseekV32Rate,
  "deepseek-reasoner": deepseekV32Rate,
};

function nonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isModelPriceRate(value: unknown): value is ModelPriceRate {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<ModelPriceRate>;
  return nonNegativeNumber(candidate.inputPerMillion)
    && nonNegativeNumber(candidate.cachedInputPerMillion)
    && nonNegativeNumber(candidate.outputPerMillion);
}

function modelKey(value?: string): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[\s_\u2010-\u2015]+/g, "-")
    .replace(/(claude-(?:(?:opus|sonnet|haiku)-)?\d+)\.(?=\d)/g, "$1-");
}

const builtinEntries = Object.entries(BUILTIN_PRICING);

function longestMatch(
  modelId: string,
  displayName: string,
  entries: [string, ModelPriceRate][],
): ModelPriceRate | null {
  let best: ModelPriceRate | null = null;
  let bestLength = 0;
  let bestRank = 0;
  for (const [key, price] of entries) {
    if (!key || key.length < bestLength) continue;
    const rank = modelId === key ? 4 : modelId.startsWith(key) ? 3
      : modelId.includes(key) ? 2 : displayName.includes(key) ? 1 : 0;
    if (rank === 0 || (key.length === bestLength && rank <= bestRank)) continue;
    best = price;
    bestLength = key.length;
    bestRank = rank;
  }
  return best;
}

export function resolveModelPrice(
  modelId: string | undefined,
  displayName: string | undefined,
  overrides?: Record<string, ModelPriceRate>,
): ModelPriceRate | null {
  const id = modelKey(modelId);
  const name = modelKey(displayName);
  const overrideEntries = Object.entries(overrides ?? {})
    .filter(([, price]) => isModelPriceRate(price))
    .map(([key, price]): [string, ModelPriceRate] => [modelKey(key), price]);
  return longestMatch(id, name, overrideEntries) ?? longestMatch(id, name, builtinEntries);
}

export function estimateTokenCostUsd(usage: TokenUsage | undefined, rate: ModelPriceRate | null): number | null {
  if (!usage || !isModelPriceRate(rate)) return null;
  const tokens = (value: unknown) => nonNegativeNumber(value) ? value : 0;
  const input = tokens(usage.other_input_tokens) + tokens(usage.cache_write_input_tokens);
  const cached = tokens(usage.cache_read_input_tokens);
  const output = tokens(usage.output_tokens);
  if (input === 0 && cached === 0 && output === 0) return null;

  const cost = input / 1_000_000 * rate.inputPerMillion
    + cached / 1_000_000 * rate.cachedInputPerMillion
    + output / 1_000_000 * rate.outputPerMillion;
  return Number.isFinite(cost) ? cost : null;
}
