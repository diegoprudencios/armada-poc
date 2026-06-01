// ABOUTME: Raised summary list for shield deposit review and complete — network, amount, fee, total.

import { formatUsdcAmount } from '@/lib/format'
import { getChainById } from '@/config/network'
import type { DisplayFees } from '@/lib/fees/displayFees'
import { EstimatedFeeValue } from '@/components/ui/EstimatedFeeValue'
import styles from './ShieldReviewStep.module.css'

export interface ShieldDepositSummaryProps {
  fromChainId: number
  amount: bigint
  displayFees: DisplayFees | null
  feeLoading?: boolean
}

export function ShieldDepositSummary({
  fromChainId,
  amount,
  displayFees,
  feeLoading = false,
}: ShieldDepositSummaryProps) {
  const fromChain = getChainById(fromChainId)
  const networkName = fromChain?.name ?? `Chain ${fromChainId}`
  const amountLabel = formatUsdcAmount(amount)
  const feeAmount = displayFees?.totalFee ?? 0n
  const totalLabel = `${formatUsdcAmount(amount + feeAmount)} USDC`

  return (
    <div className={styles.summary}>
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>Network</span>
        <span className={styles.summaryValue}>{networkName}</span>
      </div>
      <hr className={styles.summaryDivider} />
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>Your deposit</span>
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
