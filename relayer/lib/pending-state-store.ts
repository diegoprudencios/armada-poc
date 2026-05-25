/**
 * ABOUTME: Per-source-chain persistence for pendingMessages + processedMessages — survives
 * restarts so we (a) don't re-relay messages already delivered (gas savings) and (b) don't
 * lose visibility into messages waiting on Iris attestation.
 * ABOUTME: Sibling of CursorStore using the same JsonStateStore primitive — one file per source
 * chain at relayer/state/pending-<chain>.json. Atomic writes, schema-versioned.
 */

import { JsonStateStore } from "./json-state-store";

const PENDING_SCHEMA_VERSION = 2 as const;

/**
 * Persisted shape of a pending CCTP message. Mirrors the iris-relay `PendingMessage` interface
 * with two NEW fields for Phase 2 (`retryAttempts`, `nextRetryAt`) that support per-message
 * retry/backoff on relayWithHook failures, plus two NEW fields for Phase 2B
 * (`submittedTxHash`, `submittedAt`) that turn the relay loop into a state machine — the
 * presence of `submittedTxHash` means "broadcast happened, waiting for destination receipt"
 * (handled by `processInflightRelays`); absence means "still waiting on Iris attestation"
 * (handled by `processPendingMessages`).
 *
 * Both Phase 2B fields are OPTIONAL — a v1 file written by the prior version (which had
 * neither) loads cleanly. The state machine treats absent fields as "awaiting Iris."
 *
 * v2 added `dedupKey` — `${sourceTxHash}:${logIndex}`. The previous v1 dedup used
 * `messageHash` (keccak256 of the source-side messageBytes), but CCTP V2 leaves the source
 * nonce slot at bytes32(0) and our burn body has no per-tx-unique field, so two unshields
 * with the same {amount, maxFee, finalRecipient} produce byte-identical messageBytes and
 * collide on hash. `(sourceTxHash, logIndex)` is the canonical EVM identifier for a log and
 * cannot collide between two distinct burns.
 */
export interface PersistedPendingMessage {
  messageBytes: string;
  messageHash: string;
  /**
   * Globally-unique-per-log dedup key, format `${sourceTxHash}:${logIndex}`. Used as the key
   * in the in-memory pendingMessages Map and the per-chain processedMessages Set. Distinct
   * from `messageHash` (which is keccak256(messageBytes) — used for Iris attestation lookup,
   * not dedup, because identical burns produce identical hashes in CCTP V2).
   */
  dedupKey: string;
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
  /**
   * Destination-chain tx hash once we've broadcast `hookRouter.relayWithHook(...)`. Presence
   * is the state-machine flag: set → awaiting receipt confirmation (processInflightRelays);
   * absent → still awaiting Iris attestation (processPendingMessages).
   */
  submittedTxHash?: string;
  /**
   * Unix ms of the broadcast. Used by processInflightRelays to detect stuck/dropped txs —
   * if the receipt hasn't arrived within `STUCK_TX_THRESHOLD_MS` of this timestamp, the
   * message is force-re-submitted with a fresh nonce.
   */
  submittedAt?: number;
}

