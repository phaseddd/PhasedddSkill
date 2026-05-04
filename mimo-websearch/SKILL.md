---
name: mimo-search
description: 通过小米MiMo API进行实时联网搜索，获取最新公开信息（新闻、天气、股价、技术文档等）。
argument-hint: [查询内容] [--model NAME] [--max-keyword N] [--limit N] [--max-tokens N] [--json] [--no-sources] [--sources-only] [--help]
disable-model-invocation: true
allowed-tools: Bash
---

# MiMo Web Search

**执行规则：** 当用户通过 `/mimo-search` 调用时，将用户参数原样传递给脚本执行。不要修改、解释或展开参数。

```bash
node "${CLAUDE_SKILL_DIR}/scripts/mimo-search.js" $ARGUMENTS
```

脚本自动处理 `-h`/`--help`（帮助）、`config`（配置管理）、搜索三种模式。

## 用法

```
mimo-search <查询内容> [选项]
mimo-search config [set <key> <value> | path]
mimo-search --help
```

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-h, --help` | 显示完整帮助信息 | |
| `-k, --max-keyword <n>` | 每次搜索并发关键词数（控制搜索广度与费用） | 5 |
| `-l, --limit <n>` | 返回的搜索结果条数 | 5 |
| `-t, --max-tokens <n>` | 模型回复最大 Token 数 | 2048 |
| `-m, --model <name>` | 使用的 MiMo 模型 | mimo-v2.5-pro |
| `--json` | 以结构化 JSON 格式输出结果 | |
| `--sources-only` | 仅输出来源链接列表，不含回答内容 | |
| `--no-sources` | 隐藏来源，仅显示回答内容 | |

所有选项支持短格式和长格式，例如 `-k 10` 与 `--max-keyword 10` 等价。

## 配置

API Key 读取优先级：环境变量 `MIMO_API_KEY` > `config.json`

```bash
mimo-search config                              # 查看当前配置
mimo-search config set api_key sk-xxx           # 设置 API Key
mimo-search config set model mimo-v2.5-pro      # 设置默认模型
mimo-search config path                         # 显示配置文件路径
```

`config.json` 位于 skill 根目录，随 skill 一起分发。

## 示例

```bash
mimo-search "最新 AI 新闻"
mimo-search "特斯拉股价" --json
mimo-search "Go 1.24 release notes" --max-keyword 3 --limit 3
mimo-search "天气" --no-sources
mimo-search --help
```

## 输出示例

```
根据天气预报，北京今天多云转阴，最高温度26°C...

━━━ 信息来源 ━━━
1. [北京天气预报](https://...) — Weather.com
2. [北京天气](https://...) — 天气网

搜索 3 次 · 抓取 6 页
```

## API

- 端点: `POST https://api.xiaomimimo.com/v1/chat/completions`
- 认证: `api-key` 或 `Authorization: Bearer` 请求头
- 支持模型: mimo-v2.5-pro, mimo-v2.5, mimo-v2-pro, mimo-v2-omni, mimo-v2-flash
- `force_search` 始终为 `true` — 调用即搜索，不依赖模型自主判断
- 计费: 国内 ¥25/1000次, 海外 $5/1000次

## 文件结构

```
mimo-search/
├── SKILL.md
├── config.json
└── scripts/
    └── mimo-search.js
```
