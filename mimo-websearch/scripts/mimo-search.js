#!/usr/bin/env node

/**
 * MiMo Web Search — 开箱即用的 MiMo 联网搜索 CLI
 *
 * 用法:
 *   mimo-search "查询内容"
 *   mimo-search "查询内容" -k 10 -l 10
 *   mimo-search "查询内容" --json
 *   mimo-search config
 *   mimo-search config set key sk-xxx
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const DEFAULT_MODEL = 'mimo-v2.5-pro';

// ─── 配置 ───────────────────────────────────────────

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

function maskKey(key) {
  if (!key || key.length < 8) return '(未设置)';
  return key.slice(0, 5) + '***' + key.slice(-4);
}

// ─── API 调用 ───────────────────────────────────────

function callApi(query, options) {
  const body = JSON.stringify({
    model: options.model,
    messages: [{ role: 'user', content: query }],
    tools: [{
      type: 'web_search',
      max_keyword: options.maxKeyword,
      force_search: true,
      limit: options.limit
    }],
    max_completion_tokens: options.maxTokens,
    temperature: 1.0,
    top_p: 0.95,
    stream: false,
    thinking: { type: 'disabled' }
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.xiaomimimo.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': options.apiKey,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error('解析响应失败: ' + data.slice(0, 200)));
        }
      });
    });

    req.on('error', (e) => reject(new Error('网络错误: ' + e.message)));
    req.write(body);
    req.end();
  });
}

// ─── 输出格式化 ─────────────────────────────────────

function formatResult(response, outputOpts) {
  const message = response.choices?.[0]?.message;
  if (!message) return '未获取到搜索结果';

  const annotations = (message.annotations || []).filter(a => a.type === 'url_citation');
  const usage = response.usage?.web_search_usage;

  let output = '';

  if (outputOpts.json) {
    return JSON.stringify({
      content: message.content || '',
      sources: annotations.map(a => ({
        title: a.title,
        url: a.url,
        site: a.site_name || '',
        publish_time: a.publish_time || ''
      })),
      usage: usage ? { search_calls: usage.tool_usage, pages_fetched: usage.page_usage } : null
    }, null, 2);
  }

  if (outputOpts.sourcesOnly) {
    annotations.forEach((a, i) => {
      output += `${i + 1}. [${a.title || '无标题'}](${a.url || '#'})\n`;
    });
    return output;
  }

  output += message.content || '无内容';
  output += '\n';

  if (!outputOpts.noSources && annotations.length > 0) {
    output += '\n━━━ 信息来源 ━━━\n';
    annotations.forEach((a, i) => {
      output += `${i + 1}. [${a.title || '无标题'}](${a.url || '#'})`;
      if (a.site_name) output += ` — ${a.site_name}`;
      output += '\n';
    });
  }

  if (usage) {
    output += `\n搜索 ${usage.tool_usage} 次 · 抓取 ${usage.page_usage} 页`;
  }

  return output;
}

// ─── Config 命令 ────────────────────────────────────

function handleConfig(args) {
  const sub = args[0];

  if (sub === 'set' && args[1] && args[2]) {
    const config = loadConfig();
    config[args[1]] = args[2];
    saveConfig(config);
    const displayVal = args[1] === 'api_key' ? maskKey(args[2]) : args[2];
    console.log(`已设置 ${args[1]}: ${displayVal}`);
    return;
  }

  if (sub === 'path') {
    console.log(CONFIG_PATH);
    return;
  }

  // 默认：显示配置
  const config = loadConfig();
  console.log('配置文件:', CONFIG_PATH);
  console.log('api_key:', maskKey(config.api_key));
  console.log('model:  ', config.model || DEFAULT_MODEL);
  console.log('');
  console.log('设置 Key: mimo-search config set api_key sk-xxx');
  console.log('设置模型: mimo-search config set model mimo-v2.5-pro');
}

// ─── 帮助 ───────────────────────────────────────────

function showHelp() {
  console.log(`MiMo Web Search — 小米 MiMo 联网搜索 CLI

用法:
  mimo-search <查询内容> [选项]
  mimo-search config [set <key> <value> | path]

选项:
  -k, --max-keyword <n>  最大关键词数 (默认: 5)
  -l, --limit <n>        返回结果数 (默认: 5)
  -t, --max-tokens <n>   回复最大 token (默认: 2048)
  -m, --model <name>     模型 (默认: mimo-v2.5-pro)
  --json                 原始 JSON 输出
  --sources-only         仅输出来源列表
  --no-sources           隐藏来源

示例:
  mimo-search "今天天气怎么样"
  mimo-search "最新 AI 新闻" -k 3 -l 3
  mimo-search "股价" --json
  mimo-search config
  mimo-search config set api_key sk-xxx

API Key:
  优先级: 环境变量 MIMO_API_KEY > config.json
  首次使用: mimo-search config set api_key sk-xxx`);
}

// ─── 参数解析 ───────────────────────────────────────

function parseArgs(argv) {
  const args = { _: [], query: '' };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-k' || a === '--max-keyword') { args.maxKeyword = parseInt(argv[++i]); continue; }
    if (a === '-l' || a === '--limit') { args.limit = parseInt(argv[++i]); continue; }
    if (a === '-t' || a === '--max-tokens') { args.maxTokens = parseInt(argv[++i]); continue; }
    if (a === '-m' || a === '--model') { args.model = argv[++i]; continue; }
    if (a === '--json') { args.json = true; continue; }
    if (a === '--sources-only') { args.sources = true; continue; }
    if (a === '--no-sources') { args.noSources = true; continue; }
    if (a === '-h' || a === '--help') { args.help = true; continue; }
    args._.push(a);
  }

  args.query = args._.join(' ');
  return args;
}

// ─── 主入口 ─────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);

  // 无参数或帮助
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    showHelp();
    process.exit(0);
  }

  // Config 子命令
  if (argv[0] === 'config') {
    handleConfig(argv.slice(1));
    process.exit(0);
  }

  // 解析参数
  const args = parseArgs(argv);

  if (!args.query) {
    console.log('请提供搜索内容');
    process.exit(1);
  }

  // 加载配置
  const config = loadConfig();
  const apiKey = process.env.MIMO_API_KEY || config.api_key;

  if (!apiKey) {
    console.log('未检测到 MiMo API Key。请通过以下方式设置:\n');
    console.log(`  mimo-search config set api_key sk-xxx`);
    console.log(`  或设置环境变量: export MIMO_API_KEY="sk-xxx"\n`);
    console.log(`配置文件: ${CONFIG_PATH}`);
    process.exit(1);
  }

  const options = {
    apiKey,
    model: args.model || config.model || DEFAULT_MODEL,
    maxKeyword: args.maxKeyword || 5,
    limit: args.limit || 5,
    maxTokens: args.maxTokens || 2048
  };

  try {
    const result = await callApi(args.query, options);
    const output = formatResult(result, {
      json: args.json,
      sourcesOnly: args.sources,
      noSources: args.noSources
    });
    console.log(output);
  } catch (e) {
    console.error('搜索失败:', e.message);
    process.exit(1);
  }
}

main();
