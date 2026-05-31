import { describe, expect, it, vi } from 'vitest'
import { LOCAL_DEV_FEE_CACHE_ID, resolveFeeCacheId } from './resolveFeeCacheId'

vi.mock('@/config/network', () => ({
  isLocalMode: vi.fn(() => true),
  getNetworkConfig: vi.fn(() => ({
    hub: { chainId: 31337 },
  })),
}))

describe('resolveFeeCacheId', () => {
  it('returns cached quote when fresh', async () => {
    const id = await resolveFeeCacheId({
      quote: { cacheId: 'cached', expiresAt: Date.now() + 60_000, chainId: 31337, fees: {} as never },
      isStale: false,
      refresh: async () => null,
    })
    expect(id).toBe('cached')
  })

  it('falls back to local-dev when refresh fails in local mode', async () => {
    const id = await resolveFeeCacheId({
      quote: null,
      isStale: false,
      refresh: async () => null,
      timeoutMs: 10,
    })
    expect(id).toBe(LOCAL_DEV_FEE_CACHE_ID)
  })
})
