# Armada Interface — New Copy

Target user-facing strings. Implement in code per section; see `USER_MESSAGES.md` for the current inventory and source map.

**Last updated:** 2026-06-02

---

## 1. Onboarding & wallet setup

```
Connect your EVM wallet first.
Setup didn't complete. Try again or reload the page.
Something's missing on our end. Reload the page and try again.
We couldn't load a required file. Try reloading the page. If it keeps failing, disable any ad blocker or VPN for this site and try again.
We can't reach the network right now. Try again in a moment.
We couldn't create your backup. Try again.
This backup doesn't match your wallet. Make sure you uploaded the right file.
That file is empty. Try a different one.
We couldn't read that file — it may be corrupted or not an Armada backup. Go to Settings and export a fresh backup, then try again.
Wrong passphrase, or the backup file is damaged.
Something went wrong. Try again.
Couldn't cancel. Try again.
```

Passphrase validation → see **§4 Passphrase**.

**Sign step — engine retry button:**
```
Retry engine setup
Retrying engine setup…
```

**Caution dialog — cancel setup:**
```
Your private account was already created. Canceling will remove it from this device — make sure you have your backup before continuing.
```

---

## 2. Unlock

```
That doesn't look right. Your recovery secret should be 64 hexadecimal characters (0–9, a–f).
Couldn't unlock. Check your passphrase or recovery secret and try again.
```

**Tooltip — paste secret:**
```
Restoring with your recovery secret takes a few minutes on the first unlock. For faster access next time, use your encrypted backup file instead.
```

**Confirm dialog — start new account:**
```
This will replace the wallet saved in this browser. Only continue if you have a backup or want to start over.
```

---

## 3. Settings

```
Reset didn't work. Try again.
Export didn't work. Try again.
Couldn't show your recovery secret. Try again.
Your wallet is locked. Unlock it first.
```

**Caution dialog — reset wallet:**
```
This will delete your wallet and keys from this device. You'll need to reconnect your wallet and sign in again. Make sure you have your backup before continuing.
```

**Caution dialog — export recovery secret:**
```
Anyone with this secret can access your private balance. Never share it or paste it into a site you don't fully trust.
```

---

## 4. Form validation

### Amount input
```
USDC supports up to 6 decimal places.
Enter a positive amount.
Enter a valid amount.
```

### Flow-specific
```
Not enough balance.
Not enough balance to cover this amount and fees.
Not enough balance to withdraw this amount after fees.
Enter a valid private address — it starts with 0zk.
Enter a valid wallet address — it starts with 0x and is 42 characters long.
This chain isn't supported yet. Choose a different one.
```

### Passphrase
```
Use at least {minLength} characters.
Those don't match. Try again.
```

### Helper
```
Up to 6 decimal places
```

---

## 5. Gas warning

```
You don't have enough {nativeSymbol} to cover the network fee. Add some to your wallet and try again.
```

---

## 6. Balance sync

```
Sync stopped. Reload to try again.
Loading your balance — {pct}%. This only takes this long the first time.
Your balance didn't finish loading. Reload the page before trying again.
Loading your balance — hang tight.
Loading balance…
```

---

## 7. Transaction error step

| Code | Title | Body |
|------|-------|------|
| `TX_REVERTED` | Transaction failed | The transaction went through but something went wrong on chain. No funds were moved. |
| `PRE_FLIGHT_REVERT` | Couldn't submit | Prefix simulate reason with `Couldn't send: ` + dynamic revert message |
| `POLL_TIMEOUT` | We lost track of this one | We stopped monitoring the transaction. It may still go through — check the explorer to be sure. |
| `RPC_ERROR` | Network error | Couldn't connect to the network. Your transaction may not have been sent — try again. |
| `USER_REJECTED` | Cancelled | You declined the request in your wallet. Nothing was sent. |
| `CANCELLED` | Cancelled | Nothing was sent. |
| `DISMISSED` | Stopped watching | You stopped tracking this transaction. It may still complete — check the explorer. |
| `OTHER` | Something went wrong | *(dynamic)* |

**Submit-time fallback:**
```
Couldn't submit. Try again.
```

**Footer CTA (button):**
```
Try again
View details
```

**Explorer link (inline, when `explorerUrl` is set — not a footer button):**
```
View on block explorer
```

---

## 8. Handler & transaction layer

### Handler fallbacks
```
Send didn't go through. Try again.
Deposit didn't go through. Try again.
Cross-chain deposit didn't go through. Try again.
Withdrawal didn't go through. Try again.
Cross-chain withdrawal didn't go through. Try again.
Vault deposit didn't go through. Try again.
Vault withdrawal didn't go through. Try again.
You declined the request in your wallet.
```

### Thrown errors
```
Unlock your wallet first.
Connect your wallet before depositing.
Something's not set up correctly on our end. Try reloading.
The vault hasn't synced yet. Wait a moment and try again.
Cancelled while waiting for confirmation.
We couldn't confirm this in time. It may still go through — check the explorer.
The transaction failed on chain. No funds were moved.
Cancelled before anything was sent.
Stopped watching. The transaction may still complete — check the explorer.
```

### Network switch
```
Connect your wallet first.
Couldn't switch to {chainName}. Try switching manually in your wallet.
You declined the network switch. Approve it in your wallet and try again.
{chainName} isn't in your wallet yet. Add it and try again.
Couldn't switch to {chainName}. Try again or switch manually.
```

---

## 9. Progress & status labels

### TxStatusChip
```
Failed
Pending
Retrying
Stopped tracking
Expired
Cancelled
```

`Stopped tracking` — `cancelled` records with `error.code === DISMISSED` (on-chain tx may still complete). Plain `Cancelled` — user cancelled before broadcast.

### ProgressStep
```
Preparing…
Hang on…
Waiting for wallet confirmation
You can close this — we'll finish in the background.
```

### Stage copy
```
Preparing…
Confirm in your wallet
Submitting…
Waiting for cross-chain confirmation
Ready to continue
Deposited / Withdrawn / Sent / Earning
```

**Confirm before stop tracking:**
```
This transaction is already on chain and will keep going. You'll stop seeing updates here, but you can still find it on the explorer.
```

---

## 10. Informational warnings

```
Cross-chain payments take a few minutes to confirm.
Cross-chain withdrawals take a few minutes to confirm.
The rate updates constantly. Your final amount may be slightly different.
Loading…
No yield available right now
```

---

## 11. Relayer

```
Something went wrong. Try again.
Couldn't load fees. Try reloading.
Network not configured. Try again later.
```

---

## 12. Activity — empty states & filters

**Empty states:**
```
Nothing matches this filter.
Your transactions will show up here.
Try a different filter.
No activity yet
All quiet
Active transactions will show up here.
```

**History filter tab:**
```
Failed
```
