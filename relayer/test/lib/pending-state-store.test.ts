// ABOUTME: Tests for PendingStateStore — per-source-chain persistence of pending CCTP messages + processed dedup set.
// ABOUTME: WHY: in-memory pendingMessages was the second silent-data-loss surface after the cursor. A restart between MessageSent discovery and Iris attestation completion would forget the in-flight message entirely; with persistence the next boot re-loads exactly the same state. The validation tests pin the format invariants so a corrupted file is caught loudly rather than rehydrated as garbage.

import { expect } from "chai";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PendingStateStore,
  type PersistedPendingMessage,
} from "../../lib/pending-state-store";

function samplePending(overrides: Partial<PersistedPendingMessage> = {}): PersistedPendingMessage {
  return {
    messageBytes: "0xabcd",
    messageHash: "0xhash1",
    dedupKey: "0xtx1:0",
    sourceDomain: 6,
    destinationDomain: 0,
    nonce: "0xnonce",
    sourceTxHash: "0xtx1",
    sourceBlock: 12345,
    detectedAt: 1_700_000_000_000,
    pollAttempts: 2,
    lastStatus: "pending",
    retryAttempts: 0,
    nextRetryAt: 0,
    ...overrides,
  };
}

describe("PendingStateStore", function () {
  let dir: string;

  beforeEach(async function () {
    dir = await mkdtemp(join(tmpdir(), "pending-store-"));
  });

  afterEach(async function () {
    await rm(dir, { recursive: true, force: true });
  });

  describe("read/write round trip", function () {
    it("returns null when the file does not exist (cold start)", async function () {
      // WHY: cold-start contract matches CursorStore — null signals "no prior state, bootstrap
      // from empty pending + empty processed set."
      const store = new PendingStateStore(dir);
      expect(await store.read("base-sepolia")).to.equal(null);
    });

    it("round-trips an empty state (no pending messages, no processed entries)", async function () {
      // WHY: the first write after init typically happens before any messages are enqueued.
      // The empty state must serialize/deserialize cleanly — a writer that rejected empty
      // arrays would block first-cycle persistence.
      const store = new PendingStateStore(dir);
      await store.write("hub", [], new Set());
      const got = await store.read("hub");
      expect(got?.pending).to.deep.equal([]);
      expect(got?.processed).to.deep.equal([]);
      expect(got?.updatedAt).to.be.a("number");
    });

    it("round-trips pending messages + processed hashes", async function () {
      const store = new PendingStateStore(dir);
      const pending = [
        samplePending({ messageHash: "0xa", sourceTxHash: "0xtxA" }),
        samplePending({ messageHash: "0xb", sourceTxHash: "0xtxB", pollAttempts: 5 }),
      ];
      const processed = new Set(["0xdone1", "0xdone2"]);
      await store.write("hub", pending, processed);

      const got = await store.read("hub");
      expect(got?.pending).to.have.lengthOf(2);
      expect(got?.pending[0]?.messageHash).to.equal("0xa");
      expect(got?.pending[1]?.pollAttempts).to.equal(5);
      expect(got?.processed).to.have.members(["0xdone1", "0xdone2"]);
    });

    it("sorts processed hashes on write — stable file content across runs", async function () {
      // WHY: stable on-disk content means a no-op write doesn't dirty the file. Useful for
      // operators diffing state between snapshots / for any future "did this change?" check.
      const store = new PendingStateStore(dir);
      await store.write("hub", [], new Set(["0xb", "0xa", "0xc"]));
      const got = await store.read("hub");
      expect(got?.processed).to.deep.equal(["0xa", "0xb", "0xc"]);
    });
  });

  describe("validation", function () {
    it("throws on a pending entry missing a required string field", async function () {
      // WHY: a corrupted entry where messageBytes is null/missing must NOT be loaded as
      // undefined into the relayer — the downstream relayMessage call would either crash with
      // a confusing error or (worse) submit garbage. Loud failure at the boundary forces the
      // operator to investigate (delete the file, restart, scanner re-discovers from chain).
      const store = new PendingStateStore(dir);
      const path = join(dir, "pending-hub.json");
      // Manually construct corrupted JSON — v2 version stamp, but pending entry missing fields.
      await writeFile(
        path,
        JSON.stringify({
          pending: [{ messageHash: "0xa" /* missing the rest */ }],
          processed: [],
          updatedAt: 1,
          version: 2,
        }),
        "utf8",
      );
      try {
        await store.read("hub");
        expect.fail("should have thrown");
      } catch (err) {
        expect((err as Error).message).to.match(/pending\[0\]/);
      }
    });

    it("throws when 'pending' is not an array", async function () {
      const store = new PendingStateStore(dir);
      const path = join(dir, "pending-hub.json");
      await writeFile(
        path,
        JSON.stringify({ pending: "oops", processed: [], updatedAt: 1, version: 2 }),
        "utf8",
      );
      try {
        await store.read("hub");
        expect.fail("should have thrown");
      } catch (err) {
        expect((err as Error).message).to.match(/invalid 'pending'/);
      }
    });

    it("throws when 'processed' contains a non-string", async function () {
      // WHY: the dedup set is keyed by string dedupKeys. A numeric or null entry would break
      // the Set semantics and could allow re-relay of an already-processed message.
      const store = new PendingStateStore(dir);
      const path = join(dir, "pending-hub.json");
      await writeFile(
        path,
        JSON.stringify({ pending: [], processed: ["0xtx:0", 42], updatedAt: 1, version: 2 }),
        "utf8",
      );
      try {
        await store.read("hub");
        expect.fail("should have thrown");
      } catch (err) {
        expect((err as Error).message).to.match(/processed\[1\].*not a string/);
      }
    });

    it("throws when a v2 pending entry is missing dedupKey", async function () {
      // WHY: dedupKey is the v2 dedup contract — switching from messageHash fixed a silent
      // collision where two identical-amount/recipient unshields produced byte-identical
      // messageBytes (CCTP V2 source nonce is bytes32(0)) and the second one was silently
      // skipped forever. A v2 file missing dedupKey on a pending entry would re-introduce
      // that collision; rejecting at the boundary forces the operator to either delete the
      // file (scanner re-discovers from chain, computes a fresh dedupKey) or fix the writer.
      const store = new PendingStateStore(dir);
      const path = join(dir, "pending-hub.json");
      const noDedupKey = {
        messageBytes: "0xabcd",
        messageHash: "0xa",
        // dedupKey absent
        sourceDomain: 6,
        destinationDomain: 0,
        nonce: "0xn",
        sourceTxHash: "0xtx",
        sourceBlock: 1,
        detectedAt: 1,
        pollAttempts: 0,
        lastStatus: "new",
        retryAttempts: 0,
        nextRetryAt: 0,
      };
      await writeFile(
        path,
        JSON.stringify({ pending: [noDedupKey], processed: [], updatedAt: 1, version: 2 }),
        "utf8",
      );
      try {
        await store.read("hub");
        expect.fail("should have thrown");
      } catch (err) {
        expect((err as Error).message).to.match(/dedupKey/);
      }
    });

    it("throws on unsupported version (would need a migration)", async function () {
      const store = new PendingStateStore(dir);
      const path = join(dir, "pending-hub.json");
      await writeFile(
        path,
        JSON.stringify({ pending: [], processed: [], updatedAt: 1, version: 99 }),
        "utf8",
      );
      try {
        await store.read("hub");
        expect.fail("should have thrown");
      } catch (err) {
        expect((err as Error).message).to.match(/unsupported version 99/);
      }
    });

    it("accepts Phase 2B submittedTxHash + submittedAt optional fields", async function () {
      // WHY: the v1 schema added two optional fields for the non-blocking state machine. A
      // round-trip with them set must preserve both. Without this test a serialiser bug that
      // dropped optional fields could silently lose the "awaiting receipt" marker — the
      // message would re-submit on next tick (gas waste) instead of being recognised as
      // already in-flight.
      const store = new PendingStateStore(dir);
      const pending = [
        samplePending({
          messageHash: "0xinflight",
          submittedTxHash: "0xdesttx123",
          submittedAt: 1_700_000_500_000,
        }),
      ];
      await store.write("hub", pending, new Set());
      const got = await store.read("hub");
      expect(got?.pending[0]?.submittedTxHash).to.equal("0xdesttx123");
      expect(got?.pending[0]?.submittedAt).to.equal(1_700_000_500_000);
    });

    it("rejects a half-populated submittedTxHash/submittedAt pair (corruption)", async function () {
      // WHY: the two fields MUST be set together. submittedTxHash without submittedAt would
      // skip processInflightRelays's stuck-tx detection (no timestamp to compare against);
      // submittedAt without submittedTxHash would have no hash to look up. Both indicate
      // corruption; loud failure forces operator investigation.
      const store = new PendingStateStore(dir);
      const path = join(dir, "pending-hub.json");
      const halfPopulated = {
        messageBytes: "0xabcd",
        messageHash: "0xa",
        dedupKey: "0xtx:0",
        sourceDomain: 6,
        destinationDomain: 0,
        nonce: "0xn",
        sourceTxHash: "0xtx",
        sourceBlock: 1,
        detectedAt: 1,
        pollAttempts: 0,
        lastStatus: "new",
        retryAttempts: 0,
        nextRetryAt: 0,
        submittedTxHash: "0xhash",
        // submittedAt missing — corruption
      };
      await writeFile(
        path,
        JSON.stringify({ pending: [halfPopulated], processed: [], updatedAt: 1, version: 2 }),
        "utf8",
      );
      try {
        await store.read("hub");
        expect.fail("should have thrown");
      } catch (err) {
        expect((err as Error).message).to.match(/submittedAt/);
      }
    });
  });

  describe("v1 → v2 migration", function () {
    // WHY THIS SUITE EXISTS: v2 switched dedup from keccak256(messageBytes) to
    // `${sourceTxHash}:${logIndex}`. The change was driven by a real silent-data-loss bug:
    // CCTP V2 leaves the source nonce slot at bytes32(0) and our burn body has no per-tx-unique
    // field, so two unshields with the same {amount, maxFee, finalRecipient} produced byte-
    // identical messageBytes → identical messageHash → the second was silently skipped forever
    // (after Phase 2 made processedMessages persistent). The migrator drops legacy processed[]
    // entries (they're hashes incompatible with the new key shape) and back-fills dedupKey on
    // any in-flight pending messages. These tests pin the migrator's contract so a future
    // change can't regress the persistence path.

    it("migrates a v1 file by back-filling dedupKey on pending messages and dropping legacy processed[]", async function () {
      const store = new PendingStateStore(dir);
      const path = join(dir, "pending-hub.json");
      // Legacy pending — no dedupKey field (v1 didn't have it). Has the rest of the v1 shape
      // including the pre-Phase-2B optional submittedTxHash absence.
      const legacyPending = {
        messageBytes: "0xabcd",
        messageHash: "0xlegacyhash",
        sourceDomain: 6,
        destinationDomain: 0,
        nonce: "0xn",
        sourceTxHash: "0xlegacytx",
        sourceBlock: 1,
        detectedAt: 1,
        pollAttempts: 0,
        lastStatus: "new",
        retryAttempts: 0,
        nextRetryAt: 0,
      };
      await writeFile(
        path,
        JSON.stringify({
          pending: [legacyPending],
          // Two legacy processed-hash entries — both must be dropped on migration. The cost of
          // dropping is one possible re-relay each (caught by the destination contract's
          // "already processed" check — submitRelay returns 'already-processed' and the message
          // is then marked processed under the v2 dedupKey scheme).
          processed: ["0xprev_hash_a", "0xprev_hash_b"],
          updatedAt: 1,
          version: 1,
        }),
        "utf8",
      );
      const got = await store.read("hub");
      expect(got?.pending).to.have.lengthOf(1);
      // dedupKey back-filled as `${sourceTxHash}:0`. logIndex is unrecoverable from the
      // persisted v1 payload, but our two xchain entry points each emit exactly one MessageSent
      // per tx, so `:0` is correct in practice for migrated entries today.
      expect(got?.pending[0]?.dedupKey).to.equal("0xlegacytx:0");
      // Original v1 fields preserved.
      expect(got?.pending[0]?.messageHash).to.equal("0xlegacyhash");
      expect(got?.pending[0]?.submittedTxHash).to.equal(undefined);
      // Legacy processed entries DROPPED — they're keyed by messageHash, incompatible with
      // the new dedupKey shape. Re-discovered messages will get a one-shot "already processed"
      // bounce on first re-submit.
      expect(got?.processed).to.deep.equal([]);
    });

    it("after migration, the migrated file persists at v2 — a second read does not re-trigger the migrator", async function () {
      // WHY: subtle contract. After a successful read+migrate, the NEXT write must stamp v2
      // so future reads short-circuit through the v2 validator (not the v1 migrator). Without
      // this, the migrator could be invoked repeatedly on the same file, and any non-idempotent
      // migration logic would corrupt state.
      const store = new PendingStateStore(dir);
      const path = join(dir, "pending-hub.json");
      await writeFile(
        path,
        JSON.stringify({
          pending: [],
          processed: ["0xprev_hash"],
          updatedAt: 1,
          version: 1,
        }),
        "utf8",
      );
      // First read: triggers migrator.
      const firstRead = await store.read("hub");
      expect(firstRead?.version).to.equal(2);
      // Persist back to disk under v2.
      await store.write("hub", firstRead!.pending, new Set(firstRead!.processed));
      // Second read: must NOT migrate (the v1 migrator would throw on a payload without
      // version:1, so a regression that re-triggers the migrator would surface here).
      const secondRead = await store.read("hub");
      expect(secondRead?.version).to.equal(2);
      expect(secondRead?.processed).to.deep.equal([]);
    });
  });

  describe("per-chain isolation", function () {
    it("hub and base-sepolia have independent files", async function () {
      // WHY: scanning + retry-backoff are per-chain. A write on chain A must never overwrite
      // chain B's state, even with simultaneous mutations.
      const store = new PendingStateStore(dir);
      await store.write("hub", [samplePending({ messageHash: "0xhub" })], new Set(["0xpHub"]));
      await store.write("base-sepolia", [samplePending({ messageHash: "0xbase" })], new Set(["0xpBase"]));

      const hub = await store.read("hub");
      const base = await store.read("base-sepolia");
      expect(hub?.pending[0]?.messageHash).to.equal("0xhub");
      expect(base?.pending[0]?.messageHash).to.equal("0xbase");
      expect(hub?.processed).to.deep.equal(["0xpHub"]);
      expect(base?.processed).to.deep.equal(["0xpBase"]);
    });
  });
});
