import { describe, expect, it } from 'vitest'
import { computeDisplayFees, maxInputAmount, relayerGasFeeForKind } from './displayFees'
import type { FeeSchedule } from '@/lib/relayer'

const quote: FeeSchedule = {
  cacheId: 'test',
  expiresAt: Date.now() + 60_000,
  chainId: 11155111,
  fees: {
    transfer: '100000',
    unshield: '200000',
    crossContract: '300000',
    crossChainShield: '400000',
    crossChainUnshield: '500000',
  },
}

describe('computeDisplayFees', () => {
  it('sums protocol CCTP and relayer gas for cross-chain shield', () => {
    const amount = 1_000_000_000n // 1000 USDC
    const fees = computeDisplayFees('shield-xchain', amount, quote)
    expect(fees.protocolFee).toBe(200_000n) // 2 bps
    expect(fees.gasFee).toBe(400_000n)
    expect(fees.totalFee).toBe(600_000n)
  })

  it('uses relayer gas only for same-chain shield', () => {
    const fees = computeDisplayFees('shield', 5_000_000n, quote)
    expect(fees.protocolFee).toBe(0n)
    expect(fees.gasFee).toBe(300_000n)
    expect(fees.totalFee).toBe(300_000n)
  })
})

describe('maxInputAmount', () => {
  it('subtracts total fee from balance', () => {
    expect(maxInputAmount(10_000_000n, 1_000_000n)).toBe(9_000_000n)
  })

  it('returns zero when fee exceeds balance', () => {
    expect(maxInputAmount(100n, 200n)).toBe(0n)
  })
})

describe('relayerGasFeeForKind', () => {
  it('returns 0 without a quote', () => {
    expect(relayerGasFeeForKind('transfer-shielded', null)).toBe(0n)
  })
})
