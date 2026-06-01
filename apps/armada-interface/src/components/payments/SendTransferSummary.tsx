// ABOUTME: Raised summary for send review and complete — mode, chain, recipient, amount, fee, total.

import { formatUsdcAmount, truncateAddress } from '@/lib/format'
import { getChainById } from '@/config/network'
import type { DisplayFees } from '@/lib/fees/displayFees'
import { EstimatedFeeValue } from '@/components/ui/EstimatedFeeValue'
import type { SendTab } from './SendInputStep'
import styles from '@/components/shield/ShieldReviewStep.module.css'

export interface SendTransferSummaryProps {
  tab: SendTab
  destChainId: number
  recipient: string
  amount: bigint
  displayFees: DisplayFees | null
  feeLoading?: boolean
  isXchain?: boolean
}

function truncateRecipient(recipient: string): string {
  if (recipient.startsWith('0zk') && recipient.length > 14) {
    return `${recipient.slice(0, 7)}…${recipient.slice(-4)}`
  }
  return truncateAddress(recipient)
}

export function SendTransferSummary({
  tab,
  destChainId,
  recipient,
  amount,
  displayFees,
  feeLoading = false,
  isXchain = false,
}: SendTransferSummaryProps) {
  const destChain = tab === 'external' ? getChainById(destChainId) : null
  const modeLabel = tab === 'private' ? 'Private transfer' : 'External wallet'
  const amountLabel = formatUsdcAmount(amount)
  const totalLabel = `${formatUsdcAmount(amount)} USDC`

  return (
    <div className={styles.summary}>
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>Mode</span>
        <span className={styles.summaryValue}>
          {modeLabel}
          {isXchain ? ' (cross-chain)' : ''}
        </span>
      </div>
      {destChain ? (
        <>
          <hr className={styles.summaryDivider} />
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Network</span>
            <span className={styles.summaryValue}>{destChain.name}</span>
          </div>
        </>
      ) : null}
      <hr className={styles.summaryDivider} />
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>Recipient</span>
        <span className={styles.summaryValue} title={recipient}>
          {truncateRecipient(recipient)}
        </span>
      </div>
      <hr className={styles.summaryDivider} />
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>Your send</span>
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
