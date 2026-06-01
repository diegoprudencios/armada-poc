// ABOUTME: Earn complete step — confirmation with hero amount, summary, explorer + Done.

import { Button } from '@armada/ui'
import { depositOverlayShellStyles } from '@/components/deposit/DepositOverlayShell/DepositOverlayShell'
import { FlowAmountHero } from '@/components/flow/FlowAmountHero'
import { EarnActionSummary } from './EarnActionSummary'
import type { DisplayFees } from '@/lib/fees/displayFees'
import type { YieldRate } from '@/hooks/useYieldRate'
import type { EarnTab } from './EarnInputStep'
import reviewStyles from '@/components/shield/ShieldReviewStep.module.css'

export interface EarnCompleteStepProps {
  tab: EarnTab
  amount: bigint
  rate: YieldRate | null
  displayFees: DisplayFees
  feeLoading?: boolean
  netAmount: bigint
  explorerUrl?: string
  onDone: () => void
}

export function EarnCompleteStep({
  tab,
  amount,
  rate,
  displayFees,
  feeLoading,
  netAmount,
  explorerUrl,
  onDone,
}: EarnCompleteStepProps) {
  const title = tab === 'add' ? 'Deposit to vault complete' : 'Withdrawal from vault complete'

  function openExplorer() {
    if (!explorerUrl) return
    window.open(explorerUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className={reviewStyles.contentZone}>
      <h2 className={reviewStyles.title}>{title}</h2>
      <FlowAmountHero amount={netAmount} />
      <EarnActionSummary
        tab={tab}
        amount={amount}
        rate={rate}
        displayFees={displayFees}
        feeLoading={feeLoading}
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
