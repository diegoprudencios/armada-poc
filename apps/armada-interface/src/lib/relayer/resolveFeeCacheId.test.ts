import { describe, expect, it, vi } from 'vitest'
import { OFFLINE_FEE_CACHE_ID, resolveFeeCacheId } from './resolveFeeCacheId'

vi.mock('@/config/network', () => ({
  isLocalMode: vi.fn(() => true),
  isRelayerConfigured: vi.fn(() => true),
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

  it('falls back to offline cache when refresh fails in local mode', async () => {
    const id = await resolveFeeCacheId({
      quote: null,
      isStale: false,
      refresh: async () => null,
      timeoutMs: 10,
    })
    expect(id).toBe(OFFLINE_FEE_CACHE_ID)
  })
})

describe('resolveFeeCacheId (hosted Sepolia, no relayer)', () => {
  it('uses offline cache without calling refresh', async () => {
    vi.resetModules()
    vi.doMock('@/config/network', () => ({
      isLocalMode: vi.fn(() => false),
      isRelayerConfigured: vi.fn(() => false),
      getNetworkConfig: vi.fn(() => ({
        hub: { chainId: 11155111 },
      })),
    }))
    const { resolveFeeCacheId: resolve } = await import('./resolveFeeCacheId')
    const refresh = vi.fn(async () => null)
    const id = await resolve({
      quote: null,
      isStale: false,
      refresh,
    })
    expect(id).toBe(OFFLINE_FEE_CACHE_ID)
    expect(refresh).not.toHaveBeenCalled()
  })
})
