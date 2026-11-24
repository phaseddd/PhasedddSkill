#!/usr/bin/env node

// src/index.ts
import path from "node:path";
import { fileURLToPath } from "node:url";

// src/config/schema.ts
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// src/config/pricing.ts
function rate(inputPerMillion, cachedInputPerMillion, outputPerMillion) {
  return { inputPerMillion, cachedInputPerMillion, outputPerMillion };
}
var codexRate = rate(1.75, 0.175, 14);
var gpt5Rate = rate(1.25, 0.125, 10);
var codexMiniRate = rate(1.5, 0.375, 6);
var gpt6SolRate = rate(2, 0.2, 10);
var deepseekFlashRate = rate(0.15, 3e-3, 0.6);
var deepseekV32Rate = rate(0.28, 0.028, 0.42);
var BUILTIN_PRICING = {
  "gpt-6": gpt6SolRate,
  "gpt-6-sol": gpt6SolRate,
  "gpt-6-astra": rate(10, 1, 50),
  "gpt-6-luna": rate(0.1, 0.01, 0.5),
  "gpt-6.1-sol": rate(2, 0.1, 10),
  "gpt-6.1-terra": rate(1, 0.05, 5),
  "gpt-6.2-astra": rate(8, 0.4, 40),
  "gpt-6.2-sol": rate(2, 0.1, 10),
  "gpt-5.6-sol": rate(4, 0.4, 20),
  "gpt-5.6-terra": rate(2, 0.2, 12),
  "gpt-5.6-luna": rate(0.2, 0.02, 1.2),
  "gpt-5.5": rate(5, 0.5, 30),
  "gpt-5.5-pro": rate(30, 30, 180),
  "gpt-5.4": rate(2.5, 0.25, 15),
  "gpt-5.4-pro": rate(30, 30, 180),
  "gpt-5.4-mini": rate(0.75, 0.075, 4.5),
  "gpt-5.4-nano": rate(0.2, 0.02, 1.25),
  "gpt-5.3": codexRate,
  "gpt-5.3-codex": codexRate,
  "gpt-5.2": codexRate,
  "gpt-5.2-codex": codexRate,
  "gpt-5.2-pro": rate(21, 21, 168),
  "gpt-5.1": gpt5Rate,
  "gpt-5.1-codex-mini": rate(0.25, 0.025, 2),
  "gpt-5": gpt5Rate,
  "gpt-5-pro": rate(15, 15, 120),
  "gpt-5-mini": rate(0.25, 0.025, 2),
  "gpt-5-nano": rate(0.05, 5e-3, 0.4),
  o3: rate(2, 0.5, 8),
  "o3-mini": rate(1.1, 0.55, 4.4),
  "o3-pro": rate(20, 20, 80),
  "o4-mini": rate(1.1, 0.275, 4.4),
  codex: codexRate,
  "codex-mini": codexMiniRate,
  "codex-mini-latest": codexMiniRate,
  "gpt-5-codex": gpt5Rate,
  "gpt-5.1-codex": gpt5Rate,
  "gpt-5.1-codex-max": gpt5Rate,
  "claude-opus": rate(5, 0.5, 25),
  "claude-opus-4": rate(15, 1.5, 75),
  "claude-opus-4-5": rate(5, 0.5, 25),
  "claude-opus-4-6": rate(5, 0.5, 25),
  "claude-opus-4-7": rate(5, 0.5, 25),
  "claude-opus-4-8": rate(5, 0.5, 25),
  "claude-opus-5-5": rate(4, 0.2, 20),
  "claude-sonnet": rate(3, 0.3, 15),
  "claude-sonnet-5": rate(2, 0.2, 10),
  "claude-sonnet-5-5": rate(2, 0.1, 10),
  "claude-haiku": rate(1, 0.1, 5),
  "claude-haiku-5-5": rate(0.1, 0.01, 0.5),
  "claude-3-opus": rate(15, 1.5, 75),
  "claude-3-5-sonnet": rate(3, 0.3, 15),
  "claude-3-7-sonnet": rate(3, 0.3, 15),
  "claude-3-5-haiku": rate(0.8, 0.08, 4),
  "claude-3-haiku": rate(0.25, 0.03, 1.25),
  "gemini-2.5-pro": rate(1.25, 0.125, 10),
  "gemini-2.5-flash": rate(0.3, 0.03, 2.5),
  "gemini-2.5-flash-lite": rate(0.1, 0.01, 0.4),
  // DeepSeek exposes peak and off-peak prices. The estimate uses off-peak rates.
  deepseek: deepseekFlashRate,
  "deepseek-flash": deepseekFlashRate,
  "deepseek-v4-flash": deepseekFlashRate,
  "deepseek-v4-pro": rate(0.66, 0.022, 1.98),
  "deepseek-v3.2": deepseekV32Rate,
  "deepseek-chat": deepseekV32Rate,
  "deepseek-reasoner": deepseekV32Rate
};
function nonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function isModelPriceRate(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value;
  return nonNegativeNumber(candidate.inputPerMillion) && nonNegativeNumber(candidate.cachedInputPerMillion) && nonNegativeNumber(candidate.outputPerMillion);
}
function modelKey(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[\s_\u2010-\u2015]+/g, "-").replace(/(claude-(?:(?:opus|sonnet|haiku)-)?\d+)\.(?=\d)/g, "$1-");
}
var builtinEntries = Object.entries(BUILTIN_PRICING);
function longestMatch(modelId, displayName, entries) {
  let best = null;
  let bestLength = 0;
  let bestRank = 0;
  for (const [key, price] of entries) {
    if (!key || key.length < bestLength) continue;
    const rank = modelId === key ? 4 : modelId.startsWith(key) ? 3 : modelId.includes(key) ? 2 : displayName.includes(key) ? 1 : 0;
    if (rank === 0 || key.length === bestLength && rank <= bestRank) continue;
    best = price;
    bestLength = key.length;
    bestRank = rank;
  }
  return best;
}
function resolveModelPrice(modelId, displayName, overrides) {
  const id = modelKey(modelId);
  const name = modelKey(displayName);
  const overrideEntries = Object.entries(overrides ?? {}).filter(([, price]) => isModelPriceRate(price)).map(([key, price]) => [modelKey(key), price]);
  return longestMatch(id, name, overrideEntries) ?? longestMatch(id, name, builtinEntries);
}
function estimateTokenCostUsd(usage, rate2) {
  if (!usage || !isModelPriceRate(rate2)) return null;
  const tokens = (value) => nonNegativeNumber(value) ? value : 0;
  const input = tokens(usage.other_input_tokens) + tokens(usage.cache_write_input_tokens);
  const cached = tokens(usage.cache_read_input_tokens);
  const output = tokens(usage.output_tokens);
  if (input === 0 && cached === 0 && output === 0) return null;
  const cost = input / 1e6 * rate2.inputPerMillion + cached / 1e6 * rate2.cachedInputPerMillion + output / 1e6 * rate2.outputPerMillion;
  return Number.isFinite(cost) ? cost : null;
}

// src/config/schema.ts
var SKINS = ["editorial", "pill", "plain"];
var PALETTES = [
  "gruvbox-light",
  "gruvbox-dark",
  "catppuccin-latte",
  "catppuccin-mocha",
  "tokyo-night",
  "rose-pine",
  "nord",
  "terminal"
];
var GLYPHS = ["nerd", "unicode", "ascii"];
var PERCENT_MODES = ["used", "remaining"];
var DEFAULT_CONFIG = Object.freeze({
  skin: "editorial",
  palette: "gruvbox-dark",
  glyphs: "nerd",
  percentMode: "used",
  barWidth: 10,
  quotaBarWidth: 7,
  modules: Object.freeze({
    git: true,
    cache: true,
    sparkline: true,
    cost: true,
    todayCost: true,
    timer: true,
    tps: true,
    quotas: true
  }),
  pricingOverrides: Object.freeze({})
});
function getConfigPath() {
  return process.env.CODEX_COMETIX_CONFIG || join(homedir(), ".codex", "cometix-statusline.json");
}
function object(value) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return void 0;
}
function select(value, allowed, fallback) {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}
function width(value, fallback) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
function normalizeConfig(raw) {
  const config = object(raw);
  if (!config) return DEFAULT_CONFIG;
  const rawModules = object(config.modules);
  const modules = { ...DEFAULT_CONFIG.modules };
  for (const key of Object.keys(modules)) {
    const enabled = rawModules?.[key];
    if (typeof enabled === "boolean") modules[key] = enabled;
  }
  const overrides = Object.entries(object(config.pricingOverrides) ?? {}).flatMap(([key, value]) => {
    if (!key.trim() || !isModelPriceRate(value)) return [];
    const { inputPerMillion, cachedInputPerMillion, outputPerMillion } = value;
    return [[key.trim(), { inputPerMillion, cachedInputPerMillion, outputPerMillion }]];
  });
  return {
    skin: select(config.skin, SKINS, DEFAULT_CONFIG.skin),
    palette: select(config.palette, PALETTES, DEFAULT_CONFIG.palette),
    glyphs: select(config.glyphs, GLYPHS, DEFAULT_CONFIG.glyphs),
    percentMode: select(config.percentMode, PERCENT_MODES, DEFAULT_CONFIG.percentMode),
    barWidth: width(config.barWidth, DEFAULT_CONFIG.barWidth),
    quotaBarWidth: width(config.quotaBarWidth, DEFAULT_CONFIG.quotaBarWidth),
    modules,
    pricingOverrides: Object.fromEntries(overrides)
  };
}
var ConfigLoader = class {
  filePath;
  fileVersion;
  config = DEFAULT_CONFIG;
  constructor(filePath = getConfigPath()) {
    this.filePath = filePath;
  }
  get() {
    try {
      const stat2 = statSync(this.filePath, { bigint: true, throwIfNoEntry: false });
      if (stat2?.isFile()) {
        const version = `${stat2.mtimeNs}/${stat2.ctimeNs}/${stat2.ino}/${stat2.size}`;
        if (version !== this.fileVersion) {
          this.fileVersion = version;
          try {
            const json = readFileSync(this.filePath, "utf8").replace(/^\uFEFF/, "");
            this.config = normalizeConfig(JSON.parse(json));
          } catch {
            this.config = DEFAULT_CONFIG;
          }
        }
        return this.config;
      }
    } catch {
    }
    this.fileVersion = void 0;
    this.config = DEFAULT_CONFIG;
    return this.config;
  }
};

// src/collectors/git.ts
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var EMPTY_STATUS = {
  branch: "",
  detached: false,
  dirty: false,
  staged: false,
  untracked: false,
  ahead: 0,
  behind: 0
};
function parseGitPorcelainV2(stdout) {
  const status = { ...EMPTY_STATUS };
  const nulTerminated = stdout.includes("\0");
  let oid = "";
  let skipOriginalPath = false;
  for (const line of stdout.split(nulTerminated ? "\0" : /\r?\n/)) {
    if (skipOriginalPath) {
      skipOriginalPath = false;
    } else if (line.startsWith("# branch.head ")) {
      status.branch = line.slice(14).trimEnd();
      status.detached = status.branch === "(detached)";
    } else if (line.startsWith("# branch.oid ")) {
      oid = line.slice(13).trimEnd();
    } else if (line.startsWith("# branch.ab ")) {
      const counts = /\+(\d+) -(\d+)/.exec(line);
      if (counts) [status.ahead, status.behind] = [Number(counts[1]), Number(counts[2])];
    } else if (line.startsWith("? ")) {
      status.untracked = true;
    } else if (line.startsWith("u ")) {
      status.dirty = true;
    } else if (/^[12] [^ ]{2} /.test(line)) {
      status.staged ||= line[2] !== ".";
      status.dirty ||= line[3] !== ".";
      skipOriginalPath = nulTerminated && line[0] === "2";
    }
  }
  if (status.detached) status.branch = /^[0-9a-f]+$/i.test(oid) ? oid.slice(0, 7) : "HEAD";
  return status;
}
function parseGitShortStat(stdout) {
  return {
    added: Number(/(\d+) insertions?\(\+\)/.exec(stdout)?.[1] ?? 0),
    deleted: Number(/(\d+) deletions?\(-\)/.exec(stdout)?.[1] ?? 0)
  };
}
var GitCollector = class {
  entries = /* @__PURE__ */ new Map();
  ttlMs;
  timeoutMs;
  disposed = false;
  constructor(options = {}) {
    this.ttlMs = options.ttlMs ?? 4e3;
    this.timeoutMs = options.timeoutMs ?? 1500;
  }
  get(cwd, nowMs) {
    if (!cwd || this.disposed) return null;
    let entry = this.entries.get(cwd);
    if (!entry) {
      entry = { snapshot: null, expiresAt: -Infinity, refreshing: false };
      this.entries.set(cwd, entry);
    }
    if (!entry.refreshing && (nowMs ?? Date.now()) >= entry.expiresAt) {
      entry.refreshing = true;
      const capturedEntry = entry;
      setImmediate(() => {
        if (!this.disposed) void this.refresh(cwd, capturedEntry, nowMs);
      });
    }
    return entry.snapshot;
  }
  dispose() {
    this.disposed = true;
    for (const entry of this.entries.values()) entry.controller?.abort();
    this.entries.clear();
  }
  async refresh(cwd, entry, nowMs) {
    const controller = new AbortController();
    entry.controller = controller;
    const run = async (...args) => {
      const { stdout } = await execFileAsync("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", ...args], {
        cwd,
        windowsHide: true,
        timeout: this.timeoutMs,
        signal: controller.signal,
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, LC_ALL: "C", LANGUAGE: "C" }
      });
      return stdout;
    };
    try {
      const stdout = await run("status", "--porcelain=v2", "--branch", "--untracked-files=normal", "-z");
      const status = parseGitPorcelainV2(stdout);
      const [worktree, changes] = await Promise.all([
        run("rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir").then((paths) => {
          const [gitDir, commonDir] = paths.trimEnd().split(/\r?\n/);
          return Boolean(gitDir && commonDir && resolve(cwd, gitDir) !== resolve(cwd, commonDir));
        }).catch(() => entry.snapshot?.worktree ?? false),
        this.collectChanges(run, stdout.includes("# branch.oid (initial)"), status).catch(() => ({ added: entry.snapshot?.added ?? 0, deleted: entry.snapshot?.deleted ?? 0 }))
      ]);
      if (!controller.signal.aborted) {
        entry.snapshot = { isRepo: true, ...status, ...changes, worktree, updatedAt: nowMs ?? Date.now() };
      }
    } catch (error2) {
      const failure = error2;
      if (!controller.signal.aborted && (!entry.snapshot || failure.code === "ENOENT" || failure.stderr?.includes("not a git repository"))) {
        entry.snapshot = {
          isRepo: false,
          ...EMPTY_STATUS,
          added: 0,
          deleted: 0,
          worktree: false,
          updatedAt: nowMs ?? Date.now()
        };
      }
    } finally {
      entry.expiresAt = (nowMs ?? Date.now()) + this.ttlMs;
      entry.controller = void 0;
      entry.refreshing = false;
    }
  }
  async collectChanges(run, unborn, status) {
    if (!status.dirty && !status.staged) return { added: 0, deleted: 0 };
    const diff = ["diff", "--no-ext-diff", "--no-textconv", "--shortstat"];
    if (!unborn) return parseGitShortStat(await run(...diff, "HEAD", "--"));
    const [staged, unstaged] = await Promise.all([
      status.staged ? run(...diff, "--cached", "--").then(parseGitShortStat) : { added: 0, deleted: 0 },
      status.dirty ? run(...diff, "--").then(parseGitShortStat) : { added: 0, deleted: 0 }
    ]);
    return { added: staged.added + unstaged.added, deleted: staged.deleted + unstaged.deleted };
  }
};

