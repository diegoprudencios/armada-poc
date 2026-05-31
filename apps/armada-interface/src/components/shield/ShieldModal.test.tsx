// ABOUTME: Tests for ShieldModal orchestrator — open/closed gating, step advancement (input → review → progress), close resets state.
// ABOUTME: Seeds openModalAtom + usdcBalancesAtom so the user can enter an amount and proceed.

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { ShieldModal } from './ShieldModal'
import { openModalAtom } from '@/state/ui'
import { usdcBalancesAtom } from '@/state/wallet'
import { feeQuoteAtom } from '@/state/fees'
import { withTestQueryClient } from '@/test-utils/queryClient'

const FAKE_QUOTE = {
  cacheId: 'test-cache',
  expiresAt: Date.now() + 5 * 60_000,
  chainId: 31337,
  fees: { transfer: '0', unshield: '0', crossContract: '0', crossChainShield: '0', crossChainUnshield: '0' },
}

function renderModal(opts?: { open?: boolean; max?: bigint }) {
  const store = createStore()
  if (opts?.open) store.set(openModalAtom, 'shield')
  if (opts?.max !== undefined) {
    store.set(usdcBalancesAtom, { 31337: opts.max })
  }
  store.set(feeQuoteAtom, FAKE_QUOTE)
  render(withTestQueryClient(
    <Provider store={store}>
      <ShieldModal />
    </Provider>,
  ))
  return store
}

describe('<ShieldModal>', () => {
  it('renders nothing when openModal !== shield', () => {
    renderModal({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders the deposit overlay with DEPOSIT progress when open', () => {
    renderModal({ open: true, max: 10_000_000n })
    expect(screen.getByRole('dialog', { name: 'Deposit' })).toBeInTheDocument()
    expect(screen.getByText('DEPOSIT')).toBeInTheDocument()
    expect(screen.getByText('STEP 1 OF 3')).toBeInTheDocument()
    expect(screen.getByText(/How much USDC you want to deposit/i)).toBeInTheDocument()
  })

  it('advances to the review step after entering a valid amount', () => {
    renderModal({ open: true, max: 10_000_000n })
    fireEvent.change(screen.getByLabelText('Deposit amount'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /Review/ }))
    expect(screen.getByText('Review your deposit')).toBeInTheDocument()
    expect(screen.getByText('STEP 2 OF 3')).toBeInTheDocument()
    expect(screen.getAllByText('5').length).toBeGreaterThanOrEqual(1)
  })

  it('Back from review returns to the input step', () => {
    renderModal({ open: true, max: 10_000_000n })
    fireEvent.change(screen.getByLabelText('Deposit amount'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /Review/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Back/ }))
    expect(screen.getByText(/How much USDC you want to deposit/i)).toBeInTheDocument()
  })

  it('Cancel closes the modal', () => {
    const store = renderModal({ open: true, max: 10_000_000n })
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }))
    expect(store.get(openModalAtom)).toBeNull()
  })

  it('Confirm submits the tx and advances to the progress step', async () => {
    renderModal({ open: true, max: 10_000_000n })
    fireEvent.change(screen.getByLabelText('Deposit amount'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /Review/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm deposit/ }))
    })
    await waitFor(() => {
      expect(screen.getByText('Pending')).toBeInTheDocument()
      expect(screen.getByText('STEP 3 OF 3')).toBeInTheDocument()
    })
  })
})
