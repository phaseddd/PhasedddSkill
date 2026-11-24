import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, rmdirSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import type { TestContext } from "node:test";
import type { RateLimitSnapshot, RunState, StatuslineState, TokenUsage } from "../src/protocol/types.js";
import "./register-source.js";

const { ConfigLoader, DEFAULT_CONFIG, getConfigPath, normalizeConfig } = await import("../src/config/schema.js");
const { BUILTIN_PRICING, estimateTokenCostUsd, resolveModelPrice } = await import("../src/config/pricing.js");
const { GitCollector, parseGitPorcelainV2, parseGitShortStat } = await import("../src/collectors/git.js");
const { CostLedger, getLedgerPath, localDateKey } = await import("../src/collectors/ledger.js");
const { SessionTracker, computePaceDeltaPct, formatResetTime } = await import("../src/collectors/session-tracker.js");
const { installStatusline, removeCodexConfigToml, uninstallStatusline, updateCodexConfigToml } = await import("../src/cli/installer.js");
const { ENTRYPOINTS } = await import("../src/protocol/types.js");

function temporaryDirectory(t: TestContext): string {
  const parent = realpathSync(tmpdir());
  const directory = mkdtempSync(join(parent, "codex-cometix-test-"));
  t.after(() => {
    const target = realpathSync(directory);
    assert.equal(dirname(target), parent);
    rmSync(target, { recursive: true, force: true, maxRetries: 3 });
  });
  return directory;
}

function overrideEnv(t: TestContext, key: string, value: string): void {
  const previous = process.env[key];
  process.env[key] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });
}

async function waitFor<T>(probe: () => T | null | undefined): Promise<T> {
  const deadline = performance.now() + 5000;
  do {
    const result = probe();
    if (result !== null && result !== undefined) return result;
    await delay(20);
  } while (performance.now() < deadline);
  throw new Error("Timed out waiting for the background collector");
}

const exampleUsage: TokenUsage = {
  total_input_tokens: 1_000_000,
  other_input_tokens: 300_000,
  cache_write_input_tokens: 100_000,
  cache_read_input_tokens: 600_000,
  output_tokens: 200_000,
};

test("config normalizes fields independently and retains well-formed pricing overrides", () => {
  const price = { inputPerMillion: 2, cachedInputPerMillion: 0, outputPerMillion: 3 };
  assert.deepEqual(normalizeConfig({
    skin: "pill", palette: "missing", glyphs: "ascii", percentMode: "remaining", barWidth: 11, quotaBarWidth: 0,
    modules: { git: false, cache: "off", timer: false, bogus: true },
    pricingOverrides: { " Custom ": price, bad: { ...price, outputPerMillion: -1 }, "": price, invalid: null },
  }), {
    ...DEFAULT_CONFIG,
    skin: "pill", glyphs: "ascii", percentMode: "remaining", barWidth: 11,
    modules: { ...DEFAULT_CONFIG.modules, git: false, timer: false },
    pricingOverrides: { Custom: price },
  });
  assert.deepEqual(normalizeConfig({ barWidth: 2.5, modules: [] }), DEFAULT_CONFIG);
  assert.equal(normalizeConfig(null), DEFAULT_CONFIG);
  assert.equal(normalizeConfig([]), DEFAULT_CONFIG);
});

test("config loader caches by file version and recovers from missing, corrupt, or replaced files", (t) => {
  const directory = temporaryDirectory(t);
  const path = join(directory, "settings.json");
  overrideEnv(t, "CODEX_COMETIX_CONFIG", path);
  assert.equal(getConfigPath(), path);
  const loader = new ConfigLoader();
  assert.equal(loader.get(), DEFAULT_CONFIG);
  writeFileSync(path, '\uFEFF{"skin":"pill"}');
  const first = loader.get();
  assert.equal(first.skin, "pill");
  assert.equal(loader.get(), first);
  writeFileSync(path, "invalid json");
  assert.equal(loader.get(), DEFAULT_CONFIG);
  assert.equal(loader.get(), DEFAULT_CONFIG);
  writeFileSync(path, '{"skin":"plain","barWidth":9}');
  assert.equal(loader.get().skin, "plain");
  assert.equal(loader.get().barWidth, 9);
  unlinkSync(path);
  assert.equal(loader.get(), DEFAULT_CONFIG);
});

