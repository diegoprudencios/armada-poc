# `relayer/state/` — per-chain scan cursors

This directory holds the relayer's persistent state for the CCTP scan loop. The directory itself
is committed (so a fresh clone has the README) but the cursor files inside are gitignored.

## Cursor files

One JSON file per chain: `cursor-<chain-name>.json`. Created automatically by the relayer on
its first successful scan tick. Atomic writes via tmpfile + rename — a `kill -9` mid-write
leaves either the old cursor intact or the new one fully present, never a torn file.

Shape (schema version 1):

```json
{
  "lastProcessedBlock": 12345678,
  "updatedAt": 1716220800000,
  "version": 1
}
```

- **`lastProcessedBlock`** — highest block FULLY scanned + ingested into `pendingMessages`
  (inclusive). Next poll tick starts at `lastProcessedBlock + 1`.
- **`updatedAt`** — Unix ms of the last write. Future health endpoint surfaces this as
  "scanner staleness."
- **`version`** — schema version stamp. Bump and add a migration in `lib/cursor-store.ts` when
  the shape changes; loading an unsupported version throws loudly rather than misinterpreting.

## When to delete a cursor file

- **Suspected corruption.** Deleting the file is operator-actionable recovery: the relayer
  bootstraps from `currentBlock - bootLookbackBlocks` on next start.
- **Manually re-scanning a window.** Edit `lastProcessedBlock` to the floor of the window you
  want re-scanned. The cursor's `version` field must stay 1.
- **Switching deployments.** The cursor is chain-scoped (file per chain name). A redeploy that
  changes the chain name will start fresh; a redeploy that keeps the name will resume from the
  old cursor — usually fine, but if contract addresses changed, deleting the file forces a
  clean bootstrap.

## When NOT to delete a cursor file

Never delete during steady-state operation. The cursor's job is to ensure the relayer resumes
where it left off after a restart; deleting it forces a re-scan of the full lookback window,
which the contract's "already processed" check absorbs but wastes RPC quota and gas.

## Behaviour on cold start

1. If no cursor file exists → bootstrap from `currentBlock - bootLookbackBlocks`. Recovers any
   `MessageSent` events from the last ~30 min (default) so the relayer doesn't drop in-flight
   messages on first deploy.
2. If a cursor exists AND the gap to chain head is reasonable → resume exactly from cursor.
3. If a cursor exists BUT the gap exceeds `maxBootLookbackBlocks` → cap at the lookback floor
   and emit a loud warning. The operator is alerted that historical messages between the
   cursor and the lookback floor were skipped (Iris would have expired their attestations
   anyway; manual recovery via `relayWithHook` if needed).
