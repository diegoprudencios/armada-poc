/**
 * ABOUTME: Per-source-chain persistence for pendingMessages + processedMessages — survives
 * restarts so we (a) don't re-relay messages already delivered (gas savings) and (b) don't
 * lose visibility into messages waiting on Iris attestation.
 * ABOUTME: Sibling of CursorStore using the same JsonStateStore primitive — one file per source
 * chain at relayer/state/pending-<chain>.json. Atomic writes, schema-versioned.
 */

import { JsonStateStore } from "./json-state-store";

const PENDING_SCHEMA_VERSION = 1 as const;

/**
 * Persisted shape of a pending CCTP message. Mirrors the iris-relay `PendingMessage` interface
 * with two NEW fields for Phase 2 (`retryAttempts`, `nextRetryAt`) that support per-message
 * retry/backoff on relayWithHook failures.
 */
export interface PersistedPendingMessage {
  messageBytes: string;
  messageHash: string;
  sourceDomain: number;
  destinationDomain: number;
  nonce: string;
  sourceTxHash: string;
  sourceBlock: number;
  detectedAt: number;
  pollAttempts: number;
  lastStatus: string;
  /** Failed-relay retry counter; null means no relay attempted yet. Capped at MAX_RELAY_RETRIES. */
  retryAttempts: number;
  /** Unix ms — relay attempts before this time are blocked by the backoff scheduler. 0 = no wait. */
  nextRetryAt: number;
}

export interface PendingStateData {
  pending: PersistedPendingMessage[];
  /**
   * Set of messageHashes we've already delivered (relayWithHook returned success OR the contract
   * said "already processed"). Used to short-circuit `enqueueMessage` when the scanner re-discovers
   * a message after a restart. Stored as a sorted array on disk for JSON-friendliness.
   *
   * Note: this grows without bound at the relayer's current volume (handful of messages per hour
   * at most). At ~70 bytes per hash, 10k entries = 700KB. Future Phase 3 polish: prune entries
   * older than MAX_ATTESTATION_AGE_MS × 2 since they're irrelevant by then.
   */
  processed: string[];
  updatedAt: number;
  version: typeof PENDING_SCHEMA_VERSION;
}

/**
 * Filesystem-backed per-source-chain pending state. The key is the SOURCE chain name (where
 * MessageSent was emitted) because that's the dimension the iris-relay's `pendingMessages` Map
 * is implicitly keyed by — each chain's state owns its own pendingMessages.
 *
 * Mutation pattern: load on init → mutate in memory → write the whole snapshot back on every
 * change. Writes are cheap (single-file, atomic rename, small payload) but the caller MUST
 * await the write before returning from the mutating operation, otherwise a crash between
 * mutation + write would lose the change.
 */
export class PendingStateStore {
  private readonly inner: JsonStateStore<PendingStateData>;

  constructor(baseDir: string) {
    this.inner = new JsonStateStore<PendingStateData>({
      baseDir,
      filenamePrefix: "pending",
      expectedVersion: PENDING_SCHEMA_VERSION,
      validate,
    });
  }

  async read(chainName: string): Promise<PendingStateData | null> {
    return this.inner.read(chainName);
  }

  async write(
    chainName: string,
    pending: PersistedPendingMessage[],
    processed: Set<string>,
  ): Promise<void> {
    const sortedProcessed = Array.from(processed).sort();
    await this.inner.write(chainName, {
      pending,
      processed: sortedProcessed,
      updatedAt: Date.now(),
      version: PENDING_SCHEMA_VERSION,
    });
  }
}

function validate(
  parsed: unknown,
  chainName: string,
  path: string,
): PendingStateData {
  const candidate = parsed as { pending?: unknown; processed?: unknown; updatedAt?: unknown };
  if (!Array.isArray(candidate.pending)) {
    throw new Error(
      `pending-store: invalid 'pending' field for chain '${chainName}' at ${path}. Expected an array. Delete to reset.`,
    );
  }
  if (!Array.isArray(candidate.processed)) {
    throw new Error(
      `pending-store: invalid 'processed' field for chain '${chainName}' at ${path}. Expected an array. Delete to reset.`,
    );
  }
  if (
    typeof candidate.updatedAt !== "number" ||
    !Number.isInteger(candidate.updatedAt) ||
    candidate.updatedAt < 0
  ) {
    throw new Error(
      `pending-store: invalid 'updatedAt' field for chain '${chainName}' at ${path}. Expected a non-negative integer (Unix ms). Delete to reset.`,
    );
  }
  // Per-element shape check on pending — loud failure on a corrupted entry rather than
  // propagating undefined fields into the relay loop. We're permissive about extra fields so
  // a future writer that added a field can still be read by an older reader.
  const pending = candidate.pending.map((msg, idx) =>
    validatePending(msg, chainName, path, idx),
  );
  // Processed entries are just message-hash strings; light validation.
  const processed = candidate.processed.map((s, idx) => {
    if (typeof s !== "string") {
      throw new Error(
        `pending-store: processed[${idx}] for chain '${chainName}' at ${path} is not a string. Delete to reset.`,
      );
    }
    return s;
  });
  return {
    pending,
    processed,
    updatedAt: candidate.updatedAt,
    version: PENDING_SCHEMA_VERSION,
  };
}

function validatePending(
  msg: unknown,
  chainName: string,
  path: string,
  idx: number,
): PersistedPendingMessage {
  if (typeof msg !== "object" || msg === null) {
    throw new Error(
      `pending-store: pending[${idx}] for chain '${chainName}' at ${path} is not an object.`,
    );
  }
  const m = msg as Partial<PersistedPendingMessage>;
  const requiredStrings: (keyof PersistedPendingMessage)[] = [
    "messageBytes",
    "messageHash",
    "nonce",
    "sourceTxHash",
    "lastStatus",
  ];
  for (const field of requiredStrings) {
    if (typeof m[field] !== "string") {
      throw new Error(
        `pending-store: pending[${idx}].${String(field)} for chain '${chainName}' at ${path} is not a string.`,
      );
    }
  }
  const requiredNumbers: (keyof PersistedPendingMessage)[] = [
    "sourceDomain",
    "destinationDomain",
    "sourceBlock",
    "detectedAt",
    "pollAttempts",
    "retryAttempts",
    "nextRetryAt",
  ];
  for (const field of requiredNumbers) {
    if (typeof m[field] !== "number" || !Number.isFinite(m[field] as number)) {
      throw new Error(
        `pending-store: pending[${idx}].${String(field)} for chain '${chainName}' at ${path} is not a finite number.`,
      );
    }
  }
  return m as PersistedPendingMessage;
}
