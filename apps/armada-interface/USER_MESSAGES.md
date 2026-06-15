# User-facing messages — armada-interface

Catalog of **error**, **warning**, and related **status** copy shown in the UI.

**Scope:** `apps/armada-interface` only.

**Last reviewed:** 2026-06-02

## Conventions

- **No i18n** — all strings are hardcoded English.
- **Toasts:** Sonner `Toaster` is mounted in `main.tsx`; no `toast()` calls exist in this app today.
- **Revert mapping:** `src/lib/revert.ts` (`mapRevertToMessage`) defines friendly wallet/revert strings but is **not imported by UI components**; raw `err.message` often appears via `ErrorStep` code `OTHER`.
- **Dynamic copy:** Pre-flight simulate reasons, viem/MetaMask messages, and handler throws may appear verbatim in ErrorStep body or Technical details.

When adding or changing user-facing copy, update this file in the same PR.

**Target copy:** `USER_MESSAGES_COPY.md` — approved rewrite to implement in components.

---

## 1. Onboarding & wallet setup

| Message | Primary source | Where it appears |
|--------|----------------|------------------|
| `Connect an EVM wallet before enrolling.` | `src/hooks/useShieldedWallet.ts` | Sign / enroll without EVM wallet |
| `Enrollment failed. Check the browser console for details.` | `src/lib/railgun/enrollmentErrors.ts` | Generic enrollment failure |
| `Deployment manifests are missing. From the armada-poc repo root run \`npm run setup\` (local Anvil) or set \`VITE_NETWORK=sepolia\` in apps/armada-interface/.env.development and restart the dev server.` | `enrollmentErrors.ts` | Missing manifests |
| `The privacy engine could not load its ZK circuit files. This site normally serves them from the app bundle; if that failed, the engine falls back to IPFS (often blocked by ad blockers or rate limits). Reload the page, click Retry engine setup, then Sign again. Try disabling ad blockers/VPN for this domain.` | `enrollmentErrors.ts` | ZK artifact / IPFS load failure |
| `The fee relayer is not reachable. Start it from armada-poc (\`npm run relayer\` or your team's relayer script) or set \`VITE_RELAYER_URL\` to a running instance.` | `enrollmentErrors.ts` | Relayer unreachable during enrollment |
| `{underlying msg} Start local chains with \`npm run chains\` from armada-poc, then \`npm run setup\`, or use Sepolia mode.` | `enrollmentErrors.ts` | Privacy pool / chain setup (appended) |
| `{DEPLOYMENT_SETUP_MSG} ({msg})` | `enrollmentErrors.ts` | Manifest-not-found with detail |
| *(Normalized `err.message`)* | `SignEnrollmentStep.tsx` | Inline `role="alert"` after Sign / Retry engine setup fails |
| `Passphrase must be at least {minLength} characters.` (default 8) | `BackupPassphraseStep.tsx` | Backup passphrase too short |
| `Passphrases don't match.` | `BackupPassphraseStep.tsx` | Confirm mismatch |
| `Backup creation failed.` | `BackupPassphraseStep.tsx` | Encrypt/download failure |
| `encryptBackup: passphrase must be at least 8 characters` | `src/lib/crypto/kdf.ts` | Backup encrypt (can surface in UI) |
| `Backup checksum ({checksum}) does not match your live wallet ({expectedChecksum}). Did you upload the right file?` | `ConfirmBackupStep.tsx` | Wrong backup file on verify |
| `Backup file is empty.` | `kdf.ts` | Empty backup upload |
| `Backup file is not valid JSON. The file may be corrupted, incomplete, or not an Armada export. Open it in a text editor — it should be one object with \`"format": "armada-backup-v2"\`. Export a fresh file from Settings → Export recovery secret while your wallet is unlocked.` | `kdf.ts` | Invalid backup JSON |
| `decryptBackup: authentication failed (wrong passphrase or corrupted backup)` | `kdf.ts` | Wrong passphrase on decrypt |
| `Unlock failed.` | `kdf.ts` (`normalizeBackupUnlockError`) | Non-Error unlock fallback |
| Various `parseBackupBlob: …` / `decryptBackup: …` | `kdf.ts` | Invalid backup structure |
| `Could not cancel setup.` | `CancelSetupConfirmDialog.tsx` | Cancel-setup action failure |

**Caution (dialog body, not an error):** `Your private account was already created when you signed. Canceling removes it from this device…` — `CancelSetupConfirmDialog.tsx`

