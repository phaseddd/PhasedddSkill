import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { GlyphMode, PaletteId, PercentMode, SkinId, UserConfig } from "../protocol/types.js";
import { isModelPriceRate } from "./pricing.js";

const SKINS: readonly SkinId[] = ["editorial", "pill", "plain"];
const PALETTES: readonly PaletteId[] = [
  "gruvbox-light", "gruvbox-dark", "catppuccin-latte", "catppuccin-mocha",
  "tokyo-night", "rose-pine", "nord", "terminal",
];
const GLYPHS: readonly GlyphMode[] = ["nerd", "unicode", "ascii"];
const PERCENT_MODES: readonly PercentMode[] = ["used", "remaining"];

export const DEFAULT_CONFIG: UserConfig = Object.freeze({
  skin: "editorial",
  palette: "gruvbox-dark",
  glyphs: "nerd",
  percentMode: "used",
  barWidth: 10,
  quotaBarWidth: 7,
  modules: Object.freeze({
    git: true,
    cache: true,
    sparkline: true,
    cost: true,
    todayCost: true,
    timer: true,
    tps: true,
    quotas: true,
  }),
  pricingOverrides: Object.freeze({}),
});

export function getConfigPath(): string {
  return process.env.CODEX_COMETIX_CONFIG || join(homedir(), ".codex", "cometix-statusline.json");
}

function object(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function select<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

function width(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function normalizeConfig(raw: unknown): UserConfig {
  const config = object(raw);
  if (!config) return DEFAULT_CONFIG;

  const rawModules = object(config.modules);
  const modules = { ...DEFAULT_CONFIG.modules };
  for (const key of Object.keys(modules) as (keyof typeof modules)[]) {
    const enabled = rawModules?.[key];
    if (typeof enabled === "boolean") modules[key] = enabled;
  }

  const overrides = Object.entries(object(config.pricingOverrides) ?? {}).flatMap(([key, value]) => {
    if (!key.trim() || !isModelPriceRate(value)) return [];
    const { inputPerMillion, cachedInputPerMillion, outputPerMillion } = value;
    return [[key.trim(), { inputPerMillion, cachedInputPerMillion, outputPerMillion }]] as const;
  });

  return {
    skin: select(config.skin, SKINS, DEFAULT_CONFIG.skin),
    palette: select(config.palette, PALETTES, DEFAULT_CONFIG.palette),
    glyphs: select(config.glyphs, GLYPHS, DEFAULT_CONFIG.glyphs),
    percentMode: select(config.percentMode, PERCENT_MODES, DEFAULT_CONFIG.percentMode),
    barWidth: width(config.barWidth, DEFAULT_CONFIG.barWidth),
    quotaBarWidth: width(config.quotaBarWidth, DEFAULT_CONFIG.quotaBarWidth),
    modules,
    pricingOverrides: Object.fromEntries(overrides),
  };
}

export class ConfigLoader {
  private readonly filePath: string;
  private fileVersion: string | undefined;
  private config = DEFAULT_CONFIG;

  constructor(filePath = getConfigPath()) {
    this.filePath = filePath;
  }

  get(): UserConfig {
    try {
      const stat = statSync(this.filePath, { bigint: true, throwIfNoEntry: false });
      if (stat?.isFile()) {
        const version = `${stat.mtimeNs}/${stat.ctimeNs}/${stat.ino}/${stat.size}`;
        if (version !== this.fileVersion) {
          this.fileVersion = version;
          try {
            const json = readFileSync(this.filePath, "utf8").replace(/^\uFEFF/, "");
            this.config = normalizeConfig(JSON.parse(json));
          } catch {
            this.config = DEFAULT_CONFIG;
          }
        }
        return this.config;
      }
    } catch {
      // Filesystem errors use the same fallback as a missing config.
    }
    this.fileVersion = undefined;
    this.config = DEFAULT_CONFIG;
    return this.config;
  }
}
