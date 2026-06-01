// ABOUTME: Relayer URL resolution — local defaults to localhost; Sepolia deploy does not.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('relayer URL resolution', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults Sepolia builds to no relayer URL when VITE_RELAYER_URL is unset', async () => {
    vi.stubEnv('VITE_NETWORK', 'sepolia')
    vi.stubEnv('VITE_RELAYER_URL', '')
    const { getNetworkConfig, isRelayerConfigured } = await import('./network')
    expect(getNetworkConfig().relayerUrl).toBe('')
    expect(isRelayerConfigured()).toBe(false)
  })

  it('uses VITE_RELAYER_URL on Sepolia when set', async () => {
    vi.stubEnv('VITE_NETWORK', 'sepolia')
    vi.stubEnv('VITE_RELAYER_URL', 'https://relayer.example.com/')
    const { getNetworkConfig, isRelayerConfigured } = await import('./network')
    expect(getNetworkConfig().relayerUrl).toBe('https://relayer.example.com')
    expect(isRelayerConfigured()).toBe(true)
  })

  it('defaults local mode to localhost:3001', async () => {
    vi.stubEnv('VITE_NETWORK', 'local')
    vi.stubEnv('VITE_RELAYER_URL', '')
    const { getNetworkConfig, isRelayerConfigured } = await import('./network')
    expect(getNetworkConfig().relayerUrl).toBe('http://localhost:3001')
    expect(isRelayerConfigured()).toBe(true)
  })
})
