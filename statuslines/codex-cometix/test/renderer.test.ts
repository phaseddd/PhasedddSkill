import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CODEX_LIMITS,
  inspectUiTree,
  type PaletteId,
  type SkinId,
  type UserConfig,
} from "../src/protocol/types.js";
import { renderStatusline } from "../src/design/renderer.js";
import {
  WHALE_DANCE_FRAMES,
  WHALE_IDLE_FRAMES,
  WHALE_PIXEL_ROWS,
  WHALE_WIDTH,
} from "../src/design/whale.js";
import { createSampleContext } from "../src/cli/preview.js";
import { renderUiTreeToAnsi } from "../src/cli/ansi.js";

const TEST_CONFIG: UserConfig = {
  skin: "editorial",
  palette: "gruvbox-light",
  glyphs: "nerd",
  percentMode: "used",
  barWidth: 10,
  quotaBarWidth: 7,
  modules: {
    git: true,
    cache: true,
    sparkline: true,
    cost: true,
    todayCost: true,
    timer: true,
    tps: true,
    quotas: true,
  },
  pricingOverrides: {},
};

const ALL_SKINS: SkinId[] = ["editorial", "pill", "plain"];
const ALL_PALETTES: PaletteId[] = [
  "gruvbox-light",
  "gruvbox-dark",
  "catppuccin-latte",
  "catppuccin-mocha",
  "tokyo-night",
  "rose-pine",
  "nord",
  "terminal",
];

describe("DS Fat Fish sprite sheet invariants", () => {
  it("every idle and dance frame is strictly 6x14 pixels (3 terminal rows) with valid palette keys", () => {
    const valid = new Set([".", "B", "D", "H", "W", "E", "P", "T", "R", "Y", "O", "M"]);
    for (const frame of [...WHALE_IDLE_FRAMES, ...WHALE_DANCE_FRAMES]) {
      assert.equal(frame.pixels.length, WHALE_PIXEL_ROWS, `${frame.name} row count`);
      for (let r = 0; r < frame.pixels.length; r++) {
        const row = frame.pixels[r]!;
        assert.equal(row.length, WHALE_WIDTH, `${frame.name} row ${r} width`);
        for (const ch of row) {
          assert.ok(valid.has(ch), `${frame.name} invalid pixel '${ch}'`);
        }
      }
    }
  });
});

describe("Statusline renderer Codex UiTree budget & structure", () => {
  it("stays strictly within Codex v0.172 limits across every skin, palette, variant, and dance frame", () => {
    let worstNodes = 0;
    let worstLabel = "";

    for (const skin of ALL_SKINS) {
      for (const palette of ALL_PALETTES) {
        const cfg: UserConfig = { ...TEST_CONFIG, skin, palette };

        // Standard ready & working
        for (const state of ["ready", "working", "thinking", "waiting"] as const) {
          const tree = renderStatusline(
            createSampleContext(cfg, { variant: "standard", state, usedPct: 67, tick: 3 }),
          );
          const stats = inspectUiTree(tree);
          assert.ok(stats.valid, `standard ${skin}/${palette}/${state}: ${stats.reason}`);
          assert.ok(stats.nodes <= CODEX_LIMITS.MAX_NODES);
          if (stats.nodes > worstNodes) {
            worstNodes = stats.nodes;
            worstLabel = `standard/${skin}/${palette}/${state}`;
          }
        }

        // Whale idle frames
        for (let tick = 0; tick < WHALE_IDLE_FRAMES.length; tick++) {
          const tree = renderStatusline(
            createSampleContext(cfg, { variant: "whale", state: "ready", usedPct: 24, tick }),
          );
          const stats = inspectUiTree(tree);
          assert.ok(stats.valid, `whale idle ${skin}/${palette} tick=${tick}: ${stats.reason}`);
          if (stats.nodes > worstNodes) {
            worstNodes = stats.nodes;
            worstLabel = `whale-idle/${skin}/${palette}/t${tick}`;
          }
        }

        // Whale all 8 《落泪》 dance beats
        for (let tick = 0; tick < WHALE_DANCE_FRAMES.length; tick++) {
          const tree = renderStatusline(
            createSampleContext(cfg, { variant: "whale", state: "working", usedPct: 86, tick }),
          );
          const stats = inspectUiTree(tree);
          assert.ok(stats.valid, `whale dance ${skin}/${palette} tick=${tick}: ${stats.reason}`);
          if (stats.nodes > worstNodes) {
            worstNodes = stats.nodes;
            worstLabel = `whale-dance/${skin}/${palette}/t${tick}`;
          }
        }
      }
    }

    assert.ok(worstNodes > 20 && worstNodes <= CODEX_LIMITS.MAX_NODES, `Peak nodes ${worstNodes} (${worstLabel})`);
  });

  it("renders remaining % mode cleanly when configured", () => {
    const cfg: UserConfig = { ...TEST_CONFIG, percentMode: "remaining" };
    const tree = renderStatusline(createSampleContext(cfg, { variant: "standard", usedPct: 30 }));
    const ansi = renderUiTreeToAnsi(tree, 110).replace(/\x1b\[[0-9;]*m/g, "");
    assert.ok(ansi.includes("70%"), `Expected 70% remaining in:\n${ansi}`);
  });

  it("truncates emoji / surrogate pairs safely without producing lone UTF-16 surrogates", () => {
    const sample = createSampleContext(TEST_CONFIG, { variant: "standard" });
    sample.state.thread!.workspace.cwd = "D:\\work\\12345678901234😀XY";
    sample.git!.branch = "feat/123456789😀X";
    const tree = renderStatusline(sample);
    const json = JSON.stringify(tree);
    assert.ok(!/\\ud[89ab][0-9a-f]{2}/i.test(json), `Lone surrogate leaked into JSON: ${json}`);
    assert.equal(Buffer.from(json, "utf8").toString("utf8"), json, "Serialized tree JSON must be well-formed UTF-16 without unpaired surrogates");
    assert.ok(json.includes("12345678901234😀…"), `Expected emoji preserved intact in: ${json}`);
  });

  it("renders 2 lines in standard mode and 3 lines in DS Fat Fish mode (matching Codex v0.172 3-row cap)", () => {
    const stdTree = renderStatusline(createSampleContext(TEST_CONFIG, { variant: "standard" }));
    const stdLines = renderUiTreeToAnsi(stdTree, 116).split("\n");
    assert.equal(stdLines.length, 2, `Standard lines:\n${stdLines.join("\n")}`);

    const whaleTree = renderStatusline(createSampleContext(TEST_CONFIG, { variant: "whale", state: "working", tick: 3 }));
    const whaleLines = renderUiTreeToAnsi(whaleTree, 116).split("\n");
    assert.equal(whaleLines.length, 3, `Whale lines:\n${whaleLines.join("\n")}`);
  });
});
