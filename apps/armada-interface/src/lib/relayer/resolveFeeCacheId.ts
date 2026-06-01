// ABOUTME: Resolves feeCacheId for modal submit — uses cached quote, refreshes with timeout, offline fallback when relayer is optional.
// ABOUTME: Hub shield/unshield handlers submit via the user's wallet today; feeCacheId is plumbed for a future relayer path only.

import { getNetworkConfig, isLocalMode, isRelayerConfigured } from '@/config/network'
import type { FeeSchedule } from '@/lib/relayer'

/** Placeholder cache id when no relayer HTTP quote is available (wallet-submit flows only). */
export const OFFLINE_FEE_CACHE_ID = 'offline-fees'

/** @deprecated Use OFFLINE_FEE_CACHE_ID */
export const LOCAL_DEV_FEE_CACHE_ID = OFFLINE_FEE_CACHE_ID

/** Synthetic schedule when the relayer HTTP API is not used (local without relayer, or hosted Sepolia without VITE_RELAYER_URL). */
export function offlineFeeSchedule(): FeeSchedule {
  return {
    cacheId: OFFLINE_FEE_CACHE_ID,
    expiresAt: Date.now() + 5 * 60_000,
    chainId: getNetworkConfig().hub.chainId,
    fees: {
      transfer: '0',
      unshield: '0',
      crossContract: '0',
      crossChainShield: '0',
      crossChainUnshield: '0',
    },
  }
}

/** @deprecated Use offlineFeeSchedule */
export const localDevFeeSchedule = offlineFeeSchedule

export interface ResolveFeeCacheIdOptions {
  quote: FeeSchedule | null
  isStale: boolean
  refresh: () => Promise<FeeSchedule | null>
  /** Max wait for a relayer refresh before falling back / failing. */
  timeoutMs?: number
}

function canUseOfflineFeeCache(): boolean {
  return !isRelayerConfigured() || isLocalMode()
}

/**
 * Pick a feeCacheId for modal submit. Never blocks indefinitely on a dead relayer.
 */
export async function resolveFeeCacheId(opts: ResolveFeeCacheIdOptions): Promise<string> {
  if (opts.quote && !opts.isStale) return opts.quote.cacheId

  if (!isRelayerConfigured()) return OFFLINE_FEE_CACHE_ID

  const timeoutMs = opts.timeoutMs ?? 8_000
  const fresh = await Promise.race([
    opts.refresh(),
    new Promise<null>(resolve => {
      window.setTimeout(() => resolve(null), timeoutMs)
    }),
  ])
  if (fresh) return fresh.cacheId

  if (canUseOfflineFeeCache()) return OFFLINE_FEE_CACHE_ID

  throw new Error(
    'Could not fetch a fee quote from the relayer. Start it with `npm run armada-relayer` locally, or set VITE_RELAYER_URL to a running instance.',
  )
}
