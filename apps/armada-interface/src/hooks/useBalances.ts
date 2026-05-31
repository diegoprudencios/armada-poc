// ABOUTME: Aggregated balance view — unshielded USDC per chain, shielded USDC, shielded yield shares.
// ABOUTME: In local mode, optional dev mock balance (Debug toggle) overrides unshielded per-chain amounts for UI validation only.

import { useMemo } from 'react'
import { useAtomValue } from 'jotai'
import { getAllChainIdentities, isLocalMode } from '@/config/network'
import { devMockBalanceAtom, getDevMockBalanceRaw } from '@/state/devMockBalance'
import { shieldedUsdcAtom, usdcBalancesAtom, yieldSharesAtom } from '@/state/wallet'

export interface UseBalancesResult {
  /** Unshielded USDC per chain id (raw 6-decimal). May include dev mock override in local mode. */
  unshielded: Record<number, bigint>
  /** Shielded USDC (raw 6-decimal). null = not synced yet. */
  shielded: bigint | null
  /** Yield shares (raw 18-decimal). null = not synced yet. */
  yieldShares: bigint | null
  /** True when local dev mock balance is overriding unshielded amounts. */
  isMockUnshielded: boolean
}

export function useBalances(): UseBalancesResult {
  const unshielded = useAtomValue(usdcBalancesAtom)
  const mockConfig = useAtomValue(devMockBalanceAtom)
  const shielded = useAtomValue(shieldedUsdcAtom)
  const yieldShares = useAtomValue(yieldSharesAtom)

  const isMockUnshielded = isLocalMode() && mockConfig.enabled

  const effectiveUnshielded = useMemo(() => {
    if (!isMockUnshielded) return unshielded
    const amount = getDevMockBalanceRaw(mockConfig)
    const out = { ...unshielded }
    for (const chain of getAllChainIdentities()) {
      out[chain.chainId] = amount
    }
    return out
  }, [unshielded, isMockUnshielded, mockConfig.amountUsdc])

  return {
    unshielded: effectiveUnshielded,
    shielded,
    yieldShares,
    isMockUnshielded,
  }
}
