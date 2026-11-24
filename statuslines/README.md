# Statuslines

为终端 AI 编码工具打造的自定义状态栏集合。与 [Skills](../) 和 [Output Styles](../output-styles/) 不同，状态栏负责在终端底部实时呈现模型、上下文、缓存命中率、5h/7d 额度配速、Git 现场与费用遥测。

## 可用状态栏

| 目录 | 适用工具 | 说明 |
|------|----------|------|
| [codex-cometix](./codex-cometix/) | Codex CLI (`v0.171+` / `v0.172+`) | 零运行时依赖单文件 Node MCP 状态栏：融合 CCometixLine 与 agy-zh-pack 美学，提供「标准双行仪表盘」与「DS 大肥鱼纯像素《落泪》热舞版」双入口秒切 |

## 快速安装（以 `codex-cometix` 为例）

仓库内已预构建零依赖单文件 [codex-cometix/dist/index.mjs](./codex-cometix/dist/index.mjs)，克隆后**无需 `npm install`** 即可直接使用（需要 Node.js ≥ 20）：

```bash
# 安装并默认启用 DS 大肥鱼热舞版
node statuslines/codex-cometix/dist/index.mjs install --whale

# 或默认启用标准双行版
node statuslines/codex-cometix/dist/index.mjs install --standard

# 直接在终端预览所有皮肤、色板与大肥鱼动画
node statuslines/codex-cometix/dist/index.mjs preview --whale --animate
```

更多配色、皮肤与配置热重载说明见 [codex-cometix/README.md](./codex-cometix/README.md)。
