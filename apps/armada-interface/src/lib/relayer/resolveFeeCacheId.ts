// ABOUTME: Resolves feeCacheId for modal submit — uses cached quote, refreshes with timeout, local-dev fallback when relayer is down.
// ABOUTME: Hub shield/unshield handlers submit via the user's wallet today; feeCacheId is plumbed for a future relayer path only.

import { getNetworkConfig, isLocalMode } from '@/config/network'
import type { FeeSchedule } from '@/lib/relayer'

export const LOCAL_DEV_FEE_CACHE_ID = 'local-dev'

/** Synthetic schedule when the relayer is unreachable in local mode (feeCacheId unused by wallet-submit handlers). */
export function localDevFeeSchedule(): FeeSchedule {
  return {
    cacheId: LOCAL_DEV_FEE_CACHE_ID,
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

export interface ResolveFeeCacheIdOptions {
  quote: FeeSchedule | null
  isStale: boolean
  refresh: () => Promise<FeeSchedule | null>
  /** Max wait for a relayer refresh before falling back / failing. */
  timeoutMs?: number
}

/**
 * Pick a feeCacheId for modal submit. Never blocks indefinitely on a dead relayer.
 */
export async function resolveFeeCacheId(opts: ResolveFeeCacheIdOptions): Promise<string> {
  if (opts.quote && !opts.isStale) return opts.quote.cacheId

  const timeoutMs = opts.timeoutMs ?? 8_000
  const fresh = await Promise.race([
    opts.refresh(),
    new Promise<null>(resolve => {
      window.setTimeout(() => resolve(null), timeoutMs)
    }),
  ])
  if (fresh) return fresh.cacheId

  if (isLocalMode()) return LOCAL_DEV_FEE_CACHE_ID

  throw new Error(
    'Could not fetch a fee quote from the relayer. Start it with `npm run relayer` (or check VITE_RELAYER_URL).',
  )
}
