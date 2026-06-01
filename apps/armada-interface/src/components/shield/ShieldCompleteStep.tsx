// ABOUTME: Shield complete step — deposit confirmation with amount display and Done / explorer CTAs.
// ABOUTME: Matches review-step typography; progress bar turns green via DepositOverlayShell status.

import TokenUSDC from '@web3icons/react/icons/tokens/TokenUSDC'
import { Button } from '@armada/ui'
import { depositOverlayShellStyles } from '@/components/deposit/DepositOverlayShell/DepositOverlayShell'
import { formatUsdcAmount } from '@/lib/format'
import type { DisplayFees } from '@/lib/fees/displayFees'
import { ShieldDepositSummary } from './ShieldDepositSummary'
import reviewStyles from './ShieldReviewStep.module.css'

const USDC_ICON_SIZE = 24

export interface ShieldCompleteStepProps {
  fromChainId: number
  /** Gross deposit amount (pre-fee), raw 6-decimal USDC. */
  amount: bigint
  displayFees: DisplayFees
  /** Net amount deposited (post-fee), shown in the hero. */
  netAmount: bigint
  /** Block explorer URL for the submitted tx; omit when the chain has no explorer. */
  explorerUrl?: string
  onDone: () => void
}

export function ShieldCompleteStep({
  fromChainId,
  amount,
  displayFees,
  netAmount,
  explorerUrl,
  onDone,
}: ShieldCompleteStepProps) {
  const amountLabel = formatUsdcAmount(netAmount)

  function openExplorer() {
    if (!explorerUrl) return
    window.open(explorerUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className={reviewStyles.contentZone}>
      <h2 className={reviewStyles.title}>Deposit complete</h2>
      <div className={reviewStyles.amountBlock}>
        <span className={reviewStyles.amountValue}>{amountLabel}</span>
        <div className={reviewStyles.currencyRow}>
          <span className={reviewStyles.currencyIcon} aria-hidden>
            <TokenUSDC size={USDC_ICON_SIZE} variant="branded" />
          </span>
          <span className={reviewStyles.currencyLabel}>USDC</span>
        </div>
      </div>
      <ShieldDepositSummary
        fromChainId={fromChainId}
        amount={amount}
        displayFees={displayFees}
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
