// ABOUTME: Shield review step — deposit summary with Back / Confirm deposit CTAs.
// ABOUTME: Amount display matches DepositAmountCard sizing; network + fee breakdown in raised list.

import TokenUSDC from '@web3icons/react/icons/tokens/TokenUSDC'
import { Button } from '@armada/ui'
import { depositOverlayShellStyles } from '@/components/deposit/DepositOverlayShell/DepositOverlayShell'
import { formatUsdcAmount } from '@/lib/format'
import type { DisplayFees } from '@/lib/fees/displayFees'
import { ShieldDepositSummary } from './ShieldDepositSummary'
import styles from './ShieldReviewStep.module.css'

const USDC_ICON_SIZE = 24

export interface ShieldReviewStepProps {
  fromChainId: number
  amount: bigint
  displayFees: DisplayFees | null
  feeLoading?: boolean
  netAmount: bigint
  onBack: () => void
  onConfirm: () => void
  isSubmitting?: boolean
}

export function ShieldReviewStepContent({
  fromChainId,
  amount,
  displayFees,
  feeLoading,
}: Pick<ShieldReviewStepProps, 'fromChainId' | 'amount' | 'displayFees' | 'feeLoading'>) {
  const amountLabel = formatUsdcAmount(amount)

  return (
    <div className={styles.contentZone}>
      <h2 className={styles.title}>Review your deposit</h2>
      <div className={styles.amountBlock}>
        <span className={styles.amountValue}>{amountLabel}</span>
        <div className={styles.currencyRow}>
          <span className={styles.currencyIcon} aria-hidden>
            <TokenUSDC size={USDC_ICON_SIZE} variant="branded" />
          </span>
          <span className={styles.currencyLabel}>USDC</span>
        </div>
      </div>
      <ShieldDepositSummary
        fromChainId={fromChainId}
        amount={amount}
        displayFees={displayFees}
        feeLoading={feeLoading}
      />
    </div>
  )
}

export function ShieldReviewStepFooter({
  onBack,
  onConfirm,
  isSubmitting = false,
}: Pick<ShieldReviewStepProps, 'onBack' | 'onConfirm' | 'isSubmitting'>) {
  return (
    <div className={depositOverlayShellStyles.buttonRow}>
      <Button
        variant="secondary"
        size="lg"
        label="Back"
        showIcon={false}
        onClick={onBack}
        disabled={isSubmitting}
      />
      <Button
        variant="primary"
        size="lg"
        label={isSubmitting ? 'Confirming…' : 'Confirm deposit'}
        showIcon={false}
        disabled={isSubmitting}
        onClick={onConfirm}
      />
    </div>
  )
}

export function ShieldReviewStep(props: ShieldReviewStepProps) {
  return (
    <>
      <ShieldReviewStepContent {...props} />
      <ShieldReviewStepFooter {...props} />
    </>
  )
}
