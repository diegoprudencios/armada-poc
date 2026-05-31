// ABOUTME: Tests for ShieldReviewStep — renders amount, network row, total, and dispatches Back/Confirm.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShieldReviewStep } from './ShieldReviewStep'

function setup(opts?: { fee?: bigint | null }) {
  const onBack = vi.fn()
  const onConfirm = vi.fn()
  render(
    <ShieldReviewStep
      fromChainId={31337}
      amount={100_500_000n}
      fee={opts?.fee ?? null}
      netAmount={100_500_000n}
      onBack={onBack}
      onConfirm={onConfirm}
    />,
  )
  return { onBack, onConfirm }
}

describe('<ShieldReviewStep>', () => {
  it('renders the title, amount, network, and total', () => {
    setup()
    expect(screen.getByRole('heading', { name: /Review your deposit/i })).toBeInTheDocument()
    expect(screen.getAllByText('100.5').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Network')).toBeInTheDocument()
    expect(screen.getByText(/Anvil Hub/)).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getAllByText(/100\.5 USDC/).length).toBeGreaterThanOrEqual(1)
  })

  it('includes fee in total when fee is non-zero', () => {
    setup({ fee: 500_000n })
    const feeRow = screen.getByText('Estimated fee').closest('div')
    expect(feeRow).toHaveTextContent('0.5 USDC')
    const totalRow = screen.getByText('Total').closest('div')
    expect(totalRow).toHaveTextContent('101 USDC')
  })

  it('fires onConfirm on the primary CTA', () => {
    const { onConfirm } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Confirm deposit/ }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('fires onBack on the secondary CTA', () => {
    const { onBack } = setup()
    fireEvent.click(screen.getByRole('button', { name: /^Back/ }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
