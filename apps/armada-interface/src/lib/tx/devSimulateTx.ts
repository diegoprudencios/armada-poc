// ABOUTME: Local-mode tx executor path — walks each lifecycle stage with short delays and marks completed (no wallet/Railgun).
// ABOUTME: Always active when VITE_NETWORK=local; executeTx uses this instead of real stage handlers.

import { getDefaultStore } from 'jotai'
import { isLocalMode } from '@/config/network'
import { advance } from '@/lib/tx/reducer'
import { lifecycleFor } from '@/lib/tx/lifecycles'
import { putTxIfFresh } from '@/lib/tx/storage'
import type { TxKind, TxRecord } from '@/lib/tx/types'
import { upsertTxAtom } from '@/state/tx'

/** Placeholder tx hash for simulated submits (valid 32-byte hex). */
export const DEV_SIMULATED_TX_HASH =
  '0xdev0000000000000000000000000000000000000000000000000000000000001' as const

/** Per-stage pause so the Pending stepper visibly advances (~10s per status in local dev). */
export const DEV_SIM_STEP_DELAY_MS = 10_000

/** Local dev always simulates tx progress (no Railgun proofs or on-chain submits). */
export function isDevSimulateTxEnabled(): boolean {
  return isLocalMode()
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer)
      resolve()
    }, { once: true })
  })
}

function artifactPatchForStage(kind: TxKind, stage: string): Record<string, unknown> {
  if (stage === 'submit-relayer' || stage === 'hub-confirmed' || stage === 'hub-burn-confirmed') {
    return { sourceTxHash: DEV_SIMULATED_TX_HASH }
  }
  if (stage === 'client-burn-confirmed' || stage === 'client-mint-confirmed' || stage === 'hub-mint-confirmed') {
    return { sourceTxHash: DEV_SIMULATED_TX_HASH, destTxHash: DEV_SIMULATED_TX_HASH }
  }
  if (stage.includes('iris')) {
    return {
      messageHash: '0xdev0000000000000000000000000000000000000000000000000000000000002',
      attestation: '0xdev',
    }
  }
  if (kind === 'shield' && stage === 'build-proof') {
    return {
      privacyPoolAddress: '0xdev0000000000000000000000000000000000000001',
      usdcAddress: '0xdev0000000000000000000000000000000000000002',
      shieldRequest: {
        npk: '0xdev0000000000000000000000000000000000000000000000000000000000003',
        value: '0',
        encryptedBundle: [
          '0xdev0000000000000000000000000000000000000000000000000000000000004',
          '0xdev0000000000000000000000000000000000000000000000000000000000005',
          '0xdev0000000000000000000000000000000000000000000000000000000000006',
        ],
        shieldKey: '0xdev0000000000000000000000000000000000000000000000000000000000007',
      },
    }
  }
  return {}
}

/**
 * Fast-forward `record` through remaining lifecycle stages. Non-blocking; caller owns `running` cleanup.
 */
export async function runDevSimulatedTxChain(
  initial: TxRecord,
  signal: AbortSignal,
): Promise<void> {
  const store = getDefaultStore()
  const lifecycle = lifecycleFor(initial.kind)
  const stages = lifecycle.stages
  let current = initial

  try {
    const startIdx = Math.max(0, stages.indexOf(current.stage))

    // Mark the current stage as in-flight so the stepper shows a spinner (not stuck "Pending").
    if (current.executionState === 'pending') {
      current = {
        ...current,
        executionState: 'active',
        updatedSeq: current.updatedSeq + 1,
        updatedAt: Date.now(),
      }
      store.set(upsertTxAtom, current)
      await putTxIfFresh(current)
      await sleep(DEV_SIM_STEP_DELAY_MS, signal)
    }

    for (let i = startIdx + 1; i < stages.length; i++) {
      if (signal.aborted) return
      const stage = stages[i]!
      await sleep(DEV_SIM_STEP_DELAY_MS, signal)
      if (signal.aborted) return

      current = advance(current, stage as (typeof current)['stage'], artifactPatchForStage(
        current.kind,
        stage,
      ) as Partial<(typeof current)['artifacts']>)
      store.set(upsertTxAtom, current)
      await putTxIfFresh(current)
    }

  } catch {
    // Simulation is best-effort in local dev; failures are visible via the stepper state.
  }
}
