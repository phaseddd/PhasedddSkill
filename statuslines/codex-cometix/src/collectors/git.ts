import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { GitSnapshot } from "../protocol/types.js";

type GitStatus = Pick<GitSnapshot, "branch" | "detached" | "dirty" | "staged" | "untracked" | "ahead" | "behind">;
type ShortStat = { added: number; deleted: number };

const execFileAsync = promisify(execFile);
const EMPTY_STATUS: GitStatus = {
  branch: "", detached: false, dirty: false, staged: false, untracked: false, ahead: 0, behind: 0,
};

export function parseGitPorcelainV2(stdout: string): GitStatus {
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

export function parseGitShortStat(stdout: string): ShortStat {
  return {
    added: Number(/(\d+) insertions?\(\+\)/.exec(stdout)?.[1] ?? 0),
    deleted: Number(/(\d+) deletions?\(-\)/.exec(stdout)?.[1] ?? 0),
  };
}

interface CacheEntry {
  snapshot: GitSnapshot | null;
  expiresAt: number;
  refreshing: boolean;
  controller?: AbortController;
}

export class GitCollector {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly timeoutMs: number;
  private disposed = false;

  constructor(options: { ttlMs?: number; timeoutMs?: number } = {}) {
    this.ttlMs = options.ttlMs ?? 4000;
    this.timeoutMs = options.timeoutMs ?? 1500;
  }

  get(cwd: string | undefined, nowMs?: number): GitSnapshot | null {
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

  dispose(): void {
    this.disposed = true;
    for (const entry of this.entries.values()) entry.controller?.abort();
    this.entries.clear();
  }

  private async refresh(cwd: string, entry: CacheEntry, nowMs?: number): Promise<void> {
    const controller = new AbortController();
    entry.controller = controller;
    const run = async (...args: string[]): Promise<string> => {
      const { stdout } = await execFileAsync("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", ...args], {
        cwd,
        windowsHide: true,
        timeout: this.timeoutMs,
        signal: controller.signal,
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, LC_ALL: "C", LANGUAGE: "C" },
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
        this.collectChanges(run, stdout.includes("# branch.oid (initial)"), status)
          .catch(() => ({ added: entry.snapshot?.added ?? 0, deleted: entry.snapshot?.deleted ?? 0 })),
      ]);
      if (!controller.signal.aborted) {
        entry.snapshot = { isRepo: true, ...status, ...changes, worktree, updatedAt: nowMs ?? Date.now() };
      }
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & { stderr?: string };
      if (!controller.signal.aborted && (!entry.snapshot || failure.code === "ENOENT"
        || failure.stderr?.includes("not a git repository"))) {
        entry.snapshot = {
          isRepo: false, ...EMPTY_STATUS, added: 0, deleted: 0, worktree: false, updatedAt: nowMs ?? Date.now(),
        };
      }
    } finally {
      entry.expiresAt = (nowMs ?? Date.now()) + this.ttlMs;
      entry.controller = undefined;
      entry.refreshing = false;
    }
  }

  private async collectChanges(
    run: (...args: string[]) => Promise<string>,
    unborn: boolean,
    status: GitStatus,
  ): Promise<ShortStat> {
    if (!status.dirty && !status.staged) return { added: 0, deleted: 0 };
    const diff = ["diff", "--no-ext-diff", "--no-textconv", "--shortstat"];
    if (!unborn) return parseGitShortStat(await run(...diff, "HEAD", "--"));

    const [staged, unstaged] = await Promise.all([
      status.staged ? run(...diff, "--cached", "--").then(parseGitShortStat) : { added: 0, deleted: 0 },
      status.dirty ? run(...diff, "--").then(parseGitShortStat) : { added: 0, deleted: 0 },
    ]);
    return { added: staged.added + unstaged.added, deleted: staged.deleted + unstaged.deleted };
  }
}
