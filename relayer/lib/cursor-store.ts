/**
 * ABOUTME: Per-chain scan cursor persistence — atomic JSON write so a restart resumes from the
 * last successfully-scanned block instead of jumping to the chain head and silently dropping any
 * MessageSent events in the gap.
 * ABOUTME: Mirrors the pattern in crowdfund-ui/packages/indexer/src/db/fileStore.ts (tmpfile +
 * rename) but simpler — single field per file, no migrations beyond the version stamp.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Schema version. Bump and add a migration when the shape changes. */
const CURSOR_SCHEMA_VERSION = 1 as const;

export interface CursorData {
  /** Block number we have FULLY scanned and processed (inclusive). Next poll starts at +1. */
  lastProcessedBlock: number;
  /** Unix ms when this cursor was last written. For health endpoint + staleness alerts. */
  updatedAt: number;
  /** Schema version — for future migrations. */
  version: typeof CURSOR_SCHEMA_VERSION;
}

/**
 * Filesystem-backed per-chain cursor store. One file per chain at
 * `<baseDir>/cursor-{chainName}.json`. Atomic writes via tmpfile + rename so a power loss
 * mid-flush cannot corrupt the canonical file.
 *
 * The store is intentionally NOT a cache — every `write` hits the disk synchronously (from the
 * caller's perspective). The polling loop runs at multi-second cadence; the I/O cost is
 * irrelevant relative to the RPC calls themselves, and durability is more valuable than speed.
 */
export class CursorStore {
  constructor(private readonly baseDir: string) {}

  /**
   * Read the cursor for a chain. Returns null when the file does not exist (cold start case) —
   * the caller decides whether to bootstrap from chain-head-minus-lookback or from a configured
   * floor. Throws on malformed JSON or unexpected shape: don't silently start scanning from
   * block 0 because a manual edit corrupted the file.
   */
  async read(chainName: string): Promise<CursorData | null> {
    const path = this.pathFor(chainName);
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw);
      return validate(parsed, path);
    } catch (err) {
      if (isENOENT(err)) return null;
      throw err;
    }
  }

  /**
   * Atomically persist a cursor. Writes to `<path>.<pid>.tmp` then renames over the canonical
   * path — rename is atomic at the filesystem level on POSIX, so even a kill -9 mid-flush leaves
   * either the old cursor intact or the new one fully present, never a torn write.
   */
  async write(chainName: string, data: Omit<CursorData, "version">): Promise<void> {
    const path = this.pathFor(chainName);
    await mkdir(dirname(path), { recursive: true });
    const payload: CursorData = {
      ...data,
      version: CURSOR_SCHEMA_VERSION,
    };
    const tmpPath = `${path}.${process.pid}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await rename(tmpPath, path);
  }

  /**
   * Cursor file path for a chain. Sanitises the name (slashes, whitespace) so a config-driven
   * chain name can never escape the baseDir. We don't expect adversarial input — every chain
   * name comes from our own `config/networks.ts` — but cheap to lock down anyway.
   */
  private pathFor(chainName: string): string {
    const safe = chainName.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    return join(this.baseDir, `cursor-${safe}.json`);
  }
}

function isENOENT(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "ENOENT"
  );
}

function validate(parsed: unknown, path: string): CursorData {
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { lastProcessedBlock?: unknown }).lastProcessedBlock !== "number" ||
    typeof (parsed as { updatedAt?: unknown }).updatedAt !== "number" ||
    typeof (parsed as { version?: unknown }).version !== "number"
  ) {
    throw new Error(
      `cursor-store: malformed cursor file at ${path}. Delete it to reset to lookback boot.`,
    );
  }
  const candidate = parsed as { lastProcessedBlock: number; updatedAt: number; version: number };
  if (candidate.version !== CURSOR_SCHEMA_VERSION) {
    throw new Error(
      `cursor-store: cursor file ${path} has unsupported version ${candidate.version} (expected ${CURSOR_SCHEMA_VERSION}). Delete it or add a migration.`,
    );
  }
  return {
    lastProcessedBlock: candidate.lastProcessedBlock,
    updatedAt: candidate.updatedAt,
    version: CURSOR_SCHEMA_VERSION,
  };
}
