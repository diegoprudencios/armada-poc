# Relayer — Hardening Backlog

Items needing dedicated attention on the Armada relayer (`relayer/`) before it can run unattended in production. Most of these surfaced during cross-chain shield/unshield testing on Sepolia where messages were silently dropped.

This is **separate** from `ARMADA_INTERFACE_POLISH.md` — those are frontend gaps; this file is server-side reliability.

Sizing: XS (<1 hr), S (<½ day), M (~1 day), L (multi-day).

---

## Iris CCTP relay — `modules/iris-relay.ts`

### Confirmed silent-failure modes (high priority)

| Item | Size | Notes |
|---|---|---|
| **Bounded lookback on cold start** | XS | `pollChain` (lines 351-393) sets `lastProcessedBlock = currentBlock` on first tick — any `MessageSent` event in a block submitted before the relayer started is silently skipped forever. Fix: on the cold-start branch (lines 355-361), set `lastProcessedBlock = currentBlock - LOOKBACK_BLOCKS` (env-configurable, default ~2000 for Sepolia ≈ 67 min headroom). Recovers messages submitted during a restart window. |
| **Persist `lastProcessedBlock` to disk** | S | The cursor is in-memory only — every restart resets it to "now," guaranteeing message drops during the restart window. Combine with the lookback above into a single hardening commit. Per-chain JSON file alongside existing relayer state. |
| **Chunked `getLogs` with bounded range** | S | After any RPC blip the next `getLogs(fromBlock=lastProcessed+1, toBlock=now)` can span 1000s of blocks; most public RPCs (Alchemy 500, drpc 1024) reject "block range too large" — and because the catch on line 391 is silent, the failure repeats forever, growing worse with every tick. Fix: cap each `getLogs` at `MAX_LOG_RANGE` (e.g. 500), advance the cursor in chunks across multiple ticks if needed. |
| **Stop swallowing scan errors silently** | XS | `pollChain` line 391-393 — `catch (e) { /* Silently ignore */ }` hides RPC errors, rate limits (429), connection drops. At minimum log; ideally back off + retry with metrics. This is the single most important fix because it's the difference between "relayer broken" and "looks healthy but processes nothing." |

### Confirmed real-world incident

User reported a `crossChainShield` from Base Sepolia → Ethereum Sepolia (~3 USDC) that confirmed on source, deducted balance, never delivered to the shielded pool. Source tx `0x8617f73…51f65b49`. Relayer running as systemd, no log entries for the message. Most likely cause: chronic "stuck on too-large `getLogs` range" — any single past RPC blip wedges scanning forever. Manual recovery via `hookRouter.relayWithHook(message, attestation)` from Iris is the workaround until the lookback + chunking lands.

### Additional reliability gaps

| Item | Size | Notes |
|---|---|---|
| **Silent `mintRecipient` filter drop** | XS | `enqueueMessage` lines 422-425 — when a message's `mintRecipient` doesn't match `destState.knownRecipients`, return silently with NO log. The neighboring `destinationCaller` filter at line 432 DOES log. Symmetric logging would surface "we're seeing messages we don't recognise" issues. |
| **Iris API failures only warn, never escalate** | XS | `checkAttestation` logs API errors as `console.warn` (line 212) and `catch (e)` block logs `[iris] Poll error` as warn (line 234). Use `console.error` for non-404 failures so they surface above default log thresholds. |
| **No retry/backoff on `relayWithHook` revert** | S | `relayMessage` (line 537-589) handles "Nonce already used" as success but other reverts (gas issues, hub-side contract checks) return false and the message stays in `pendingMessages` forever, retrying every poll. Add an exponential-backoff retry counter with a max-attempts ceiling. |
| **No health endpoint** | XS | Today there's no `/health` / `/status` to confirm the relayer is actually scanning chains (vs. running but wedged). Add one returning `{ chains: { name: { lastProcessedBlock, lastScanAt } } }` so monitoring can alert on stale cursors. |

### What's NOT a relayer problem (frontend handles)

For completeness so future investigators don't go hunting in the wrong place:

- **CCTP V2 destination delivery detection** is purely frontend — the relayer doesn't notify the app when delivery completes. The app polls the destination chain's `MessageReceived` events directly. See `apps/armada-interface/src/features/unshield-xchain/handler.ts::runWaitForDelivery`.

---

## Mock CCTP relay — `modules/cctp-relay.ts`

| Item | Size | Notes |
|---|---|---|
| _(none flagged — used only for local Anvil; correctness has been validated end-to-end)_ | — | If `iris-relay.ts` issues are fixed, consider whether to keep two parallel impls or unify with mode-flag branching. |

---

## Privacy relay — `modules/privacy-relay.ts`

| Item | Size | Notes |
|---|---|---|
| **No idempotency on `/relay`** | S | Anyone with the calldata + a live `feesCacheId` can re-submit the same tx. Acceptable for POC; for production: bind requests to a user-supplied nonce or signature. |
| **No rate limiting** | S | A single client can flood the relayer with `/relay` requests. Express middleware (`express-rate-limit`) keyed by IP or signature. |

---

## Cross-cutting

| Item | Size | Notes |
|---|---|---|
| **Structured JSON logs** | S | Today: `console.log` with ad-hoc formatting. Migrate to a structured logger (pino, which is already a transitive dep via @railgun-community/wallet) so production logs can be parsed by Loki/Datadog/etc. |
| **Telemetry/metrics surface** | M | Counters for messages-enqueued, attestation-polls, relays-successful/failed; histogram for end-to-end delivery latency. Even basic Prometheus `/metrics` endpoint would dramatically improve operability. |

---

## Suggested order of attack

1. **Item 1-4 above** (the four "silent failure mode" items) as one focused PR — lookback + persisted cursor + chunked getLogs + non-silent error handling. This eliminates the class of "relayer running but quietly broken" failures.
2. **Health endpoint** as a small follow-up — gives operators a positive signal that scanning is happening.
3. Retry/backoff + structured logging + metrics as a separate hardening pass once #1 has stabilised behavior.
4. Idempotency + rate limiting come last (production-readiness, not POC blockers).