test("pricing chooses the longest case-insensitive alias and gives user overrides precedence", () => {
  assert.equal(resolveModelPrice("OPENAI/GPT-5.4-MINI-2026-03-17", undefined), BUILTIN_PRICING["gpt-5.4-mini"]);
  assert.equal(resolveModelPrice(undefined, "GPT-6.2 Sol (max)"), BUILTIN_PRICING["gpt-6.2-sol"]);
  assert.equal(resolveModelPrice("custom", "Claude Opus 4.6"), BUILTIN_PRICING["claude-opus-4-6"]);
  assert.equal(resolveModelPrice(undefined, "Claude 3.5 Sonnet"), BUILTIN_PRICING["claude-3-5-sonnet"]);
  assert.equal(resolveModelPrice("gemini-2.5-flash-lite-preview", undefined), BUILTIN_PRICING["gemini-2.5-flash-lite"]);
  assert.equal(resolveModelPrice("codex-mini-latest", undefined), BUILTIN_PRICING["codex-mini"]);
  assert.equal(resolveModelPrice("deepseek-v4-pro", "DeepSeek V4 Pro"), BUILTIN_PRICING["deepseek-v4-pro"]);
  assert.equal(resolveModelPrice("unrecognized", " "), null);

  const broad = { inputPerMillion: 100, cachedInputPerMillion: 0, outputPerMillion: 10 };
  const specific = { ...broad, inputPerMillion: 25 };
  assert.equal(resolveModelPrice("gpt-5.4-mini", undefined, { "GPT-5": broad }), broad);
  assert.equal(resolveModelPrice("gpt-5.4-mini", undefined, { "GPT-5": broad, "gPt-5.4": specific }), specific);
  assert.equal(resolveModelPrice("unrecognized", undefined, { " ": broad }), null);
});

test("pricing charges cache writes at the input rate and charges cache reads separately", () => {
  const price = { inputPerMillion: 1, cachedInputPerMillion: 0.5, outputPerMillion: 2 };
  assert.ok(Math.abs(estimateTokenCostUsd(exampleUsage, price)! - 1.1) < 1e-12);
  assert.equal(estimateTokenCostUsd(exampleUsage, null), null);
  assert.equal(estimateTokenCostUsd(undefined, price), null);
  assert.equal(estimateTokenCostUsd({ ...exampleUsage, other_input_tokens: -1, cache_read_input_tokens: 0,
    cache_write_input_tokens: 0, output_tokens: NaN }, price), null);
  assert.equal(estimateTokenCostUsd(exampleUsage, { inputPerMillion: 0, cachedInputPerMillion: 0, outputPerMillion: 0 }), 0);
});

test("Git porcelain parses ordinary changes, detached and unborn HEAD, conflicts, and NUL rename records", () => {
  assert.deepEqual(parseGitPorcelainV2([
    "# branch.oid 0123456789abcdef", "# branch.head feature/cache", "# branch.upstream origin/feature/cache", "# branch.ab +2 -5",
    "1 .M N... 100644 100644 100644 a b changed.txt", "1 A. N... 000000 100644 100644 a b staged.txt", "? untracked.txt",
    "! ignored.txt", "",
  ].join("\r\n")), { branch: "feature/cache", detached: false, dirty: true, staged: true, untracked: true, ahead: 2, behind: 5 });
  assert.deepEqual(parseGitPorcelainV2([
    "# branch.oid 0123456789abcdef", "# branch.head (detached)", "2 R. N... 100644 100644 100644 a b R100 new.txt",
    "# branch.head is-a-filename", "? untracked\nwith-a-newline", "",
  ].join("\0")), { branch: "0123456", detached: true, dirty: false, staged: true, untracked: true, ahead: 0, behind: 0 });
  assert.deepEqual(parseGitPorcelainV2("# branch.oid (initial)\n# branch.head main\nu UU N... x\n"), {
    branch: "main", detached: false, dirty: true, staged: false, untracked: false, ahead: 0, behind: 0,
  });
});