// src/collectors/ledger.ts
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync as readFileSync2, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { basename, dirname, join as join2, resolve as resolve2 } from "node:path";
var WRITE_DELAY_MS = 150;
var REFRESH_INTERVAL_MS = 4e3;
var STALE_LOCK_MS = 6e4;
function getLedgerPath() {
  return process.env.CODEX_COMETIX_LEDGER || join2(homedir2(), ".codex", "cometix-ledger.json");
}
function localDateKey(nowMs = Date.now()) {
  const timestamp = new Date(nowMs);
  const date = Number.isNaN(timestamp.getTime()) ? /* @__PURE__ */ new Date() : timestamp;
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function decodeLedger(text) {
  const days = /* @__PURE__ */ new Map();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return days;
  }
  if (!isObject(data)) return days;
  for (const [day, entries] of Object.entries(data)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isObject(entries)) continue;
    const threads = /* @__PURE__ */ new Map();
    for (const [thread, cost] of Object.entries(entries)) {
      if (thread && typeof cost === "number" && Number.isFinite(cost) && cost > 0) threads.set(thread, cost);
    }
    if (threads.size) days.set(day, threads);
  }
  return days;
}
function codeOf(error2) {
  return error2?.code;
}
function readOptional(action, fallback) {
  try {
    return action();
  } catch (error2) {
    if (codeOf(error2) !== "ENOENT") throw error2;
    return fallback;
  }
}
async function readOptionalAsync(action, fallback) {
  try {
    return await action();
  } catch (error2) {
    if (codeOf(error2) !== "ENOENT") throw error2;
    return fallback;
  }
}
function quiet(action) {
  try {
    action();
  } catch {
  }
}
var CostLedger = class {
  filePath;
  directory;
  lockPath;
  pendingPrefix;
  days = /* @__PURE__ */ new Map();
  total;
  revision = 0;
  savedRevision = 0;
  timer;
  writing = false;
  lastDiskRead = Date.now();
  constructor(filePath = getLedgerPath()) {
    this.filePath = resolve2(filePath);
    this.directory = dirname(this.filePath);
    this.lockPath = `${this.filePath}.lock`;
    this.pendingPrefix = `${basename(this.filePath)}.`;
    quiet(() => {
      this.mergeFromDiskSync();
    });
  }
  record(threadId, sessionCostUsd, nowMs = Date.now()) {
    if (threadId && Number.isFinite(sessionCostUsd) && sessionCostUsd > 0 && this.setCheckpoint(localDateKey(nowMs), threadId, sessionCostUsd)) {
      this.revision += 1;
      this.scheduleWrite();
    }
    return this.getTodayTotal(nowMs);
  }
  getTodayTotal(nowMs = Date.now()) {
    const now = Date.now();
    if (!this.writing && !this.timer && now - this.lastDiskRead >= REFRESH_INTERVAL_MS) {
      this.lastDiskRead = now;
      void this.mergeFromDisk().catch(() => {
      });
    }
    const day = localDateKey(nowMs);
    if (day === this.total?.day) return this.total.cost;
    const previous = /* @__PURE__ */ new Map();
    const today = this.days.get(day);
    let cost = 0;
    if (today) {
      for (const [pastDay, threads] of this.days) {
        if (pastDay >= day) continue;
        for (const [thread, amount] of threads) {
          if (today.has(thread) && amount > (previous.get(thread) ?? 0)) previous.set(thread, amount);
        }
      }
      for (const [thread, amount] of today) cost += Math.max(0, amount - (previous.get(thread) ?? 0));
    }
    this.total = { day, cost };
    return cost;
  }
  flushSync() {
    clearTimeout(this.timer);
    this.timer = void 0;
    if (this.savedRevision === this.revision) return;
    let locked = false;
    let temporary;
    try {
      mkdirSync(this.directory, { recursive: true });
      try {
        mkdirSync(this.lockPath);
        locked = true;
      } catch (error2) {
        if (codeOf(error2) !== "EEXIST") throw error2;
      }
      const pending = locked ? this.mergeFromDiskSync() : [];
      const target = locked ? this.filePath : `${this.filePath}.${process.pid}-${randomUUID()}.pending`;
      temporary = `${target}.${randomUUID()}.tmp`;
      writeFileSync(temporary, this.serialize(), { flag: "wx", mode: 384 });
      renameSync(temporary, target);
      temporary = void 0;
      this.savedRevision = this.revision;
      for (const path2 of pending) quiet(() => unlinkSync(path2));
    } catch {
      this.scheduleWrite();
    } finally {
      if (temporary) quiet(() => unlinkSync(temporary));
      if (locked) quiet(() => rmdirSync(this.lockPath));
    }
  }
  setCheckpoint(day, thread, cost) {
    let threads = this.days.get(day);
    if (!threads) {
      threads = /* @__PURE__ */ new Map();
      this.days.set(day, threads);
    }
    if (cost <= (threads.get(thread) ?? 0)) return false;
    threads.set(thread, cost);
    this.total = void 0;
    return true;
  }
  merge(text) {
    for (const [day, threads] of decodeLedger(text)) {
      for (const [thread, cost] of threads) this.setCheckpoint(day, thread, cost);
    }
  }
  pendingFiles(names) {
    return names.filter((name) => name.startsWith(this.pendingPrefix) && /^\d+-[0-9a-f-]{36}\.pending$/.test(name.slice(this.pendingPrefix.length))).map((name) => join2(this.directory, name));
  }
  mergeFromDiskSync() {
    const pending = this.pendingFiles(readOptional(() => readdirSync(this.directory), []));
    for (const path2 of pending) this.merge(readOptional(() => readFileSync2(path2, "utf8"), ""));
    this.merge(readOptional(() => readFileSync2(this.filePath, "utf8"), ""));
    this.lastDiskRead = Date.now();
    return pending;
  }
  async mergeFromDisk() {
    const pending = this.pendingFiles(await readOptionalAsync(() => readdir(this.directory), []));
    const records = await Promise.all(pending.map((path2) => readOptionalAsync(() => readFile(path2, "utf8"), "")));
    for (const record2 of records) this.merge(record2);
    this.merge(await readOptionalAsync(() => readFile(this.filePath, "utf8"), ""));
    this.lastDiskRead = Date.now();
    return pending;
  }
  serialize() {
    const entries = Array.from(this.days, ([day, threads]) => [day, Object.fromEntries(threads)]);
    return `${JSON.stringify(Object.fromEntries(entries))}
`;
  }
  scheduleWrite() {
    if (this.writing || this.timer || this.savedRevision === this.revision) return;
    this.timer = setTimeout(() => {
      this.timer = void 0;
      void this.persist();
    }, WRITE_DELAY_MS);
    this.timer.unref();
  }
  async persist() {
    let locked = false;
    let temporary;
    this.writing = true;
    try {
      await mkdir(this.directory, { recursive: true });
      try {
        await mkdir(this.lockPath);
      } catch (error2) {
        if (codeOf(error2) !== "EEXIST") throw error2;
        const lock = await stat(this.lockPath);
        if (Date.now() - lock.mtimeMs >= STALE_LOCK_MS) await rmdir(this.lockPath);
        return;
      }
      locked = true;
      const pending = await this.mergeFromDisk();
      const revision = this.revision;
      temporary = `${this.filePath}.${process.pid}-${randomUUID()}.tmp`;
      await writeFile(temporary, this.serialize(), { flag: "wx", mode: 384 });
      await rename(temporary, this.filePath);
      temporary = void 0;
      this.savedRevision = Math.max(this.savedRevision, revision);
      await Promise.all(pending.map((path2) => unlink(path2).catch(() => {
      })));
    } catch {
    } finally {
      if (temporary) await unlink(temporary).catch(() => {
      });
      if (locked) await rmdir(this.lockPath).catch(() => {
      });
      this.writing = false;
      this.scheduleWrite();
    }
  }
};

// src/config/models-cache.ts
import { readFileSync as readFileSync3, statSync as statSync2 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { join as join3 } from "node:path";
function normalizeModelKey(value) {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/(claude-(?:opus|sonnet|haiku)-\d+)\.(?=\d)/g, "$1-");
}
function isNonNegNum(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}
function extractPriceRate(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return void 0;
  const obj = raw;
  if (isNonNegNum(obj.inputPerMillion) && isNonNegNum(obj.cachedInputPerMillion) && isNonNegNum(obj.outputPerMillion)) {
    return {
      inputPerMillion: obj.inputPerMillion,
      cachedInputPerMillion: obj.cachedInputPerMillion,
      outputPerMillion: obj.outputPerMillion
    };
  }
  const input = obj.input_per_million ?? obj.input_cost_per_million ?? obj.in;
  const cached = obj.cached_input_per_million ?? obj.cache_read_per_million ?? obj.cache ?? input;
  const output = obj.output_per_million ?? obj.output_cost_per_million ?? obj.out;
  if (isNonNegNum(input) && isNonNegNum(cached) && isNonNegNum(output)) {
    return {
      inputPerMillion: input,
      cachedInputPerMillion: cached,
      outputPerMillion: output
    };
  }
  return void 0;
}
function parsePriceTiers(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
  const obj = entry;
  const direct = extractPriceRate(obj);
  if (direct) return [{ untilDate: null, rate: direct }];
  const tiers = [];
  if (Array.isArray(obj.t)) {
    for (const tier of obj.t) {
      if (!Array.isArray(tier) || tier.length < 2) continue;
      const [untilDate, rawRates] = tier;
      const rate2 = extractPriceRate(rawRates);
      if (rate2 && (untilDate === null || typeof untilDate === "string")) {
        tiers.push({ untilDate, rate: rate2 });
      }
    }
  }
  return tiers;
}
function pricingDateKey(nowMs) {
  const shifted = new Date(nowMs - 8 * 60 * 60 * 1e3);
  const valid = Number.isNaN(shifted.getTime()) ? /* @__PURE__ */ new Date() : shifted;
  return valid.toISOString().slice(0, 10);
}
function codexHomeDir() {
  return process.env.CODEX_HOME || join3(homedir3(), ".codex");
}
function getCodexModelsCachePath() {
  return process.env.CODEX_MODELS_CACHE_PATH || join3(codexHomeDir(), "models_cache.json");
}
function getExternalPricesPath() {
  return process.env.CODEX_COMETIX_PRICES || join3(codexHomeDir(), "cometix-prices.json");
}
var LocalModelsRegistry = class {
  modelsCachePath;
  externalPricesPath;
  modelsCacheVer;
  externalPricesVer;
  cachedModels = /* @__PURE__ */ new Map();
  externalPriceTiers = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    this.modelsCachePath = options.modelsCachePath;
    this.externalPricesPath = options.externalPricesPath;
  }
  resolveModelsPath() {
    return this.modelsCachePath ?? getCodexModelsCachePath();
  }
  resolvePricesPath() {
    return this.externalPricesPath ?? getExternalPricesPath();
  }
  refreshModelsCache() {
    const filePath = this.resolveModelsPath();
    try {
      const stat2 = statSync2(filePath, { bigint: true, throwIfNoEntry: false });
      if (!stat2?.isFile()) {
        this.modelsCacheVer = void 0;
        this.cachedModels.clear();
        return;
      }
      const ver = `${filePath}:${stat2.mtimeNs}/${stat2.ctimeNs}/${stat2.ino}/${stat2.size}`;
      if (ver === this.modelsCacheVer) return;
      const parsed = JSON.parse(readFileSync3(filePath, "utf8").replace(/^\uFEFF/, ""));
      const next = /* @__PURE__ */ new Map();
      if (Array.isArray(parsed?.models)) {
        for (const item of parsed.models) {
          if (!item || typeof item !== "object" || Array.isArray(item)) continue;
          const m = item;
          const slug = typeof m.slug === "string" ? m.slug.trim() : "";
          if (!slug) continue;
          const displayName = typeof m.display_name === "string" ? m.display_name.trim() : void 0;
          const contextWindow = typeof m.context_window === "number" && Number.isFinite(m.context_window) && m.context_window > 0 ? m.context_window : void 0;
          const effectiveContextWindowPercent = typeof m.effective_context_window_percent === "number" && Number.isFinite(m.effective_context_window_percent) ? m.effective_context_window_percent : void 0;
          const pricing = extractPriceRate(m.pricing ?? m.cost ?? m.billing);
          const meta = {
            slug,
            displayName,
            contextWindow,
            effectiveContextWindowPercent,
            pricing
          };
          next.set(normalizeModelKey(slug), meta);
          if (displayName) {
            next.set(normalizeModelKey(displayName), meta);
          }
        }
      }
      this.cachedModels = next;
      this.modelsCacheVer = ver;
    } catch {
    }
  }
  refreshExternalPrices() {
    const filePath = this.resolvePricesPath();
    try {
      const stat2 = statSync2(filePath, { bigint: true, throwIfNoEntry: false });
      if (!stat2?.isFile()) {
        this.externalPricesVer = void 0;
        this.externalPriceTiers.clear();
        return;
      }
      const ver = `${filePath}:${stat2.mtimeNs}/${stat2.ctimeNs}/${stat2.ino}/${stat2.size}`;
      if (ver === this.externalPricesVer) return;
      const parsed = JSON.parse(readFileSync3(filePath, "utf8").replace(/^\uFEFF/, ""));
      const sourceMap = parsed && typeof parsed.models === "object" && parsed.models !== null && !Array.isArray(parsed.models) ? parsed.models : parsed;
      const next = /* @__PURE__ */ new Map();
      for (const [key, val] of Object.entries(sourceMap ?? {})) {
        const tiers = parsePriceTiers(val);
        if (tiers.length > 0) {
          next.set(normalizeModelKey(key), tiers);
        }
      }
      this.externalPriceTiers = next;
      this.externalPricesVer = ver;
    } catch {
    }
  }
  resolveModelMetadata(modelId, displayName) {
    this.refreshModelsCache();
    for (const candidate of [modelId, displayName]) {
      if (!candidate) continue;
      const exact = this.cachedModels.get(normalizeModelKey(candidate));
      if (exact) return exact;
    }
    return null;
  }
  getMergedPricingOverrides(userOverrides, nowMs = Date.now()) {
    this.refreshModelsCache();
    this.refreshExternalPrices();
    const merged = {};
    for (const [key, meta] of this.cachedModels.entries()) {
      if (meta.pricing) merged[key] = meta.pricing;
    }
    const todayKey = pricingDateKey(nowMs);
    for (const [key, tiers] of this.externalPriceTiers.entries()) {
      const active = tiers.find((t) => t.untilDate === null || todayKey < t.untilDate);
      if (active) merged[key] = active.rate;
    }
    if (userOverrides) {
      for (const [rawKey, rate2] of Object.entries(userOverrides)) {
        const norm = normalizeModelKey(rawKey);
        if (norm) merged[norm] = rate2;
      }
    }
    return merged;
  }
};

