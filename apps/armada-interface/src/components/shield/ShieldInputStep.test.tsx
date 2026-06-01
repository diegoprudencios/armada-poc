// ABOUTME: Tests for ShieldInputStep — Review gated on a positive amount within max, error surfaces when amount exceeds max.
// ABOUTME: Uses DepositAmountCard (aria-label "Deposit amount") and Review/Cancel CTAs.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ZERO_DISPLAY_FEES } from '@/test/fixtures/displayFees'
import { ShieldInputStep } from './ShieldInputStep'

function setup(extras?: { max?: bigint; amountStr?: string }) {
  const max = extras?.max ?? 5_000_000n
  const props = {
    fromChainId: 31337,
    onFromChainIdChange: vi.fn(),
    amountStr: extras?.amountStr ?? '',
    onAmountChange: vi.fn(),
    max,
    maxInput: max,
    displayFees: ZERO_DISPLAY_FEES,
    onCancel: vi.fn(),
    onContinue: vi.fn(),
  }
  render(<ShieldInputStep {...props} />)
  return props
}

describe('<ShieldInputStep>', () => {
  it('disables Review when the amount is empty', () => {
    setup()
    expect(screen.getByRole('button', { name: /Review/ })).toBeDisabled()
  })

  it('disables Review when the amount is 0', () => {
    setup({ amountStr: '0' })
    expect(screen.getByRole('button', { name: /Review/ })).toBeDisabled()
  })

  it('disables Review and surfaces an error when amount exceeds max', () => {
    setup({ max: 1_000_000n, amountStr: '5' })
    expect(screen.getByRole('alert')).toHaveTextContent(/exceeds your available balance/i)
    expect(screen.getByRole('button', { name: /Review/ })).toBeDisabled()
  })

  it('enables Review when amount is positive and within max', () => {
    setup({ max: 5_000_000n, amountStr: '4' })
    expect(screen.getByRole('button', { name: /Review/ })).not.toBeDisabled()
  })

  it('fires onContinue when the user submits a valid amount', () => {
    const props = setup({ max: 5_000_000n, amountStr: '4' })
    fireEvent.click(screen.getByRole('button', { name: /Review/ }))
    expect(props.onContinue).toHaveBeenCalledTimes(1)
  })

  it('fires onCancel from the secondary CTA', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }))
    expect(props.onCancel).toHaveBeenCalledTimes(1)
  })
})
