# Armada Interface — Open Polish Items

Running list of deferred work / known gaps across the `@armada/interface` build.
Updated as we ship more features. Items are tagged by area and rough size
(XS = <1 hr, S = <½ day, M = ~1 day, L = multi-day).

## How to use this doc

- **Adding an item**: append to the relevant section with a one-line description, the
  affected file(s) when known, and a size tag. Link the commit that introduced the gap.
- **Closing an item**: delete the row (or move to "Recently closed" if there's value in
  history — usually not; commits already record what changed).
- **Don't let this doc grow stale.** When a feature lands, sweep the relevant section.

---

## Wallet lifecycle (Phase 1)

| Item | Size | Notes |
|---|---|---|
| Drop the internal-mnemonic SDK shim — Phase 2 engine-level keys | L | `lib/crypto/CLAUDE.md` documents the compromise. Phase 1 keys are NOT migratable to Phase 2. |
| BN254 / Baby Jubjub / Ed25519 scalar reduction | M | Pending Andrew's confirmation of moduli per subkey purpose. Forward-compatible additive change. |
| Argon2id backup KDF | S | Parsers already accept `kdf: 'argon2id' \| 'scrypt' \| 'pbkdf2-sha256'`. PBKDF2-SHA-256@600k is the v1 spec; Argon2id is the preferred Phase 2 KDF. |
| IC-4 end-to-end test vectors with real signatures | S | Needs sample wallet signatures + expected `root_secret` outputs. |
| Web Worker entry points for spending-key derivation | M | Off-main-thread key ops to keep the UI responsive during signing ceremonies. |
| Recovery secret QR-code export mode | S | Spec mentions QR alongside hex. We ship file + hex only; need a QR encoder dep. |
| Auto-lock visible indicator | XS | `useAutoLock` is wired but there's no "N min until auto-lock" affordance in the header / settings. |

## Transaction executor + lifecycle

| Item | Size | Notes |
|---|---|---|
| Tx history detail view | S | History page lists records but no detail/explorer-link panel. `TxLifecycleStepper` already exists; just need a route + outlet. |
| Cross-tab follower live-sync | M | v1 has only the leader executor running. Other tabs see records but lifecycles freeze. Out of scope per Plan §7a; revisit when it bites. |

## Shield flow

_(no open items)_

## Unshield-local

| Item | Size | Notes |
|---|---|---|
| Relayer-mediated submit path | M | Today always user-signs the transact. Adding a "submit via relayer" toggle hides the second MetaMask prompt and uses the relayer for gas. Depends on `useFees` and relayer client. |

## Unshield-xchain

| Item | Size | Notes |
|---|---|---|
| Iris attestation polling for finer stage transitions | M | Today we collapse `iris-attestation-ready` / `client-mint-pending` / `client-mint-confirmed` into one detection. Real CCTP mode (Sepolia) needs Iris polling to split these. `lib/cctp.ts::pollIrisOnce` is stubbed. |
| Real CCTP (Sepolia) end-to-end test | S | Handler is mode-agnostic by design but unverified on real CCTP. |

## Transfer-shielded

| Item | Size | Notes |
|---|---|---|
| `showSenderAddressToRecipient` + `memoText` exposure | S | Both currently hardcoded (`false` / `undefined`) in `lib/railgun/transfer.ts`. Future UX add: optional toggle + memo field on the Send-Private form. |

## Yield

| Item | Size | Notes |
|---|---|---|
| `rateToApy()` actual APY computation | S | `lib/yield.ts` returns 0. Need to derive APY from the spoke's `annualYieldBps` or sample rate-over-time. |
| Slippage protection on withdraw | S | Modal computes shares from a locally-cached rate; if the rate moves between quote and execution, the user gets slightly more/less than requested. Add a min-out check at the adapter call or surface the slippage on the Review step. |
| Verify proof reuse across stages | XS | `features/yield-deposit/handler.ts` + `features/yield-withdraw/handler.ts` re-call `buildYieldAdaptTransaction` in submit-relayer. Verify the SDK reuses the cached proof when inputs match; otherwise we pay another ~30s. |

## Fees & relayer integration

| Item | Size | Notes |
|---|---|---|
| `submitRelay()` HTTP client | M | `lib/relayer.ts::submitRelay` still throws. Needed for the relayer-mediated submit path that hides the second MetaMask prompt. The other endpoints (`fetchFees`, `pollStatus`) are wired. |
| Stale-quote handling on submit | S | If a modal sits open through a fee-schedule refresh, the user could click Confirm with a stale `cacheId`. The relayer rejects with `FEE_EXPIRED`; we should detect that and offer a one-click re-quote rather than dumping the user into an error step. |

## Debug page

_(no open items)_

## Telemetry

| Item | Size | Notes |
|---|---|---|
| Real telemetry sink | S | Console-only today (`lib/telemetry.ts`). Swap with PostHog / Statsig / etc. when product analytics is needed. The EventRegistry contract should remain the privacy gate. |
| Visibility-gated polling | S | `useUsdcBalances` and `useShieldedBalanceSync` poll regardless of `tabVisibleAtom`. Backing off when hidden saves RPC quota. |

## Sepolia / real-network mode

| Item | Size | Notes |
|---|---|---|
| Full end-to-end testing | M | Onboarding works in either mode; tx flows untested on Sepolia. |
| Per-chain gas estimation | S | `lib/railgun/unshield.ts` + `transfer.ts` hardcode EIP-1559 values appropriate for Anvil. Real chains need RPC-derived values. |
| Real Iris API integration | M | `lib/cctp.ts::pollIrisOnce` is stubbed. Needed for cross-chain flows on real CCTP. |

## Tests

| Item | Size | Notes |
|---|---|---|
| Cross-tab leader election test | S | Only one tab runs the executor; un-tested in the multi-tab path. Would catch the `JotaiProvider` store-mismatch class of bugs again. |
| End-to-end test against a live relayer | M | Integration test running against `npm run chains` + `npm run armada-relayer` + the new app. Validates shield → unshield round-trips. |

## UI polish

| Item | Size | Notes |
|---|---|---|
| Xchain stepper: smoother "skipped" stage rendering | XS | When detection lands, the stepper jumps three stages at once. Looks abrupt. A short transition or "summary" stage row would feel better. |

---

## Recently closed

(none — when items close, just delete them. Commits are the history of record.)
