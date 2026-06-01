// ABOUTME: Unshield complete step — withdrawal confirmation with hero amount, summary, explorer + Done.

import { Button } from '@armada/ui'
import { depositOverlayShellStyles } from '@/components/deposit/DepositOverlayShell/DepositOverlayShell'
import { FlowAmountHero } from '@/components/flow/FlowAmountHero'
import type { DisplayFees } from '@/lib/fees/displayFees'
import { UnshieldWithdrawSummary } from './UnshieldWithdrawSummary'
import reviewStyles from '@/components/shield/ShieldReviewStep.module.css'

export interface UnshieldCompleteStepProps {
  destChainId: number
  recipient: string
  amount: bigint
  displayFees: DisplayFees
  isXchain: boolean
  netAmount: bigint
  explorerUrl?: string
  onDone: () => void
}

export function UnshieldCompleteStep({
  destChainId,
  recipient,
  amount,
  displayFees,
  isXchain,
  netAmount,
  explorerUrl,
  onDone,
}: UnshieldCompleteStepProps) {
  function openExplorer() {
    if (!explorerUrl) return
    window.open(explorerUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className={reviewStyles.contentZone}>
      <h2 className={reviewStyles.title}>Withdrawal complete</h2>
      <FlowAmountHero amount={netAmount} />
      <UnshieldWithdrawSummary
        destChainId={destChainId}
        recipient={recipient}
        amount={amount}
        displayFees={displayFees}
        isXchain={isXchain}
      />
      <div className={depositOverlayShellStyles.buttonRow}>
        <Button
          variant="secondary"
          size="lg"
          label="View on explorer"
          showIcon={false}
          disabled={!explorerUrl}
          onClick={openExplorer}
        />
        <Button
          variant="primary"
          size="lg"
          label="Done"
          showIcon={false}
          onClick={onDone}
        />
      </div>
    </div>
  )
}
