// ABOUTME: Raised summary for earn review and complete — mode, APY, amount, fee, total.

import { formatUsdcAmount } from '@/lib/format'
import { rateToApy } from '@/lib/yield'
import type { YieldRate } from '@/hooks/useYieldRate'
import type { DisplayFees } from '@/lib/fees/displayFees'
import { EstimatedFeeValue } from '@/components/ui/EstimatedFeeValue'
import type { EarnTab } from './EarnInputStep'
import styles from '@/components/shield/ShieldReviewStep.module.css'

export interface EarnActionSummaryProps {
  tab: EarnTab
  amount: bigint
  rate: YieldRate | null
  displayFees: DisplayFees | null
  feeLoading?: boolean
}

function formatApy(rate: YieldRate | null): string {
  if (!rate) return 'Syncing…'
  const apy = rateToApy(rate.apyBps)
  if (apy === 0) return 'Unavailable'
  return `~${apy.toFixed(2)}%`
}

export function EarnActionSummary({
  tab,
  amount,
  rate,
  displayFees,
  feeLoading = false,
}: EarnActionSummaryProps) {
  const modeLabel = tab === 'add' ? 'Add to vault' : 'Withdraw from vault'
  const amountLabel = formatUsdcAmount(amount)
  const amountRowLabel = tab === 'add' ? 'Your deposit' : 'Your withdrawal'
  const totalLabel = `${formatUsdcAmount(amount)} USDC`

  return (
    <div className={styles.summary}>
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>Mode</span>
        <span className={styles.summaryValue}>{modeLabel}</span>
      </div>
      <hr className={styles.summaryDivider} />
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>Estimated APY</span>
        <span className={styles.summaryValue}>{formatApy(rate)}</span>
      </div>
      <hr className={styles.summaryDivider} />
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>{amountRowLabel}</span>
        <span className={styles.summaryValue}>{amountLabel} USDC</span>
      </div>
      <hr className={styles.summaryDivider} />
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>Estimated fee</span>
        <EstimatedFeeValue fees={displayFees} isLoading={feeLoading} />
      </div>
      <hr className={styles.summaryDivider} />
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>Total</span>
        <span className={styles.summaryValue}>{totalLabel}</span>
      </div>
    </div>
  )
}