// src/collectors/session-tracker.ts
var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var DAY_MS = 24 * 60 * 60 * 1e3;
var MAX_SAMPLES = 8;
var TPS_SAMPLE_WEIGHT = 0.35;
function clamp(value, max) {
  return Math.min(max, Math.max(0, value));
}
function counter(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function formatResetTime(resetsAtSec, nowMs) {
  const date = new Date(resetsAtSec * 1e3);
  if (Number.isNaN(date.getTime())) return "";
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const time = `${hour}:${minute}`;
  return Math.abs(date.getTime() - nowMs) <= DAY_MS ? time : `${WEEKDAYS[date.getDay()]} ${time}`;
}
function computePaceDeltaPct(usedPct, windowMinutes, resetsAtSec, nowMs) {
  if (windowMinutes === null || windowMinutes <= 0 || !Number.isFinite(windowMinutes) || resetsAtSec === null || !Number.isFinite(resetsAtSec) || !Number.isFinite(nowMs) || !Number.isFinite(usedPct)) {
    return null;
  }
  const windowSec = windowMinutes * 60;
  const elapsed = clamp((windowSec - (resetsAtSec - nowMs / 1e3)) / windowSec, 1);
  return Math.round(usedPct - elapsed * 100);
}
function quotaWindows(snapshot, nowMs) {
  const metrics = [];
  for (const window of [snapshot?.primary_limit, snapshot?.secondary_limit]) {
    if (!window || !Number.isFinite(window.used_percent)) continue;
    const minutes = window.window_minutes;
    const label = minutes === 300 ? "5h" : minutes === 10080 ? "7d" : null;
    if (label === null || minutes === null || metrics.some((metric) => metric.label === label)) continue;
    const usedPct = clamp(window.used_percent, 100);
    const reset = counter(window.resets_at);
    const resetText = reset === null ? null : formatResetTime(reset, nowMs) || null;
    const resetsAt = resetText === null ? null : reset;
    metrics.push({
      label,
      usedPct,
      remainingPct: 100 - usedPct,
      windowMinutes: minutes,
      resetsAt,
      resetText,
      paceDeltaPct: computePaceDeltaPct(usedPct, minutes, resetsAt, nowMs)
    });
  }
  if (metrics[0]?.label === "7d" && metrics.length === 2) metrics.reverse();
  return metrics;
}
function selectQuotas(snapshots, nowMs) {
  if (!Array.isArray(snapshots)) return [];
  let fallback = [];
  for (const snapshot of snapshots) {
    if (fallback.length && snapshot?.limit_id !== "codex") continue;
    const metrics = quotaWindows(snapshot, nowMs);
    if (!metrics.length) continue;
    if (snapshot.limit_id === "codex") return metrics;
    fallback = metrics;
  }
  return fallback;
}
function updateTiming(metrics, active, outputTokens, nowMs) {
  const sample = metrics.outputSample;
  if (!active) {
    metrics.turnStartedAt = null;
    metrics.outputSample = null;
    metrics.outputTps = null;
  } else {
    metrics.turnStartedAt ??= nowMs;
    if (outputTokens === null) {
      metrics.outputSample = null;
      metrics.outputTps = null;
    } else if (!sample || outputTokens < sample.tokens || nowMs < sample.nowMs) {
      metrics.outputSample = { tokens: outputTokens, nowMs };
      metrics.outputTps = null;
    } else if (nowMs > sample.nowMs) {
      const currentTps = (outputTokens - sample.tokens) * 1e3 / (nowMs - sample.nowMs);
      const previousTps = metrics.outputTps;
      metrics.outputTps = previousTps === null ? currentTps : previousTps + (currentTps - previousTps) * TPS_SAMPLE_WEIGHT;
      metrics.outputSample = { tokens: outputTokens, nowMs };
    }
  }
  return {
    turnElapsedSec: metrics.turnStartedAt === null ? null : Math.max(0, (nowMs - metrics.turnStartedAt) / 1e3),
    sessionElapsedSec: Math.max(0, (nowMs - metrics.startedAt) / 1e3),
    outputTps: metrics.outputTps
  };
}
var SessionTracker = class {
  git;
  ledger;
  modelsRegistry;
  threads = /* @__PURE__ */ new Map();
  noThreadTick = 0;
  constructor(options = {}) {
    this.git = options.git ?? new GitCollector();
    this.ledger = options.ledger ?? new CostLedger();
    this.modelsRegistry = options.modelsRegistry ?? new LocalModelsRegistry();
  }
  buildRenderContext(state, config, variant, nowMs = Date.now()) {
    const thread = state.thread;
    const threadId = typeof thread?.id === "string" ? thread.id : "";
    let metrics = this.threads.get(threadId);
    if (threadId && !metrics) {
      metrics = { startedAt: nowMs, turnStartedAt: null, outputSample: null, outputTps: null, samples: [], tick: 0 };
      this.threads.set(threadId, metrics);
    }
    const cachedModel = this.modelsRegistry.resolveModelMetadata(thread?.model?.id, thread?.model?.display_name);
    const context = thread?.usage?.context;
    const usedTokens = counter(context?.used_tokens);
    const windowSize = counter(context?.context_window_size) ?? counter(cachedModel?.contextWindow);
    const tokenPct = windowSize && usedTokens !== null ? usedTokens / windowSize * 100 : null;
    const reportedPct = context?.used_percentage;
    const pct = typeof reportedPct === "number" && Number.isFinite(reportedPct) ? reportedPct : tokenPct;
    const usedPct = pct === null ? null : clamp(pct, 100);
    let deltaTokens = null;
    if (metrics && usedTokens !== null) {
      const previous = metrics.samples.at(-1);
      if (previous !== void 0) deltaTokens = usedTokens - previous;
      if (usedTokens !== previous) {
        metrics.samples.push(usedTokens);
        if (metrics.samples.length > MAX_SAMPLES) metrics.samples.shift();
      }
    }
    const usage = thread?.usage?.total;
    const totalInputTokens = counter(usage?.total_input_tokens) ?? 0;
    const cachedTokens = counter(usage?.cache_read_input_tokens) ?? 0;
    const hitPct = totalInputTokens > 0 ? Math.round(clamp(cachedTokens / totalInputTokens * 100, 100)) : null;
    const nativeCost = counter(thread?.usage?.cost?.total_cost_usd);
    const mergedPricing = this.modelsRegistry.getMergedPricingOverrides(config.pricingOverrides, nowMs);
    const sessionUsd = nativeCost ?? (usage ? estimateTokenCostUsd(
      usage,
      resolveModelPrice(thread?.model?.id, thread?.model?.display_name, mergedPricing)
    ) : null);
    const cost = sessionUsd === null ? null : {
      sessionUsd,
      todayUsd: this.ledger.record(threadId, sessionUsd, nowMs),
      estimated: nativeCost === null
    };
    const runState = thread?.agent?.state;
    const timing = metrics ? updateTiming(metrics, runState === "working" || runState === "thinking", counter(usage?.output_tokens), nowMs) : { turnElapsedSec: null, sessionElapsedSec: 0, outputTps: null };
    return {
      state,
      config,
      variant,
      nowMs,
      git: config.modules.git ? this.git.get(thread?.workspace?.cwd, nowMs) : null,
      context: {
        usedPct,
        remainingPct: usedPct === null ? null : 100 - usedPct,
        usedTokens,
        windowSize,
        sparklineSamples: metrics ? [...metrics.samples] : [],
        deltaTokens
      },
      cache: { hitPct, cachedTokens, totalInputTokens },
      quotas: selectQuotas(state.account?.rate_limits, nowMs),
      cost,
      timing,
      animationTick: metrics ? ++metrics.tick : ++this.noThreadTick
    };
  }
  dispose() {
    this.git.dispose();
    this.ledger.flushSync();
    this.threads.clear();
  }
};

// src/protocol/types.ts
var CODEX_LIMITS = {
  MAX_JSON_BYTES: 64 * 1024,
  MAX_TEXT_BYTES: 16 * 1024,
  MAX_NODES: 256,
  MAX_DEPTH: 16
};
var ENTRYPOINTS = {
  SERVER_NAME: "codex-cometix",
  STANDARD_TOOL: "statusline",
  STANDARD_TITLE: "Cometix Studio \xB7 \u53CC\u884C\u4EEA\u8868\u76D8",
  STANDARD_URI: "ui://codex-cometix/standard",
  WHALE_TOOL: "statusline-whale",
  WHALE_TITLE: "Cometix Studio \xB7 DS\u5927\u80A5\u9C7C\u70ED\u821E\u7248",
  WHALE_URI: "ui://codex-cometix/whale"
};
function inspectUiTree(tree) {
  const json = JSON.stringify(tree);
  const jsonBytes = Buffer.byteLength(json, "utf8");
  if (tree === null) {
    return { nodes: 0, maxDepth: 0, textBytes: 0, jsonBytes, valid: true };
  }
  let nodes = 0;
  let maxDepth = 0;
  let textBytes = 0;
  const stack = [{ node: tree, depth: 0 }];
  while (stack.length > 0) {
    const current = stack.pop();
    nodes += 1;
    if (current.depth > maxDepth) maxDepth = current.depth;
    if (typeof current.node === "string") {
      textBytes += Buffer.byteLength(current.node, "utf8");
      continue;
    }
    if (current.node.type === "row") {
      const gap = current.node.props.gap;
      if (!Number.isSafeInteger(gap) || gap < 0) {
        return {
          nodes,
          maxDepth,
          textBytes,
          jsonBytes,
          valid: false,
          reason: `Invalid row gap: ${String(gap)}`
        };
      }
    }
    for (const child of current.node.children) {
      if (child !== null) {
        stack.push({ node: child, depth: current.depth + 1 });
      }
    }
  }
  if (jsonBytes > CODEX_LIMITS.MAX_JSON_BYTES) {
    return { nodes, maxDepth, textBytes, jsonBytes, valid: false, reason: `JSON ${jsonBytes}B > 64KiB` };
  }
  if (nodes > CODEX_LIMITS.MAX_NODES) {
    return { nodes, maxDepth, textBytes, jsonBytes, valid: false, reason: `Nodes ${nodes} > 256` };
  }
  if (maxDepth > CODEX_LIMITS.MAX_DEPTH) {
    return { nodes, maxDepth, textBytes, jsonBytes, valid: false, reason: `Depth ${maxDepth} > 16` };
  }
  if (textBytes > CODEX_LIMITS.MAX_TEXT_BYTES) {
    return { nodes, maxDepth, textBytes, jsonBytes, valid: false, reason: `Text ${textBytes}B > 16KiB` };
  }
  return { nodes, maxDepth, textBytes, jsonBytes, valid: true };
}

// src/design/glyphs.ts
var NERD_GLYPHS = {
  model: "\uF135",
  // fa-rocket (classic NF v2/v3 core, 100% present in Maple Mono NF CN)
  effort: "\uF0E7",
  // fa-bolt
  dir: "\u{F024B}",
  // md-folder (verified rendered in Maple Mono NF CN)
  git: "\u{F02A2}",
  // md-git
  gitClean: "\u2713",
  gitDirty: "\u25CF",
  gitStaged: "+",
  gitUntracked: "?",
  ahead: "\u2191",
  behind: "\u2193",
  cache: "\uF1C0",
  // fa-database
  quota5h: "\u{F0520}",
  // md-timer-outline
  quota7d: "\uF073",
  // fa-calendar
  cost: "\uF0D6",
  // fa-money (classic NF core, avoids double '$' next to $0.42)
  today: "\u2211",
  timer: "\uF017",
  // fa-clock-o (classic NF core)
  speed: "\uF0E4",
  // fa-tachometer (classic NF core)
  sep: "\u2502",
  dot: "\xB7",
  pillLeft: "\uE0B6",
  // 
  pillRight: "\uE0B4",
  // 
  paceFast: "\u21E1",
  paceSlow: "\u21E3",
  paceEven: "\u2248",
  stateReady: "\u25CF",
  stateWorking: ["\u280B", "\u2819", "\u2838", "\u2834", "\u2826", "\u2807"],
  stateThinking: ["\u2726", "\u2727", "\u2736", "\u2727"],
  stateWaiting: "\u25CC",
  stateStarting: "\u25E6",
  barFrameLeft: "\u2595",
  barFrameRight: "\u258F",
  barFull: "\u2588",
  barPartials: ["\u258F", "\u258E", "\u258D", "\u258C", "\u258B", "\u258A", "\u2589"],
  barEmpty: "\u2591",
  contextRings: [
    "\u{F0A9E}",
    "\u{F0A9F}",
    "\u{F0AA0}",
    "\u{F0AA1}",
    "\u{F0AA2}",
    "\u{F0AA3}",
    "\u{F0AA4}",
    "\u{F0AA5}"
  ],
  sparkLevels: ["\u2581", "\u2582", "\u2583", "\u2584", "\u2585", "\u2586", "\u2587", "\u2588"]
};
var UNICODE_GLYPHS = {
  model: "\u25C6",
  effort: "\u26A1",
  dir: "\u25A3",
  git: "\u2387",
  gitClean: "\u2713",
  gitDirty: "\u25CF",
  gitStaged: "+",
  gitUntracked: "?",
  ahead: "\u2191",
  behind: "\u2193",
  cache: "\u2248",
  quota5h: "\u25F7",
  quota7d: "\u25F6",
  cost: "$",
  today: "\u2211",
  timer: "\u23F1",
  speed: "\xBB",
  sep: "\u2502",
  dot: "\xB7",
  pillLeft: "",
  pillRight: "",
  paceFast: "\u21E1",
  paceSlow: "\u21E3",
  paceEven: "\u2248",
  stateReady: "\u25CF",
  stateWorking: ["\u25D0", "\u25D3", "\u25D1", "\u25D2"],
  stateThinking: ["\u2726", "\u2727"],
  stateWaiting: "\u25CC",
  stateStarting: "\u25E6",
  barFrameLeft: "\u2595",
  barFrameRight: "\u258F",
  barFull: "\u2588",
  barPartials: ["\u258F", "\u258E", "\u258D", "\u258C", "\u258B", "\u258A", "\u2589"],
  barEmpty: "\u2591",
  contextRings: ["\u25CB", "\u25D4", "\u25D1", "\u25D5", "\u25CF"],
  sparkLevels: ["\u2581", "\u2582", "\u2583", "\u2584", "\u2585", "\u2586", "\u2587", "\u2588"]
};
var ASCII_GLYPHS = {
  model: "*",
  effort: "",
  dir: "dir",
  git: "git",
  gitClean: "ok",
  gitDirty: "*",
  gitStaged: "+",
  gitUntracked: "?",
  ahead: "^",
  behind: "v",
  cache: "cache",
  quota5h: "5h",
  quota7d: "7d",
  cost: "$",
  today: "day",
  timer: "t",
  speed: "",
  sep: "|",
  dot: ".",
  pillLeft: "[",
  pillRight: "]",
  paceFast: "+",
  paceSlow: "-",
  paceEven: "=",
  stateReady: "o",
  stateWorking: ["|", "/", "-", "\\"],
  stateThinking: ["*", "+"],
  stateWaiting: ".",
  stateStarting: ".",
  barFrameLeft: "[",
  barFrameRight: "]",
  barFull: "=",
  barPartials: [],
  barEmpty: "-",
  contextRings: [],
  sparkLevels: ["_", ".", "-", "=", "^"]
};
function getGlyphs(mode) {
  switch (mode) {
    case "nerd":
      return NERD_GLYPHS;
    case "unicode":
      return UNICODE_GLYPHS;
    case "ascii":
      return ASCII_GLYPHS;
  }
}
function buildProgressBar(pct, width2, glyphs) {
  const safeWidth = Math.max(3, Math.min(24, Math.floor(width2)));
  const clamped = Math.max(0, Math.min(100, pct));
  const exactCells = clamped / 100 * safeWidth;
  const fullCells = Math.floor(exactCells);
  const remainder = exactCells - fullCells;
  let filled = glyphs.barFull.repeat(fullCells);
  let usedCells = fullCells;
  if (usedCells < safeWidth) {
    if (glyphs.barPartials.length > 0 && remainder > 0) {
      const idx = Math.min(
        glyphs.barPartials.length - 1,
        Math.floor(remainder * glyphs.barPartials.length)
      );
      if (remainder >= 1 / (glyphs.barPartials.length + 1)) {
        filled += glyphs.barPartials[idx];
        usedCells += 1;
      }
    } else if (clamped > 0 && fullCells === 0 && glyphs.barPartials.length > 0) {
      filled += glyphs.barPartials[0];
      usedCells += 1;
    }
  }
  const emptyCount = Math.max(0, safeWidth - usedCells);
  const empty = glyphs.barEmpty.repeat(emptyCount);
  return { filled, empty };
}
function pickContextRing(usedPct, glyphs) {
  const rings = glyphs.contextRings;
  if (rings.length === 0) return "";
  const ratio = Math.max(0, Math.min(1, usedPct / 100));
  const idx = Math.min(rings.length - 1, Math.floor(ratio * rings.length));
  return rings[idx];
}
function buildSparkline(samples, glyphs) {
  if (samples.length < 2) return "";
  const levels = glyphs.sparkLevels;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const span2 = max - min;
  return samples.map((v) => {
    if (span2 <= 0) return levels[Math.floor(levels.length / 2)];
    const norm = (v - min) / span2;
    const idx = Math.min(levels.length - 1, Math.floor(norm * levels.length));
    return levels[idx];
  }).join("");
}

// src/design/palettes.ts
var WHALE_LIGHT = {
  body: "#3B5BDB",
  bodyDeep: "#2B44B8",
  highlight: "#748FFC",
  belly: "#F1F5FF",
  outline: "#1B2559",
  eye: "#111827",
  blush: "#F06595",
  tear: "#0CA6E9",
  heart: "#E03131",
  sparkle: "#D97706",
  bubble: "#228BE6",
  note: "#AE3EC9"
};
var WHALE_DARK = {
  body: "#4D6BFE",
  bodyDeep: "#3651D9",
  highlight: "#8CA2FF",
  belly: "#EDF2FF",
  outline: "#18224D",
  eye: "#0F172A",
  blush: "#FF7AA2",
  tear: "#38BDF8",
  heart: "#FB7185",
  sparkle: "#FBBF24",
  bubble: "#7DD3FC",
  note: "#E879F9"
};
var PALETTES2 = {
  /**
   * Default — hand-crafted for warm parchment / Gruvbox Light (#fbf1c7) terminals.
   * Inspired by Swiss editorial typography + tactile studio instrumentation.
   */
  "gruvbox-light": {
    id: "gruvbox-light",
    mode: "light",
    badgeModelBg: "#3C3836",
    badgeModelFg: "#FBF1C7",
    badgeEffortFg: "#FABD2F",
    pillBg: "#EBDBB2",
    pillBgAlt: "#E4D3A8",
    stateReadyBg: "#E3E8C8",
    stateReadyFg: "#427B58",
    stateWorkBg: "#F6DFB8",
    stateWorkFg: "#AF3A03",
    stateThinkBg: "#EAD8E2",
    stateThinkFg: "#8F3F71",
    stateWaitBg: "#F3E2B3",
    stateWaitFg: "#B57614",
    dir: "#B57614",
    gitBranch: "#8F3F71",
    gitClean: "#427B58",
    gitDirty: "#AF3A03",
    gitAheadBehind: "#076678",
    gitAdd: "#79740E",
    gitDel: "#9D0006",
    ctxOk: "#076678",
    ctxWarn: "#B57614",
    ctxCrit: "#9D0006",
    barTrack: "#D5C4A1",
    sparkline: "#427B58",
    cache: "#427B58",
    quota5h: "#076678",
    quota7d: "#8F3F71",
    paceFast: "#AF3A03",
    paceSlow: "#427B58",
    paceEven: "#7C6F64",
    cost: "#79740E",
    costToday: "#9D5B10",
    timing: "#665C54",
    tps: "#076678",
    sep: "#BDAE93",
    muted: "#7C6F64",
    text: "#3C3836",
    whale: WHALE_LIGHT
  },
  "gruvbox-dark": {
    id: "gruvbox-dark",
    mode: "dark",
    badgeModelBg: "#458588",
    badgeModelFg: "#FBF1C7",
    badgeEffortFg: "#FABD2F",
    pillBg: "#3C3836",
    pillBgAlt: "#504945",
    stateReadyBg: "#343D2C",
    stateReadyFg: "#B8BB26",
    stateWorkBg: "#4D3422",
    stateWorkFg: "#FE8019",
    stateThinkBg: "#44303B",
    stateThinkFg: "#D3869B",
    stateWaitBg: "#4B3D24",
    stateWaitFg: "#FABD2F",
    dir: "#FABD2F",
    gitBranch: "#D3869B",
    gitClean: "#B8BB26",
    gitDirty: "#FE8019",
    gitAheadBehind: "#83A598",
    gitAdd: "#B8BB26",
    gitDel: "#FB4934",
    ctxOk: "#83A598",
    ctxWarn: "#FABD2F",
    ctxCrit: "#FB4934",
    barTrack: "#504945",
    sparkline: "#8EC07C",
    cache: "#8EC07C",
    quota5h: "#83A598",
    quota7d: "#D3869B",
    paceFast: "#FE8019",
    paceSlow: "#8EC07C",
    paceEven: "#A89984",
    cost: "#B8BB26",
    costToday: "#FABD2F",
    timing: "#BDAE93",
    tps: "#83A598",
    sep: "#665C54",
    muted: "#A89984",
    text: "#EBDBB2",
    whale: WHALE_DARK
  },
  "catppuccin-latte": {
    id: "catppuccin-latte",
    mode: "light",
    badgeModelBg: "#1E66F5",
    badgeModelFg: "#EFF1F5",
    badgeEffortFg: "#F9E2AF",
    pillBg: "#E6E9EF",
    pillBgAlt: "#DCE0E8",
    stateReadyBg: "#DCEEE0",
    stateReadyFg: "#40A02B",
    stateWorkBg: "#FCE5D8",
    stateWorkFg: "#FE640B",
    stateThinkBg: "#ECE0F8",
    stateThinkFg: "#8839EF",
    stateWaitBg: "#F9ECD6",
    stateWaitFg: "#DF8E1D",
    dir: "#DF8E1D",
    gitBranch: "#8839EF",
    gitClean: "#40A02B",
    gitDirty: "#FE640B",
    gitAheadBehind: "#04A5E5",
    gitAdd: "#40A02B",
    gitDel: "#D20F39",
    ctxOk: "#179299",
    ctxWarn: "#DF8E1D",
    ctxCrit: "#D20F39",
    barTrack: "#CCD0DA",
    sparkline: "#179299",
    cache: "#40A02B",
    quota5h: "#1E66F5",
    quota7d: "#8839EF",
    paceFast: "#FE640B",
    paceSlow: "#40A02B",
    paceEven: "#7C7F93",
    cost: "#179299",
    costToday: "#DF8E1D",
    timing: "#6C6F85",
    tps: "#1E66F5",
    sep: "#BCC0CC",
    muted: "#7C7F93",
    text: "#4C4F69",
    whale: WHALE_LIGHT
  },
  "catppuccin-mocha": {
    id: "catppuccin-mocha",
    mode: "dark",
    badgeModelBg: "#313244",
    badgeModelFg: "#89B4FA",
    badgeEffortFg: "#F9E2AF",
    pillBg: "#313244",
    pillBgAlt: "#45475A",
    stateReadyBg: "#263831",
    stateReadyFg: "#A6E3A1",
    stateWorkBg: "#3D2D27",
    stateWorkFg: "#FAB387",
    stateThinkBg: "#362B45",
    stateThinkFg: "#CBA6F7",
    stateWaitBg: "#3D3729",
    stateWaitFg: "#F9E2AF",
    dir: "#F9E2AF",
    gitBranch: "#CBA6F7",
    gitClean: "#A6E3A1",
    gitDirty: "#FAB387",
    gitAheadBehind: "#89DCEB",
    gitAdd: "#A6E3A1",
    gitDel: "#F38BA8",
    ctxOk: "#94E2D5",
    ctxWarn: "#F9E2AF",
    ctxCrit: "#F38BA8",
    barTrack: "#45475A",
    sparkline: "#94E2D5",
    cache: "#A6E3A1",
    quota5h: "#89B4FA",
    quota7d: "#CBA6F7",
    paceFast: "#FAB387",
    paceSlow: "#A6E3A1",
    paceEven: "#9399B2",
    cost: "#94E2D5",
    costToday: "#F9E2AF",
    timing: "#A6ADC8",
    tps: "#89DCEB",
    sep: "#585B70",
    muted: "#9399B2",
    text: "#CDD6F4",
    whale: WHALE_DARK
  },
  "tokyo-night": {
    id: "tokyo-night",
    mode: "dark",
    badgeModelBg: "#292E42",
    badgeModelFg: "#7AA2F7",
    badgeEffortFg: "#E0AF68",
    pillBg: "#24283B",
    pillBgAlt: "#2F3549",
    stateReadyBg: "#223331",
    stateReadyFg: "#9ECE6A",
    stateWorkBg: "#3A2B24",
    stateWorkFg: "#FF9E64",
    stateThinkBg: "#2F2640",
    stateThinkFg: "#BB9AF7",
    stateWaitBg: "#383223",
    stateWaitFg: "#E0AF68",
    dir: "#E0AF68",
    gitBranch: "#BB9AF7",
    gitClean: "#9ECE6A",
    gitDirty: "#FF9E64",
    gitAheadBehind: "#7DCFFF",
    gitAdd: "#9ECE6A",
    gitDel: "#F7768E",
    ctxOk: "#2AC3DE",
    ctxWarn: "#E0AF68",
    ctxCrit: "#F7768E",
    barTrack: "#3B4261",
    sparkline: "#73DACA",
    cache: "#73DACA",
    quota5h: "#7AA2F7",
    quota7d: "#BB9AF7",
    paceFast: "#FF9E64",
    paceSlow: "#9ECE6A",
    paceEven: "#787C99",
    cost: "#73DACA",
    costToday: "#E0AF68",
    timing: "#9AA5CE",
    tps: "#7DCFFF",
    sep: "#414868",
    muted: "#787C99",
    text: "#C0CAF5",
    whale: WHALE_DARK
  },
  "rose-pine": {
    id: "rose-pine",
    mode: "dark",
    badgeModelBg: "#26233A",
    badgeModelFg: "#EBBCBA",
    badgeEffortFg: "#F6C177",
    pillBg: "#26233A",
    pillBgAlt: "#312E47",
    stateReadyBg: "#22323A",
    stateReadyFg: "#9CCFD8",
    stateWorkBg: "#3B2832",
    stateWorkFg: "#EB6F92",
    stateThinkBg: "#312840",
    stateThinkFg: "#C4A7E7",
    stateWaitBg: "#393129",
    stateWaitFg: "#F6C177",
    dir: "#F6C177",
    gitBranch: "#C4A7E7",
    gitClean: "#9CCFD8",
    gitDirty: "#EBBCBA",
    gitAheadBehind: "#31748F",
    gitAdd: "#9CCFD8",
    gitDel: "#EB6F92",
    ctxOk: "#9CCFD8",
    ctxWarn: "#F6C177",
    ctxCrit: "#EB6F92",
    barTrack: "#403D52",
    sparkline: "#9CCFD8",
    cache: "#9CCFD8",
    quota5h: "#EBBCBA",
    quota7d: "#C4A7E7",
    paceFast: "#EB6F92",
    paceSlow: "#9CCFD8",
    paceEven: "#908CAA",
    cost: "#F6C177",
    costToday: "#EBBCBA",
    timing: "#908CAA",
    tps: "#9CCFD8",
    sep: "#524F67",
    muted: "#908CAA",
    text: "#E0DEF4",
    whale: WHALE_DARK
  },
  nord: {
    id: "nord",
    mode: "dark",
    badgeModelBg: "#3B4252",
    badgeModelFg: "#88C0D0",
    badgeEffortFg: "#EBCB8B",
    pillBg: "#3B4252",
    pillBgAlt: "#434C5E",
    stateReadyBg: "#33423D",
    stateReadyFg: "#A3BE8C",
    stateWorkBg: "#4A3A36",
    stateWorkFg: "#D08770",
    stateThinkBg: "#43394A",
    stateThinkFg: "#B48EAD",
    stateWaitBg: "#494336",
    stateWaitFg: "#EBCB8B",
    dir: "#EBCB8B",
    gitBranch: "#B48EAD",
    gitClean: "#A3BE8C",
    gitDirty: "#D08770",
    gitAheadBehind: "#81A1C1",
    gitAdd: "#A3BE8C",
    gitDel: "#BF616A",
    ctxOk: "#88C0D0",
    ctxWarn: "#EBCB8B",
    ctxCrit: "#BF616A",
    barTrack: "#4C566A",
    sparkline: "#8FBCBB",
    cache: "#A3BE8C",
    quota5h: "#88C0D0",
    quota7d: "#B48EAD",
    paceFast: "#D08770",
    paceSlow: "#A3BE8C",
    paceEven: "#81A1C1",
    cost: "#8FBCBB",
    costToday: "#EBCB8B",
    timing: "#D8DEE9",
    tps: "#88C0D0",
    sep: "#4C566A",
    muted: "#9AA5B8",
    text: "#ECEFF4",
    whale: WHALE_DARK
  },
  /**
   * Adaptive fallback using Codex native semantic theme colors.
   */
  terminal: {
    id: "terminal",
    mode: "adaptive",
    badgeModelBg: null,
    badgeModelFg: "status-model",
    badgeEffortFg: "accent",
    pillBg: null,
    pillBgAlt: null,
    stateReadyBg: null,
    stateReadyFg: "green",
    stateWorkBg: null,
    stateWorkFg: "yellow",
    stateThinkBg: null,
    stateThinkFg: "magenta",
    stateWaitBg: null,
    stateWaitFg: "cyan",
    dir: "status-path",
    gitBranch: "status-branch",
    gitClean: "green",
    gitDirty: "yellow",
    gitAheadBehind: "cyan",
    gitAdd: "green",
    gitDel: "red",
    ctxOk: "status-progress",
    ctxWarn: "yellow",
    ctxCrit: "red",
    barTrack: "status-metadata",
    sparkline: "cyan",
    cache: "green",
    quota5h: "status-limit",
    quota7d: "magenta",
    paceFast: "yellow",
    paceSlow: "green",
    paceEven: "status-metadata",
    cost: "status-usage",
    costToday: "yellow",
    timing: "status-metadata",
    tps: "cyan",
    sep: "status-metadata",
    muted: "status-metadata",
    text: "primary",
    whale: WHALE_DARK
  }
};
function getPalette(id) {
  return PALETTES2[id] ?? PALETTES2["gruvbox-dark"];
}

// src/design/whale.ts
var WHALE_WIDTH = 14;
var WHALE_ROWS = 3;
var WHALE_PIXEL_ROWS = WHALE_ROWS * 2;
var WHALE_IDLE_FRAMES = [
  {
    name: "idle-float-1",
    pixels: [
      "....O.........",
      "..BBHHBBB....D",
      ".BBEBBBBBB..DD",
      ".BPBBBBBBBBDD.",
      "..BWWWWWWBBD.D",
      "...DDDDDB....."
    ]
  },
  {
    name: "idle-float-2",
    pixels: [
      "...O..........",
      "....O........D",
      "..BBHHBBB...DD",
      ".BBEBBBBBBBDD.",
      ".BPWWWWWWBBD.D",
      "..BDDDDDB....."
    ]
  },
  {
    name: "idle-blink",
    pixels: [
      ".....O........",
      "..BBHHBBB...D.",
      ".BBBBBBBBB.DD.",
      ".BPBBBBBBBBDD.",
      "..BWWWWWWBBD..",
      "...DDDDDB...D."
    ]
  },
  {
    name: "idle-float-3",
    pixels: [
      "....O.........",
      "...O........D.",
      "..BBHHBBB..DD.",
      ".BBEBBBBBBBDD.",
      ".BPWWWWWWBBD..",
      "..BDDDDDB...D."
    ]
  }
];
var WHALE_DANCE_FRAMES = [
  // Beat 0: Lean LEFT, left fin raised pointing + floating red heart (我真的)
  {
    name: "dance-1-love-left",
    pixels: [
      ".RR..BHHB..Y..",
      ".RR.BBBBBB....",
      "DBBEBBBBEBD...",
      "..BPWWWWPB..D.",
      "...BWWWWWWB...",
      "...DD....DD..."
    ]
  },
  // Beat 1: Sway RIGHT, right fin raised + double red hearts (特别爱你)
  {
    name: "dance-2-love-right",
    pixels: [
      "..R..BHHB..RR.",
      "....BBBBBB.RR.",
      "...BBEBBBBEBD.",
      ".D..BPWWWWPB..",
      "...BWWWWWWB...",
      "....DD..DD...."
    ]
  },
  // Beat 2: Both fins clutching cheeks + sparkling tears forming (为什么)
  {
    name: "dance-3-why-tears",
    pixels: [
      "..Y..BHHB..Y..",
      "...BEBBBBEB...",
      "..DBTWWWWPBD..",
      "..DBTWWWWTBD..",
      "...BWWWWWWB...",
      "...DD....DD..."
    ]
  },
  // Beat 3: Squat beat! Twin cyan tear waterfalls + fat belly shake (你在流泪)
  {
    name: "dance-4-crying-squash",
    pixels: [
      ".R...BHHBB..R.",
      "...BBBBBBBB...",
      ".DBBEBBBBEBBD.",
      "D.BPTWWWWTPB.D",
      "..B.TWWWWBTB..",
      "..DD.BBBB.DD.."
    ]
  },
  // Beat 4: DJ beat left — wipe tear + throw heart + music accent
  {
    name: "dance-5-wipe-left",
    pixels: [
      "M.RR.BHHB...Y.",
      "..RR.BBBBBB...",
      "..DBBEBBBBEB..",
      ".D.BPTWWWPBD..",
      "...BTWWWWWWB..",
      "....DD..DD...."
    ]
  },
  // Beat 5: DJ hype jump! Both fins flung wide, hearts & tears flying symmetrically
  {
    name: "dance-6-jump-hype",
    pixels: [
      ".R.Y.BHHB.Y.R.",
      ".D..BEBBBBEB.D",
      "D..BPTWWWWTPBD",
      "...BTWWWWWWBT.",
      "....BBBBBBBB..",
      "...D........D."
    ]
  },
  // Beat 6: Cheeky left hip sway + wink + tear & heart groove
  {
    name: "dance-7-sway-left",
    pixels: [
      "..R..BHHBB..M.",
      "..BBBBBBB.....",
      ".BBEBBBBBB..Y.",
      "DBPTWWWWPBD...",
      "..BTWWWWWWB...",
      "..DD...DD....."
    ]
  },
  // Beat 7: Cheeky right hip sway + hug fins + twin tears loop back
  {
    name: "dance-8-sway-right",
    pixels: [
      "..Y...BHHBB.R.",
      ".....BBBBBBB..",
      ".M..BEBBBBEB..",
      "...BPTWWWWTPBD",
      "...BTWWWWWWB..",
      ".....DD..DD..."
    ]
  }
];
function resolvePixelColor(key, palette) {
  const w = palette.whale;
  switch (key) {
    case ".":
      return null;
    case "B":
      return w.body;
    case "D":
      return w.bodyDeep;
    case "H":
      return w.highlight;
    case "W":
      return w.belly;
    case "E":
      return w.eye;
    case "P":
      return w.blush;
    case "T":
      return w.tear;
    case "R":
      return w.heart;
    case "Y":
      return w.sparkle;
    case "O":
      return w.bubble;
    case "M":
      return w.note;
  }
}
function encodeHalfBlockCell(top, bottom) {
  if (top === null && bottom === null) {
    return { ch: "\xA0", fg: null, bg: null };
  }
  if (top !== null && bottom === null) {
    return { ch: "\u2580", fg: top, bg: null };
  }
  if (top === null && bottom !== null) {
    return { ch: "\u2584", fg: bottom, bg: null };
  }
  if (top === bottom) {
    return { ch: "\u2588", fg: top, bg: null };
  }
  return { ch: "\u2580", fg: top, bg: bottom };
}
function buildWhaleTerminalRow(topRow, bottomRow, palette) {
  const runs = [];
  for (let x = 0; x < WHALE_WIDTH; x++) {
    const topKey = topRow[x] ?? ".";
    const botKey = bottomRow[x] ?? ".";
    const token = encodeHalfBlockCell(
      resolvePixelColor(topKey, palette),
      resolvePixelColor(botKey, palette)
    );
    const prev = runs[runs.length - 1];
    if (prev && prev.fg === token.fg && prev.bg === token.bg) {
      prev.text += token.ch;
    } else {
      runs.push({ text: token.ch, fg: token.fg, bg: token.bg });
    }
  }
  const rowChildren = [];
  let inlineBuf = [];
  const flushInline = () => {
    if (inlineBuf.length === 0) return;
    if (inlineBuf.length === 1) {
      rowChildren.push(inlineBuf[0]);
    } else {
      rowChildren.push({ type: "text", children: inlineBuf });
    }
    inlineBuf = [];
  };
  for (const run of runs) {
    if (run.bg === null) {
      if (run.fg === null) {
        inlineBuf.push(run.text);
      } else {
        inlineBuf.push({
          type: "text",
          props: { color: run.fg },
          children: [run.text]
        });
      }
    } else {
      flushInline();
      rowChildren.push({
        type: "row",
        props: { gap: 0, background: run.bg, wrap: "nowrap" },
        children: [
          run.fg === null ? run.text : { type: "text", props: { color: run.fg }, children: [run.text] }
        ]
      });
    }
  }
  flushInline();
  if (rowChildren.length === 1 && typeof rowChildren[0] !== "string" && rowChildren[0].type === "row") {
    return rowChildren[0];
  }
  return {
    type: "row",
    props: { gap: 0, wrap: "nowrap" },
    children: rowChildren
  };
}
function selectWhaleFrame(isActive, tick) {
  const safeTick = Math.max(0, Math.floor(tick));
  if (isActive) {
    return WHALE_DANCE_FRAMES[safeTick % WHALE_DANCE_FRAMES.length];
  }
  return WHALE_IDLE_FRAMES[safeTick % WHALE_IDLE_FRAMES.length];
}
function renderWhaleColumn(isActive, tick, palette) {
  const frame = selectWhaleFrame(isActive, tick);
  const rows = [];
  for (let r = 0; r < WHALE_ROWS; r++) {
    const top = frame.pixels[r * 2] ?? ".".repeat(WHALE_WIDTH);
    const bot = frame.pixels[r * 2 + 1] ?? ".".repeat(WHALE_WIDTH);
    rows.push(buildWhaleTerminalRow(top, bot, palette));
  }
  return {
    frameName: frame.name,
    node: {
      type: "row",
      props: { gap: 1e4, wrap: "wrap" },
      children: rows
    }
  };
}

// src/design/renderer.ts
var NBSP = "\xA0";
function span(text, color, bold = false) {
  if (!text) return "";
  if (!color && !bold) return text;
  return {
    type: "text",
    props: {
      ...color ? { color } : {},
      ...bold ? { weight: "bold" } : {}
    },
    children: [text]
  };
}
function inline(children) {
  const filtered = children.filter((c) => c !== null && c !== "");
  if (filtered.length === 0) return "";
  if (filtered.length === 1) return filtered[0];
  return { type: "text", children: filtered };
}
function row(children, gap = 0, background = null, wrap = "nowrap") {
  const filtered = children.filter((c) => c !== null && c !== "");
  return {
    type: "row",
    props: {
      gap,
      ...background ? { background } : {},
      wrap
    },
    children: filtered
  };
}
function vstack(rows) {
  const filtered = rows.filter((r) => r !== null && r !== "");
  if (filtered.length === 1) return filtered[0];
  return {
    type: "row",
    props: { gap: 1e4, wrap: "wrap" },
    children: filtered
  };
}
function chip(children, bg, skin, glyphs) {
  const inner = children.filter((c) => c !== null && c !== "");
  if (inner.length === 0) return "";
  if (!bg || skin === "plain") {
    return inline(inner);
  }
  const body = row([inline([NBSP, ...inner, NBSP])], 0, bg, "nowrap");
  if (skin === "pill" && glyphs.pillLeft && glyphs.pillRight) {
    return row([span(glyphs.pillLeft, bg), body, span(glyphs.pillRight, bg)], 0, null, "nowrap");
  }
  return body;
}
function formatCompactTokens(tokens) {
  const abs = Math.abs(tokens);
  const sign = tokens < 0 ? "-" : "";
  if (abs >= 1e6) {
    const val = abs / 1e6;
    return `${sign}${val >= 10 ? val.toFixed(0) : val.toFixed(1)}M`;
  }
  if (abs >= 1e3) {
    const val = abs / 1e3;
    return `${sign}${val >= 100 ? Math.round(val) : val >= 10 ? val.toFixed(0) : val.toFixed(1)}k`;
  }
  return `${sign}${Math.round(abs)}`;
}
function formatUsd(amount) {
  if (amount >= 100) return `$${amount.toFixed(0)}`;
  if (amount >= 10) return `$${amount.toFixed(1)}`;
  if (amount >= 0.01) return `$${amount.toFixed(2)}`;
  if (amount > 0) return `$${amount.toFixed(3)}`;
  return "$0.00";
}
function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  if (m < 60) return remS === 0 ? `${m}m` : `${m}m${String(remS).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h${String(remM).padStart(2, "0")}m`;
}
function truncateMiddleOrEnd(text, maxLen) {
  const chars = Array.from(text);
  if (chars.length <= maxLen) return text;
  return `${chars.slice(0, Math.max(1, maxLen - 1)).join("")}\u2026`;
}
function basenameDir(cwd) {
  const norm = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!norm) return cwd;
  const parts = norm.split("/");
  return truncateMiddleOrEnd(parts[parts.length - 1] || norm, 16);
}
function shortModelName(raw) {
  return truncateMiddleOrEnd(raw.trim() || "Codex", 20);
}
function heatColor(usedPct, ok, warn, crit) {
  if (usedPct >= 85) return crit;
  if (usedPct >= 60) return warn;
  return ok;
}
function renderModelAnchor(ctx, p, g) {
  const model = ctx.state.thread?.model;
  const name = shortModelName(model?.display_name ?? model?.id ?? "Codex");
  const effort = model?.reasoning_level;
  const rawTier = model?.service_tier_display_name || model?.service_tier || "";
  const normTier = rawTier.trim().toLowerCase();
  const fast = normTier && normTier !== "default" && normTier !== "normal" && normTier !== "standard" ? rawTier.trim() : null;
  const skin = ctx.config.skin;
  const hasBadgeBg = skin !== "plain" && p.badgeModelBg !== null;
  const iconPrefix = g.model ? `${g.model}${NBSP}` : "";
  const effortSuffix = [effort, fast ? `${g.effort}${fast}` : null].filter(Boolean).join(NBSP);
  if (skin === "plain") {
    return inline([
      span(`${iconPrefix}${name}`, p.ctxOk, true),
      ...effortSuffix ? [span(`${NBSP}${g.dot}${NBSP}${effortSuffix}`, p.dir, true)] : []
    ]);
  }
  return chip(
    [
      span(`${iconPrefix}${name}`, hasBadgeBg ? p.badgeModelFg : p.ctxOk, true),
      ...effortSuffix ? [span(`${NBSP}${g.dot}${NBSP}${effortSuffix}`, hasBadgeBg ? p.badgeEffortFg : p.dir, true)] : []
    ],
    p.badgeModelBg,
    skin,
    g
  );
}
function renderRunState(ctx, p, g) {
  const runState = ctx.state.thread?.agent.state;
  if (!runState) return null;
  const tick = ctx.animationTick;
  let glyph;
  let label;
  let fg;
  let bg;
  switch (runState) {
    case "working":
      glyph = g.stateWorking[tick % g.stateWorking.length];
      label = "working";
      fg = p.stateWorkFg;
      bg = p.stateWorkBg;
      break;
    case "thinking":
      glyph = g.stateThinking[tick % g.stateThinking.length];
      label = `think${NBSP}${NBSP}`;
      fg = p.stateThinkFg;
      bg = p.stateThinkBg;
      break;
    case "waiting":
      glyph = g.stateWaiting;
      label = "waiting";
      fg = p.stateWaitFg;
      bg = p.stateWaitBg;
      break;
    case "starting":
      glyph = g.stateStarting;
      label = "booting";
      fg = p.muted;
      bg = p.pillBg;
      break;
    case "ready":
    default:
      glyph = g.stateReady;
      label = `ready${NBSP}${NBSP}`;
      fg = p.stateReadyFg;
      bg = p.stateReadyBg;
      break;
  }
  const content = span(`${glyph}${NBSP}${label}`, fg, runState === "working" || runState === "thinking");
  if (ctx.config.skin === "plain") return content;
  return chip([content], bg, ctx.config.skin, g);
}
function renderDirectory(ctx, p, g) {
  const cwd = ctx.state.thread?.workspace.cwd;
  if (!cwd) return null;
  const name = basenameDir(cwd);
  const icon = g.dir ? `${g.dir}${NBSP}` : "";
  const content = span(`${icon}${name}`, p.dir, true);
  return ctx.config.skin === "pill" ? chip([content], p.pillBg, "pill", g) : content;
}
function renderGit(ctx, p, g) {
  if (!ctx.config.modules.git) return null;
  const git = ctx.git;
  if (!git || !git.isRepo || !git.branch) return null;
  const branchName = truncateMiddleOrEnd(git.branch, 15);
  const parts = [
    span(`${g.git ? `${g.git}${NBSP}` : ""}${git.detached ? "@" : ""}${branchName}`, p.gitBranch, true)
  ];
  let flags = "";
  if (git.dirty) flags += g.gitDirty;
  if (git.staged) flags += g.gitStaged;
  if (git.untracked) flags += g.gitUntracked;
  parts.push(flags ? span(`${NBSP}${flags}`, p.gitDirty) : span(`${NBSP}${g.gitClean}`, p.gitClean));
  if (git.ahead > 0 || git.behind > 0) {
    const ab = `${git.ahead > 0 ? `${g.ahead}${git.ahead}` : ""}${git.behind > 0 ? `${g.behind}${git.behind}` : ""}`;
    parts.push(span(`${NBSP}${ab}`, p.gitAheadBehind));
  }
  if (git.added > 0 || git.deleted > 0) {
    if (git.added > 0) parts.push(span(`${NBSP}+${git.added}`, p.gitAdd));
    if (git.deleted > 0) parts.push(span(`${git.added > 0 ? "/" : NBSP}-${git.deleted}`, p.gitDel));
  }
  const content = inline(parts);
  return ctx.config.skin === "pill" ? chip([content], p.pillBg, "pill", g) : content;
}
function renderContext(ctx, p, g, compact = false) {
  const { usedPct, remainingPct, usedTokens, sparklineSamples } = ctx.context;
  if (usedPct === null) return null;
  const displayPct = ctx.config.percentMode === "remaining" && remainingPct !== null ? remainingPct : usedPct;
  const color = heatColor(usedPct, p.ctxOk, p.ctxWarn, p.ctxCrit);
  const ring = pickContextRing(usedPct, g);
  const barLen = compact ? 5 : Math.min(5, ctx.config.barWidth);
  const bar = buildProgressBar(displayPct, barLen, g);
  const parts = [
    span(`${ring ? `${ring}${NBSP}` : `ctx${NBSP}`}${g.barFrameLeft}${bar.filled}`, color)
  ];
  if (bar.empty) {
    parts.push(span(`${bar.empty}${g.barFrameRight}`, p.barTrack));
  } else {
    parts.push(span(g.barFrameRight, color));
  }
  parts.push(span(`${NBSP}${Math.round(displayPct)}%`, color, true));
  if (usedTokens !== null) {
    parts.push(span(`${NBSP}${g.dot}${NBSP}${formatCompactTokens(usedTokens)}`, p.muted));
  }
  if (ctx.config.modules.sparkline && !compact && sparklineSamples.length >= 2) {
    const spark = buildSparkline(sparklineSamples.slice(-5), g);
    if (spark) {
      parts.push(span(`${NBSP}${spark}`, p.sparkline));
    }
  }
  const content = inline(parts);
  return ctx.config.skin === "pill" ? chip([content], p.pillBg, "pill", g) : content;
}
function renderCache(ctx, p, g) {
  if (!ctx.config.modules.cache) return null;
  if (ctx.cache.hitPct === null) return null;
  const icon = g.cache ? `${g.cache}${NBSP}` : "";
  const content = inline([
    span(`${icon}${ctx.cache.hitPct}%`, p.cache, true),
    span(`${NBSP}hit`, p.muted)
  ]);
  return ctx.config.skin === "pill" ? chip([content], p.pillBg, "pill", g) : content;
}
function renderQuota(q, ctx, p, g, compact = false) {
  const displayPct = ctx.config.percentMode === "remaining" ? q.remainingPct : q.usedPct;
  const baseColor = q.label === "5h" ? p.quota5h : p.quota7d;
  const fillColor = heatColor(q.usedPct, baseColor, p.ctxWarn, p.ctxCrit);
  const icon = q.label === "5h" ? g.quota5h : g.quota7d;
  const barLen = compact ? 3 : Math.min(4, ctx.config.quotaBarWidth);
  const bar = buildProgressBar(displayPct, barLen, g);
  const parts = [
    span(`${icon ? `${icon}${NBSP}` : ""}${q.label}${NBSP}${bar.filled}`, fillColor)
  ];
  if (bar.empty) {
    parts.push(span(bar.empty, p.barTrack));
  }
  parts.push(span(`${NBSP}${Math.round(displayPct)}%`, fillColor, true));
  if (q.resetText) {
    parts.push(span(`${NBSP}${q.resetText}`, p.muted));
  }
  if (q.paceDeltaPct !== null) {
    const abs = Math.abs(q.paceDeltaPct);
    if (abs <= 2) {
      parts.push(span(`${NBSP}${g.paceEven}`, p.paceEven));
    } else if (q.paceDeltaPct > 0) {
      parts.push(span(`${NBSP}${g.paceFast}${abs}%`, p.paceFast, abs >= 15));
    } else {
      parts.push(span(`${NBSP}${g.paceSlow}${abs}%`, p.paceSlow));
    }
  }
  const content = inline(parts);
  return ctx.config.skin === "pill" ? chip([content], p.pillBg, "pill", g) : content;
}
function renderCost(ctx, p, g) {
  if (!ctx.config.modules.cost) return null;
  if (!ctx.cost) return null;
  const prefix = ctx.cost.estimated ? "~" : "";
  const icon = g.cost && g.cost !== "$" ? `${g.cost}${NBSP}` : "";
  const parts = [span(`${icon}${prefix}${formatUsd(ctx.cost.sessionUsd)}`, p.cost, true)];
  if (ctx.config.modules.todayCost && ctx.cost.todayUsd > 0) {
    parts.push(span(`${NBSP}${g.dot}${NBSP}${formatUsd(ctx.cost.todayUsd)}${NBSP}day`, p.costToday));
  }
  const content = inline(parts);
  return ctx.config.skin === "pill" ? chip([content], p.pillBgAlt, "pill", g) : content;
}
function renderTiming(ctx, p, g) {
  const parts = [];
  const isActive = ctx.state.thread?.agent.state === "working" || ctx.state.thread?.agent.state === "thinking";
  if (ctx.config.modules.timer) {
    const sec = isActive && ctx.timing.turnElapsedSec !== null ? ctx.timing.turnElapsedSec : ctx.timing.sessionElapsedSec;
    if (sec > 0 || isActive) {
      parts.push(
        span(
          `${g.timer ? `${g.timer}${NBSP}` : ""}${formatDuration(sec)}`,
          isActive ? p.stateWorkFg : p.timing,
          isActive
        )
      );
    }
  }
  if (ctx.config.modules.tps && ctx.timing.outputTps !== null && ctx.timing.outputTps > 0) {
    const dot = parts.length > 0 ? `${NBSP}${g.dot}${NBSP}` : "";
    const speedIcon = g.speed ? `${g.speed}${NBSP}` : "";
    parts.push(span(`${dot}${speedIcon}${Math.round(ctx.timing.outputTps)}${NBSP}t/s`, p.tps));
  }
  if (parts.length === 0) return null;
  const content = inline(parts);
  return ctx.config.skin === "pill" ? chip([content], p.pillBgAlt, "pill", g) : content;
}
function joinSegments(items, skin, p, g) {
  const filtered = items.filter((item) => item !== null && item !== "");
  if (filtered.length === 0) return "";
  if (skin === "pill") {
    return row(filtered, 1, null, "wrap");
  }
  const withSep = [];
  for (let i = 0; i < filtered.length; i++) {
    if (i > 0) {
      withSep.push(span(g.sep, p.sep));
    }
    withSep.push(filtered[i]);
  }
  return row(withSep, 1, null, "wrap");
}
function buildTree(ctx, compact) {
  const p = getPalette(ctx.config.palette);
  const g = getGlyphs(ctx.config.glyphs);
  const skin = ctx.config.skin;
  const modelNode = renderModelAnchor(ctx, p, g);
  const stateNode = renderRunState(ctx, p, g);
  const dirNode = renderDirectory(ctx, p, g);
  const gitNode = renderGit(ctx, p, g);
  const costNode = renderCost(ctx, p, g);
  const timingNode = renderTiming(ctx, p, g);
  const ctxNode = renderContext(ctx, p, g, compact);
  const cacheNode = renderCache(ctx, p, g);
  const quotaNodes = ctx.config.modules.quotas ? ctx.quotas.map((q) => renderQuota(q, ctx, p, g, compact)) : [];
  if (ctx.variant === "standard") {
    const line1Left = joinSegments([modelNode, stateNode, dirNode, gitNode], skin, p, g);
    const line2Left = joinSegments([ctxNode, cacheNode, ...quotaNodes], skin, p, g);
    const hasRight = costNode !== null || timingNode !== null;
    if (!hasRight) {
      return vstack([line1Left, line2Left]);
    }
    const leftCol = vstack([line1Left, line2Left]);
    const rightCol = vstack([
      costNode ?? timingNode ?? NBSP,
      costNode && timingNode ? timingNode : NBSP
    ]);
    return row([leftCol, rightCol], 2, null, "nowrap");
  }
  const isActive = ctx.state.thread?.agent.state === "working" || ctx.state.thread?.agent.state === "thinking";
  const whaleLine1 = joinSegments([modelNode, stateNode, dirNode, gitNode], skin, p, g);
  const whaleLine2 = joinSegments([ctxNode, cacheNode, ...quotaNodes], skin, p, g);
  const whaleLine3 = joinSegments([costNode, timingNode], skin, p, g);
  const hasLine2 = ctxNode !== null || cacheNode !== null || quotaNodes.length > 0;
  const hasLine3 = costNode !== null || timingNode !== null;
  const leftRows = [
    whaleLine1,
    hasLine2 ? whaleLine2 : hasLine3 ? whaleLine3 : NBSP,
    hasLine2 && hasLine3 ? whaleLine3 : NBSP
  ];
  const { node: whaleCol } = renderWhaleColumn(isActive, ctx.animationTick, p);
  return row([vstack(leftRows), whaleCol], 2, null, "nowrap");
}
function renderStatusline(ctx) {
  const tree = buildTree(ctx, false);
  const stats = inspectUiTree(tree);
  if (stats.valid) {
    return tree;
  }
  const compactTree = buildTree(
    {
      ...ctx,
      config: {
        ...ctx.config,
        skin: ctx.config.skin === "pill" ? "editorial" : ctx.config.skin,
        modules: { ...ctx.config.modules, sparkline: false }
      }
    },
    true
  );
  if (inspectUiTree(compactTree).valid) {
    return compactTree;
  }
  const fallbackModel = ctx.state.thread?.model.display_name ?? "Codex";
  const pct = ctx.context.usedPct !== null ? ` \xB7 ctx ${Math.round(ctx.context.usedPct)}%` : "";
  const state = ctx.state.thread?.agent.state ? ` \xB7 ${ctx.state.thread.agent.state}` : "";
  const safeTree = `${fallbackModel}${pct}${state}`;
  if (inspectUiTree(safeTree).nodes <= CODEX_LIMITS.MAX_NODES) {
    return safeTree;
  }
  return "Codex";
}

