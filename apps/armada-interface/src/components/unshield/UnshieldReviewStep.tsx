// ABOUTME: Unshield review step — withdraw summary with Back / Confirm withdrawal CTAs.

import { Button } from '@armada/ui'
import { depositOverlayShellStyles } from '@/components/deposit/DepositOverlayShell/DepositOverlayShell'
import { FlowAmountHero } from '@/components/flow/FlowAmountHero'
import type { DisplayFees } from '@/lib/fees/displayFees'
import { UnshieldWithdrawSummary } from './UnshieldWithdrawSummary'
import styles from '@/components/shield/ShieldReviewStep.module.css'

export interface UnshieldReviewStepProps {
  destChainId: number
  recipient: string
  amount: bigint
  displayFees: DisplayFees | null
  feeLoading?: boolean
  isXchain: boolean
  submitBlockedReason?: string | null
  onBack: () => void
  onConfirm: () => void
  isSubmitting?: boolean
}

export function UnshieldReviewStepContent({
  destChainId,
  recipient,
  amount,
  displayFees,
  feeLoading,
  isXchain,
  submitBlockedReason,
}: Pick<
  UnshieldReviewStepProps,
  | 'destChainId'
  | 'recipient'
  | 'amount'
  | 'displayFees'
  | 'feeLoading'
  | 'isXchain'
  | 'submitBlockedReason'
>) {
  return (
    <div className={styles.contentZone}>
      <h2 className={styles.title}>Review your withdrawal</h2>
      <FlowAmountHero amount={amount} />
      <UnshieldWithdrawSummary
        destChainId={destChainId}
        recipient={recipient}
        amount={amount}
        displayFees={displayFees}
        feeLoading={feeLoading}
        isXchain={isXchain}
      />
      {submitBlockedReason ? (
        <div className={styles.syncNotice} role="status" aria-live="polite">
          {submitBlockedReason}
        </div>
      ) : null}
    </div>
  )
}

export function UnshieldReviewStepFooter({
  submitBlockedReason,
  onBack,
  onConfirm,
  isSubmitting = false,
}: Pick<
  UnshieldReviewStepProps,
  'submitBlockedReason' | 'onBack' | 'onConfirm' | 'isSubmitting'
>) {
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
        label={isSubmitting ? 'Confirming…' : 'Confirm withdrawal'}
        showIcon={false}
        disabled={Boolean(submitBlockedReason) || isSubmitting}
        onClick={onConfirm}
      />
    </div>
  )
}

export function UnshieldReviewStep(props: UnshieldReviewStepProps) {
  return (
    <>
      <UnshieldReviewStepContent {...props} />
      <UnshieldReviewStepFooter {...props} />
    </>
  )
}
