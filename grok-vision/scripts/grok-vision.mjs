#!/usr/bin/env node
// grok-vision.mjs — grok 视觉/视频分析客户端（Node ESM，零依赖）
// 子命令：image | video | convert | check
// 退出码：0 成功 / 1 参数与文件 / 2 凭据 / 3 网络与超时 / 4 大小与格式 / 5 上游 API 错误
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const API = 'https://api.x.ai/v1'
const DEFAULT_MODEL = 'grok-4.5'
const DETAIL_VALUES = ['low', 'high', 'auto']
const DEFAULT_DETAIL = 'high' // 对齐 xAI Image Understanding 示例；--detail 可覆盖
const IMAGE_MAX = 20 * 1024 * 1024 // 20MiB
const VIDEO_MAX = 50 * 1024 * 1024 // 50MB（官方 Files API 上限）
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png']
const VIDEO_EXTS = ['.mp4']
const AUTH_KEY_PREFIX = 'https://auth.x.ai::'
const TIMEOUTS = { image: 120_000, upload: 120_000, analyze: 300_000, delete: 30_000 }

function fail(code, msg) {
  console.error(`grok-vision: ${msg}`)
  process.exit(code)
}

function usage() {
  console.log(`grok-vision — grok 视觉/视频分析客户端
用法：
  node grok-vision.mjs image --file <路径|URL> [--file ...] --prompt <文本> [--model <名>] [--detail high|low|auto] [--json]
  node grok-vision.mjs video --file <mp4> --prompt <文本> [--model <名>] [--json] [--keep]
  node grok-vision.mjs convert <src> <dst>
  node grok-vision.mjs check [--json] [--strict]
--prompt 亦可改用 --prompt-file <文件>（超长/多行时推荐）。
--detail 仅 image：默认 high，与 --model 一样用 CLI 覆盖。
--strict 仅 check：完整栈自检（credential + grok + ffmpeg 全部就绪才算过）。
退出码：0 成功 / 1 参数与文件 / 2 凭据 / 3 网络与超时 / 4 大小与格式 / 5 上游 API 错误`)
}

// ---------- 凭据 ----------

const CREDENTIAL_HINT = '未找到可用凭据，两种方式任选：\n  a) 在 console.x.ai 创建 API key，设置环境变量 GROK_API_KEY（推荐，长期有效）\n  b) 安装 grok-build 并运行 grok -p \'hi\' 完成登录（写入 ~/.grok/auth.json）'

// 凭据三级链：GROK_API_KEY 环境变量 > ~/.grok/auth.json（grok CLI 登录态）> 引导提示
function loadToken() {
  const apiKey = process.env.GROK_API_KEY
  if (apiKey) return { token: apiKey, source: 'GROK_API_KEY' }

  const home = process.env.GROK_HOME || os.homedir()
  const authPath = path.join(home, '.grok', 'auth.json')
  let auth
  try {
    auth = JSON.parse(fs.readFileSync(authPath, 'utf8'))
  } catch {
    fail(2, `找不到或无法解析 ${authPath}。\n${CREDENTIAL_HINT}`)
  }
  const entries = Object.entries(auth).filter(([k]) => k.startsWith(AUTH_KEY_PREFIX))
  if (!entries.length) {
    fail(2, `auth.json 中没有 ${AUTH_KEY_PREFIX} 前缀条目。\n${CREDENTIAL_HINT}`)
  }
  const entry = entries[0][1]
  if (!entry || typeof entry.key !== 'string' || !entry.key) {
    fail(2, `auth.json 条目缺少 key 字段。\n${CREDENTIAL_HINT}`)
  }
  if (entry.expires_at) {
    const exp = Date.parse(entry.expires_at)
    if (Number.isFinite(exp) && exp - Date.now() < 60_000) {
      fail(2, '登录态即将过期。请先运行 grok -p \'hi\' 刷新登录态后重试。')
    }
  }
  return { token: entry.key, source: 'auth.json' }
}

// ---------- 上游调用 ----------

