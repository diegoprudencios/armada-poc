# Relayer — Hardening Backlog

Items needing dedicated attention on the Armada relayer (`relayer/`) before it can run unattended in production. Most surfaced during cross-chain shield/unshield testing on Sepolia where messages were silently dropped.

Separate from `ARMADA_INTERFACE_POLISH.md` — that's frontend gaps; this file is server-side reliability.

Sizing: XS (<1 hr), S (<½ day), M (~1 day), L (multi-day).

---

## Status

| Phase | Theme | Status |
|---|---|---|
| Phase 1 | Stop the silent stalls — persistent cursor + chunked/bisected getLogs + RPC timeouts + non-silent errors + confirmation depth + async shutdown | ✅ shipped in PR #292 |
| Phase 2 | Recoverability — persistent pending+processed, per-message retry/backoff, explicit nonce tracking, parallel polling, configurable attestation TTL | ✅ shipped in PR #293 |
| Phase 2B | Non-blocking relay loop — fire-and-track receipts, stuck-tx detection, state-machine separation | ✅ shipped in PR #294 |
| **Phase 3** | **Observability — health endpoint, structured logs, metrics** | **open** |

---

## Phase 3 — open items

### Iris CCTP relay — `modules/iris-relay.ts`

| Item | Size | Notes |
|---|---|---|
| **`/health` endpoint** | S | Surface per-chain `{ lastProcessedBlock, chainHead, lagBlocks, lastScanAt, lastError, pendingCount }`. Mirror the indexer's `IndexerHealth` shape (`crowdfund-ui/packages/shared/src/lib/indexer.ts:29-48`). Status field: `healthy \| degraded \| stale \| unhealthy`. Gives operators a positive signal that the scanner is actually working — currently the only signal is logs. |
| **Structured JSON logs** | S | Migrate `console.log`/`console.error` to `pino` (already a transitive dep via @railgun-community/wallet). Production logs are currently fragile to parse — Loki/Datadog ingestion needs structured shape. Keep the existing log content; just change the serialiser. |
| **Prometheus `/metrics` endpoint** | M | Counters: messages-enqueued, attestations-polled, submits-successful, submits-failed, reverts, stuck-txs, expired-messages. Histograms: end-to-end delivery latency (detectedAt → confirmed), Iris attestation latency. Gauges: per-chain `lagBlocks`, `pendingCount`, `processedCount`. Existing `lastError` field is the natural place to wire counters from. |

### Privacy relay — `modules/privacy-relay.ts`

Out of scope for POC, tracked for production-readiness:

| Item | Size | Notes |
|---|---|---|
| **No idempotency on `/relay`** | S | Anyone with the calldata + a live `feesCacheId` can re-submit. For production: bind requests to a user-supplied nonce or signature. |
| **No rate limiting** | S | A single client can flood. Express middleware (`express-rate-limit`) keyed by IP or signature. |

---

## What's NOT a relayer problem (frontend handles)

For completeness so future investigators don't go hunting in the wrong place:

- **CCTP V2 destination delivery detection** is purely frontend — the relayer doesn't notify the app when delivery completes. The app polls the destination chain's `MessageReceived` events directly. See `apps/armada-interface/src/features/unshield-xchain/handler.ts::runWaitForDelivery`.

---

## Resolved — historical reference

### Phase 1 (PR #292)

Closed the silent-stall failure class that dropped a real Sepolia shield (`0x8617f73…`):

- Cold-start lookback (bootstrap from `currentBlock - bootLookbackBlocks` when no cursor exists)
- Persistent `lastProcessedBlock` per chain in `relayer/state/cursor-{chain}.json`
- Chunked `getLogs` (cursor-checkpoint cadence)
- Bisecting `eth_getLogs` patch (adapts to Alchemy 10-block cap automatically)
- RPC timeouts via `withTimeout` — no more wedged-socket loop pinning
- Non-silent error handling with `lastError` per chain
- Confirmation depth — won't scan reorg-vulnerable tip blocks
- Async shutdown that awaits in-flight scan + flushes cursors before `process.exit`

### Phase 2 (PR #293)

Closed the remaining scanner-side recoverability gaps:

- Persistent `pendingMessages` + `processedMessages` per chain (restart-safe dedup)
- Per-message retry + exponential backoff for failed `relayWithHook` (ported `RetryEntry` from cctp-relay)
- Explicit `pendingNonce` tracking in iris-relay (Sepolia load-balancer drift fix)
- `MAX_ATTESTATION_AGE_MS` configurable via env, default bumped 30 → 60 min, expiry telemetry loud
- Parallel `pollChain` via `Promise.allSettled` — one slow chain no longer delays others

### Phase 2B (PR #294)

Non-blocking relay loop:

- `relayMessage` → `submitRelay` — broadcasts and returns immediately without `await tx.wait()`. Per-message confirmation latency (~12s on Sepolia) no longer serialises the loop.
- New `processInflightRelays(state)` — receipt polling phase, runs after `processPendingMessages` in each tick
- State machine via `submittedTxHash` field: absent → awaiting Iris; set → awaiting receipt
- Stuck/dropped tx detection — `STUCK_TX_THRESHOLD_MS` (10 min default, env-configurable) triggers re-submit with fresh nonce
- Revert handling — receipt with `status=0` routes through the existing retry/backoff machinery
- Backward-compatible schema: `submittedTxHash` + `submittedAt` are optional, v1 files from Phase 2 load cleanly

---

## Mock CCTP relay — `modules/cctp-relay.ts`

| Item | Size | Notes |
|---|---|---|
| _(none flagged for Phase 3 — used only for local Anvil; the non-blocking refactor was explicitly skipped here since `tx.wait()` against Anvil is instant and the added complexity has zero benefit)_ | — | If iris-relay ever needs to share code with cctp-relay beyond the existing `lib/` primitives, consider a base class. Not needed yet. |