test("Git shortstat handles missing counters and singular/plural wording", () => {
  assert.deepEqual(parseGitShortStat(" 2 files changed, 18 insertions(+), 1 deletion(-)\n"), { added: 18, deleted: 1 });
  assert.deepEqual(parseGitShortStat(" 1 file changed, 1 insertion(+)\n"), { added: 1, deleted: 0 });
  assert.deepEqual(parseGitShortStat(" 1 file changed, 9 deletions(-)\n"), { added: 0, deleted: 9 });
  assert.deepEqual(parseGitShortStat(""), { added: 0, deleted: 0 });
});

test("Git collector serves stale caches during deduplicated probes and recognizes worktrees", { timeout: 16_000 }, async (t) => {
  if (spawnSync("git", ["--version"], { windowsHide: true }).status !== 0) {
    t.skip("Git is unavailable");
    return;
  }
  const directory = temporaryDirectory(t);
  const repo = join(directory, "repo");
  const worktree = join(directory, "worktree");
  const nonRepo = join(directory, "elsewhere");
  mkdirSync(repo);
  mkdirSync(nonRepo);
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=Cometix Test", "-c", "user.email=test@example.invalid",
    "-c", "commit.gpgSign=false", "-c", "core.autocrlf=false", ...args], { cwd: repo, windowsHide: true, stdio: "pipe" });
  git("init", "--template=", "-b", "main");
  const tracked = join(repo, "tracked.txt");
  writeFileSync(tracked, "first\nold\nlast\n");
  git("add", "tracked.txt");
  git("commit", "-m", "initial");
  git("worktree", "add", "--detach", worktree, "HEAD");
  const trace = join(directory, "trace.jsonl");
  overrideEnv(t, "GIT_TRACE2_EVENT", trace);
  const collector = new GitCollector({ ttlMs: 1000 });
  try {
    const now = 10_000;
    assert.equal(collector.get(undefined, now), null);
    for (let n = 0; n < 25; n += 1) assert.equal(collector.get(repo, now), null);
    const clean = await waitFor(() => collector.get(repo, now));
    assert.equal(clean.branch, "main");
    assert.equal(clean.isRepo, true);
    assert.equal(clean.worktree, false);
    assert.equal(clean.dirty, false);
    const starts = readFileSync(trace, "utf8").trim().split("\n").map((line) => JSON.parse(line) as {
      event: string; argv?: string[];
    }).filter((event) => event.event === "start" && event.argv?.includes("status"));
    assert.equal(starts.length, 1);

    writeFileSync(tracked, "first\nnew\nlast\nextra\n");
    writeFileSync(join(repo, "staged.txt"), "staged\n");
    git("add", "staged.txt");
    writeFileSync(join(repo, "untracked.txt"), "untracked\n");
    assert.equal(collector.get(repo, now + 999), clean);
    assert.equal(collector.get(repo, now + 1000), clean);
    const changed = await waitFor(() => {
      const value = collector.get(repo, now + 1000);
      return value === clean ? null : value;
    });
    assert.equal(changed.dirty, true);
    assert.equal(changed.staged, true);
    assert.equal(changed.untracked, true);
    assert.equal(changed.added, 3);
    assert.equal(changed.deleted, 1);
    assert.equal(changed.updatedAt, now + 1000);

    const [linked, outside] = await Promise.all([
      waitFor(() => collector.get(worktree, now)), waitFor(() => collector.get(nonRepo, now)),
    ]);
    assert.equal(linked.worktree, true);
    assert.equal(linked.detached, true);
    assert.match(linked.branch, /^[a-f0-9]{7}$/);
    assert.equal(outside.isRepo, false);
    assert.equal(collector.get(nonRepo, now + 999), outside);
  } finally {
    collector.dispose();
  }
  assert.equal(collector.get(repo), null);
});

