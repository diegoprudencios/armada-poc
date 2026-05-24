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
      // Manually construct corrupted JSON — version stamp valid but pending entry missing fields.
      await writeFile(
        path,
        JSON.stringify({
          pending: [{ messageHash: "0xa" /* missing the rest */ }],
          processed: [],
          updatedAt: 1,
          version: 1,
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
        JSON.stringify({ pending: "oops", processed: [], updatedAt: 1, version: 1 }),
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
      // WHY: the dedup set is keyed by string hashes. A numeric or null entry would break the
      // Set semantics and could allow re-relay of an already-processed message.
      const store = new PendingStateStore(dir);
      const path = join(dir, "pending-hub.json");
      await writeFile(
        path,
        JSON.stringify({ pending: [], processed: ["0xa", 42], updatedAt: 1, version: 1 }),
        "utf8",
      );
      try {
        await store.read("hub");
        expect.fail("should have thrown");
      } catch (err) {
        expect((err as Error).message).to.match(/processed\[1\].*not a string/);
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

    it("a v1 file written before Phase 2B (no submittedTxHash) loads cleanly", async function () {
      // WHY: backward-compat invariant. Phase 2 deployments wrote v1 files without the new
      // fields; the Phase 2B reader MUST accept them as "awaiting Iris" (no submittedTxHash).
      // Without this, the first restart after the Phase 2B upgrade would fail to load any
      // existing pending state — losing every in-flight message in the wild.
      const store = new PendingStateStore(dir);
      const path = join(dir, "pending-hub.json");
      const legacyPending = {
        messageBytes: "0xabcd",
        messageHash: "0xa",
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
        // submittedTxHash + submittedAt absent — pre-Phase-2B file
      };
      await writeFile(
        path,
        JSON.stringify({
          pending: [legacyPending],
          processed: [],
          updatedAt: 1,
          version: 1,
        }),
        "utf8",
      );
      const got = await store.read("hub");
      expect(got?.pending).to.have.lengthOf(1);
      expect(got?.pending[0]?.submittedTxHash).to.equal(undefined);
      expect(got?.pending[0]?.submittedAt).to.equal(undefined);
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
        JSON.stringify({ pending: [halfPopulated], processed: [], updatedAt: 1, version: 1 }),
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
