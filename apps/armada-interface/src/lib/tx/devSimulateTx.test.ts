import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { getDefaultStore } from 'jotai'
import { DEV_SIMULATED_TX_HASH, DEV_SIM_STEP_DELAY_MS, runDevSimulatedTxChain } from './devSimulateTx'
import { txListAtom, upsertTxAtom } from '@/state/tx'
import type { TxRecord } from './types'

vi.mock('@/config/network', () => ({
  isLocalMode: vi.fn(() => true),
}))

function shieldRecord(): TxRecord<'shield'> {
  return {
    id: '01TEST',
    kind: 'shield',
    executionState: 'pending',
    stage: 'build-proof',
    stagesCompleted: [],
    updatedSeq: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    meta: { amount: 1_000_000n, feeCacheId: 'local-dev', fromChainId: 31337 },
    artifacts: {},
    walletContext: { sourceChainId: 31337 },
  }
}

describe('runDevSimulatedTxChain', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('advances shield to completed', async () => {
    const store = getDefaultStore()
    const initial = shieldRecord()
    store.set(upsertTxAtom, initial)

    const controller = new AbortController()
    const chain = runDevSimulatedTxChain(initial, controller.signal)
    await vi.runAllTimersAsync()
    await chain

    const final = store.get(txListAtom).find(t => t.id === initial.id) as TxRecord<'shield'>
    expect(final.stage).toBe('hub-confirmed')
    expect(final.executionState).toBe('completed')
    expect(final.artifacts.sourceTxHash).toBe(DEV_SIMULATED_TX_HASH)
    expect(final.stagesCompleted).toContain('build-proof')
    expect(final.stagesCompleted).toContain('submit-relayer')
  })
})
