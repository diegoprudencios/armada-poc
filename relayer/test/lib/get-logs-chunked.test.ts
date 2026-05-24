// ABOUTME: Tests for getLogsChunked — verifies bounded chunking, per-chunk progress callbacks, and ordering.
// ABOUTME: WHY: the un-chunked scan was the proximate cause of the silent stall failure (range grew past RPC limit, errors swallowed, stuck forever). Chunking + per-chunk persistence is the structural fix — every chunking edge case (exact boundary, partial last chunk, single-block range, empty range) needs explicit coverage so regressions surface immediately.

import { expect } from "chai";
import type { ethers } from "ethers";
import { getLogsChunked } from "../../lib/get-logs-chunked";

/** Tiny fake provider that records every getLogs invocation and returns canned logs. */
function makeFakeProvider(
  logsForRange: (from: number, to: number) => ethers.Log[],
): {
  provider: ethers.JsonRpcProvider;
  calls: Array<{ from: number; to: number }>;
} {
  const calls: Array<{ from: number; to: number }> = [];
  const provider = {
    async getLogs(filter: { fromBlock: number; toBlock: number }) {
      calls.push({ from: filter.fromBlock, to: filter.toBlock });
      return logsForRange(filter.fromBlock, filter.toBlock);
    },
  } as unknown as ethers.JsonRpcProvider;
  return { provider, calls };
}

/** Synthesize an ethers.Log just enough to be carried through the helper. */
function fakeLog(blockNumber: number): ethers.Log {
  return {
    blockNumber,
    blockHash: "0x" + blockNumber.toString(16).padStart(64, "0"),
    transactionHash: "0xtx",
    transactionIndex: 0,
    address: "0xabc",
    data: "0x",
    topics: [],
    index: 0,
    removed: false,
  } as unknown as ethers.Log;
}

