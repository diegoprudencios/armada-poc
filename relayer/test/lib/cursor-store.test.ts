// ABOUTME: Tests for CursorStore — atomic per-chain cursor persistence used by the CCTP scanners.
// ABOUTME: WHY this exists at all: silent in-memory cursors caused real Sepolia message drops (PR #292 incident); a corrupt or torn-write cursor on disk would reintroduce the same class of failure, so every persistence edge case (missing file, malformed JSON, version mismatch, atomic-write survival) gets explicit coverage.

import { expect } from "chai";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CursorStore } from "../../lib/cursor-store";

describe("CursorStore", function () {
  let dir: string;

  beforeEach(async function () {
    dir = await mkdtemp(join(tmpdir(), "cursor-store-"));
  });

  afterEach(async function () {
    await rm(dir, { recursive: true, force: true });
  });

  describe("read", function () {
    it("returns null when the cursor file does not exist", async function () {
      // WHY: cold start IS the missing-file case. The caller bootstraps from a lookback window
      // in this case rather than failing — null is the contract that signals "fresh boot."
      const store = new CursorStore(dir);
      expect(await store.read("hub")).to.equal(null);
    });

    it("round-trips a written cursor", async function () {
      const store = new CursorStore(dir);
      await store.write("hub", { lastProcessedBlock: 12345, updatedAt: 1_700_000_000_000 });
      const got = await store.read("hub");
      expect(got).to.deep.equal({
        lastProcessedBlock: 12345,
        updatedAt: 1_700_000_000_000,
        version: 1,
      });
    });

    it("throws on malformed JSON rather than silently treating as cold start", async function () {
      // WHY: silently returning null on malformed input would be the same class of bug as the
      // original silent-scan-error problem — we'd boot from chain head and lose every in-flight
      // message. Loud failure forces operator to investigate (delete file → bootstrap from
      // lookback) rather than corrupt the relayer's worldview.
      const store = new CursorStore(dir);
      const path = join(dir, "cursor-hub.json");
      await writeFile(path, "{ not valid json", "utf8");
      try {
        await store.read("hub");
        expect.fail("should have thrown");
      } catch (err) {
        expect((err as Error).message).to.match(/JSON|malformed|Unexpected/);
      }
    });

    it("throws on unexpected shape (missing required fields)", async function () {
      const store = new CursorStore(dir);
      const path = join(dir, "cursor-hub.json");
      await writeFile(path, JSON.stringify({ foo: "bar" }), "utf8");
      try {
        await store.read("hub");
        expect.fail("should have thrown");
      } catch (err) {
        expect((err as Error).message).to.match(/malformed cursor/);
      }
    });

    it("throws on a future schema version", async function () {
      // WHY: a future-version cursor written by a newer relayer must not be misinterpreted by
      // an older one. The schema version stamp + explicit version check is how we'd safely add
      // migration logic later.
      const store = new CursorStore(dir);
      const path = join(dir, "cursor-hub.json");
      await writeFile(
        path,
        JSON.stringify({ lastProcessedBlock: 100, updatedAt: 1, version: 999 }),
        "utf8",
      );
      try {
        await store.read("hub");
        expect.fail("should have thrown");
      } catch (err) {
        expect((err as Error).message).to.match(/unsupported version/);
      }
    });
  });

  describe("write", function () {
    it("creates the base directory if it does not exist", async function () {
      // WHY: fresh deployments / cleared state dirs are common. Auto-creating is the difference
      // between "first boot just works" and "first boot crashes with ENOENT."
      const nested = join(dir, "deep", "nest");
      const store = new CursorStore(nested);
      await store.write("hub", { lastProcessedBlock: 1, updatedAt: 2 });
      const stats = await stat(nested);
      expect(stats.isDirectory()).to.equal(true);
    });

    it("writes the canonical file atomically (no .tmp left behind on success)", async function () {
      // WHY: the atomic write pattern is tmpfile + rename. If a .tmp file is left dangling, it
      // indicates the rename failed silently — operator would see stale data on the canonical
      // path while the latest write sits in a phantom tmp file forever.
      const store = new CursorStore(dir);
      await store.write("hub", { lastProcessedBlock: 100, updatedAt: 1 });
      const entries = await readdir(dir);
      expect(entries).to.include("cursor-hub.json");
      expect(entries.every((e) => !e.endsWith(".tmp"))).to.equal(true);
    });

    it("a partial write to .tmp does not corrupt the canonical file", async function () {
      // WHY: simulates kill-9 mid-write. The atomic-rename pattern's whole point is that the
      // canonical file is either old-intact OR new-fully-present, never torn. We pre-seed a
      // good cursor, then dump a manual half-written .tmp next to it, then read — the read
      // MUST return the good prior value.
      const store = new CursorStore(dir);
      await store.write("hub", { lastProcessedBlock: 999, updatedAt: 1_111 });

      // Simulate a crash mid-write: write a junk .tmp that never got renamed.
      const tmpPath = join(dir, `cursor-hub.json.${process.pid}.tmp`);
      await writeFile(tmpPath, '{"lastProcessedBlock": 50000000, "garbage"', "utf8");

      const got = await store.read("hub");
      expect(got?.lastProcessedBlock).to.equal(999);
      expect(got?.updatedAt).to.equal(1_111);
    });

    it("sanitises chain names — no path traversal", async function () {
      // WHY: chain name comes from our own config, but path traversal in a state file pattern
      // is the kind of latent footgun we should slam shut now rather than discover when someone
      // adds a chain called "../etc/passwd".
      const store = new CursorStore(dir);
      await store.write("../escape", { lastProcessedBlock: 1, updatedAt: 1 });
      const entries = await readdir(dir);
      expect(entries.some((e) => e.startsWith("cursor-"))).to.equal(true);
      expect(entries.every((e) => !e.includes(".."))).to.equal(true);
    });

    it("ends the JSON with a trailing newline (git-friendly + posix-tradition)", async function () {
      const store = new CursorStore(dir);
      await store.write("hub", { lastProcessedBlock: 1, updatedAt: 1 });
      const raw = await readFile(join(dir, "cursor-hub.json"), "utf8");
      expect(raw.endsWith("\n")).to.equal(true);
    });

    it("overwrites an existing cursor on second write", async function () {
      const store = new CursorStore(dir);
      await store.write("hub", { lastProcessedBlock: 100, updatedAt: 1 });
      await store.write("hub", { lastProcessedBlock: 200, updatedAt: 2 });
      const got = await store.read("hub");
      expect(got?.lastProcessedBlock).to.equal(200);
      expect(got?.updatedAt).to.equal(2);
    });
  });

  describe("multi-chain isolation", function () {
    it("each chain has an independent cursor file", async function () {
      // WHY: scanning is independent per chain. A stall on chain A must not interfere with
      // chain B's cursor — separate files = separate fates.
      const store = new CursorStore(dir);
      await store.write("hub", { lastProcessedBlock: 100, updatedAt: 1 });
      await store.write("base", { lastProcessedBlock: 200, updatedAt: 2 });
      expect((await store.read("hub"))?.lastProcessedBlock).to.equal(100);
      expect((await store.read("base"))?.lastProcessedBlock).to.equal(200);
    });

    it("case-insensitive chain name normalisation", async function () {
      // WHY: defensive against config typos / case drift. "Hub" and "hub" should hit the same
      // file rather than silently double-track.
      const store = new CursorStore(dir);
      await store.write("Hub", { lastProcessedBlock: 100, updatedAt: 1 });
      expect((await store.read("hub"))?.lastProcessedBlock).to.equal(100);
    });
  });
});