async function readErrorBody(res) {
  let raw
  try {
    raw = await res.text()
  } catch {
    return '（响应体读取失败）'
  }
  let text = raw
  try {
    const j = JSON.parse(raw)
    if (j?.error) text = typeof j.error === 'string' ? j.error : JSON.stringify(j.error)
  } catch {
    // 非 JSON：剥 HTML 标签取纯文本
    if (/^\s*</.test(raw)) text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  return text.slice(0, 2048)
}

async function apiCall(apiPath, options, timeoutMs, silent) {
  let res
  try {
    res = await fetch(`${API}${apiPath}`, { ...options, signal: AbortSignal.timeout(timeoutMs) })
  } catch (e) {
    const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
    fail(3, `${apiPath} 请求失败：${isTimeout ? '网络超时（若服务端较慢可重试）' : e.message}`)
  }
  if (res.status === 401) {
    fail(2, `${apiPath} 返回 401 未授权。请检查 GROK_API_KEY 是否有效，或运行 grok -p 'hi' 刷新登录态后重试。`)
  }
  if (!res.ok) {
    const body = await readErrorBody(res)
    if (silent) return null
    fail(5, `${apiPath} 返回 HTTP ${res.status}：${body}`)
  }
  return res
}

function extractText(data) {
  const parts = []
  for (const item of data?.output ?? []) {
    if (item?.type === 'reasoning') continue
    for (const c of item?.content ?? []) {
      if (c?.type === 'input_text') continue
      if (typeof c?.text === 'string') parts.push(c.text)
    }
  }
  return parts.join('\n').trim()
}

function readPrompt(opts) {
  if (opts.prompt != null) return opts.prompt
  if (opts.promptFile) {
    const p = path.resolve(opts.promptFile)
    if (!fs.existsSync(p)) fail(1, `prompt 文件不存在：${p}`)
    return fs.readFileSync(p, 'utf8').trim()
  }
  fail(1, '缺少 --prompt 或 --prompt-file')
}

// ---------- image：图片内联（base64 data URL 或公网 URL） ----------

async function cmdImage(opts, token) {
  if (!opts.files.length) fail(1, 'image 需要至少一个 --file（本地路径或公网 URL）')
  const prompt = readPrompt(opts)

  const content = [{ type: 'input_text', text: prompt }]
  for (const f of opts.files) {
    if (/^https?:\/\//i.test(f)) {
      content.push({ type: 'input_image', image_url: f, detail: opts.detail })
      continue
    }
    const p = path.resolve(f)
    if (!fs.existsSync(p)) fail(1, `文件不存在：${p}`)
    const ext = path.extname(p).toLowerCase()
    if (!IMAGE_EXTS.includes(ext)) {
      fail(4, `不支持的图片格式：${ext}（支持 ${IMAGE_EXTS.join(' / ')}）。gif/webm 请先 convert 转换。`)
    }
    const size = fs.statSync(p).size
    if (size > IMAGE_MAX) {
      fail(4, `图片 ${Math.round(size / 1024 / 1024)}MiB 超过 20MiB 上限。可 convert 压缩，或改用 grok CLI 本地读图。`)
    }
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg'
    const b64 = fs.readFileSync(p).toString('base64')
    content.push({ type: 'input_image', image_url: `data:${mime};base64,${b64}`, detail: opts.detail })
  }

  const payload = { model: opts.model, store: false, input: [{ role: 'user', content }] }
  const t0 = Date.now()
  const res = await apiCall('/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, TIMEOUTS.image)
  const data = await res.json()
  const text = extractText(data)
  const out = { ok: true, text, duration_ms: Date.now() - t0 }
  if (opts.json) console.log(JSON.stringify(out))
  else console.log(text)
}

// ---------- video：文件上传 → 分析 → 删除 ----------

async function cmdVideo(opts, token) {
  if (opts.files.length !== 1) fail(1, 'video 只接受一个 --file')
  const f = opts.files[0]
  if (/^https?:\/\//i.test(f)) {
    fail(1, '视频公网 URL 请先下载为本地 mp4 再调用（脚本不内置下载）')
  }
  const p = path.resolve(f)
  if (!fs.existsSync(p)) fail(1, `文件不存在：${p}`)
  const ext = path.extname(p).toLowerCase()
  if (!VIDEO_EXTS.includes(ext)) {
    fail(4, `不支持的视频格式：${ext}（仅 mp4）。webm 请先 convert 转 mp4。`)
  }
  const size = fs.statSync(p).size
  if (size > VIDEO_MAX) {
    fail(4, `视频 ${Math.round(size / 1024 / 1024)}MB 超过 50MB 上限。可 convert 压缩后重试。`)
  }

  const buf = fs.readFileSync(p)
  const form = new FormData()
  form.append('purpose', 'assistants')
  form.append('expires_after', '3600') // TTL 兜底：删除失败也不留服务端垃圾
  form.append('file', new Blob([buf], { type: 'video/mp4' }), path.basename(p))

  const t0 = Date.now()
  const upRes = await apiCall('/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  }, TIMEOUTS.upload)
  const upData = await upRes.json()
  const fid = upData?.id
  if (!fid) fail(5, `上传响应缺少 id 字段：${JSON.stringify(upData).slice(0, 500)}`)

  try {
    const payload = {
      model: opts.model,
      store: false,
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: readPrompt(opts) },
          { type: 'input_file', file_id: fid },
        ],
      }],
    }
    const res = await apiCall('/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, TIMEOUTS.analyze)
    const data = await res.json()
    const text = extractText(data)
    const out = { ok: true, text, duration_ms: Date.now() - t0 }
    if (opts.keep) out.file_id = fid // 仅 --keep 时有意义（追问复用），默认已删
    if (opts.json) console.log(JSON.stringify(out))
    else console.log(text)
  } finally {
    if (!opts.keep) {
      // 删除失败必须显式提示（残余 file_id 可手动清理），不静默
      try {
        const del = await fetch(`${API}/files/${fid}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(TIMEOUTS.delete),
        })
        if (!del.ok) console.error(`grok-vision: 删除服务端文件 ${fid} 失败（HTTP ${del.status}），可手动调用 DELETE ${API}/files/${fid} 清理`)
      } catch (e) {
        const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
        console.error(`grok-vision: 删除服务端文件 ${fid} 失败（${isTimeout ? '网络超时' : e.message}），可手动调用 DELETE ${API}/files/${fid} 清理`)
      }
    }
  }
}

// ---------- convert：ffmpeg 包装（仅格式转换，零缩放零裁剪） ----------
// 注意：Windows 下 WinGet 的 ffmpeg 是 0 字节 AppExecutionAlias，node 直接
// CreateProcess 无法解析（status 异常），必须走 shell 模式（实测通过）。

function shellQuote(s) {
  return `"${String(s).replace(/"/g, '""')}"`
}

function cmdConvert(src, dst) {
  const sp = path.resolve(src)
  if (!fs.existsSync(sp)) fail(1, `文件不存在：${sp}`)
  const r = spawnSync(`ffmpeg -hide_banner -loglevel error -y -i ${shellQuote(sp)} ${shellQuote(path.resolve(dst))}`, { stdio: 'inherit', shell: true })
  if (r.error) fail(1, `无法执行 ffmpeg：${r.error.message}`)
  process.exit(r.status ?? 1)
}

// ---------- check：环境自检 ----------

function binOk(name) {
  try {
    const flag = name === 'ffmpeg' ? '-version' : '--version'
    const r = spawnSync(`${name} ${flag}`, { stdio: 'ignore', shell: true })
    return !r.error && r.status === 0
  } catch {
    return false
  }
}

function cmdCheck(opts) {
  const home = process.env.GROK_HOME || os.homedir()
  const authPath = path.join(home, '.grok', 'auth.json')
  const checks = []
  const push = (name, level, ok, info) => checks.push({ name, level, ok, info })

  // credential：required —— image/video 主路径的凭据，缺了什么都跑不了
  const apiKey = process.env.GROK_API_KEY
  if (apiKey) {
    push('credential', 'required', true, 'GROK_API_KEY 环境变量（长期有效）')
  } else if (fs.existsSync(authPath)) {
    try {
      const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'))
      const entries = Object.entries(auth).filter(([k]) => k.startsWith(AUTH_KEY_PREFIX))
      if (entries.length) {
        const exp = entries[0][1]?.expires_at
        if (exp) {
          const ms = Date.parse(exp) - Date.now()
          push('credential', 'required', ms > 60_000, ms > 60_000 ? `auth.json 有效，剩约 ${Math.max(1, Math.round(ms / 60_000))} 分钟` : `auth.json 已过期（${exp}），请运行 grok -p 'hi' 刷新`)
        } else {
          push('credential', 'required', true, 'auth.json 条目存在（无 expires_at 字段）')
        }
      } else {
        push('credential', 'required', false, `auth.json 无 ${AUTH_KEY_PREFIX} 前缀条目`)
      }
    } catch (e) {
      push('credential', 'required', false, `auth.json 解析失败：${e.message}`)
    }
  } else {
    push('credential', 'required', false, `未设置 GROK_API_KEY 且无 ${authPath}`)
  }
  // grok / ffmpeg：optional —— 缺了只降级可用面（无通道 C / 无 convert），不影响 image/video 主路径
  const grokOk = binOk('grok')
  const ffmpegOk = binOk('ffmpeg')
  push('grok', 'optional', grokOk, grokOk ? '在 PATH' : '不在 PATH（通道 C 不可用）')
  push('ffmpeg', 'optional', ffmpegOk, ffmpegOk ? '在 PATH' : '不在 PATH（convert 不可用）')
  push('model', 'info', true, `默认模型 ${DEFAULT_MODEL}（--model 可覆盖）`)
  push('detail', 'info', true, `image 默认 detail=${DEFAULT_DETAIL}（--detail 可覆盖）`)

  const requiredOk = checks.filter((c) => c.level === 'required').every((c) => c.ok)
  const optionalOk = checks.filter((c) => c.level === 'optional').every((c) => c.ok)
  const unavailable = []
  if (!grokOk) unavailable.push('channel-c')
  if (!ffmpegOk) unavailable.push('convert')

  const out = { ok: requiredOk, ready: ['image', 'video'], unavailable, checks, model: DEFAULT_MODEL, detail: DEFAULT_DETAIL }
  if (opts.json) {
    console.log(JSON.stringify(out))
  } else {
    for (const c of checks) {
      const mark = c.ok ? '✓' : c.level === 'required' ? '✗' : '○'
      console.log(`${mark} ${c.name}: ${c.info}`)
    }
    console.log(`ready: ${out.ready.join(', ')}${unavailable.length ? `\nunavailable: ${unavailable.join(', ')}` : ''}`)
  }

  // 退出码：required 挂 2（与运行时凭据错误一致）；--strict 且 optional 挂 1；默认 0
  if (!requiredOk) process.exit(2)
  if (opts.strict && !optionalOk) process.exit(1)
  process.exit(0)
}

// ---------- 入口 ----------

const args = process.argv.slice(2)
const cmd = args[0]
if (!cmd || cmd === '--help' || cmd === '-h') {
  usage()
  process.exit(cmd ? 0 : 1)
}

if (cmd === 'convert') {
  // convert 只接受两个位置参数，不走 flag 解析
  if (args.length !== 3) fail(1, 'convert 用法：node grok-vision.mjs convert <src> <dst>')
  cmdConvert(args[1], args[2])
}

const opts = {
  files: [],
  model: DEFAULT_MODEL,
  detail: DEFAULT_DETAIL,
  json: false,
  keep: false,
  strict: false,
  prompt: undefined,
  promptFile: undefined,
}
for (let i = 1; i < args.length; i++) {
  const a = args[i]
  switch (a) {
    case '--file':
      if (!args[++i]) fail(1, '--file 缺少值')
      opts.files.push(args[i])
      break
    case '--prompt':
      if (!args[++i]) fail(1, '--prompt 缺少值')
      opts.prompt = args[i]
      break
    case '--prompt-file':
      if (!args[++i]) fail(1, '--prompt-file 缺少值')
      opts.promptFile = args[i]
      break
    case '--model':
      if (!args[++i]) fail(1, '--model 缺少值')
      opts.model = args[i]
      break
    case '--detail': {
      if (!args[++i]) fail(1, '--detail 缺少值')
      const d = String(args[i]).toLowerCase()
      if (!DETAIL_VALUES.includes(d)) fail(1, `--detail 仅支持 ${DETAIL_VALUES.join(' / ')}，收到：${args[i]}`)
      opts.detail = d
      break
    }
    case '--json':
      opts.json = true
      break
    case '--keep':
      opts.keep = true
      break
    case '--strict':
      opts.strict = true
      break
    default:
      fail(1, `未知参数：${a}`)
  }
}

switch (cmd) {
  case 'image': {
    const { token } = loadToken()
    await cmdImage(opts, token)
    break
  }
  case 'video': {
    const { token } = loadToken()
    await cmdVideo(opts, token)
    break
  }
  case 'check':
    cmdCheck(opts)
    break
  default:
    fail(1, `未知子命令：${cmd}`)
}