---

## 2. Unlock (returning users)

| Message | Primary source | Where it appears |
|--------|----------------|------------------|
| `Recovery secret must be 64 hexadecimal characters (32 bytes).` | `useShieldedWallet.ts` | Paste-secret unlock |
| `Unlock failed.` | `UnlockFlow.tsx` | Paste/backup unlock fallback |
| Enrollment/backup errors from §1 | via `normalizeEnrollmentError` / `normalizeBackupUnlockError` | Backup tab unlock `role="alert"` |

**Warning (tooltip):** `Pasting the raw secret triggers a full chain rescan to recover your balances. This can take a few minutes on the first unlock. For faster restores in the future, use the encrypted Backup file instead — and re-export a fresh backup from Settings once this scan completes.` — `UnlockFlow.tsx`

**`window.confirm`:** `Start a new account? The wallet saved in this browser will no longer be used. Only continue if you have a backup or want to enroll again.` — `App.tsx`

---

## 3. Settings

| Message | Primary source | Where it appears |
|--------|----------------|------------------|
| `Reset failed.` | `ResetWalletDialog.tsx` | Reset wallet failure |
| `Export failed.` | `RecoverySecretExportDialog.tsx` | Backup export failure |
| `Could not reveal recovery secret.` | `RecoverySecretExportDialog.tsx` | Hex reveal failure |
| `keyManager: wallet is locked` | `src/lib/railgun/keyManager.ts` | Export/reveal when session locked |

**Caution (dialog body):**

- `This deletes your wallet and key material from this device. You'll need to re-sign with…` — `ResetWalletDialog.tsx`
- `The raw recovery secret is 64 hexadecimal characters. Anyone with this value can spend your private balance — never paste it into a website you don't fully trust.` — `RecoverySecretExportDialog.tsx` (hex mode)

---

## 4. Form validation — amounts & addresses

### USDC input (`usdcInputErrorMessage` in `src/lib/format.ts`)

| Message | Used in |
|--------|---------|
| `USDC has at most 6 decimal places.` | Shield, Send, Unshield, Earn; `AmountInput` |
| `Amount cannot be negative.` | Same |
| `Enter a valid number.` | Same |

### Flow-specific balance / recipient

| Message | Flow | Source |
|--------|------|--------|
| `Amount exceeds your available balance.` | Shield (deposit) | `ShieldInputStep.tsx` |
| `Amount exceeds your private balance after fees.` | Send, Unshield, Earn (deposit) | `SendInputStep.tsx`, `UnshieldInputStep.tsx`, `EarnInputStep.tsx` |
| `Amount exceeds your earning balance after fees.` | Earn (withdraw tab) | `EarnInputStep.tsx` |
| `Enter a valid shielded address (0zk…).` | Send (private) | `SendInputStep.tsx` |
| `Enter a valid EVM address (0x… 42 chars).` | Send (external) | `SendInputStep.tsx` |
| `This destination chain has no deployment manifest. Pick another chain.` | Send (external) | `SendModal.tsx` |

### Passphrase (onboarding backup)

| Message | Source |
|--------|--------|
| `Passphrase must be at least ${minLength} characters.` | `BackupPassphraseStep.tsx` |
| `Passphrases don't match.` | `BackupPassphraseStep.tsx` |

### Helper (informational, not an error)

| Message | Source |
|--------|--------|
| `USDC has up to 6 decimal places` | `AmountInput.tsx` (display variant) |

`DepositAmountCard` renders any `error` string passed by the parent (no own validation messages).

---

## 5. Gas warning

| Message | Source | Where |
|--------|--------|-------|
| `Not enough {nativeSymbol} in your wallet to pay network gas.{balanceHint} Add funds on this chain, then try again.` | `GasBalanceNotice.tsx` | Shield / Send / Unshield / Earn input when `useGasBalanceWarning` fires |

---

## 6. Shielded balance sync

| Message | Source | Where |
|--------|--------|-------|
| `Sync interrupted. Reload the page to retry.` | `SyncBanner.tsx` | App header (sync failed) |
| `Loading your private balance — {pct}%. Subsequent visits will be much faster.` | `SyncBanner.tsx` | App header (syncing) |
| `Shielded-balance sync was interrupted. Reload the page to retry before submitting.` | `useSpendableSyncGate.ts` | Send / Unshield / Earn review — blocks Confirm |
| `Loading your private balance — please wait for the initial sync to finish.` | `useSpendableSyncGate.ts` | Same — first sync |
| `Syncing private balance…` | `BalanceHero.tsx` | Dashboard hero while balance unknown |