// src/protocol/mcp-server.ts
import { createInterface } from "node:readline";
var STATE_KEY = "com.openai/codex-statusline-state";
var MIME_TYPE = "application/json";
var PROVIDERS = [
  { variant: "standard", name: ENTRYPOINTS.STANDARD_TOOL, title: ENTRYPOINTS.STANDARD_TITLE, uri: ENTRYPOINTS.STANDARD_URI },
  { variant: "whale", name: ENTRYPOINTS.WHALE_TOOL, title: ENTRYPOINTS.WHALE_TITLE, uri: ENTRYPOINTS.WHALE_URI }
];
function record(value) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }
  return void 0;
}
function error(code, message) {
  return { error: { code, message } };
}
function uiText(render, state, variant) {
  try {
    const text = JSON.stringify(render(state, variant));
    if (typeof text === "string" && Buffer.byteLength(text, "utf8") <= CODEX_LIMITS.MAX_JSON_BYTES && inspectUiTree(JSON.parse(text)).valid) {
      return text;
    }
  } catch {
  }
  return "null";
}
function dispatch(method, params, render, version) {
  switch (method) {
    case "initialize":
      return { result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: ENTRYPOINTS.SERVER_NAME, version }
      } };
    case "ping":
      return { result: {} };
    case "tools/list":
      return { result: { tools: PROVIDERS.map(({ name, title, uri }) => ({
        name,
        title,
        inputSchema: { type: "object", properties: {} },
        _meta: { "openai/ui": { entrypoints: [{ type: "statusline", resourceUri: uri }] } }
      })) } };
    case "tools/call": {
      const provider = PROVIDERS.find(({ name }) => name === params.name);
      if (!provider) return error(-32602, "Unknown tool name");
      return { result: { content: [{ type: "text", text: `The statusline resource is ${provider.uri}.` }] } };
    }
    case "resources/list":
      return { result: { resources: PROVIDERS.map(({ name, title, uri }) => ({ name, title, uri, mimeType: MIME_TYPE })) } };
    case "resources/templates/list":
      return { result: { resourceTemplates: [] } };
    case "resources/read": {
      const provider = PROVIDERS.find(({ uri }) => uri === params.uri);
      if (!provider) return error(-32602, "Unknown resource URI");
      const state = record(record(params._meta)?.[STATE_KEY]) ?? {};
      const text = uiText(render, state, provider.variant);
      return { result: { contents: [{ uri: provider.uri, mimeType: MIME_TYPE, text }] } };
    }
    default:
      return error(-32601, "Method not found");
  }
}
function handleJsonRpcLine(line, render, serverVersion = "1.0.0") {
  line = line.trim();
  if (!line) return null;
  const reply = (id2, body) => JSON.stringify({ jsonrpc: "2.0", id: id2, ...body });
  let message;
  try {
    message = record(JSON.parse(line));
  } catch {
    return reply(null, error(-32700, "Parse error"));
  }
  if (message?.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return reply(null, error(-32600, "Invalid request"));
  }
  if (!Object.hasOwn(message, "id")) return null;
  const { id, method } = message;
  if (typeof id !== "string" && (typeof id !== "number" || !Number.isInteger(id))) {
    return reply(null, error(-32600, "Invalid request ID"));
  }
  const params = message.params === void 0 ? {} : record(message.params);
  if (!params) return reply(id, error(-32602, "Invalid parameters"));
  return reply(id, dispatch(method, params, render, serverVersion));
}
function startMcpServer(options) {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const reader = createInterface({ input, terminal: false, crlfDelay: Infinity });
  const close = () => reader.close();
  reader.on("error", close);
  output.on("error", close);
  void (async () => {
    try {
      for await (const line of reader) {
        const response = handleJsonRpcLine(line, options.render, options.serverVersion);
        if (response === null) continue;
        await new Promise((resolve4, reject) => {
          output.write(`${response}
`, (error2) => error2 ? reject(error2) : resolve4());
        });
      }
    } catch {
      close();
    }
  })();
}