describe("getLogsChunked", function () {
  it("issues a single chunk when the range fits in maxRange", async function () {
    // WHY: trivial case but the baseline — we must not over-chunk a small range or we waste
    // RPC calls. 100 blocks at maxRange=500 is one call, not two.
    const { provider, calls } = makeFakeProvider(() => []);
    await getLogsChunked(provider, {
      fromBlock: 100,
      toBlock: 199,
      maxRange: 500,
      filter: { address: "0xabc" },
    });
    expect(calls).to.deep.equal([{ from: 100, to: 199 }]);
  });

  it("splits a large range into exact-size chunks plus a remainder", async function () {
    // WHY: this is the failure mode the bug fix targets. Without chunking, a 1500-block range
    // hitting an RPC with a 500-block cap would silently fail forever. With chunking, it
    // becomes 3 successive calls — each one within the cap.
    const { provider, calls } = makeFakeProvider(() => []);
    await getLogsChunked(provider, {
      fromBlock: 1_000,
      toBlock: 2_499,
      maxRange: 500,
      filter: { address: "0xabc" },
    });
    expect(calls).to.deep.equal([
      { from: 1_000, to: 1_499 },
      { from: 1_500, to: 1_999 },
      { from: 2_000, to: 2_499 },
    ]);
  });

  it("clamps the final chunk to toBlock rather than overshooting", async function () {
    // WHY: edge case — a 600-block range with maxRange=500 is 1 full chunk + 1 partial (100
    // blocks). The partial chunk must NOT request blocks past toBlock — the RPC would either
    // error or return future-block data the scanner would misinterpret.
    const { provider, calls } = makeFakeProvider(() => []);
    await getLogsChunked(provider, {
      fromBlock: 0,
      toBlock: 599,
      maxRange: 500,
      filter: { address: "0xabc" },
    });
    expect(calls).to.deep.equal([
      { from: 0, to: 499 },
      { from: 500, to: 599 },
    ]);
  });

  it("treats fromBlock === toBlock as a single 1-block query", async function () {
    // WHY: defensive — the cursor advance pattern is `from = lastChunkTo + 1` so on a chain
    // with no new blocks since the last tick, we'd otherwise loop forever. The early-return
    // when from > to handles that; this test pins the equal case as the "yes scan 1 block" path.
    const { provider, calls } = makeFakeProvider(() => []);
    await getLogsChunked(provider, {
      fromBlock: 42,
      toBlock: 42,
      maxRange: 500,
      filter: { address: "0xabc" },
    });
    expect(calls).to.deep.equal([{ from: 42, to: 42 }]);
  });

  it("returns empty + makes no RPC calls when fromBlock > toBlock", async function () {
    // WHY: the no-new-blocks case. Caller passes `from=lastProcessed+1, to=currentBlock` —
    // when no new blocks have arrived since the last successful tick, from > to and we should
    // short-circuit without burning a getLogs call.
    const { provider, calls } = makeFakeProvider(() => [fakeLog(1)]);
    const out = await getLogsChunked(provider, {
      fromBlock: 100,
      toBlock: 99,
      maxRange: 500,
      filter: { address: "0xabc" },
    });
    expect(out).to.deep.equal([]);
    expect(calls).to.deep.equal([]);
  });

  it("concatenates logs across chunks in ascending order", async function () {
    // WHY: callers (enqueueMessage in iris-relay) iterate the result in order — out-of-order
    // delivery would mean nonces processed before their predecessors.
    const { provider } = makeFakeProvider((from) => [fakeLog(from + 1)]);
    const out = await getLogsChunked(provider, {
      fromBlock: 0,
      toBlock: 1_499,
      maxRange: 500,
      filter: { address: "0xabc" },
    });
    expect(out.map((l) => l.blockNumber)).to.deep.equal([1, 501, 1001]);
  });

  it("fires onChunk after each successful chunk so the caller can persist mid-range progress", async function () {
    // WHY: this is the critical reliability property. If chunk 3 of 5 fails, the caller has
    // received 2 onChunk callbacks — by ingesting+persisting in each, the next poll tick
    // resumes from chunk 3 rather than re-scanning chunks 1-2. Without per-chunk progress, an
    // outage mid-range would lose ALL progress and the next attempt would face the same
    // (or worse) range failure.
    const events: Array<{ from: number; toInc: number; n: number }> = [];
    const { provider } = makeFakeProvider((from) => [fakeLog(from + 1)]);
    await getLogsChunked(provider, {
      fromBlock: 0,
      toBlock: 1_499,
      maxRange: 500,
      filter: { address: "0xabc" },
      onChunk: ({ fromBlock: f, toBlockInclusive, logs }) => {
        events.push({ from: f, toInc: toBlockInclusive, n: logs.length });
      },
    });
    expect(events).to.deep.equal([
      { from: 0, toInc: 499, n: 1 },
      { from: 500, toInc: 999, n: 1 },
      { from: 1000, toInc: 1499, n: 1 },
    ]);
  });

  it("does NOT fire onChunk for a chunk whose getLogs call threw", async function () {
    // WHY: partial-progress contract — onChunk only fires on success. If chunk 2 throws, the
    // cursor stays at the end of chunk 1. The exception bubbles to the caller.
    const events: number[] = [];
    let attempt = 0;
    const provider = {
      async getLogs() {
        attempt++;
        if (attempt === 2) throw new Error("simulated RPC blip on chunk 2");
        return [];
      },
    } as unknown as ethers.JsonRpcProvider;

    try {
      await getLogsChunked(provider, {
        fromBlock: 0,
        toBlock: 1_499,
        maxRange: 500,
        filter: { address: "0xabc" },
        onChunk: ({ toBlockInclusive }) => {
          events.push(toBlockInclusive);
        },
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error).message).to.match(/simulated RPC blip/);
    }
    // chunk 1 completed → 499 persisted. chunk 2 threw → 999 NOT persisted.
    expect(events).to.deep.equal([499]);
  });

  it("awaits an async onChunk before issuing the next chunk", async function () {
    // WHY: cursor persistence + log ingestion may be async. We MUST not start chunk N+1 before
    // chunk N's persistence + ingest completes, otherwise a crash between them would leave
    // the on-disk cursor referencing logs we haven't actually accepted into pendingMessages.
    // This test pins the await contract by ordering an async sleep inside the callback against
    // the chunk-issue sequence and verifying interleave.
    const trace: string[] = [];
    const { provider } = makeFakeProvider(() => []);
    await getLogsChunked(provider, {
      fromBlock: 0,
      toBlock: 1_499,
      maxRange: 500,
      filter: { address: "0xabc" },
      onChunk: async ({ toBlockInclusive }) => {
        trace.push(`onChunk-start ${toBlockInclusive}`);
        await new Promise((r) => setTimeout(r, 5));
        trace.push(`onChunk-end ${toBlockInclusive}`);
      },
    });
    // Each chunk's onChunk must finish before the next chunk's onChunk starts.
    expect(trace).to.deep.equal([
      "onChunk-start 499",
      "onChunk-end 499",
      "onChunk-start 999",
      "onChunk-end 999",
      "onChunk-start 1499",
      "onChunk-end 1499",
    ]);
  });

  it("throws on maxRange < 1 — would otherwise infinite-loop", async function () {
    // WHY: maxRange=0 would never advance the cursor; the while loop spins forever. Loud throw
    // > silent hang.
    const { provider } = makeFakeProvider(() => []);
    try {
      await getLogsChunked(provider, {
        fromBlock: 0,
        toBlock: 100,
        maxRange: 0,
        filter: { address: "0xabc" },
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error).message).to.match(/maxRange must be ≥ 1/);
    }
  });
});