---

## 7. Transaction error step (`ErrorStep`)

**Source:** `src/components/flow/ErrorStep/ErrorStep.tsx` (`COPY_BY_CODE`)

| Code | Title | Body (when fixed) |
|------|-------|-------------------|
| `TX_REVERTED` | Transaction failed on chain | The network mined your transaction but the contract reverted. No funds were moved. |
| `PRE_FLIGHT_REVERT` | Pre-flight check failed — nothing was sent | *(dynamic `error.message`, e.g. simulate revert reason)* |
| `POLL_TIMEOUT` | Lost track of your transaction | We stopped watching after the time budget elapsed. The transaction may still complete — check the explorer to confirm. |
| `RPC_ERROR` | Network error | We hit an error talking to the chain. Try again — your transaction may not have been submitted yet. |
| `USER_REJECTED` | Action declined | You declined the prompt in your wallet. Nothing was submitted. |
| `CANCELLED` | Cancelled | No transaction was sent. |
| `DISMISSED` | Stopped tracking | You asked us to stop watching this transaction. It may still complete on chain — check the explorer. |
| `OTHER` | Something went wrong | *(dynamic `error.message` or modal `message` prop)* |

**CTAs:** `Try again`, `View details` (when handlers provided)

**Used in:** `ShieldModal`, `UnshieldModal`, `SendModal`, `EarnModal` when `step === 'error'`.

**Submit-time fallback (before tx record):** `Submit failed.` — all four modals.

---

## 8. Handler & tx layer messages

Often shown in ErrorStep body (`OTHER`) or Technical details (`TxLifecycleStepper`).

### Handler fallbacks (`classifyHandlerError` in `src/lib/tx/errors.ts`)

| Fallback |
|----------|
| `Private send failed.` |
| `Shield failed.` |
| `Cross-chain deposit failed.` |
| `Unshield failed.` |
| `Cross-chain withdraw failed.` |
| `Vault deposit failed.` |
| `Vault withdrawal failed.` |
| `You declined the action in your wallet.` |

### Common thrown errors

| Message | Source area |
|--------|-------------|
| `{Kind} requires an unlocked shielded wallet.` | shield, unshield, transfer-shielded, shield-xchain, unshield-xchain, yield-deposit, yield-withdraw handlers |
| `Shield requires a connected EVM wallet; none captured at submit time.` | `shield/handler.ts`, `shield-xchain/handler.ts` |
| `Yield deployment manifest not found — run \`npm run setup\`…` | `yield-deposit/handler.ts`, `yield-withdraw/handler.ts` |
| `Withdraw shares is zero — the vault rate may not have synced yet. Try again in a moment.` | `yield-withdraw/handler.ts` |
| `Cancelled while waiting for receipt.` | `lib/tx/receipt.ts` |
| `Receipt not found within {N}s. The transaction may still complete on chain.` | `receipt.ts` |
| `The transaction was mined but reverted on chain.` | `receipt.ts` |
| `RPC error waiting for receipt` *(or dynamic)* | `receipt.ts` |
| `Cancelled before submission.` | `lib/tx/reducer.ts` (`markCancelled`) |
| `Stopped tracking — the transaction may still complete on chain.` | `reducer.ts` (`markDismissed`) |

### Network switch (`src/lib/network-switch.ts`)

| Message |
|--------|
| `No wallet connected — connect a wallet before submitting a transaction.` |
| `Could not switch to {chainName}: connector did not expose an EIP-1193 provider.` |
| `Network switch declined. Approve the switch to {chainName} in your wallet and try again.` |
| `{chainName} isn't configured in your wallet. Add the network and try again.` |
| `Could not switch to {chainName}: {msg}` |

---

## 9. Progress & status labels

### `TxStatusChip` (`src/components/tx/TxStatusChip.tsx`)

| Label | Variant |
|-------|---------|
| `Failed` | error |
| `Pending` | warning |
| `Retrying` | warning |
| `Stopped tracking` | error (dismissed, still on-chain) |
| `Expired` / `Cancelled` | neutral |

### `ProgressStep` (`src/components/flow/ProgressStep/ProgressStep.tsx`)

