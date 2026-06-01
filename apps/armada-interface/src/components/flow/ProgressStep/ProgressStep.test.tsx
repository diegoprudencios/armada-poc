// ABOUTME: Tests for ProgressStep — pre-record placeholder vs. delegating to TxLifecycleStepper once a record exists.
// ABOUTME: Deposit mode (onClose): centered Cancel pre-broadcast; dismiss hint + Close after broadcast.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DEV_SIMULATED_TX_HASH } from '@/lib/tx/devSimulateTx'
import { ProgressStep } from './ProgressStep'
import type { TxRecord } from '@/lib/tx/types'

const sampleRecord: TxRecord<'shield'> = {
  id: '01JX',
  kind: 'shield',
  executionState: 'active',
  stage: 'build-proof',
  stagesCompleted: [],
  updatedSeq: 1,
  createdAt: 0,
  updatedAt: 0,
  meta: { amount: 1_000_000n, feeCacheId: 'fc-1', fromChainId: 31337 },
  artifacts: {},
  walletContext: {
    evmAddress: '0xabc',
    railgunWalletId: 'rg-1',
    sourceChainId: 31337,
  },
}

const broadcastRecord: TxRecord<'shield'> = {
  ...sampleRecord,
  stage: 'submit-relayer',
  artifacts: {
    sourceTxHash: DEV_SIMULATED_TX_HASH,
  },
}

describe('<ProgressStep>', () => {
  it('renders preparing placeholder when no record exists', () => {
    render(<ProgressStep record={null} title="Deposit in progress" onClose={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Deposit in progress' })).toBeInTheDocument()
    expect(screen.getByText('Preparing transaction')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(screen.queryByText('You can close this window while we finish')).toBeNull()
  })

  it('renders wallet confirmation UI when ux is wallet', () => {
    render(
      <ProgressStep
        record={sampleRecord}
        ux="wallet"
        depositAmount={1_000_000n}
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole('heading', { name: /Confirm transactions/i })).toBeInTheDocument()
    expect(screen.getByText('Authorize deposit')).toBeInTheDocument()
    expect(screen.getByText('Approve 1 USDC')).toBeInTheDocument()
    expect(screen.getByText('Waiting for wallet confirmation')).toBeInTheDocument()
    expect(screen.queryByText('Preparing transaction')).toBeNull()
  })

  it('delegates to TxLifecycleStepper when record is present', () => {
    render(<ProgressStep record={sampleRecord} />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Preparing transaction')).toBeInTheDocument()
  })

  it('shows centered Cancel before broadcast in deposit mode', () => {
    render(
      <ProgressStep
        record={sampleRecord}
        title="Deposit in progress"
        onClose={() => {}}
        ux="lifecycle"
      />,
    )
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.queryByText('You can close this window while we finish')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Stop tracking' })).toBeNull()
  })

  it('shows dismiss hint and Close after broadcast in deposit mode', () => {
    const onClose = vi.fn()
    render(
      <ProgressStep
        record={broadcastRecord}
        title="Deposit in progress"
        onClose={onClose}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Stop tracking' })).toBeNull()
    expect(screen.getByText('You can close this window while we finish')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('hides Close in wallet mode until every wallet prompt is finished', () => {
    render(
      <ProgressStep
        record={broadcastRecord}
        ux="wallet"
        depositAmount={1_000_000n}
        onClose={() => {}}
      />,
    )
    expect(screen.queryByText('You can close this window while we finish')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    expect(screen.getByText('Waiting for wallet confirmation')).toBeInTheDocument()
  })

  it('shows Close in wallet mode after sign, approve, and deposit submit', () => {
    const walletDone: TxRecord<'shield'> = {
      ...broadcastRecord,
      stagesCompleted: ['build-proof'],
      artifacts: {
        sourceTxHash: DEV_SIMULATED_TX_HASH,
        approveTxHash: '0x0000000000000000000000000000000000000000000000000000000000000001',
      },
    }
    render(
      <ProgressStep
        record={walletDone}
        ux="wallet"
        depositAmount={1_000_000n}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('You can close this window while we finish')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
})