export interface PendingStateData {
  pending: PersistedPendingMessage[];
  /**
   * Set of `dedupKey`s (format `${sourceTxHash}:${logIndex}`) for messages we've already
   * delivered (relayWithHook returned success OR the destination contract said
   * "already processed"). Used to short-circuit `enqueueMessage` when the scanner re-discovers
   * a message after a restart. Stored as a sorted array on disk for JSON-friendliness.
   *
   * Note: this grows without bound at the relayer's current volume (handful of messages per hour
   * at most). At ~80 bytes per entry, 10k entries = 800KB. Future Phase 3 polish: prune entries
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
      migrate: migrateV1ToV2,
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
    // Defensive size signal — fires when the processed-hash set grows past a level that
    // suggests either real volume scale-up or a dedup bug. At the relayer's intended POC
    // volume (handful per hour) we expect <100 entries even after months of uptime; crossing
    // 10k means either we should ship the Phase 3 prune logic OR something is wrong (e.g. the
    // dedup short-circuit in enqueueMessage broke and we're re-adding hashes that should have
    // been caught). Either way operators should investigate.
    if (sortedProcessed.length > PROCESSED_SET_WARN_THRESHOLD) {
      console.warn(
        `[pending-store] ${chainName}: processed-hash set has grown to ${sortedProcessed.length} entries (warn threshold ${PROCESSED_SET_WARN_THRESHOLD}). At current volume this is unexpected — investigate or ship Phase 3 prune logic.`,
      );
    }
    await this.inner.write(chainName, {
      pending,
      processed: sortedProcessed,
      updatedAt: Date.now(),
      version: PENDING_SCHEMA_VERSION,
    });
  }
}

/** Loud-log threshold for the processed-set size — see comment in PendingStateStore.write. */
const PROCESSED_SET_WARN_THRESHOLD = 10_000;

/**
 * Migrate a v1 payload (pre-dedupKey, processed-keyed-by-messageHash) to v2.
 *
 * v1 `processed[]` entries are keccak256(messageBytes) — incompatible with v2's dedupKey
 * (`${sourceTxHash}:${logIndex}`). There's no way to recover the dedupKey from a bare hash, so
 * we drop the v1 processed[] entirely. Pending messages also get back-filled with a synthetic
 * dedupKey derived from their `sourceTxHash`; logIndex is unrecoverable from the persisted
 * payload, so we use `0` as a placeholder. The pending-message dedupKey is only used for
 * Map keying + future dedup; the brief window where two un-confirmed messages from the same
 * source tx could collide is acceptable — `atomicCrossChainUnshield` and `crossChainShield`
 * each emit exactly one MessageSent per tx, so `:0` is correct in practice today.
 *
 * The cost of dropping v1 processed[] is one possible re-relay per previously-delivered
 * message that the scanner re-discovers — the destination contract's "already processed"
 * check is the safety net (submitRelay returns 'already-processed', the message is then
 * marked processed under v2). One wasted RPC call per stale message, not a real issue.
 */
function migrateV1ToV2(oldPayload: unknown, oldVersion: number): PendingStateData {
  if (oldVersion !== 1) {
    throw new Error(
      `pending-store: cannot migrate from version ${oldVersion} — no migrator defined for that path.`,
    );
  }
  const candidate = oldPayload as {
    pending?: unknown;
    processed?: unknown;
    updatedAt?: unknown;
  };
  if (!Array.isArray(candidate.pending)) {
    throw new Error(`pending-store: v1 migration failed — 'pending' is not an array.`);
  }
  if (typeof candidate.updatedAt !== "number") {
    throw new Error(`pending-store: v1 migration failed — 'updatedAt' is missing or non-numeric.`);
  }
  const migratedPending = candidate.pending.map((raw, idx) => {
    if (typeof raw !== "object" || raw === null) {
      throw new Error(`pending-store: v1 migration failed — pending[${idx}] is not an object.`);
    }
    const r = raw as Partial<PersistedPendingMessage> & { sourceTxHash?: string };
    if (typeof r.sourceTxHash !== "string") {
      throw new Error(
        `pending-store: v1 migration failed — pending[${idx}].sourceTxHash missing or non-string; cannot synthesize dedupKey.`,
      );
    }
    return { ...r, dedupKey: `${r.sourceTxHash}:0` } as PersistedPendingMessage;
  });
  console.warn(
    `[pending-store] Migrating v1 → v2: dropping ${
      Array.isArray(candidate.processed) ? candidate.processed.length : 0
    } legacy processed-hash entries; back-filled dedupKey on ${migratedPending.length} pending message(s). Any previously-relayed messages re-discovered by the scanner will get a one-shot 'already processed' bounce on first re-submit.`,
  );
  return {
    pending: migratedPending,
    processed: [], // legacy keccak256(messageBytes) entries are not convertible — drop them.
    updatedAt: candidate.updatedAt,
    version: PENDING_SCHEMA_VERSION,
  };
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
    "dedupKey",
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
  // Optional fields — validate ONLY if present. submittedTxHash + submittedAt MUST be present
  // together; one without the other indicates corruption that downstream logic would mishandle.
  if (m.submittedTxHash !== undefined || m.submittedAt !== undefined) {
    if (typeof m.submittedTxHash !== "string") {
      throw new Error(
        `pending-store: pending[${idx}].submittedTxHash for chain '${chainName}' at ${path} is set but not a string.`,
      );
    }
    if (typeof m.submittedAt !== "number" || !Number.isFinite(m.submittedAt)) {
      throw new Error(
        `pending-store: pending[${idx}].submittedAt for chain '${chainName}' at ${path} is set but not a finite number.`,
      );
    }
  }
  return m as PersistedPendingMessage;
}