| Copy |
|------|
| `Preparing transaction` |
| `Hang on a moment…` |
| `Waiting for wallet confirmation` |
| `You can close this window while we finish` (default dismiss hint) |

### Stage copy (`src/components/tx/stageCopy.ts`)

Examples (full table in source file):

| Stage / kind | Copy |
|--------------|------|
| `build-proof` | `Preparing transaction` |
| `submit-relayer` (shield, waiting) | `Confirm in your wallet` |
| `submit-relayer` (shield, active) | `Submitting transaction` |
| `iris-attestation-pending` | `Waiting for cross-chain confirmation` |
| `iris-attestation-ready` | `Cross-chain confirmation ready` |
| `hub-confirmed` | `Deposited` / `Withdrawn` / `Sent` / `Earning` / etc. by kind |

### Confirm before stop tracking

`Your transaction is already on chain and will continue. We will stop watching it — you can find it on the block explorer using the link in the error view.` — `TxActions.tsx` (`window.confirm`)

### Technical details

`{error.code} {error.message}` — `TxLifecycleStepper.tsx`

---

## 10. Informational warnings (not blocking errors)

| Message | Source | Where |
|--------|--------|-------|
| `Cross-chain payment takes a few minutes for the CCTP confirmation.` | `SendInputStep.tsx` | External send |
| `Cross-chain withdrawal takes a few minutes for the CCTP confirmation.` | `UnshieldInputStep.tsx` | Cross-chain withdraw |
| `The vault rate moves with each new block. Your final USDC may differ slightly from this quote.` | `EarnReviewStep.tsx` | Vault slippage notice |
| `syncing…` | `EarnInputStep.tsx`, `EarnReviewStep.tsx` | APY loading |
| `unavailable — pool currently pays no yield` | `EarnInputStep.tsx` | Zero APY pool |

---

## 11. Relayer

| Message | Source |
|--------|--------|
| `Relayer request failed ({status})` (+ optional server `body.error`) | `src/lib/relayer.ts` |
| `fetchFees called without a configured relayer URL` | `relayer.ts` |
| `Armada relayer URL is not configured. Set VITE_RELAYER_URL for hosted Sepolia builds.` | `src/config/relayer.ts` |

**Server error codes** (if returned in JSON): `FEE_TOO_LOW`, `FEE_EXPIRED`, `INVALID_TARGET`, `INVALID_CHAIN`, `INVALID_DATA`, `DUPLICATE_TX`, `GAS_ESTIMATION_FAILED`, `SUBMISSION_FAILED`, `RELAYER_BUSY`, `UNKNOWN_ERROR` — `config/relayer.ts`

---

## 12. Revert mapping (not wired to UI)

**File:** `src/lib/revert.ts` — `mapRevertToMessage` — **no component imports today.**

| Pattern → friendly message |
|---------------------------|
| user rejected / user denied → `Transaction rejected by user` |
| insufficient funds → `Insufficient funds for gas` |
| insufficient balance → `Your balance is insufficient.` |
| insufficient allowance → `Token allowance is insufficient — approve first.` |
| transfer amount exceeds balance → `Transfer amount exceeds balance.` |
| fee_too_low → `Quoted fee is too low — re-fetch and retry.` |
| fee_expired → `Quoted fee expired — re-fetch and retry.` |

---

## 13. Dev-only (`Debug` page)

| Message | Source |
|--------|--------|
| `Connect your wallet first.` | `src/pages/Debug.tsx` |
| `Drip failed.` | `Debug.tsx` |
| Dynamic from `/api/fund-gas` (e.g. `fund-gas failed`) | `vite.config.ts` → `Debug.tsx` |

---

## 14. Activity empty states (neutral)

| Message | Source |
|--------|--------|
| `No matching activity` | `History.tsx` |
| `Your transactions will appear here as they happen.` | `History.tsx` (filter: all) |
| `Try a different filter to see other transactions.` | `History.tsx` (other filters) |
| `Failed` | `History.tsx` (filter tab label only) |
| `No activity yet` | `RecentActivityCard.tsx` |
| `All quiet` | `InProgressCard.tsx` |
| `In-flight transactions will appear here.` | `InProgressCard.tsx` |

---

## Maintenance checklist

When shipping UI copy changes:

1. Update the string in code.
2. Add or edit the row in the relevant section above.
3. If the message is a new category (e.g. new flow), add a section or sub-table.
4. Note whether the message is **error** (`role="alert"`), **warning** (`role="status"` / caution dialog), or **status label**.
