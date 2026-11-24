import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

type Checkpoints = Map<string, Map<string, number>>;

const WRITE_DELAY_MS = 150;
const REFRESH_INTERVAL_MS = 4000;
const STALE_LOCK_MS = 60_000;

export function getLedgerPath(): string {
  return process.env.CODEX_COMETIX_LEDGER || join(homedir(), ".codex", "cometix-ledger.json");
}

export function localDateKey(nowMs = Date.now()): string {
  const timestamp = new Date(nowMs);
  const date = Number.isNaN(timestamp.getTime()) ? new Date() : timestamp;
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodeLedger(text: string): Checkpoints {
  const days: Checkpoints = new Map();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return days;
  }
  if (!isObject(data)) return days;
  for (const [day, entries] of Object.entries(data)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isObject(entries)) continue;
    const threads = new Map<string, number>();
    for (const [thread, cost] of Object.entries(entries)) {
      if (thread && typeof cost === "number" && Number.isFinite(cost) && cost > 0) threads.set(thread, cost);
    }
    if (threads.size) days.set(day, threads);
  }
  return days;
}

function codeOf(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code;
}

function readOptional<T>(action: () => T, fallback: T): T {
  try {
    return action();
  } catch (error) {
    if (codeOf(error) !== "ENOENT") throw error;
    return fallback;
  }
}

async function readOptionalAsync<T>(action: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (codeOf(error) !== "ENOENT") throw error;
    return fallback;
  }
}

function quiet(action: () => void): void {
  try {
    action();
  } catch {
    // Cleanup is best effort.
  }
}

export class CostLedger {
  private readonly filePath: string;
  private readonly directory: string;
  private readonly lockPath: string;
  private readonly pendingPrefix: string;
  private readonly days: Checkpoints = new Map();
  private total: { day: string; cost: number } | undefined;
  private revision = 0;
  private savedRevision = 0;
  private timer: NodeJS.Timeout | undefined;
  private writing = false;
  private lastDiskRead = Date.now();

  constructor(filePath = getLedgerPath()) {
    this.filePath = resolve(filePath);
    this.directory = dirname(this.filePath);
    this.lockPath = `${this.filePath}.lock`;
    this.pendingPrefix = `${basename(this.filePath)}.`;
    quiet(() => { this.mergeFromDiskSync(); });
  }

  record(threadId: string, sessionCostUsd: number, nowMs = Date.now()): number {
    if (threadId && Number.isFinite(sessionCostUsd) && sessionCostUsd > 0
      && this.setCheckpoint(localDateKey(nowMs), threadId, sessionCostUsd)) {
      this.revision += 1;
      this.scheduleWrite();
    }
    return this.getTodayTotal(nowMs);
  }

  getTodayTotal(nowMs = Date.now()): number {
    const now = Date.now();
    if (!this.writing && !this.timer && now - this.lastDiskRead >= REFRESH_INTERVAL_MS) {
      this.lastDiskRead = now;
      void this.mergeFromDisk().catch(() => {});
    }

    const day = localDateKey(nowMs);
    if (day === this.total?.day) return this.total.cost;
    const previous = new Map<string, number>();
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

  flushSync(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.savedRevision === this.revision) return;

    let locked = false;
    let temporary: string | undefined;
    try {
      mkdirSync(this.directory, { recursive: true });
      try {
        mkdirSync(this.lockPath);
        locked = true;
      } catch (error) {
        if (codeOf(error) !== "EEXIST") throw error;
      }

      // An exiting process can publish its checkpoints while a peer owns the ledger lock.
      const pending = locked ? this.mergeFromDiskSync() : [];
      const target = locked ? this.filePath : `${this.filePath}.${process.pid}-${randomUUID()}.pending`;
      temporary = `${target}.${randomUUID()}.tmp`;
      writeFileSync(temporary, this.serialize(), { flag: "wx", mode: 0o600 });
      renameSync(temporary, target);
      temporary = undefined;
      this.savedRevision = this.revision;
      for (const path of pending) quiet(() => unlinkSync(path));
    } catch {
      this.scheduleWrite();
    } finally {
      if (temporary) quiet(() => unlinkSync(temporary!));
      if (locked) quiet(() => rmdirSync(this.lockPath));
    }
  }

  private setCheckpoint(day: string, thread: string, cost: number): boolean {
    let threads = this.days.get(day);
    if (!threads) {
      threads = new Map();
      this.days.set(day, threads);
    }
    if (cost <= (threads.get(thread) ?? 0)) return false;
    threads.set(thread, cost);
    this.total = undefined;
    return true;
  }

  private merge(text: string): void {
    for (const [day, threads] of decodeLedger(text)) {
      for (const [thread, cost] of threads) this.setCheckpoint(day, thread, cost);
    }
  }

  private pendingFiles(names: string[]): string[] {
    return names.filter((name) => name.startsWith(this.pendingPrefix)
      && /^\d+-[0-9a-f-]{36}\.pending$/.test(name.slice(this.pendingPrefix.length)))
      .map((name) => join(this.directory, name));
  }

  private mergeFromDiskSync(): string[] {
    const pending = this.pendingFiles(readOptional(() => readdirSync(this.directory), []));
    for (const path of pending) this.merge(readOptional(() => readFileSync(path, "utf8"), ""));
    this.merge(readOptional(() => readFileSync(this.filePath, "utf8"), ""));
    this.lastDiskRead = Date.now();
    return pending;
  }

  private async mergeFromDisk(): Promise<string[]> {
    const pending = this.pendingFiles(await readOptionalAsync(() => readdir(this.directory), []));
    const records = await Promise.all(pending.map((path) => readOptionalAsync(() => readFile(path, "utf8"), "")));
    for (const record of records) this.merge(record);
    // Read the ledger after the pending files in case a peer has just consolidated them.
    this.merge(await readOptionalAsync(() => readFile(this.filePath, "utf8"), ""));
    this.lastDiskRead = Date.now();
    return pending;
  }

  private serialize(): string {
    // Daily cumulative checkpoints let concurrent writers merge per-thread maxima.
    const entries = Array.from(this.days, ([day, threads]) => [day, Object.fromEntries(threads)] as const);
    return `${JSON.stringify(Object.fromEntries(entries))}\n`;
  }

  private scheduleWrite(): void {
    if (this.writing || this.timer || this.savedRevision === this.revision) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.persist();
    }, WRITE_DELAY_MS);
    this.timer.unref();
  }

  private async persist(): Promise<void> {
    let locked = false;
    let temporary: string | undefined;
    this.writing = true;
    try {
      await mkdir(this.directory, { recursive: true });
      try {
        await mkdir(this.lockPath);
      } catch (error) {
        if (codeOf(error) !== "EEXIST") throw error;
        const lock = await stat(this.lockPath);
        if (Date.now() - lock.mtimeMs >= STALE_LOCK_MS) await rmdir(this.lockPath);
        return;
      }
      locked = true;
      const pending = await this.mergeFromDisk();
      const revision = this.revision;
      temporary = `${this.filePath}.${process.pid}-${randomUUID()}.tmp`;
      await writeFile(temporary, this.serialize(), { flag: "wx", mode: 0o600 });
      await rename(temporary, this.filePath);
      temporary = undefined;
      this.savedRevision = Math.max(this.savedRevision, revision);
      await Promise.all(pending.map((path) => unlink(path).catch(() => {})));
    } catch {
      // Keep the pending checkpoints for another attempt.
    } finally {
      if (temporary) await unlink(temporary).catch(() => {});
      if (locked) await rmdir(this.lockPath).catch(() => {});
      this.writing = false;
      this.scheduleWrite();
    }
  }
}