test("ledger counts per-thread increments across local midnight and process restarts", (t) => {
  const directory = temporaryDirectory(t);
  const path = join(directory, "ledger.json");
  overrideEnv(t, "CODEX_COMETIX_LEDGER", path);
  assert.equal(getLedgerPath(), path);
  const before = new Date(2026, 10, 23, 23, 59).getTime();
  const after = new Date(2026, 10, 24, 0, 1).getTime();
  assert.equal(localDateKey(before), "2026-11-23");
  assert.equal(localDateKey(after), "2026-11-24");

  const ledger = new CostLedger();
  assert.equal(ledger.record("first", 2, before), 2);
  assert.equal(ledger.record("second", 1.5, before), 3.5);
  assert.equal(ledger.record("first", 2, before), 3.5);
  assert.equal(ledger.record("first", 0.5, before), 3.5);
  ledger.flushSync();

  const restarted = new CostLedger(path);
  assert.equal(restarted.getTodayTotal(before), 3.5);
  assert.equal(restarted.record("first", 2, after), 0);
  assert.equal(restarted.record("second", 1, after), 0);
  assert.equal(restarted.record("first", 2.5, after), 0.5);
  assert.equal(restarted.record("second", 2, after), 1);
  assert.equal(restarted.record("__proto__", 1, after), 2);
  assert.equal(restarted.record("first", Infinity, after), 2);
  restarted.flushSync();
  const persisted = new CostLedger(path);
  assert.equal(persisted.getTodayTotal(before), 3.5);
  assert.equal(persisted.getTodayTotal(after), 2);
});

test("ledger asynchronously merges checkpoint submissions to the same file", async (t) => {
  const directory = temporaryDirectory(t);
  const path = join(directory, "ledger.json");
  writeFileSync(path, "bad-json");
  const first = new CostLedger(path);
  const second = new CostLedger(path);
  assert.equal(first.getTodayTotal(), 0);
  first.record("shared", 3);
  second.record("shared", 2);
  second.record("other-thread", 1);
  await waitFor(() => !existsSync(`${path}.lock`) && new CostLedger(path).getTodayTotal() === 4 ? true : null);
  first.flushSync();
  second.flushSync();
  assert.equal(new CostLedger(path).getTodayTotal(), 4);
});

test("a synchronous ledger flush preserves checkpoints owned by a competing writer", (t) => {
  const directory = temporaryDirectory(t);
  const path = join(directory, "ledger.json");
  const first = new CostLedger(path);
  first.record("first", 2);
  first.flushSync();

  mkdirSync(`${path}.lock`);
  const second = new CostLedger(path);
  second.record("second", 3);
  second.flushSync();
  assert.equal(new CostLedger(path).getTodayTotal(), 5);
  assert.ok(readdirSync(directory).some((name) => name.endsWith(".pending")));
  rmdirSync(`${path}.lock`);

  first.record("third", 1);
  first.flushSync();
  assert.equal(new CostLedger(path).getTodayTotal(), 6);
  assert.deepEqual(readdirSync(directory), ["ledger.json"]);
});

const TRACKER_CONFIG = { ...DEFAULT_CONFIG, modules: { ...DEFAULT_CONFIG.modules, git: false } };

function sessionState(id: string, agent: RunState, used: number, output: number, native?: number): StatuslineState {
  return { thread: {
    id, name: null, agent: { state: agent }, model: { display_name: "GPT-5.4", provider: "openai" }, workspace: { cwd: "" },
    usage: { context: { used_tokens: used, context_window_size: 1000 }, total: { ...exampleUsage, output_tokens: output },
      cost: native === undefined ? undefined : { total_cost_usd: native } },
  } };
}

