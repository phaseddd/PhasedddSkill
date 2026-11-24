import {
  inspectUiTree,
  type Color,
  type PaletteId,
  type RenderContext,
  type RenderVariant,
  type SkinId,
  type UserConfig,
} from "../protocol/types.js";
import { renderStatusline } from "../design/renderer.js";
import { WHALE_DANCE_FRAMES, WHALE_IDLE_FRAMES } from "../design/whale.js";
import { renderUiTreeToAnsi } from "./ansi.js";

const PALETTE_CANVAS_BG: Record<PaletteId, Color | null> = {
  "gruvbox-light": "#FBF1C7",
  "gruvbox-dark": "#282828",
  "catppuccin-latte": "#EFF1F5",
  "catppuccin-mocha": "#1E1E2E",
  "tokyo-night": "#1A1B26",
  "rose-pine": "#191724",
  nord: "#2E3440",
  terminal: null,
};

export interface PreviewOptions {
  variant: RenderVariant;
  skin?: SkinId;
  palette?: PaletteId;
  allSkins?: boolean;
  allPalettes?: boolean;
  animate?: boolean;
  frames?: boolean;
  width?: number;
}

export function createSampleContext(
  baseConfig: UserConfig,
  overrides: Partial<{
    variant: RenderVariant;
    state: "ready" | "working" | "thinking" | "waiting";
    usedPct: number;
    tick: number;
  }> = {},
): RenderContext {
  const nowMs = Date.now();
  const stateKind = overrides.state ?? "working";
  const usedPct = overrides.usedPct ?? 38;
  const usedTokens = Math.round((usedPct / 100) * 200_000);

  return {
    state: {
      account: {
        rate_limits: [
          {
            limit_id: "codex",
            limit_name: "Codex",
            primary_limit: { used_percent: 32, window_minutes: 300, resets_at: Math.floor(nowMs / 1000) + 7200 },
            secondary_limit: { used_percent: 64, window_minutes: 10080, resets_at: Math.floor(nowMs / 1000) + 172800 },
          },
        ],
      },
      app: { cli_version: "0.172.0", display_mode: "standard" },
      thread: {
        id: "preview-thread-01",
        name: "Codex Statusline Studio",
        agent: { state: stateKind },
        model: {
          display_name: "GPT-6.2-Sol",
          id: "gpt-6.2-sol",
          provider: "custom",
          reasoning_level: "max",
        },
        workspace: { cwd: "/workspace/codex-cometix" },
        usage: {
          context: {
            context_window_size: 200_000,
            used_tokens: usedTokens,
            used_percentage: usedPct,
          },
          total: {
            total_input_tokens: 120_000,
            cache_read_input_tokens: 112_800,
            cache_write_input_tokens: 2_400,
            other_input_tokens: 4_800,
            output_tokens: 6_400,
          },
          cost: { total_cost_usd: 0.42 },
        },
      },
    },
    config: baseConfig,
    variant: overrides.variant ?? "standard",
    nowMs,
    git: {
      isRepo: true,
      branch: "feat/cometix-whale",
      detached: false,
      dirty: true,
      staged: true,
      untracked: false,
      ahead: 2,
      behind: 0,
      added: 148,
      deleted: 23,
      worktree: false,
      updatedAt: nowMs,
    },
    context: {
      usedPct,
      remainingPct: 100 - usedPct,
      usedTokens,
      windowSize: 200_000,
      sparklineSamples: [18_000, 26_000, 39_000, 48_000, 58_000, 66_000, usedTokens],
      deltaTokens: 10_000,
    },
    cache: {
      hitPct: 94,
      cachedTokens: 112_800,
      totalInputTokens: 120_000,
    },
    quotas: [
      {
        label: "5h",
        usedPct: 32,
        remainingPct: 68,
        windowMinutes: 300,
        resetsAt: Math.floor(nowMs / 1000) + 7200,
        resetText: "16:44",
        paceDeltaPct: -8,
      },
      {
        label: "7d",
        usedPct: 64,
        remainingPct: 36,
        windowMinutes: 10080,
        resetsAt: Math.floor(nowMs / 1000) + 172800,
        resetText: "Sat 16:08",
        paceDeltaPct: 14,
      },
    ],
    cost: {
      sessionUsd: 0.42,
      todayUsd: 1.85,
      estimated: false,
    },
    timing: {
      turnElapsedSec: stateKind === "working" || stateKind === "thinking" ? 14 : null,
      sessionElapsedSec: 492,
      outputTps: stateKind === "working" ? 86 : null,
    },
    animationTick: overrides.tick ?? 0,
  };
}

