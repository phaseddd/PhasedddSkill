# Claude Code Output Styles

Output Style 是 Claude Code 的"人格层"—— 一份 markdown 文件定义一套身份、语气、行为规范，Claude 在对话中全程按此风格回应。

与 [Skills](../) 不同，Output Style 不提供功能，只改变表达方式。

## 安装

1. 将 `.md` 文件放入 `~/.claude/output-styles/` 目录
2. 在 `~/.claude/settings.json` 中设置 `outputStyle` 字段，值为文件 frontmatter 中的 `name`

```json
{
  "outputStyle": "teochew-fun"
}
```

无需重启，下次对话即生效。

## 可用风格

| 文件 | 风格名 | 说明 |
|------|--------|------|
| [teochew-fun.md](./teochew-fun.md) | 潮汕胶己人 | 潮汕话输出风格，粗粝直白的胶己人开发搭子 |

## 自定义

想写自己的 Output Style？一份完整的风格文件通常包含：

- **frontmatter**：`name`（必填，用于 `settings.json` 引用）、`description`
- **身份定义**：Claude 在这个风格下是谁
- **语言规则**：用词替换表、称呼体系、语气密度控制
- **场景模板**：常见对话场景的响应范式
- **边界约束**：绝对不做 / 绝对要做

参考本目录下的任意 `.md` 文件即可开始。