// src/cli/ansi.ts
var ESC = "\x1B[";
var RESET = "\x1B[0m";
var DEFAULT_PAINT = {
  fg: null,
  bg: null,
  bold: false,
  italic: false,
  underline: false
};
var SEMANTIC_RGB = {
  primary: [60, 56, 54],
  surface: [251, 241, 199],
  accent: [7, 102, 120],
  black: [40, 40, 40],
  red: [157, 0, 6],
  green: [66, 123, 88],
  yellow: [181, 118, 20],
  blue: [7, 102, 120],
  magenta: [143, 63, 113],
  cyan: [66, 123, 88],
  white: [235, 219, 178],
  "status-model": [7, 102, 120],
  "status-path": [181, 118, 20],
  "status-branch": [143, 63, 113],
  "status-state": [175, 58, 3],
  "status-usage": [121, 116, 14],
  "status-limit": [7, 102, 120],
  "status-metadata": [124, 111, 100],
  "status-mode": [143, 63, 113],
  "status-thread": [60, 56, 54],
  "status-progress": [66, 123, 88]
};
function parseColor(color) {
  if (!color) return null;
  if (color.startsWith("#") && color.length === 7) {
    const r = Number.parseInt(color.slice(1, 3), 16);
    const g = Number.parseInt(color.slice(3, 5), 16);
    const b = Number.parseInt(color.slice(5, 7), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return [r, g, b];
    }
  }
  return SEMANTIC_RGB[color] ?? null;
}
function charDisplayWidth(ch) {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp === 0) return 0;
  if (cp >= 4352 && cp <= 4447 || cp >= 11904 && cp <= 42191 || cp >= 44032 && cp <= 55203 || cp >= 63744 && cp <= 64255 || cp >= 65040 && cp <= 65135 || cp >= 65280 && cp <= 65376 || cp >= 65504 && cp <= 65510) {
    return 2;
  }
  return 1;
}
function paintToAnsi(paint) {
  const codes = ["0"];
  if (paint.bold) codes.push("1");
  if (paint.italic) codes.push("3");
  if (paint.underline) codes.push("4");
  const fg = parseColor(paint.fg);
  if (fg) codes.push(`38;2;${fg[0]};${fg[1]};${fg[2]}`);
  const bg = parseColor(paint.bg);
  if (bg) codes.push(`48;2;${bg[0]};${bg[1]};${bg[2]}`);
  return `${ESC}${codes.join(";")}m`;
}
function samePaint(a, b) {
  return a.fg === b.fg && a.bg === b.bg && a.bold === b.bold && a.italic === b.italic && a.underline === b.underline;
}
function makeSpaces(count, paint) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ ch: " ", width: 1, paint });
  }
  return out;
}
function rowWidth(cells) {
  return cells.reduce((sum, c) => sum + c.width, 0);
}
function layoutElement(node, maxWidth, paint) {
  if (node === null) return { rows: [], width: 0 };
  if (typeof node === "string") {
    const lines = node.split("\n");
    const rows = [];
    let w = 0;
    for (const line of lines) {
      const cells = [];
      let cw = 0;
      for (const ch of line) {
        const display = ch === "\xA0" ? " " : ch;
        const dw = charDisplayWidth(display);
        cells.push({ ch: display, width: dw, paint });
        cw += dw;
      }
      rows.push(cells);
      if (cw > w) w = cw;
    }
    return { rows, width: w };
  }
  if (node.type === "bold") {
    return layoutInline(node.children, maxWidth, { ...paint, bold: true });
  }
  if (node.type === "italic") {
    return layoutInline(node.children, maxWidth, { ...paint, italic: true });
  }
  if (node.type === "underline" || node.type === "link") {
    return layoutInline(node.children, maxWidth, { ...paint, underline: true });
  }
  if (node.type === "text") {
    const nextPaint2 = {
      ...paint,
      fg: node.props?.color ?? paint.fg,
      bold: node.props?.weight === "bold" ? true : node.props?.weight === "normal" ? false : paint.bold,
      italic: node.props?.italic ?? paint.italic,
      underline: node.props?.underline ?? paint.underline
    };
    return layoutInline(node.children, maxWidth, nextPaint2);
  }
  const nextPaint = {
    ...paint,
    bg: node.props.background ?? paint.bg
  };
  const gap = node.props.gap;
  const wrap = node.props.wrap ?? "nowrap";
  const children = node.children.filter((c) => c !== null);
  if (wrap === "wrap" && gap >= 1e3) {
    const allRows = [];
    let w = 0;
    for (const child of children) {
      const box = layoutElement(child, maxWidth, nextPaint);
      for (const r of box.rows) {
        allRows.push(r);
        const rw = rowWidth(r);
        if (rw > w) w = rw;
      }
    }
    return { rows: allRows, width: w };
  }
  const isTwoColFlex = wrap === "nowrap" && children.length === 2 && typeof children[0] !== "string" && children[0].type === "row" && children[0].props.gap >= 1e3;
  if (isTwoColFlex) {
    const rightBox = layoutElement(children[1], maxWidth, nextPaint);
    const leftBudget = Math.max(16, maxWidth - gap - rightBox.width);
    const leftBox = layoutElement(children[0], leftBudget, nextPaint);
    const height = Math.max(leftBox.rows.length, rightBox.rows.length);
    const rightStart = Math.max(leftBox.width + gap, maxWidth - rightBox.width);
    const outRows2 = [];
    let maxW2 = 0;
    for (let y = 0; y < height; y++) {
      const lr = leftBox.rows[y] ?? [];
      const rr = rightBox.rows[y] ?? [];
      const lw = rowWidth(lr);
      const pad = Math.max(gap, rightStart - lw);
      const combined = [...lr, ...makeSpaces(pad, nextPaint), ...rr];
      const cw = rowWidth(combined);
      if (cw > maxW2) maxW2 = cw;
      outRows2.push(combined);
    }
    return { rows: outRows2, width: maxW2 };
  }
  const childBoxes = children.map((c) => layoutElement(c, maxWidth, nextPaint));
  const outRows = [];
  let currentLine = [];
  let currentW = 0;
  let maxW = 0;
  for (const box of childBoxes) {
    if (box.rows.length === 0) continue;
    const flat = box.rows[0] ?? [];
    const bw = rowWidth(flat);
    if (wrap === "wrap" && currentW > 0 && currentW + gap + bw > maxWidth) {
      outRows.push(currentLine);
      if (currentW > maxW) maxW = currentW;
      currentLine = [...flat];
      currentW = bw;
    } else {
      if (currentW > 0 && gap > 0) {
        currentLine.push(...makeSpaces(gap, nextPaint));
        currentW += gap;
      }
      currentLine.push(...flat);
      currentW += bw;
    }
  }
  if (currentLine.length > 0) {
    outRows.push(currentLine);
    if (currentW > maxW) maxW = currentW;
  }
  return { rows: outRows, width: maxW };
}
function layoutInline(children, maxWidth, paint) {
  const outRows = [[]];
  let maxW = 0;
  for (const child of children) {
    if (child === null) continue;
    const box = layoutElement(child, maxWidth, paint);
    for (let i = 0; i < box.rows.length; i++) {
      if (i > 0) outRows.push([]);
      const target = outRows[outRows.length - 1];
      target.push(...box.rows[i]);
      const w = rowWidth(target);
      if (w > maxW) maxW = w;
    }
  }
  return { rows: outRows, width: maxW };
}
function renderUiTreeToAnsi(tree, width2 = 112, canvasBg = null) {
  if (tree === null) return "";
  const basePaint = { ...DEFAULT_PAINT, bg: canvasBg };
  const box = layoutElement(tree, width2, basePaint);
  const lines = [];
  for (const cells of box.rows) {
    let out = "";
    let active = null;
    let col = 0;
    for (const cell of cells) {
      if (col + cell.width > width2) break;
      if (!active || !samePaint(active, cell.paint)) {
        out += paintToAnsi(cell.paint);
        active = cell.paint;
      }
      out += cell.ch;
      col += cell.width;
    }
    if (canvasBg && col < width2) {
      if (!active || !samePaint(active, basePaint)) {
        out += paintToAnsi(basePaint);
        active = basePaint;
      }
      out += " ".repeat(width2 - col);
    }
    if (active) out += RESET;
    lines.push(out);
  }
  return lines.join("\n");
}

