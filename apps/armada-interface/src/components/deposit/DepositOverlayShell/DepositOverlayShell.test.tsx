// ABOUTME: Tests DepositOverlayShell exit transition — stays mounted with data-exiting until OVERLAY_EXIT_MS.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { OVERLAY_EXIT_MS } from '@/constants/overlayMotion'
import { DepositOverlayShell } from './DepositOverlayShell'

describe('<DepositOverlayShell>', () => {
  beforeEach(() => {
    document.body.style.overflow = ''
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.style.overflow = ''
  })

  it('renders nothing when open=false initially', () => {
    render(
      <DepositOverlayShell open={false} currentStep={1}>
        <div>content</div>
      </DepositOverlayShell>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sets data-exiting on close and unmounts after exit duration', () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <DepositOverlayShell open currentStep={1}>
        <div>content</div>
      </DepositOverlayShell>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Deposit' })
    expect(dialog).not.toHaveAttribute('data-exiting')

    rerender(
      <DepositOverlayShell open={false} currentStep={1}>
        <div>content</div>
      </DepositOverlayShell>,
    )
    expect(screen.getByRole('dialog', { name: 'Deposit' })).toHaveAttribute('data-exiting', 'true')
    expect(screen.getByText('content')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(OVERLAY_EXIT_MS - 1)
    })
    expect(screen.getByRole('dialog', { name: 'Deposit' })).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
