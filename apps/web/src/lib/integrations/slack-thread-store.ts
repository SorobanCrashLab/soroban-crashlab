import * as fs from "fs";
import * as path from "path";

/**
 * Persistent file-based store mapping a fuzzing run to the Slack message it
 * first posted for that run, so later events for the same run can be
 * threaded as replies (`thread_ts`) instead of posting a new top-level
 * message every time. Mirrors the write-through JSON approach in
 * `webhook-store.ts` so state survives process restarts.
 */

const DEFAULT_DATA_DIR = path.join(process.cwd(), ".slack-thread-data");
const THREADS_FILE = "slack-run-threads.json";

export interface SlackRunThread {
  runId: string;
  channel: string;
  threadTs: string;
  updatedAt: string;
}

export class SlackThreadStore {
  private dataDir: string;
  private threads: Map<string, SlackRunThread> = new Map();

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DEFAULT_DATA_DIR;
    this.ensureDataDir();
    this.load();
  }

  getThread(runId: string): SlackRunThread | undefined {
    return this.threads.get(runId);
  }

  setThread(thread: SlackRunThread): void {
    this.threads.set(thread.runId, thread);
    this.save();
  }

  deleteThread(runId: string): boolean {
    const deleted = this.threads.delete(runId);
    if (deleted) this.save();
    return deleted;
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private filePath(): string {
    return path.join(this.dataDir, THREADS_FILE);
  }

  private load(): void {
    const p = this.filePath();
    try {
      if (!fs.existsSync(p)) return;
      const raw = fs.readFileSync(p, "utf-8");
      const arr = JSON.parse(raw) as SlackRunThread[];
      for (const thread of arr) {
        this.threads.set(thread.runId, thread);
      }
    } catch {
      // Corrupt or missing file: start from an empty store rather than
      // failing the caller.
    }
  }

  private save(): void {
    const p = this.filePath();
    fs.writeFileSync(p, JSON.stringify(Array.from(this.threads.values()), null, 2), "utf-8");
  }
}

let sharedStore: SlackThreadStore | null = null;

/** Returns the process-wide store, creating it on first use. */
export function getSlackThreadStore(): SlackThreadStore {
  if (!sharedStore) {
    sharedStore = new SlackThreadStore();
  }
  return sharedStore;
}

/** Resets the process-wide store; used by tests to isolate state. */
export function resetSlackThreadStore(): void {
  sharedStore = null;
}
