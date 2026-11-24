# codex-cometix — Architecture & Codex v0.172 Protocol Notes

## 1. Overview

`codex-cometix` is a zero-runtime-dependency TypeScript → single-file Node.js ESM (`dist/index.mjs`) custom statusline MCP server for **Codex CLI v0.171+ / v0.172+**, inspired by [CCometixLine](https://github.com/Haleclipse/CCometixLine) and [agy-zh-pack](https://github.com/ncdeng/agy-zh-pack).

## 2. Codex CLI v0.172.0 Protocol & Renderer Invariants

1. **Transport**: Newline-delimited JSON-RPC 2.0 MCP over `stdin`/`stdout` (`protocolVersion: "2025-06-18"`). Never write non-JSON-RPC output to `stdout`.
2. **Dual Entrypoints**: One MCP server advertises two tools in `tools/list`, each declaring one `_meta["openai/ui"].entrypoints` statusline resource:
   - `statusline` → `ui://codex-cometix/standard` (`Cometix Studio · 双行仪表盘`)
   - `statusline-whale` → `ui://codex-cometix/whale` (`Cometix Studio · DS大肥鱼热舞版`)
3. **Polling & Latency Budget**:
   - Codex polls `resources/read` every **1 second** with a hard **1-second timeout** (any error or timeout stops polling).
   - All Git probing, disk reads, and ledger persistence are strictly non-blocking or mtime-cached so `resources/read` responds in `< 10ms`.
4. **UI Tree Caps & Layout Mechanics**:
   - Hard limits: JSON ≤ 64 KiB, UTF-8 leaf text ≤ 16 KiB, **non-null nodes ≤ 256**, depth ≤ 16.
   - Observed TUI viewport height cap in Codex `v0.172.0`: **3 terminal rows** — the DS Fat Fish sprite (`6×14` virtual pixels via Unicode half-blocks `▀▄█` + `row.background`) is sculpted to **exact 3-row height** so it renders with zero clipping.
   - Consecutive ASCII spaces collapse in text leaves; `\u00A0` (NBSP) and `row.gap` preserve exact spacing.
   - Multi-row stacking with `row.background` uses `row(gap: 10000, wrap: "wrap")` so each child row paints alone on its own line; pairing a left stack and a fixed-width right stack inside an outer `row(gap: 2, wrap: "nowrap")` aligns the right stack flush to the terminal's right edge at any viewport width.

## 3. Module Layout

```text
src/
├── index.ts                     # Multi-mode CLI entrypoint: MCP server (default), preview, install, uninstall
├── protocol/
│   ├── types.ts                 # Codex StatuslineState & UiTree types + inspectUiTree validator
│   └── mcp-server.ts            # Newline-delimited JSON-RPC 2.0 stdio MCP server
├── config/
│   ├── schema.ts                # Config defaults, normalization & mtime-cached hot reload
│   ├── models-cache.ts          # Reads $CODEX_HOME/models_cache.json & optional cometix-prices.json (agy-zh-pack tiers)
│   └── pricing.ts               # Built-in fallback pricing table & token cost estimator
├── collectors/
│   ├── git.ts                   # Non-blocking async SWR Git collector (--no-optional-locks, -z porcelain v2, worktree)
│   ├── ledger.ts                # Multi-process atomic daily cost ledger with local-midnight rollover
│   └── session-tracker.ts       # Per-thread sparkline, cache hit%, 5h/7d pace delta, turn timer & EWMA tok/s
├── design/
│   ├── palettes.ts              # 8 curated light/dark/adaptive truecolor palettes
│   ├── glyphs.ts                # Nerd Font, Unicode & ASCII icon sets + 1/8-cell sub-block bars
│   ├── whale.ts                 # 3-row × 14-col (6×14 px) DS Fat Fish pixel engine (4 idle + 8 dance beats)
│   └── renderer.ts              # 3 skins (editorial, pill, plain), dual-line & whale layouts + <=256 node guard
└── cli/
    ├── ansi.ts                  # Faithful Codex UiTree → ANSI truecolor terminal renderer
    ├── preview.ts               # Interactive gallery & live 1 FPS animation previewer
    └── installer.ts             # Surgical lossless ~/.codex/config.toml installer/uninstaller
```
