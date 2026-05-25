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
| Phase 3A | Observability part 1 — `/health` endpoint with per-chain status + rollup | ✅ shipped in PR #295 |
| **Phase 3B** | **Structured JSON logs (pino migration)** | **open** |
| **Phase 3C** | **Prometheus `/metrics` endpoint** | **open** |

---

## Phase 3B — Structured JSON logs (open)

Migrate `console.log` / `console.error` across the relayer to `pino` so production logs are parseable by Loki / Datadog / etc. Today everything is free-form prefixed strings — fine for `tail -f`, fragile for any ingestion pipeline.

| Item | Size | Notes |
|---|---|---|
| **Pino setup + child loggers per module** | S | Add `pino` as a direct dep (currently transitive via `@railgun-community/wallet`). Create a root logger in `armada-relayer.ts`; pass child loggers (`logger.child({ module: 'iris-relay' })`) into each module's constructor. |
| **Log statement migration** | S | Rewrite every `console.*` call to use the module logger. Preserve current log CONTENT — chain names, message hashes, block numbers, error stacks. Adopt log levels: `debug` for per-tick chatter (skip-stale-message decisions), `info` for state transitions (attestation ready, tx submitted, confirmation received), `warn` for retry/backoff scheduling, `error` for gave-up cases + scan failures. |
| **Local dev pretty-printer** | XS | Local dev (CCTP_MODE=mock) should still produce human-readable output. Use `pino-pretty` as a dev dep, wire via env: `LOG_PRETTY=1 npm run armada-relayer` pipes through it. |

WHY: production logs are currently fragile to parse. The hardening so far is invisible to operators unless they `tail -f` the process. Structured logs unlock dashboards, alerting on specific error codes, and queryable history.

---

## Phase 3C — Prometheus `/metrics` endpoint (open)

Adds a `/metrics` endpoint scrapable by Prometheus / VictoriaMetrics / Grafana Agent. Complementary to `/health` (which is a point-in-time snapshot) — metrics give the time-series view that lets operators distinguish "we always have 2 pending messages" from "pending count has been growing for 30 minutes."

| Item | Size | Notes |
|---|---|---|
| **Prometheus client setup** | XS | Add `prom-client` dep. Register the default Node.js process metrics (event loop lag, GC, heap). |
| **Counters** | S | `relayer_messages_enqueued_total{source_chain}`, `relayer_attestations_polled_total{source_chain,outcome}`, `relayer_submits_total{dest_chain,outcome}`, `relayer_reverts_total{dest_chain}`, `relayer_stuck_txs_total{dest_chain}`, `relayer_expired_messages_total{source_chain}`. |
| **Histograms** | S | `relayer_delivery_latency_seconds{source,dest}` — from `detectedAt` (source MessageSent) → confirmed receipt on destination. `relayer_iris_attestation_latency_seconds{source}` — from `detectedAt` → Iris returns the attestation. Buckets: tuned for Sepolia (10s, 30s, 1m, 2m, 5m, 10m, 30m, 1h). |
| **Gauges** | S | `relayer_lag_blocks{chain}`, `relayer_pending_count{chain}`, `relayer_processed_count{chain}`, `relayer_inflight_count{chain}`. Updated each poll tick. |
| **Route in http-api** | XS | `GET /metrics` returning `register.metrics()` with the Prometheus text content-type. |

WHY: `/health` answers "is it broken right now?" Metrics answer "is it getting worse?" Both are needed — the former pages, the latter explains.

---

## Privacy relay — `modules/privacy-relay.ts`

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

### Phase 3A (PR #295)

`/health` endpoint — gives operators a positive signal that the scanner is alive (previously only signal was log tailing):

- `RelayerHealth` + `ChainHealth` types in `relayer/types.ts` mirror the indexer's `IndexerHealth` shape
- Pure `classifyChainHealth()` classifier in `relayer/lib/health-classifier.ts` — multipliers tied to pollInterval (3× = stale, 10× = unhealthy) + 100-block lag threshold for degraded
- Worst-wins `rollupStatus()` aggregator
- `lastChainHead` field on `ChainState` (both iris-relay + cctp-relay) — captured each tick, used to compute `lagBlocks` cheaply at request time
- `getHealth()` on `IrisRelayModule` + `CCTPRelayModule` — both implement the same contract, surfaced through `cctpRelayModule` in armada-relayer
- `GET /health` route in http-api — HTTP 200 for healthy/degraded, 503 for stale/unhealthy so k8s/uptime-kuma can act without parsing JSON
- 16 unit tests for the classifier pin severity ordering + boundary thresholds

---

## Mock CCTP relay — `modules/cctp-relay.ts`

| Item | Size | Notes |
|---|---|---|
| _(none flagged for Phase 3 — used only for local Anvil; the non-blocking refactor was explicitly skipped here since `tx.wait()` against Anvil is instant and the added complexity has zero benefit)_ | — | If iris-relay ever needs to share code with cctp-relay beyond the existing `lib/` primitives, consider a base class. Not needed yet. |
