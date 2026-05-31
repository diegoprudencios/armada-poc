// ABOUTME: Tests for ShieldCompleteStep — deposit complete title, amount, explorer + Done CTAs.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShieldCompleteStep } from './ShieldCompleteStep'

const defaultProps = {
  fromChainId: 31337,
  amount: 1_000_000_000n,
  fee: 0n,
  netAmount: 1_000_000_000n,
  onDone: () => {},
}

describe('<ShieldCompleteStep>', () => {
  it('renders deposit complete title, amount, and summary details', () => {
    render(
      <ShieldCompleteStep
        {...defaultProps}
        explorerUrl="https://etherscan.io/tx/0xabc"
      />,
    )
    expect(screen.getByRole('heading', { name: 'Deposit complete' })).toBeInTheDocument()
    expect(screen.getByText('1,000')).toBeInTheDocument()
    expect(screen.getByText('USDC')).toBeInTheDocument()
    expect(screen.getByText('Network')).toBeInTheDocument()
    expect(screen.getByText(/Anvil Hub/)).toBeInTheDocument()
    expect(screen.getByText('Your deposit')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.queryByText('Success')).toBeNull()
    expect(screen.queryByText(/You've deposited/)).toBeNull()
  })

  it('opens the explorer URL from the secondary button', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(
      <ShieldCompleteStep
        {...defaultProps}
        explorerUrl="https://etherscan.io/tx/0xabc"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /View on explorer/ }))
    expect(open).toHaveBeenCalledWith(
      'https://etherscan.io/tx/0xabc',
      '_blank',
      'noopener,noreferrer',
    )
    open.mockRestore()
  })

  it('disables the explorer button when no URL is available', () => {
    render(
      <ShieldCompleteStep
        fromChainId={31337}
        amount={1_000_000n}
        fee={0n}
        netAmount={1_000_000n}
        onDone={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /View on explorer/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Done/ })).toBeInTheDocument()
  })

  it('fires onDone when the Done CTA is clicked', () => {
    const onDone = vi.fn()
    render(
      <ShieldCompleteStep
        fromChainId={31337}
        amount={1_000_000n}
        fee={0n}
        netAmount={1_000_000n}
        onDone={onDone}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Done/ }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
