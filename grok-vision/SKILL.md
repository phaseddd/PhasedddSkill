---
name: grok-vision
description: >
  用 grok 的原生视觉/视频能力分析图片与视频：读截图、评界面效果、
  核对颜色/尺寸/布局、解读设计稿、分析视频画面与时间线。
  仅在请求涉及具体图片（jpg/jpeg/png）或视频（mp4）文件、或图片公网 URL 时使用；
  当前模型无法直接读图/视频时优先走本技能。
  纯文字、代码、文档分析不用本技能。
when_to_use: >
  "帮我看看这张图""读一下这个截图""这个界面效果怎么样""这个颜色对不对"
  "分析这段视频"；用户明确要求用 grok 看图/视频时亦然。
  需用户给出本地文件路径或图片公网 URL；
  只谈"截图/界面"概念而未给文件时不触发。
argument-hint: [图片或视频路径] [问题]
allowed-tools:
  - Read
  - Grep
  - Bash(${CLAUDE_SKILL_DIR}/scripts/grok-vision.mjs *)
  - Bash(ffmpeg *)
  - Bash(grok -p *)
---

# grok-vision：借 grok 的眼睛

图片/视频视觉分析交给 grok 原生视觉能力：图片走 API 内联（最轻）或本地 grok CLI 降级，视频走 API 文件上传链路（无降级）。

触发：`paths` 限定的目录内（demos、.vision）自动生效；其他地方手动 `/grok-vision <图片或视频路径> [问题]` 兜底。用户给了文件路径/公网 URL 和关注点后，按下面流程执行。

## 调用（bash，统一走脚本）

```bash
node ${CLAUDE_SKILL_DIR}/scripts/grok-vision.mjs image --file a.png --file b.png --prompt '用中文回答：两页对齐是否一致'
node ${CLAUDE_SKILL_DIR}/scripts/grok-vision.mjs image --file a.png --prompt '核对布局' --detail high
node ${CLAUDE_SKILL_DIR}/scripts/grok-vision.mjs video --file demo.mp4 --prompt 't=0s 黑场 → t=1s 标题浮现 → t=2.5s 完成态，评估节奏'
node ${CLAUDE_SKILL_DIR}/scripts/grok-vision.mjs convert input.webm output.mp4
node ${CLAUDE_SKILL_DIR}/scripts/grok-vision.mjs check
```

- 脚本路径用环境注入的 skill 目录变量（Claude Code：`${CLAUDE_SKILL_DIR}`；其他环境无此变量时，从技能目录用相对路径 `scripts/grok-vision.mjs`）
- `--prompt` 用 bash 单引号包裹；prompt 超长/含引号/多行时写入临时文件改用 `--prompt-file <文件>`
- `image` 默认传 `detail=high`（对齐 xAI 示例）；与 `--model` 一样仅用 CLI `--detail high|low|auto` 覆盖
- `--json` 输出单行 JSON；退出码：0 成功 / 1 参数与文件 / 2 凭据 / 3 网络与超时 / 4 大小与格式 / 5 上游 API 错误
- `check` 默认只要求凭据就绪（exit 0），grok CLI/ffmpeg 为 optional（缺了仅通道 C/convert 不可用，按输出的 `ready`/`unavailable` 调整路由）；完整栈自检用 `check --strict`
- allowed-tools 已预批 mjs/ffmpeg/grok；若仍弹权限请向用户反馈，勿自行放宽规则

## 路由决策

- jpg/jpeg/png ≤20MiB → `image`；mp4 ≤50MB → `video`
- gif/webm → `convert` 转 mp4（视频）或 jpg（动图抽帧）→ 对应通道；仅格式转换，零缩放零裁剪
- 图片 >20MiB → 先报告用户 → 默认尝试通道 C（grok CLI 本地读图，无 20MiB 限制）→ 或经用户同意 `convert` 压缩后走 `image`
- 公网图片 URL → `image --file` 直接收 URL；公网视频 URL → 先下载为本地 mp4 再走 `video`（脚本不内置下载）
- PDF 不支持，不触发
- 收到 401 / 退出码 2 → 请用户检查 `GROK_API_KEY` 或先跑 `grok -p 'hi'` 刷新登录态 → 重试；仍 401 才降级通道 C（C 读同一份凭据，先刷新是必要前置）
- `image` 失败（网络/403/超限/格式）→ 降级通道 C；`video` 失败无降级，错误原样转达

## 意图组织