function renderCard(title: string, ctx: RenderContext, width: number, paintCanvas = true): string {
  const tree = renderStatusline(ctx);
  const stats = inspectUiTree(tree);
  const badge = stats.valid
    ? `${stats.nodes}/256 nodes · ${stats.jsonBytes}B`
    : `INVALID: ${stats.reason}`;
  const header = `\x1b[2m── ${title}  (${badge}) ──\x1b[0m`;
  const canvasBg = paintCanvas ? PALETTE_CANVAS_BG[ctx.config.palette] : null;
  const rendered = renderUiTreeToAnsi(tree, width, canvasBg);
  return `${header}\n${rendered}\n`;
}

export async function runPreview(baseConfig: UserConfig, opts: PreviewOptions): Promise<void> {
  const width = opts.width ?? Math.min(116, Math.max(76, (process.stdout.columns ?? 110) - 2));
  const cfg: UserConfig = {
    ...baseConfig,
    skin: opts.skin ?? baseConfig.skin,
    palette: opts.palette ?? baseConfig.palette,
  };

  if (opts.animate) {
    // Live 1 FPS animation preview in terminal (idle 3s -> working 8-beat dance loop!)
    const totalBeats = 12;
    process.stdout.write("\x1b[?25l");
    try {
      for (let step = 0; step < totalBeats; step++) {
        const isDance = step >= 3;
        const tick = isDance ? step - 3 : step;
        const frameName = isDance
          ? WHALE_DANCE_FRAMES[tick % WHALE_DANCE_FRAMES.length]!.name
          : WHALE_IDLE_FRAMES[tick % WHALE_IDLE_FRAMES.length]!.name;
        const ctx = createSampleContext(cfg, {
          variant: "whale",
          state: isDance ? "working" : "ready",
          usedPct: isDance ? 42 + tick * 4 : 38,
          tick,
        });
        if (step > 0) {
          process.stdout.write("\x1b[4A\x1b[J");
        }
        process.stdout.write(
          renderCard(
            `LIVE 1FPS [${isDance ? "WORKING · 《落泪》热舞" : "IDLE · 摸鱼吐泡泡"}] ${frameName}`,
            ctx,
            width,
          ),
        );
        await new Promise((r) => setTimeout(r, 900));
      }
    } finally {
      process.stdout.write("\x1b[?25h");
    }
    return;
  }

  if (opts.frames) {
    console.log(renderCard("WHALE IDLE · 摸鱼吐泡泡", createSampleContext(cfg, { variant: "whale", state: "ready", tick: 0 }), width));
    for (let i = 0; i < WHALE_DANCE_FRAMES.length; i++) {
      console.log(
        renderCard(
          `WHALE BEAT ${i + 1}/8 · ${WHALE_DANCE_FRAMES[i]!.name}`,
          createSampleContext(cfg, { variant: "whale", state: "working", usedPct: 35 + i * 7, tick: i }),
          width,
        ),
      );
    }
    return;
  }

  if (opts.allSkins) {
    const skins: SkinId[] = ["editorial", "pill", "plain"];
    for (const skin of skins) {
      console.log(
        renderCard(
          `skin=${skin} · palette=${cfg.palette} · ${opts.variant}`,
          createSampleContext({ ...cfg, skin }, { variant: opts.variant, state: "working", tick: 0 }),
          width,
        ),
      );
    }
    return;
  }

  if (opts.allPalettes) {
    const palettes: PaletteId[] = [
      "gruvbox-light",
      "gruvbox-dark",
      "catppuccin-latte",
      "catppuccin-mocha",
      "tokyo-night",
      "rose-pine",
      "nord",
      "terminal",
    ];
    for (const palette of palettes) {
      console.log(
        renderCard(
          `palette=${palette} · skin=${cfg.skin}`,
          createSampleContext({ ...cfg, palette }, { variant: opts.variant, state: "working", tick: 1 }),
          width,
        ),
      );
    }
    return;
  }

  // Default gallery: show Standard (ready & working) + DS Fat Fish (idle & dancing)
  console.log(renderCard(`Standard · skin=${cfg.skin} · palette=${cfg.palette} (ready)`, createSampleContext(cfg, { variant: "standard", state: "ready", usedPct: 24, tick: 0 }), width));
  console.log(renderCard(`Standard · skin=${cfg.skin} · palette=${cfg.palette} (working · high ctx)`, createSampleContext(cfg, { variant: "standard", state: "working", usedPct: 78, tick: 2 }), width));
  console.log(renderCard(`DS Fat Fish · Idle 摸鱼吐泡泡`, createSampleContext(cfg, { variant: "whale", state: "ready", usedPct: 24, tick: 0 }), width));
  console.log(renderCard(`DS Fat Fish · Working 《落泪》Beat 1 (我真的特别爱你)`, createSampleContext(cfg, { variant: "whale", state: "working", usedPct: 52, tick: 0 }), width));
  console.log(renderCard(`DS Fat Fish · Working 《落泪》Beat 4 (为什么你在流泪)`, createSampleContext(cfg, { variant: "whale", state: "working", usedPct: 68, tick: 3 }), width));
}
