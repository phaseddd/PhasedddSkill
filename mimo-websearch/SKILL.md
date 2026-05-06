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

## 调用约定

> **重要：** 在 Claude Code 中，所有命令以 `/mimo-search` 调用。脚本内部输出的 `mimo-search` 均为 CLI 名称，在 Claude Code 中对应 `/mimo-search`。
>
> 例如，脚本提示 `mimo-search config set api_key sk-xxx` 时，实际应执行 `/mimo-search config set api_key sk-xxx`。

## 首次使用

### 前置条件

1. **API Key 类型**：MiMo 有两类 API Key，**不可混用**：
   - Token Plan Key（`tp-xxxxx`）：预付费套餐，**不支持联网搜索**
   - 按量付费 Key（`sk-xxxxx`）：按量计费，**联网搜索必须使用此类 Key**
2. **开通联网搜索**：在 [MiMo 控制台](https://platform.xiaomimimo.com) 开启 Web Search 服务开关（参考 [Web Search 使用指南](https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/tool-calling/web-search)）
3. **账户余额**：按量付费账户需有可用余额

详见 [MiMo 快速接入文档](https://platform.xiaomimimo.com/docs/zh-CN/tokenplan/quick-access)。

### 配置

```bash
/mimo-search config set api_key sk-你的按量付费密钥
```

或设置环境变量 `MIMO_API_KEY`（优先级高于 config.json）。

### 验证

```bash
/mimo-search config          # 查看当前配置
/mimo-search "你好"           # 测试搜索
```

## 用法

```
/mimo-search <查询内容> [选项]
/mimo-search config [set <key> <value> | path]
/mimo-search --help
```

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-h, --help` | 显示完整帮助信息 | |
| `-k, --max-keyword <n>` | 每次搜索并发关键词数（控制搜索广度与费用） | 5 |
| `-l, --limit <n>` | 返回的搜索结果条数 | 5 |
| `-t, --max-tokens <n>` | 模型回复最大 Token 数 | 65536 |
| `-m, --model <name>` | 使用的 MiMo 模型 | mimo-v2.5-pro |
| `--json` | 以结构化 JSON 格式输出结果 | |
| `--sources-only` | 仅输出来源链接列表，不含回答内容 | |
| `--no-sources` | 隐藏来源，仅显示回答内容 | |

所有选项支持短格式和长格式，例如 `-k 10` 与 `--max-keyword 10` 等价。

## 配置

API Key 读取优先级：环境变量 `MIMO_API_KEY` > `config.json`

```bash
/mimo-search config                              # 查看当前配置
/mimo-search config set api_key sk-xxx           # 设置 API Key
/mimo-search config set model mimo-v2.5-pro      # 设置默认模型
/mimo-search config path                         # 显示配置文件路径
```

`config.json` 位于 skill 根目录，随 skill 一起分发。

## 示例

```bash
/mimo-search "最新 AI 新闻"
/mimo-search "特斯拉股价" --json
/mimo-search "Go 1.24 release notes" --max-keyword 3 --limit 3
/mimo-search "天气" --no-sources
/mimo-search --help
```

## 输出示例

```
根据天气预报，北京今天多云转阴，最高温度26°C...

━━━ 信息来源 ━━━
1. [北京天气预报](https://...) — Weather.com
2. [北京天气](https://...) — 天气网

搜索 3 次 · 抓取 6 页
```

## 故障排查

| 现象 | 可能原因 | 解决方式 |
|------|----------|----------|
| `401 Unauthorized` | API Key 无效或类型错误 | 确认使用的是按量付费 Key（`sk-` 开头），而非 Token Plan Key（`tp-` 开头） |
| `403 Forbidden` | 未开通联网搜索服务 | 在 MiMo 控制台开启 Web Search 开关 |
| `402 Payment Required` | 按量付费余额不足 | 充值按量付费账户 |
| 网络错误 | 网络不可达 | 检查网络环境，确认能访问 `api.xiaomimimo.com` |
| 解析响应失败 | API 返回异常 | 重试；如持续失败，检查模型名是否在支持列表中 |

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