// src/cli/preview.ts
var PALETTE_CANVAS_BG = {
  "gruvbox-light": "#FBF1C7",
  "gruvbox-dark": "#282828",
  "catppuccin-latte": "#EFF1F5",
  "catppuccin-mocha": "#1E1E2E",
  "tokyo-night": "#1A1B26",
  "rose-pine": "#191724",
  nord: "#2E3440",
  terminal: null
};
function createSampleContext(baseConfig, overrides = {}) {
  const nowMs = Date.now();
  const stateKind = overrides.state ?? "working";
  const usedPct = overrides.usedPct ?? 38;
  const usedTokens = Math.round(usedPct / 100 * 2e5);
  return {
    state: {
      account: {
        rate_limits: [
          {
            limit_id: "codex",
            limit_name: "Codex",
            primary_limit: { used_percent: 32, window_minutes: 300, resets_at: Math.floor(nowMs / 1e3) + 7200 },
            secondary_limit: { used_percent: 64, window_minutes: 10080, resets_at: Math.floor(nowMs / 1e3) + 172800 }
          }
        ]
      },
      app: { cli_version: "0.172.0", display_mode: "standard" },
      thread: {
        id: "preview-thread-01",
        name: "Codex Statusline Studio",
        agent: { state: stateKind },
        model: {
          display_name: "GPT-6.2-Sol",
          id: "gpt-6.2-sol",
          provider: "custom",
          reasoning_level: "max"
        },
        workspace: { cwd: "/workspace/codex-cometix" },
        usage: {
          context: {
            context_window_size: 2e5,
            used_tokens: usedTokens,
            used_percentage: usedPct
          },
          total: {
            total_input_tokens: 12e4,
            cache_read_input_tokens: 112800,
            cache_write_input_tokens: 2400,
            other_input_tokens: 4800,
            output_tokens: 6400
          },
          cost: { total_cost_usd: 0.42 }
        }
      }
    },
    config: baseConfig,
    variant: overrides.variant ?? "standard",
    nowMs,
    git: {
      isRepo: true,
      branch: "feat/cometix-whale",
      detached: false,
      dirty: true,
      staged: true,
      untracked: false,
      ahead: 2,
      behind: 0,
      added: 148,
      deleted: 23,
      worktree: false,
      updatedAt: nowMs
    },
    context: {
      usedPct,
      remainingPct: 100 - usedPct,
      usedTokens,
      windowSize: 2e5,
      sparklineSamples: [18e3, 26e3, 39e3, 48e3, 58e3, 66e3, usedTokens],
      deltaTokens: 1e4
    },
    cache: {
      hitPct: 94,
      cachedTokens: 112800,
      totalInputTokens: 12e4
    },
    quotas: [
      {
        label: "5h",
        usedPct: 32,
        remainingPct: 68,
        windowMinutes: 300,
        resetsAt: Math.floor(nowMs / 1e3) + 7200,
        resetText: "16:44",
        paceDeltaPct: -8
      },
      {
        label: "7d",
        usedPct: 64,
        remainingPct: 36,
        windowMinutes: 10080,
        resetsAt: Math.floor(nowMs / 1e3) + 172800,
        resetText: "Sat 16:08",
        paceDeltaPct: 14
      }
    ],
    cost: {
      sessionUsd: 0.42,
      todayUsd: 1.85,
      estimated: false
    },
    timing: {
      turnElapsedSec: stateKind === "working" || stateKind === "thinking" ? 14 : null,
      sessionElapsedSec: 492,
      outputTps: stateKind === "working" ? 86 : null
    },
    animationTick: overrides.tick ?? 0
  };
}
function renderCard(title, ctx, width2, paintCanvas = true) {
  const tree = renderStatusline(ctx);
  const stats = inspectUiTree(tree);
  const badge = stats.valid ? `${stats.nodes}/256 nodes \xB7 ${stats.jsonBytes}B` : `INVALID: ${stats.reason}`;
  const header = `\x1B[2m\u2500\u2500 ${title}  (${badge}) \u2500\u2500\x1B[0m`;
  const canvasBg = paintCanvas ? PALETTE_CANVAS_BG[ctx.config.palette] : null;
  const rendered = renderUiTreeToAnsi(tree, width2, canvasBg);
  return `${header}
${rendered}
`;
}
async function runPreview(baseConfig, opts) {
  const width2 = opts.width ?? Math.min(116, Math.max(76, (process.stdout.columns ?? 110) - 2));
  const cfg = {
    ...baseConfig,
    skin: opts.skin ?? baseConfig.skin,
    palette: opts.palette ?? baseConfig.palette
  };
  if (opts.animate) {
    const totalBeats = 12;
    process.stdout.write("\x1B[?25l");
    try {
      for (let step = 0; step < totalBeats; step++) {
        const isDance = step >= 3;
        const tick = isDance ? step - 3 : step;
        const frameName = isDance ? WHALE_DANCE_FRAMES[tick % WHALE_DANCE_FRAMES.length].name : WHALE_IDLE_FRAMES[tick % WHALE_IDLE_FRAMES.length].name;
        const ctx = createSampleContext(cfg, {
          variant: "whale",
          state: isDance ? "working" : "ready",
          usedPct: isDance ? 42 + tick * 4 : 38,
          tick
        });
        if (step > 0) {
          process.stdout.write("\x1B[4A\x1B[J");
        }
        process.stdout.write(
          renderCard(
            `LIVE 1FPS [${isDance ? "WORKING \xB7 \u300A\u843D\u6CEA\u300B\u70ED\u821E" : "IDLE \xB7 \u6478\u9C7C\u5410\u6CE1\u6CE1"}] ${frameName}`,
            ctx,
            width2
          )
        );
        await new Promise((r) => setTimeout(r, 900));
      }
    } finally {
      process.stdout.write("\x1B[?25h");
    }
    return;
  }
  if (opts.frames) {
    console.log(renderCard("WHALE IDLE \xB7 \u6478\u9C7C\u5410\u6CE1\u6CE1", createSampleContext(cfg, { variant: "whale", state: "ready", tick: 0 }), width2));
    for (let i = 0; i < WHALE_DANCE_FRAMES.length; i++) {
      console.log(
        renderCard(
          `WHALE BEAT ${i + 1}/8 \xB7 ${WHALE_DANCE_FRAMES[i].name}`,
          createSampleContext(cfg, { variant: "whale", state: "working", usedPct: 35 + i * 7, tick: i }),
          width2
        )
      );
    }
    return;
  }
  if (opts.allSkins) {
    const skins = ["editorial", "pill", "plain"];
    for (const skin of skins) {
      console.log(
        renderCard(
          `skin=${skin} \xB7 palette=${cfg.palette} \xB7 ${opts.variant}`,
          createSampleContext({ ...cfg, skin }, { variant: opts.variant, state: "working", tick: 0 }),
          width2
        )
      );
    }
    return;
  }
  if (opts.allPalettes) {
    const palettes = [
      "gruvbox-light",
      "gruvbox-dark",
      "catppuccin-latte",
      "catppuccin-mocha",
      "tokyo-night",
      "rose-pine",
      "nord",
      "terminal"
    ];
    for (const palette of palettes) {
      console.log(
        renderCard(
          `palette=${palette} \xB7 skin=${cfg.skin}`,
          createSampleContext({ ...cfg, palette }, { variant: opts.variant, state: "working", tick: 1 }),
          width2
        )
      );
    }
    return;
  }
  console.log(renderCard(`Standard \xB7 skin=${cfg.skin} \xB7 palette=${cfg.palette} (ready)`, createSampleContext(cfg, { variant: "standard", state: "ready", usedPct: 24, tick: 0 }), width2));
  console.log(renderCard(`Standard \xB7 skin=${cfg.skin} \xB7 palette=${cfg.palette} (working \xB7 high ctx)`, createSampleContext(cfg, { variant: "standard", state: "working", usedPct: 78, tick: 2 }), width2));
  console.log(renderCard(`DS Fat Fish \xB7 Idle \u6478\u9C7C\u5410\u6CE1\u6CE1`, createSampleContext(cfg, { variant: "whale", state: "ready", usedPct: 24, tick: 0 }), width2));
  console.log(renderCard(`DS Fat Fish \xB7 Working \u300A\u843D\u6CEA\u300BBeat 1 (\u6211\u771F\u7684\u7279\u522B\u7231\u4F60)`, createSampleContext(cfg, { variant: "whale", state: "working", usedPct: 52, tick: 0 }), width2));
  console.log(renderCard(`DS Fat Fish \xB7 Working \u300A\u843D\u6CEA\u300BBeat 4 (\u4E3A\u4EC0\u4E48\u4F60\u5728\u6D41\u6CEA)`, createSampleContext(cfg, { variant: "whale", state: "working", usedPct: 68, tick: 3 }), width2));
}