test("session tracker keeps independent sparklines, timing, throughput, and animation ticks", (t) => {
  const tracker = new SessionTracker({ ledger: new CostLedger(join(temporaryDirectory(t), "ledger.json")) });
  const start = new Date(2026, 10, 24, 12).getTime();
  const render = (state: StatuslineState, elapsed: number) => tracker.buildRenderContext(state, TRACKER_CONFIG, "whale", start + elapsed);
  try {
    const first = render(sessionState("thread-a", "ready", 100, 0, 0), 0);
    assert.equal(first.variant, "whale");
    assert.equal(first.animationTick, 1);
    assert.deepEqual(first.context, { usedPct: 10, remainingPct: 90, usedTokens: 100, windowSize: 1000,
      sparklineSamples: [100], deltaTokens: null });
    assert.deepEqual(first.cost, { sessionUsd: 0, todayUsd: 0, estimated: false });
    assert.deepEqual(first.cache, { hitPct: 60, cachedTokens: 600_000, totalInputTokens: 1_000_000 });

    const started = render(sessionState("thread-a", "thinking", 100, 10, 1), 1000);
    assert.deepEqual(started.context.sparklineSamples, [100]);
    assert.equal(started.context.deltaTokens, 0);
    assert.deepEqual(started.timing, { turnElapsedSec: 0, sessionElapsedSec: 1, outputTps: null });
    const working = render(sessionState("thread-a", "working", 130, 110, 1.5), 2000);
    assert.equal(working.context.deltaTokens, 30);
    assert.deepEqual(working.context.sparklineSamples, [100, 130]);
    assert.deepEqual(working.timing, { turnElapsedSec: 1, sessionElapsedSec: 2, outputTps: 100 });
    const smooth = render(sessionState("thread-a", "working", 140, 130, 1.5), 3000);
    assert.equal(smooth.timing.outputTps, 72);
    assert.equal(smooth.animationTick, 4);

    const other = render(sessionState("thread-b", "ready", 200, 200_000), 4000);
    const estimate = estimateTokenCostUsd(exampleUsage, BUILTIN_PRICING["gpt-5.4"]!);
    assert.equal(other.cost?.estimated, true);
    assert.equal(other.cost?.sessionUsd, estimate);
    assert.equal(other.cost?.todayUsd, 1.5 + estimate!);
    assert.equal(other.animationTick, 1);
    assert.deepEqual(other.context.sparklineSamples, [200]);

    for (let step = 0; step < 10; step += 1) {
      render(sessionState("thread-a", "working", 150 + step, 131 + step, 1.5), 5000 + step * 1000);
    }
    const waiting = render(sessionState("thread-a", "waiting", 159, 140, 1.5), 15_000);
    assert.deepEqual(waiting.context.sparklineSamples, [152, 153, 154, 155, 156, 157, 158, 159]);
    assert.deepEqual(first.context.sparklineSamples, [100]);
    assert.deepEqual(waiting.timing, { turnElapsedSec: null, sessionElapsedSec: 15, outputTps: null });
    const nextTurn = render(sessionState("thread-a", "working", 120, 8, 1.5), 16_000);
    assert.equal(nextTurn.context.deltaTokens, -39);
    assert.deepEqual(nextTurn.timing, { turnElapsedSec: 0, sessionElapsedSec: 16, outputTps: null });
    assert.equal(render({}, 17_000).animationTick, 1);
    assert.equal(render({}, 18_000).animationTick, 2);
  } finally {
    tracker.dispose();
  }
});

test("session quotas prefer Codex, order 5h and 7d, and use local reset times and clamped pace", (t) => {
  const tracker = new SessionTracker({ ledger: new CostLedger(join(temporaryDirectory(t), "ledger.json")) });
  const now = new Date(2026, 10, 26, 10, 0).getTime();
  const near = new Date(2026, 10, 26, 13, 0).getTime() / 1000;
  const far = new Date(2026, 10, 28, 16, 8).getTime() / 1000;
  assert.equal(formatResetTime(near, now), "13:00");
  assert.equal(formatResetTime(far, now), "Sat 16:08");
  assert.equal(computePaceDeltaPct(30, 300, near, now), -10);
  assert.equal(computePaceDeltaPct(30, 300, now / 1000 - 60, now), -70);
  assert.equal(computePaceDeltaPct(30, 300, far, now), 30);
  assert.equal(computePaceDeltaPct(30, null, near, now), null);
  assert.equal(computePaceDeltaPct(30, 300, null, now), null);

  const unsupported: RateLimitSnapshot = { limit_id: "misc", limit_name: null, primary_limit: null, secondary_limit: null };
  const fallback: RateLimitSnapshot = { ...unsupported, limit_id: "other", primary_limit: {
    used_percent: 5, window_minutes: 300, resets_at: null,
  } };
  const codex: RateLimitSnapshot = { ...unsupported, limit_id: "codex",
    primary_limit: { used_percent: 120, window_minutes: 10080, resets_at: far },
    secondary_limit: { used_percent: 30, window_minutes: 300, resets_at: near },
  };
  try {
    const chosen = tracker.buildRenderContext({ account: { rate_limits: [unsupported, fallback, codex] } }, TRACKER_CONFIG, "standard", now);
    assert.deepEqual(chosen.quotas[0], { label: "5h", usedPct: 30, remainingPct: 70, windowMinutes: 300,
      resetsAt: near, resetText: "13:00", paceDeltaPct: -10 });
    assert.equal(chosen.quotas[1]?.label, "7d");
    assert.equal(chosen.quotas[1]?.usedPct, 100);
    const alternative = tracker.buildRenderContext({ account: { rate_limits: [unsupported, fallback, { ...unsupported, limit_id: "codex" }] } },
      TRACKER_CONFIG, "standard", now);
    assert.equal(alternative.quotas[0]?.usedPct, 5);
    assert.equal(alternative.quotas[0]?.resetText, null);
  } finally {
    tracker.dispose();
  }
});

