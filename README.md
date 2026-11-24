# PhasedddSkill

My personal collection of open-source Claude Code & Codex CLI skills, output styles, and statuslines.

## Skills

### council

Multi-agent council debate system. Spawns independent AI agents with distinct personas who engage in real cross-talk debate on any topic. Designed for decisions, architecture choices, strategy discussions, or any complex topic where a single viewpoint is insufficient.

Key design concepts: perspective spectrum, unexpected voices, irreplaceable observation positions, friction saturation, Speaker/facilitator role, AskUserQuestion lifecycle integration.

### council-zh

Chinese adaptation of the council skill (not a translation). Aligned with the English version's behavioral specification while using natural Chinese expression. All tool names (AskUserQuestion, TeamCreate, etc.) remain in English.

### mimo-search

Real-time web search via Xiaomi MiMo API. Uses MiMo's `web_search` tool calling to fetch live public information — news, weather, stock prices, technical docs, and more. Requires a pay-as-you-go MiMo API Key (`sk-` prefix) with Web Search enabled in the console. Explicit invocation only (`/mimo-search`), no automatic triggering.

### grok-vision

Image and video analysis via xAI Grok — screenshots, UI review, layout/color checks, design mockups, and video timelines. Prefer when the current model cannot read images/video directly, or when the user explicitly wants Grok; requires a local file path or public image URL (not for pure text/code/docs). Zero-dependency Node script (`image` / `video` / `convert` / `check`); credentials from `GROK_API_KEY` or `~/.grok/auth.json`. Optional local `grok` CLI fallback for large images or API failures; optional `ffmpeg` for format convert. `check` requires credentials only by default (`check --strict` for full stack).

### tim-mediastorm

Writing skill that emulates Tim's (潘天鸿, founder of MediaStorm/影视飓风) distinctive writing style — blending tech rationality with humanistic poetry. Includes a comprehensive style guide covering HKRR theory, narrative arc, elevation techniques, golden sentences, and scenario-specific adaptations. Only activates when the user explicitly requests Tim or MediaStorm style.

## Output Styles

Output styles define Claude's persona, tone, and behavior — they change *how* Claude speaks, not what Claude can do. See [output-styles/README.md](./output-styles/README.md) for installation and usage.

### teochew-fun

潮汕话输出风格，把 Claude 变成讲话粗粝直白的胶己人开发搭子。Just For Fun，不推荐生产使用。

## Statuslines

Custom terminal statuslines for AI coding CLIs. See [statuslines/README.md](./statuslines/README.md) for overview and quick setup.

### codex-cometix

Zero-runtime-dependency TypeScript → single-file Node.js MCP statusline for **Codex CLI v0.171+ / v0.172+**, inspired by [CCometixLine](https://github.com/Haleclipse/CCometixLine) and [agy-zh-pack](https://github.com/ncdeng/agy-zh-pack). Ships pre-built (`statuslines/codex-cometix/dist/index.mjs`) with one-command `install` / `preview`, 3 skins (`editorial` / `pill` / `plain`), 8 curated light/dark palettes, hot-reloaded config, local `~/.codex/models_cache.json` + daily cost ledger integration, non-blocking SWR Git telemetry, and dual `/statusline` entrypoints — **Standard Dual-Line Dashboard** plus the **DS Fat Fish (`大肥鱼`) Pixel Dance Edition** (idle bubbling, upright 8-beat pixel dance while `working`). See [statuslines/codex-cometix/README.md](./statuslines/codex-cometix/README.md).

## Community

This project is shared with the [LINUX DO](https://linux.do/) community.

## License

MIT
