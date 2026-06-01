// ABOUTME: Send complete step — confirmation with hero amount, summary, explorer + Done.

import { Button } from '@armada/ui'
import { depositOverlayShellStyles } from '@/components/deposit/DepositOverlayShell/DepositOverlayShell'
import { FlowAmountHero } from '@/components/flow/FlowAmountHero'
import type { DisplayFees } from '@/lib/fees/displayFees'
import { SendTransferSummary } from './SendTransferSummary'
import type { SendTab } from './SendInputStep'
import reviewStyles from '@/components/shield/ShieldReviewStep.module.css'

export interface SendCompleteStepProps {
  tab: SendTab
  destChainId: number
  recipient: string
  amount: bigint
  displayFees: DisplayFees
  isXchain: boolean
  netAmount: bigint
  explorerUrl?: string
  onDone: () => void
}

export function SendCompleteStep({
  tab,
  destChainId,
  recipient,
  amount,
  displayFees,
  isXchain,
  netAmount,
  explorerUrl,
  onDone,
}: SendCompleteStepProps) {
  function openExplorer() {
    if (!explorerUrl) return
    window.open(explorerUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className={reviewStyles.contentZone}>
      <h2 className={reviewStyles.title}>Send complete</h2>
      <FlowAmountHero amount={netAmount} />
      <SendTransferSummary
        tab={tab}
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