const INSTALL_CONFIG = {
  serverName: ENTRYPOINTS.SERVER_NAME,
  toolName: ENTRYPOINTS.WHALE_TOOL,
  nodePath: String.raw`C:\Program Files\nodejs\node.exe`,
  bundlePath: String.raw`D:\O'Brien\with # marker\index.mjs`,
};

test("installer surgically updates TOML while preserving CRLF, unrelated values, and comments", () => {
  const untouched = [
    "# Existing user settings", 'model = "a # in string"', 'developer_instructions = """',
    "[tui]", 'status_line_provider = { server = "fake", tool = "leave me" }', '"""',
    "", "[[skills.config]]", "enabled = true", "", "[mcp_servers.keep-me]", "command = 'tool # path' # untouched",
    "[mcp_servers.keep-me.env]", "VAR = 'visible'", "[profiles.alt.features]", "tui_extensions_statusline = false",
  ].join("\r\n");
  const original = `\uFEFF${untouched}\r\n\r\n${[
    '[ "features" ] # existing features', '  "tui_extensions_statusline" = false   # feature comment',
    "", "[tui]", 'status_line = ["model"] # keep built-in selection',
    "status_line_provider = { server = 'local-session-status', tool = 'statusline' } # pin provider",
    "", "[mcp_servers . 'codex-cometix'] # matching server", 'url = "https://example.invalid" # old transport',
    "startup_timeout_sec = 3 # retained option", "[mcp_servers.codex-cometix.env]", "VAR = 'preserved'",
    "", "[mcp_servers.local-session-status] # former provider", "command = 'python' # former command",
    "[mcp_servers.local-session-status.env]", "OLD = 'expired'", "",
  ].join("\r\n")}`;
  const options = { ...INSTALL_CONFIG, removeLegacyServers: ["local-session-status"] };
  const installed = updateCodexConfigToml(original, options);
  assert.ok(installed.startsWith(`\uFEFF${untouched}\r\n`));
  assert.equal(installed.replaceAll("\r\n", "").includes("\n"), false);
  assert.ok(installed.includes('  "tui_extensions_statusline" = true   # feature comment'));
  assert.ok(installed.includes('status_line_provider = { server = "codex-cometix", tool = "statusline-whale" } # pin provider'));
  assert.ok(installed.includes(`command = '${options.nodePath}'`));
  assert.ok(installed.includes(`args = [${JSON.stringify(options.bundlePath)}]`));
  for (const fragment of ["# former provider", "# former command", "# old transport", "startup_timeout_sec = 3 # retained option", "VAR = 'preserved'"]) {
    assert.ok(installed.includes(fragment));
  }
  assert.ok(!installed.includes("[mcp_servers.local-session-status"));
  assert.ok(!installed.includes('url = "https://example.invalid"'));
  assert.equal(updateCodexConfigToml(installed, options), installed);

  const removed = removeCodexConfigToml(installed, ENTRYPOINTS.SERVER_NAME);
  assert.ok(removed.startsWith(`\uFEFF${untouched}\r\n`));
  assert.ok(removed.includes("# pin provider"));
  assert.ok(removed.includes('status_line = ["model"] # keep built-in selection'));
  assert.ok(removed.includes('"tui_extensions_statusline" = true'));
  assert.ok(!removed.includes('status_line_provider = { server = "codex-cometix"'));
  assert.ok(!removed.includes("[mcp_servers.codex-cometix.env]"));
  assert.equal(removeCodexConfigToml(removed, ENTRYPOINTS.SERVER_NAME), removed);
});