// src/cli/installer.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { mkdirSync as mkdirSync2, readFileSync as readFileSync4, realpathSync, renameSync as renameSync2, statSync as statSync3, unlinkSync as unlinkSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { homedir as homedir4 } from "node:os";
import { dirname as dirname2, join as join4, resolve as resolve3 } from "node:path";
var FEATURE = ["features", "tui_extensions_statusline"];
var PROVIDER = ["tui", "status_line_provider"];
var LEGACY_SERVER = "local-session-status";
function isPrefix(prefix, path2) {
  return prefix.length <= path2.length && prefix.every((part, index) => part === path2[index]);
}
function samePath(left, right) {
  return left.length === right.length && isPrefix(left, right);
}
function lineEnd(source, start) {
  const newline = source.indexOf("\n", start);
  return newline === -1 ? source.length : newline + 1;
}
function skipSpaces(source, start) {
  while (source[start] === " " || source[start] === "	") start += 1;
  return start;
}
function quotedEnd(source, start) {
  const quote = source[start];
  const triple = quote.repeat(3);
  const multiline = source.startsWith(triple, start);
  for (let pos = start + (multiline ? 3 : 1); pos < source.length; pos += 1) {
    if (quote === '"' && source[pos] === "\\") {
      pos += 1;
    } else if (source[pos] === quote) {
      if (!multiline) return pos + 1;
      if (source.startsWith(triple, pos)) {
        let end = pos + 3;
        while (end < pos + 5 && source[end] === quote) end += 1;
        return end;
      }
    } else if (!multiline && source[pos] === "\n") {
      break;
    }
  }
  throw new SyntaxError(`Unterminated TOML string at offset ${start}`);
}
function decodeString(text) {
  const quote = text[0];
  if (quote !== "'" && quote !== '"') return void 0;
  const multiline = text.startsWith(quote.repeat(3));
  const width2 = multiline ? 3 : 1;
  let value = text.slice(width2, -width2);
  if (multiline) value = value.replace(/^\r?\n/, "").replaceAll("\r\n", "\n");
  if (quote === "'") return value;
  const escapes = { '"': '"', "\\": "\\", b: "\b", t: "	", n: "\n", f: "\f", r: "\r" };
  return value.replace(
    /\\(["\\btnfr]|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[ \t]*\n[ \t\n]*)/g,
    (_, escape) => {
      if (escape.startsWith("u") || escape.startsWith("U")) {
        return String.fromCodePoint(Number.parseInt(escape.slice(1), 16));
      }
      return escapes[escape] ?? "";
    }
  );
}
function readKey(source, start) {
  const path2 = [];
  let end = start;
  do {
    const pos = skipSpaces(source, end);
    if (source[pos] === '"' || source[pos] === "'") {
      end = quotedEnd(source, pos);
      path2.push(decodeString(source.slice(pos, end)));
    } else {
      const key = /^[A-Za-z0-9_-]+/.exec(source.slice(pos))?.[0];
      if (key === void 0) throw new SyntaxError(`Invalid TOML key at offset ${pos}`);
      path2.push(key);
      end = pos + key.length;
    }
    end = skipSpaces(source, end);
    if (source[end] !== ".") return { path: path2, end };
    end += 1;
  } while (true);
}
function readValue(source, start, inline2) {
  const closing = [];
  let end = start;
  for (let pos = start; pos < source.length; pos += 1) {
    const char = source[pos];
    if (char === '"' || char === "'") {
      end = quotedEnd(source, pos);
      pos = end - 1;
      continue;
    }
    if (closing.length === 0 && (char === "#" || char === "\n" || char === "\r" || inline2 && (char === "," || char === "}"))) break;
    if (char === "#") {
      pos = lineEnd(source, pos) - 1;
      continue;
    }
    if (char === "[" || char === "{") closing.push(char === "[" ? "]" : "}");
    if ((char === "]" || char === "}") && closing.pop() !== char) {
      throw new SyntaxError(`Unmatched TOML bracket at offset ${pos}`);
    }
    if (!/[ \t\r\n]/.test(char)) end = pos + 1;
  }
  if (end === start || closing.length) throw new SyntaxError(`Incomplete TOML value at offset ${start}`);
  return { start, end };
}
function readAssignment(source, start, scope, inline2) {
  const key = readKey(source, start);
  if (source[key.end] !== "=") throw new SyntaxError(`Expected TOML assignment at offset ${key.end}`);
  const value = readValue(source, skipSpaces(source, key.end + 1), inline2);
  return {
    path: [...scope, ...key.path],
    scope,
    value,
    start,
    outerStart: start,
    end: inline2 ? value.end : lineEnd(source, value.end)
  };
}
function scanToml(source) {
  const tables = [];
  const entries = [];
  let scope = [];
  let start = source.startsWith("\uFEFF") ? 1 : 0;
  while (start < source.length) {
    const pos = skipSpaces(source, start);
    if (source[pos] === "[") {
      const closer = source[pos + 1] === "[" ? "]]" : "]";
      const { path: path2, end } = readKey(source, pos + closer.length);
      if (!source.startsWith(closer, end)) throw new SyntaxError(`Incomplete TOML table at offset ${start}`);
      scope = path2;
      const next = lineEnd(source, end + closer.length);
      tables.push({ path: path2, start, end: next });
      start = next;
    } else if (pos === source.length || /[#\r\n]/.test(source[pos])) {
      start = lineEnd(source, pos);
    } else {
      const entry = readAssignment(source, start, scope, false);
      entries.push(entry);
      start = entry.end;
    }
  }
  return { tables, entries };
}
function skipInlineTrivia(source, start) {
  while (start < source.length) {
    if (source[start] === "#") start = lineEnd(source, start);
    else if (/[ \t\r\n]/.test(source[start])) start += 1;
    else break;
  }
  return start;
}
function inlineEntries(source, parent) {
  const entries = [];
  let start = skipInlineTrivia(source, parent.value.start + 1);
  let before;
  while (start < parent.value.end - 1) {
    const entry = readAssignment(source, start, parent.path, true);
    const comma = skipInlineTrivia(source, entry.end);
    const after = source[comma] === "," ? comma : void 0;
    entry.commas = { before, after };
    entry.outerStart = parent.outerStart;
    entries.push(entry);
    if (after === void 0) break;
    before = after;
    start = skipInlineTrivia(source, after + 1);
  }
  return entries;
}
function closestAssignment(source, entries, path2) {
  for (const entry of entries) {
    if (!isPrefix(entry.path, path2)) continue;
    if (!samePath(entry.path, path2) && source[entry.value.start] === "{") {
      return closestAssignment(source, inlineEntries(source, entry), path2) ?? entry;
    }
    return entry;
  }
  return void 0;
}
function findInlineInPath(source, entries, path2) {
  for (const entry of entries) {
    if (entry.commas && isPrefix(path2, entry.path)) return entry;
    if (isPrefix(entry.path, path2) && source[entry.value.start] === "{") {
      const match = findInlineInPath(source, inlineEntries(source, entry), path2);
      if (match) return match;
    }
  }
  return void 0;
}
function editAll(source, edits) {
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  }
  return source;
}
function commentsIn(source, span2) {
  let text = "";
  for (let pos = span2.start; pos < span2.end; pos += 1) {
    if (source[pos] === '"' || source[pos] === "'") {
      pos = quotedEnd(source, pos) - 1;
    } else if (source[pos] === "#") {
      const start = Math.max(span2.start, source.lastIndexOf("\n", pos - 1) + 1);
      const end = Math.min(span2.end, lineEnd(source, pos));
      text += source.slice(start, skipSpaces(source, start)) + source.slice(pos, end);
      pos = end - 1;
    }
  }
  return text;
}
function removePath(source, path2) {
  let document = scanToml(source);
  const direct = [...document.tables, ...document.entries].filter((entry) => isPrefix(path2, entry.path));
  source = editAll(source, direct.map(({ start, end }) => ({ start, end, text: commentsIn(source, { start, end }) })));
  if (direct.length) document = scanToml(source);
  let nested = findInlineInPath(source, document.entries, path2);
  while (nested) {
    const { start, end, outerStart, commas } = nested;
    const comma = commas?.after ?? commas?.before;
    const edits = [{ start, end, text: "" }];
    if (comma !== void 0) edits.push({ start: comma, end: comma + 1, text: "" });
    const comments = commentsIn(source, { start, end });
    if (comments) edits.push({ start: outerStart, end: outerStart, text: comments });
    source = editAll(source, edits);
    nested = findInlineInPath(source, scanToml(source).entries, path2);
  }
  return source;
}
function basicString(value) {
  return JSON.stringify(value).replace(/\u007f/g, "\\u007F");
}
function pathString(value) {
  return /['\x00-\x1f\x7f]/.test(value) ? basicString(value) : `'${value}'`;
}
function keyString(path2) {
  return path2.map((key) => /^[A-Za-z0-9_-]+$/.test(key) ? key : basicString(key)).join(".");
}
function insertLines(source, at, lines, newline) {
  const before = source.slice(0, at);
  const prefix = before && before !== "\uFEFF" && !before.endsWith("\n") ? newline : "";
  return before + prefix + lines + newline + source.slice(at);
}
function setValue(source, path2, value) {
  const { tables, entries } = scanToml(source);
  const closest = closestAssignment(source, entries, path2);
  if (closest) {
    if (samePath(closest.path, path2)) {
      const comments = commentsIn(source, closest.value);
      return editAll(source, [
        { ...closest.value, text: value },
        { start: closest.outerStart, end: closest.outerStart, text: comments }
      ]);
    }
    if (source[closest.value.start] !== "{") {
      throw new SyntaxError(`Expected TOML table at ${keyString(closest.path)}`);
    }
    const last = inlineEntries(source, closest).at(-1);
    const insertion = last?.commas?.after ?? last?.end ?? closest.value.start + 1;
    const added = `${keyString(path2.slice(closest.path.length))} = ${value}`;
    const text = last ? `, ${added}` : ` ${added} `;
    return editAll(source, [{ start: insertion, end: insertion, text }]);
  }
  const newline = /\r?\n/.exec(source)?.[0] ?? "\n";
  const parent = path2.slice(0, -1);
  const table = tables.find((candidate) => samePath(candidate.path, parent));
  if (table) {
    const last = entries.findLast((entry) => entry.scope === table.path);
    return insertLines(source, last?.end ?? table.end, `${keyString(path2.slice(-1))} = ${value}`, newline);
  }
  const dotted = entries.find((entry) => entry.scope.length < parent.length && isPrefix(parent, entry.path));
  if (dotted) {
    return insertLines(source, dotted.end, `${keyString(path2.slice(dotted.scope.length))} = ${value}`, newline);
  }
  const separator = source.replace(/^\uFEFF/, "") && !/(?:\r?\n){2}$/.test(source) ? newline : "";
  return insertLines(source, source.length, `${separator}[${keyString(parent)}]${newline}${keyString(path2.slice(-1))} = ${value}`, newline);
}
function updateCodexConfigToml(tomlContent, options) {
  let source = tomlContent;
  for (const legacy of options.removeLegacyServers ?? []) {
    if (legacy !== options.serverName) source = removePath(source, ["mcp_servers", legacy]);
  }
  source = setValue(source, FEATURE, "true");
  const provider = closestAssignment(source, scanToml(source).entries, PROVIDER);
  if (!provider || !samePath(provider.path, PROVIDER)) source = removePath(source, PROVIDER);
  source = setValue(source, PROVIDER, `{ server = ${basicString(options.serverName)}, tool = ${basicString(options.toolName)} }`);
  const server = ["mcp_servers", options.serverName];
  for (const key of ["url", "bearer_token_env_var", "http_headers", "env_http_headers", "enabled"]) {
    source = removePath(source, [...server, key]);
  }
  source = setValue(source, [...server, "command"], pathString(options.nodePath));
  return setValue(source, [...server, "args"], `[${pathString(options.bundlePath)}]`);
}
function removeCodexConfigToml(tomlContent, serverName) {
  const key = [...PROVIDER, "server"];
  const provider = closestAssignment(tomlContent, scanToml(tomlContent).entries, key);
  const removeProvider = provider && samePath(provider.path, key) && decodeString(tomlContent.slice(provider.value.start, provider.value.end)) === serverName;
  const source = removeProvider ? removePath(tomlContent, PROVIDER) : tomlContent;
  return removePath(source, ["mcp_servers", serverName]);
}
function codexDirectory() {
  return process.env.CODEX_HOME || join4(homedir4(), ".codex");
}
function readConfig(filePath) {
  try {
    return readFileSync4(filePath, "utf8");
  } catch (error2) {
    if (error2.code === "ENOENT") return "";
    throw error2;
  }
}
function writeConfig(filePath, content) {
  let target = filePath;
  let mode = 384;
  try {
    target = realpathSync(filePath);
    mode = statSync3(target).mode & 511;
  } catch (error2) {
    if (error2.code !== "ENOENT") throw error2;
  }
  mkdirSync2(dirname2(target), { recursive: true });
  const temporary = `${target}.${process.pid}-${randomUUID2()}.tmp`;
  try {
    writeFileSync2(temporary, content, { encoding: "utf8", flag: "wx", mode });
    renameSync2(temporary, target);
  } catch (error2) {
    try {
      unlinkSync2(temporary);
    } catch {
    }
    throw error2;
  }
}
function resolveStableNodePath(explicit) {
  const candidate = explicit ?? process.execPath;
  try {
    return realpathSync(candidate);
  } catch {
    return candidate;
  }
}
function installStatusline(options) {
  const configPath = resolve3(options.configTomlPath ?? join4(codexDirectory(), "config.toml"));
  const current = readConfig(configPath);
  const next = updateCodexConfigToml(current, {
    serverName: ENTRYPOINTS.SERVER_NAME,
    toolName: options.defaultVariant === "whale" ? ENTRYPOINTS.WHALE_TOOL : ENTRYPOINTS.STANDARD_TOOL,
    nodePath: resolveStableNodePath(options.nodePath),
    bundlePath: resolve3(options.bundlePath),
    removeLegacyServers: options.removeLegacyPython ? [LEGACY_SERVER] : []
  });
  if (next !== current) writeConfig(configPath, next);
  let removedLegacyFile = false;
  if (options.removeLegacyPython) {
    const legacyPath = options.legacyPythonPath ?? join4(codexDirectory(), "statuslines", "session-status.py");
    try {
      unlinkSync2(legacyPath);
      removedLegacyFile = true;
    } catch (error2) {
      if (error2.code !== "ENOENT") throw error2;
    }
  }
  return { configPath, removedLegacyFile };
}
function uninstallStatusline(options = {}) {
  const configPath = resolve3(options.configTomlPath ?? join4(codexDirectory(), "config.toml"));
  const current = readConfig(configPath);
  const next = removeCodexConfigToml(current, ENTRYPOINTS.SERVER_NAME);
  if (next !== current) writeConfig(configPath, next);
  return { configPath, changed: next !== current };
}

// src/index.ts
function parseFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  const prefixed = args.find((a) => a.startsWith(`${flag}=`));
  return prefixed ? prefixed.slice(flag.length + 1) : void 0;
}
function printHelp() {
  console.log(`codex-cometix \u2014 Custom Codex CLI Statusline (Dual-Line Studio & DS Fat Fish Edition)

Usage:
  codex-cometix                           Start stdio MCP statusline server (for Codex CLI)
  codex-cometix preview [options]         Preview statusline directly in terminal
    --whale                               Preview DS Fat Fish edition
    --animate                             Play live 1 FPS idle -> \u300A\u843D\u6CEA\u300B dance animation
    --frames                              Print all 8 \u300A\u843D\u6CEA\u300B dance beats statically
    --all-skins                           Compare editorial, pill, and plain skins
    --all-palettes                        Compare all 8 curated light/dark palettes
    --skin <editorial|pill|plain>         Override skin
    --palette <name>                      Override palette (default: gruvbox-light)
    --width <cols>                        Simulate terminal width
  codex-cometix install [--standard|--whale] [--clean-legacy]
                                          Configure ~/.codex/config.toml automatically
  codex-cometix uninstall                 Remove codex-cometix from ~/.codex/config.toml
`);
}
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd || cmd === "mcp" || cmd === "serve") {
    const configLoader = new ConfigLoader();
    const git = new GitCollector();
    const ledger = new CostLedger();
    const tracker = new SessionTracker({ git, ledger });
    process.on("exit", () => {
      tracker.dispose();
      ledger.flushSync();
    });
    startMcpServer({
      render: (state, variant) => {
        const config = configLoader.get();
        const ctx = tracker.buildRenderContext(state, config, variant);
        return renderStatusline(ctx);
      }
    });
    return;
  }
  if (cmd === "-h" || cmd === "--help" || cmd === "help") {
    printHelp();
    return;
  }
  if (cmd === "preview") {
    const configLoader = new ConfigLoader();
    const loaded = configLoader.get();
    const skin = parseFlagValue(args, "--skin");
    const palette = parseFlagValue(args, "--palette");
    const widthRaw = parseFlagValue(args, "--width");
    const width2 = widthRaw ? Number.parseInt(widthRaw, 10) : void 0;
    await runPreview(loaded ?? DEFAULT_CONFIG, {
      variant: args.includes("--whale") ? "whale" : "standard",
      skin,
      palette,
      allSkins: args.includes("--all-skins"),
      allPalettes: args.includes("--all-palettes"),
      animate: args.includes("--animate"),
      frames: args.includes("--frames"),
      width: width2 && !Number.isNaN(width2) ? width2 : void 0
    });
    return;
  }
  if (cmd === "install") {
    const currentFile = fileURLToPath(import.meta.url);
    const bundlePath = currentFile.endsWith(".mjs") ? currentFile : path.resolve(path.dirname(currentFile), "../dist/index.mjs");
    const defaultVariant = args.includes("--standard") ? "standard" : "whale";
    const result = installStatusline({
      bundlePath,
      defaultVariant,
      removeLegacyPython: args.includes("--clean-legacy")
    });
    console.log(`Installed codex-cometix (${defaultVariant}) -> ${result.configPath}`);
    if (result.removedLegacyFile) {
      console.log("Removed legacy ~/.codex/statuslines/session-status.py");
    }
    console.log("Restart Codex CLI or run /statusline to switch between Standard and DS Fat Fish editions.");
    return;
  }
  if (cmd === "uninstall") {
    const result = uninstallStatusline();
    console.log(
      result.changed ? `Removed codex-cometix from ${result.configPath}` : `codex-cometix was not present in ${result.configPath}`
    );
    return;
  }
  console.error(`Unknown command: ${cmd}`);
  printHelp();
  process.exitCode = 1;
}
void main();
