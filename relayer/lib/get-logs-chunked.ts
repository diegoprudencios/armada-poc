/**
 * ABOUTME: Bounded-window getLogs helper. Splits a block range into max-size chunks so a single
 * query never exceeds public RPC caps (Alchemy ~500, drpc ~1024, publicnode ~10k).
 * ABOUTME: Adapted from apps/armada-interface/src/lib/events/getLogsChunked.ts — kept in
 * lockstep with the frontend version. Update both files in the same PR or extract to a shared
 * package per Plan §19 when a third consumer appears.
 */

import type { ethers } from "ethers";

/**
 * Per-chunk progress signal. Fired after each successful chunk so callers can persist the
 * cursor + ingest the chunk's logs mid-flight — if the next chunk fails, the cursor reflects
 * what HAS been processed rather than what was attempted. The `logs` array carries the chunk's
 * logs so the caller can ingest synchronously alongside the cursor advance, keeping the two
 * actions in lockstep (avoids "cursor advanced past logs we never enqueued" scenarios on
 * mid-window error).
 */
export interface ChunkProgress<TLog = unknown> {
  fromBlock: number;
  toBlockInclusive: number;
  logs: TLog[];
}

export interface ChunkedLogsOptions {
  /** Inclusive lower block. */
  fromBlock: number;
  /** Inclusive upper block. */
  toBlock: number;
  /** Inclusive max blocks per chunk. Must be ≥ 1. */
  maxRange: number;
  /** ethers Filter — address + topics + (the function adds fromBlock/toBlock per chunk). */
  filter: Omit<ethers.Filter, "fromBlock" | "toBlock">;
  /**
   * Fires after each successful chunk so the caller can ingest the chunk's logs + persist the
   * cursor advance in lockstep. The callback may be async; the helper awaits it before issuing
   * the next chunk — this is critical for crash safety, since "persisted cursor must always
   * trail or equal ingested logs."
   */
  onChunk?: (info: ChunkProgress<ethers.Log>) => Promise<void> | void;
}

/**
 * Fetch logs across an arbitrarily large block range by issuing a sequence of bounded `getLogs`
 * calls, each spanning at most `maxRange` blocks inclusive. Results are concatenated in
 * chunk-issued order (ascending blocks).
 *
 * On error mid-iteration: throws. The caller has received all `onChunk` callbacks for chunks
 * that completed successfully — so persisting the cursor inside `onChunk` lets the next poll
 * tick resume from `lastSuccessfulChunk.toBlockInclusive + 1` rather than re-scanning everything.
 *
 * This is the failure mode that bit us in the un-chunked design: an RPC outage halfway through
 * a 10k-block range meant the next attempt tried 10k+ blocks (worse), failed again (silent),
 * and so on forever. Chunked + per-chunk persistence means a transient outage costs at most
 * `maxRange` blocks of replay on the next tick.
 */
export async function getLogsChunked(
  provider: ethers.JsonRpcProvider,
  opts: ChunkedLogsOptions,
): Promise<ethers.Log[]> {
  if (opts.maxRange < 1) {
    throw new Error(`getLogsChunked: maxRange must be ≥ 1 (got ${opts.maxRange})`);
  }
  if (opts.fromBlock > opts.toBlock) return [];

  const out: ethers.Log[] = [];
  let cursor = opts.fromBlock;

  while (cursor <= opts.toBlock) {
    // Inclusive window: [cursor, cursor + maxRange - 1], clamped at toBlock.
    const windowEnd = cursor + opts.maxRange - 1;
    const chunkTo = windowEnd > opts.toBlock ? opts.toBlock : windowEnd;

    const logs = await provider.getLogs({
      ...opts.filter,
      fromBlock: cursor,
      toBlock: chunkTo,
    });

    out.push(...logs);
    // Awaited so the caller's ingest + persist completes BEFORE we move on to the next chunk.
    // This is the contract that makes per-chunk progress crash-safe: the cursor is never
    // advanced past logs the caller hasn't accepted responsibility for.
    if (opts.onChunk) {
      await opts.onChunk({
        fromBlock: cursor,
        toBlockInclusive: chunkTo,
        logs,
      });
    }

    cursor = chunkTo + 1;
  }

  return out;
}
