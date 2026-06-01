// ABOUTME: Raised summary for withdraw review and complete — chain, recipient, amount, fee, total.

import { formatUsdcAmount, truncateAddress } from '@/lib/format'
import { getChainById } from '@/config/network'
import type { DisplayFees } from '@/lib/fees/displayFees'
import { EstimatedFeeValue } from '@/components/ui/EstimatedFeeValue'
import styles from '@/components/shield/ShieldReviewStep.module.css'

export interface UnshieldWithdrawSummaryProps {
  destChainId: number
  recipient: string
  amount: bigint
  displayFees: DisplayFees | null
  feeLoading?: boolean
  isXchain?: boolean
}

export function UnshieldWithdrawSummary({
  destChainId,
  recipient,
  amount,
  displayFees,
  feeLoading = false,
  isXchain = false,
}: UnshieldWithdrawSummaryProps) {
  const destChain = getChainById(destChainId)
  const networkName = destChain?.name ?? `Chain ${destChainId}`
  const amountLabel = formatUsdcAmount(amount)
  const totalLabel = `${formatUsdcAmount(amount)} USDC`

  return (
    <div className={styles.summary}>
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>Network</span>
        <span className={styles.summaryValue}>
          {networkName}
          {isXchain ? ' (cross-chain)' : ''}
        </span>
      </div>
      <hr className={styles.summaryDivider} />
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>Recipient</span>
        <span className={styles.summaryValue} title={recipient}>
          {truncateAddress(recipient)}
        </span>
      </div>
      <hr className={styles.summaryDivider} />
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>Your withdrawal</span>
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
