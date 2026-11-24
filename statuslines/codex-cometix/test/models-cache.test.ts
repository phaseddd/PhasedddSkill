import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { LocalModelsRegistry } from "../src/config/models-cache.js";
import { DEFAULT_CONFIG } from "../src/config/schema.js";
import { CostLedger } from "../src/collectors/ledger.js";
import { SessionTracker } from "../src/collectors/session-tracker.js";

describe("LocalModelsRegistry & dynamic pricing", () => {
  it("loads context_window from models_cache.json and merges agy-zh-pack prices.json + user overrides by priority", () => {
    const dir = mkdtempSync(join(tmpdir(), "cometix-models-"));
    try {
      const cachePath = join(dir, "models_cache.json");
      const pricesPath = join(dir, "cometix-prices.json");
      const ledgerPath = join(dir, "ledger.json");

      writeFileSync(
        cachePath,
        JSON.stringify({
          models: [
            {
              slug: "gpt-6.2-sol",
              display_name: "GPT-6.2-Sol",
              context_window: 500000,
              effective_context_window_percent: 95,
              pricing: { input_per_million: 9, cached_input_per_million: 0.9, output_per_million: 29 },
            },
          ],
        }),
      );

      writeFileSync(
        pricesPath,
        JSON.stringify({
          schema: 1,
          models: {
            "gpt-6.2-sol": {
              t: [
                ["2027-01-01", { in: 3, cache: 0.3, out: 12 }],
                [null, { in: 6, cache: 0.6, out: 24 }],
              ],
            },
            "gemini-4-neon": {
              t: [[null, { in: 3, cache: 0.15, out: 15 }]],
            },
          },
        }),
      );

      const registry = new LocalModelsRegistry({ modelsCachePath: cachePath, externalPricesPath: pricesPath });
      const meta = registry.resolveModelMetadata("gpt-6.2-sol");
      assert.equal(meta?.contextWindow, 500000);
      assert.equal(meta?.displayName, "GPT-6.2-Sol");

      const nowMs = Date.parse("2026-11-24T10:00:00Z");
      const merged = registry.getMergedPricingOverrides(undefined, nowMs);
      // External prices.json beats models_cache.json pricing
      assert.deepEqual(merged["gpt-6.2-sol"], {
        inputPerMillion: 3,
        cachedInputPerMillion: 0.3,
        outputPerMillion: 12,
      });
      assert.deepEqual(merged["gemini-4-neon"], {
        inputPerMillion: 3,
        cachedInputPerMillion: 0.15,
        outputPerMillion: 15,
      });

      // Case-variant user override MUST beat external lowercase key
      const withUser = registry.getMergedPricingOverrides(
        { "GPT-6.2-SOL": { inputPerMillion: 99, cachedInputPerMillion: 1, outputPerMillion: 4 } },
        nowMs,
      );
      assert.deepEqual(withUser["gpt-6.2-sol"], {
        inputPerMillion: 99,
        cachedInputPerMillion: 1,
        outputPerMillion: 4,
      });

      // Same registry instance crossing the 2027-01-01 08:00 UTC boundary switches tier dynamically
      const beforeCutoff = registry.getMergedPricingOverrides(undefined, Date.parse("2027-01-01T07:59:59Z"));
      assert.equal(beforeCutoff["gpt-6.2-sol"]?.inputPerMillion, 3);
      const afterCutoff = registry.getMergedPricingOverrides(undefined, Date.parse("2027-01-01T08:00:00Z"));
      assert.equal(afterCutoff["gpt-6.2-sol"]?.inputPerMillion, 6);

      // SessionTracker uses cached context_window when Codex omits context_window_size
      const tracker = new SessionTracker({
        ledger: new CostLedger(ledgerPath),
        modelsRegistry: registry,
      });
      const ctx = tracker.buildRenderContext(
        {
          thread: {
            id: "t-cache",
            name: null,
            agent: { state: "ready" },
            model: { id: "gpt-6.2-sol", display_name: "GPT-6.2-Sol", provider: "custom" },
            workspace: { cwd: dir },
            usage: {
              context: { used_tokens: 100_000 },
              total: {
                total_input_tokens: 1_000_000,
                cache_read_input_tokens: 0,
                cache_write_input_tokens: 0,
                other_input_tokens: 1_000_000,
                output_tokens: 0,
              },
            },
          },
        },
        { ...DEFAULT_CONFIG, modules: { ...DEFAULT_CONFIG.modules, git: false } },
        "standard",
        nowMs,
      );

      assert.equal(ctx.context.windowSize, 500000);
      assert.equal(ctx.context.usedPct, 20);
      assert.equal(ctx.cost?.sessionUsd, 3);
      assert.equal(ctx.cost?.estimated, true);
      tracker.dispose();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
