# PhasedddSkill

My personal collection of open-source Claude Code skills and output styles.

## Skills

### council

Multi-agent council debate system. Spawns independent AI agents with distinct personas who engage in real cross-talk debate on any topic. Designed for decisions, architecture choices, strategy discussions, or any complex topic where a single viewpoint is insufficient.

Key design concepts: perspective spectrum, unexpected voices, irreplaceable observation positions, friction saturation, Speaker/facilitator role, AskUserQuestion lifecycle integration.

### council-zh

Chinese adaptation of the council skill (not a translation). Aligned with the English version's behavioral specification while using natural Chinese expression. All tool names (AskUserQuestion, TeamCreate, etc.) remain in English.

### mimo-search

Real-time web search via Xiaomi MiMo API. Uses MiMo's `web_search` tool calling to fetch live public information — news, weather, stock prices, technical docs, and more. Includes a CLI interface (`mimo-search.js`) with configurable search breadth, result count, and output formatting.

```bash
# Installation
cp -r mimo-websearch ~/.claude/skills/mimo-search

# Set API Key (get one at https://platform.xiaomimimo.com)
mimo-search config set api_key sk-xxx

# Or via environment variable
export MIMO_API_KEY="sk-xxx"
```

Requirements: Node.js, MiMo API Key (pay-as-you-go, ¥25/1000 searches). Explicit invocation only (`/mimo-search`), no automatic triggering.

### tim-mediastorm

Writing skill that emulates Tim's (潘天鸿, founder of MediaStorm/影视飓风) distinctive writing style — blending tech rationality with humanistic poetry. Includes a comprehensive style guide covering HKRR theory, narrative arc, elevation techniques, golden sentences, and scenario-specific adaptations. Only activates when the user explicitly requests Tim or MediaStorm style.

## Output Styles

Output styles define Claude's persona, tone, and behavior — they change *how* Claude speaks, not what Claude can do. See [output-styles/README.md](./output-styles/README.md) for installation and usage.

### teochew-fun

潮汕话输出风格，把 Claude 变成讲话粗粝直白的胶己人开发搭子。Just For Fun，不推荐生产使用。

## Community

This project is shared with the [LINUX DO](https://linux.do/) community.

## License

MIT
