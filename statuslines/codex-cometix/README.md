# codex-cometix

> 为 **Codex CLI v0.171+ / v0.172+** 打造的零运行时依赖自定义状态栏 MCP Server。
> 融合 [CCometixLine](https://github.com/Haleclipse/CCometixLine) 与 [agy-zh-pack](https://github.com/ncdeng/agy-zh-pack) 的精密信息密度与美学克制，并内置「**DS 大肥鱼（DeepSeek 蓝鲸）纯像素《落泪》热舞特供版**」。

## 特性一览

- **零运行时依赖 · 单文件跨平台**：TypeScript 预构建为单一 [dist/index.mjs](./dist/index.mjs)，仅需 Node.js ≥ 20，克隆即用、无需 Python，也无需按平台交叉编译。
- **双入口秒切**：同一个 MCP Server 在 Codex `/statusline` 选择器中并列提供两个入口：
  - `Cometix Studio · 双行仪表盘`（标准精密双行版）
  - `Cometix Studio · DS大肥鱼热舞版`（3 行指标 + 最右侧 3 行 × 14 列真彩半块像素 DS 大肥鱼：待机摸鱼吐泡泡，进入 `working / thinking` 立刻直立跳 8 拍纯像素《落泪》热舞，精准契合 Codex `v0.172.0` 的 3 行视口上限）
- **三套皮肤 × 八套精调色板**：
  - 皮肤：`editorial`（默认：通透编辑风 + 焦点微徽章）、`pill`（柔色圆角胶囊）、`plain`（纯文字彩色图标）
  - 色板：`gruvbox-dark`（默认，适配深色终端）、`gruvbox-light`（暖米色浅底精调）、`catppuccin-latte`、`catppuccin-mocha`、`tokyo-night`、`rose-pine`、`nord`、`terminal`
  - 字形：`nerd`（推荐，如 Maple Mono NF CN）、`unicode`、`ascii`
- **常驻进程实时遥测（< 10ms，绝不阻塞 1s 轮询）**：
  - 第 1 行：模型 + 推理档位微徽章 · 固定槽位运行脉搏 · 当前目录 · 后台异步 SWR Git 现场（分支、脏/暂存、ahead/behind、`+a/-d`）
  - 第 2 行：8 阶上下文圆环 + 1/8 亚像素进度条（默认已用 %，可切回剩余 %）· 增长曲线 `▁▂▄▆` · 缓存命中率 · 5h/7d 额度条+重置时间+配速偏移 `⇡/⇣`
  - 右侧 / 第 3 行：会话花费 + 今日账本（优先读 Codex 原生费用，缺失时自动结合 `$CODEX_HOME/models_cache.json`、可选 `$CODEX_HOME/cometix-prices.json`（兼容 `agy-zh-pack` 阶梯价格式）及内置价格表估算）· 耗时与实时 `t/s`
- **配置热重载**：修改 `~/.codex/cometix-statusline.json` 后下一秒自动生效，无需重启 Codex。

## 快速开始（免构建直接安装）

仓库已附带构建好的 `dist/index.mjs`，直接执行即可：

```bash
# 终端实时预览
node dist/index.mjs preview
node dist/index.mjs preview --whale --animate
node dist/index.mjs preview --all-skins
node dist/index.mjs preview --all-palettes

# 一键接入 Codex CLI（默认启用 DS 大肥鱼热舞版）
node dist/index.mjs install --whale

# 或默认启用标准双行版
node dist/index.mjs install --standard

# 卸载
node dist/index.mjs uninstall
```

启用后重启 Codex CLI，输入 `/statusline` → **Choose a status line provider** 即可随时在「双行仪表盘」和「DS 大肥鱼热舞版」之间切换。

## 本地开发与构建

```bash
npm install
npm run check   # typecheck + build dist/index.mjs + 全部单元测试
```

## 自定义配置（`~/.codex/cometix-statusline.json`）

```json
{
  "skin": "editorial",
  "palette": "gruvbox-dark",
  "glyphs": "nerd",
  "percentMode": "used",
  "barWidth": 10,
  "quotaBarWidth": 7,
  "modules": {
    "git": true,
    "cache": true,
    "sparkline": true,
    "cost": true,
    "todayCost": true,
    "timer": true,
    "tps": true,
    "quotas": true
  }
}
```

## 致谢

视觉语言与指标灵感源自 [CCometixLine](https://github.com/Haleclipse/CCometixLine) 与 [agy-zh-pack](https://github.com/ncdeng/agy-zh-pack)。