- **意图结构保留**：用户原话逐字传给 grok，不分类、不转译；澄清只补缺口，不改写意图
- **澄清协议**（最多两轮，用环境的提问机制澄清，一次一问、选项带推荐）：
  - 第一轮：请求含模糊评价词（"好不好看"）或验证类请求未给目标值/参考图时，问关注维度（整体观感 / 视觉细节 / 动效与节奏 / 风格一致性）
  - 第二轮：仍存在多种合理输出形式时，问形式（一句话结论 / 逐项清单 / 对照表）
  - 两轮后用户未改选 → 用默认方案立即执行，绝不追加；事实类信息（文件存在/大小/格式）一律脚本自查，不占用提问
- 锚点类验证（颜色/尺寸/对齐）：用户给目标值与关注点 → 原样传 grok 逐项核对
- 无锚点评价（风格/氛围）：给背景与关注点即可，评价完全交给 grok；用户要求客观/挑刺时 prompt 末尾加"优先指出问题与改进点"
- 动效/时间线类问题按阶段描述关注点（`t=0s 黑场 → t=1s 标题浮现 → t=2.5s 完成态`）；非时序类问题（内容/台词/人物识别）不必套时间线格式
- OCR/文字提取：直接要求 grok 提取并标注位置；参考图对照：图并列传入，prompt 说明谁是谁（如"图1 设计稿，图2 实现截图"）
- `video` 分析后服务端文件即删，追问同一视频需重新上传（`--keep` 除外）
- 需要中文回答时在 prompt 末尾加"用中文回答"

## 凭据与隐私

- 凭据三级链，只由脚本内部读取，模型不接触 token 字符串；禁止打印凭据、Authorization 头、请求体：
  1. 环境变量 `GROK_API_KEY`（xAI 控制台长期 API key，推荐）→ 最高优先级
  2. `~/.grok/auth.json`（grok CLI 登录态，`GROK_HOME` 可覆盖；精确匹配 `https://auth.x.ai::` 前缀；expires_at 预留 60s）
  3. 都没有 → 脚本报错并引导两种方式，不假设已装 grok-build
- 本地图片/视频会上传 x.ai 服务端，仅走用户自己的账号与凭据

## 通道 C：grok CLI 降级（仅图片）

```bash
grok -p --prompt-file <prompt.txt> --yolo
```

- 仅当 `image` 子命令失败或图片 >20MiB 时使用；grok 报错（超限、解码失败、权限）→ 错误原样转达，不自己猜原因
- prompt 一律写临时文件走 `--prompt-file`（不进 argv，防进程列表暴露）；需要程序化取字段时加 `--output-format json`
- 不加 `--max-turns` 等护栏参数：grok 自己决定跑多少回合；`--yolo` 免确认执行工具，不加会被权限询问卡住

## 跨 harness 说明

本技能遵循 Agent Skills 开放标准（agentskills.io），Claude Code 与 Codex 均可使用：

- SKILL.md frontmatter 的 `paths`/`allowed-tools`/`argument-hint` 是 Claude Code 扩展字段，其他环境忽略不报错（只认 `name`/`description`）
- 隐式调用开关对照：Claude Code `disable-model-invocation: true` ⇄ Codex `agents/openai.yaml` 的 `policy.allow_implicit_invocation: false`（本技能用 `paths` 限定激活范围，未设此开关）
- 提问机制对照：Claude Code `AskUserQuestion` ⇄ Codex `request_user_input`（契约差异：Codex 需 id 字段、1~5 问、无 multiSelect、Other 需显式）
- 脚本本身零依赖纯 Node，任意环境可直接 `node scripts/grok-vision.mjs ...` 运行

## Gotchas

- Windows 下 PowerShell `-Form` 上传视频服务端见 0 字节（历史坑，已由脚本 FormData+Blob 消除）
- Windows 重定向 stdout 是 GBK 非 UTF-8（脚本 Node 原生 UTF-8 输出，已根除）
- grok CLI `--yolo` 官方别名 `--always-approve`；`-p` 长形式是 `--single`
- Files API 官方上限 50MB（48MB 是第三方误报）；上传带 `expires_after=3600` TTL 兜底，删除失败也不留服务端垃圾

## 不变量

- 不替 grok 做任何预测性限制（分析深度、处理方式都由它决定）
- grok 报错原样转达，不自己猜原因
- 通道 C 是降级不是主路
- 凭据每次现取，不缓存、不打印
