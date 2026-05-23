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

## Transaction executor + lifecycle

| Item | Size | Notes |
|---|---|---|
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
| Contract-enforced min-out on withdraw | S–M | Frontend now refreshes the vault rate immediately before submit and recomputes `shares` from the freshest value, reducing the slippage window to ~1 block. For belt-and-braces protection against a same-block rate move, the `ArmadaYieldAdapter.redeemAndShield` entry point would need a `minUsdcOut` parameter the proof binds to. Out of scope for v1; track as a follow-up if observed slippage exceeds tolerance. |

## Fees & relayer integration

| Item | Size | Notes |
|---|---|---|
| `submitRelay()` HTTP client | M | `lib/relayer.ts::submitRelay` still throws. Needed for the relayer-mediated submit path that hides the second MetaMask prompt. The other endpoints (`fetchFees`, `pollStatus`) are wired. |
| Shield-xchain relayer compensation | M | Tackle alongside `submitRelay()` for hub-tx kinds. Today the relayer pays the hub-side `relayWithHook` gas out of pocket for shield-xchain — there's no integrator slice, no caller-deducted fee, no on-chain reimbursement path. Subsidy is fine for POC but not production. Needs an explicit design decision (integrator-slice via the unused `integrator` arg on `crossChainShield`? caller-deducted fee on the hub `shield()` entry? meta-tx style fee from the user's shielded balance?). Independent of the relayer-mediated submit path for hub `transact()` kinds. |

## Debug page

_(no open items)_

## Telemetry

| Item | Size | Notes |
|---|---|---|
| Real telemetry sink | S | Console-only today (`lib/telemetry.ts`). Swap with PostHog / Statsig / etc. when product analytics is needed. The EventRegistry contract should remain the privacy gate. |

## Sepolia / real-network mode

| Item | Size | Notes |
|---|---|---|
| Full end-to-end testing | M | Onboarding works in either mode; tx flows untested on Sepolia. |
| Per-chain gas estimation (becomes load-bearing with `submitRelay`) | S | `lib/railgun/unshield.ts` + `transfer.ts` hardcode EIP-1559 values appropriate for Anvil. Today these are inert — our wrappers strip the gas fields off the SDK's returned tx and wagmi estimates fresh per-chain. The hardcoded values only matter once the relayer-submit path is wired (the relayer consumes the SDK's returned gas fields to budget native-token outlay). Fold into the `submitRelay()` work. |
| Real Iris API integration | M | `lib/cctp.ts::pollIrisOnce` is stubbed. Needed for cross-chain flows on real CCTP. |

## Tests

| Item | Size | Notes |
|---|---|---|
| Cross-tab leader election test | S | Only one tab runs the executor; un-tested in the multi-tab path. Would catch the `JotaiProvider` store-mismatch class of bugs again. |
| End-to-end test against a live relayer | M | Integration test running against `npm run chains` + `npm run armada-relayer` + the new app. Validates shield → unshield round-trips. |

## UI polish

_(no open items)_

---

## Recently closed

(none — when items close, just delete them. Commits are the history of record.)