test("installer recognizes inline, dotted, and subtable TOML configuration", () => {
  const inline = [
    "features = { other = true, tui_extensions_statusline = false }",
    "tui = { theme = 'light', status_line_provider = { server = 'elsewhere', tool = 'other' } } # keep",
    "mcp_servers = { 'codex-cometix' = { command = 'old', timeout = 5 }, keep = { command = 'other' } }", "",
  ].join("\n");
  const installed = updateCodexConfigToml(inline, INSTALL_CONFIG);
  assert.ok(installed.includes("features = { other = true, tui_extensions_statusline = true }"));
  assert.ok(installed.includes("timeout = 5"));
  assert.ok(installed.includes('server = "codex-cometix"'));
  const removed = removeCodexConfigToml(installed, ENTRYPOINTS.SERVER_NAME);
  assert.ok(removed.includes("theme = 'light'"));
  assert.ok(removed.includes("keep = { command = 'other' }"));
  assert.ok(removed.includes("# keep"));
  assert.ok(!removed.includes("status_line_provider"));
  assert.ok(!removed.includes("codex-cometix"));

  const dotted = [
    "features.other = true", "tui.theme = 'light'", "mcp_servers.codex-cometix.env.VAR = 'value'", "",
    '[tui.status_line_provider]', 'server = "elsewhere" # old server', 'tool = "other"', "",
  ].join("\n");
  const updated = updateCodexConfigToml(dotted, INSTALL_CONFIG);
  assert.ok(updated.includes("features.tui_extensions_statusline = true"));
  assert.ok(updated.includes('tui.status_line_provider = { server = "codex-cometix", tool = "statusline-whale" }'));
  assert.ok(updated.includes("mcp_servers.codex-cometix.command"));
  assert.ok(updated.includes("# old server"));

  const anotherProvider = "[tui]\nstatus_line_provider = { server = 'other', tool = 'keep' }\n";
  assert.equal(removeCodexConfigToml(`${anotherProvider}[mcp_servers.codex-cometix]\ncommand = 'old'\n`, ENTRYPOINTS.SERVER_NAME), anotherProvider);
  const multilineServer = `[tui.status_line_provider]\nserver = """codex-cometix"""\ntool = 'statusline'\n`;
  assert.equal(removeCodexConfigToml(multilineServer, ENTRYPOINTS.SERVER_NAME), "");
});

test("install and uninstall write an isolated config and remove the legacy file only on request", (t) => {
  const directory = temporaryDirectory(t);
  const configTomlPath = join(directory, "config.toml");
  const legacyPythonPath = join(directory, "session-status.py");
  const bundlePath = join(directory, "index.mjs");
  writeFileSync(configTomlPath, "# preserve\n[mcp_servers.local-session-status]\ncommand = 'python'\n");
  writeFileSync(legacyPythonPath, "# old provider\n");
  const options = { configTomlPath, bundlePath, legacyPythonPath, defaultVariant: "whale" as const };
  assert.deepEqual(installStatusline(options), { configPath: configTomlPath, removedLegacyFile: false });
  assert.ok(existsSync(legacyPythonPath));
  assert.ok(readFileSync(configTomlPath, "utf8").includes("[mcp_servers.local-session-status]"));
  assert.deepEqual(installStatusline({ ...options, removeLegacyPython: true }), { configPath: configTomlPath, removedLegacyFile: true });
  assert.ok(!existsSync(legacyPythonPath));
  assert.ok(readFileSync(configTomlPath, "utf8").includes('tool = "statusline-whale"'));
  assert.deepEqual(uninstallStatusline({ configTomlPath }), { configPath: configTomlPath, changed: true });
  assert.deepEqual(uninstallStatusline({ configTomlPath }), { configPath: configTomlPath, changed: false });
  assert.ok(readFileSync(configTomlPath, "utf8").startsWith("# preserve\n"));
});
