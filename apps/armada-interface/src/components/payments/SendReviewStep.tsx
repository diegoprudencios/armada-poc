// ABOUTME: Send review step — transfer summary with Back / Confirm send CTAs.

import { Button } from '@armada/ui'
import { depositOverlayShellStyles } from '@/components/deposit/DepositOverlayShell/DepositOverlayShell'
import { FlowAmountHero } from '@/components/flow/FlowAmountHero'
import type { DisplayFees } from '@/lib/fees/displayFees'
import { SendTransferSummary } from './SendTransferSummary'
import type { SendTab } from './SendInputStep'
import styles from '@/components/shield/ShieldReviewStep.module.css'

export interface SendReviewStepProps {
  tab: SendTab
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

export function SendReviewStepContent({
  tab,
  destChainId,
  recipient,
  amount,
  displayFees,
  feeLoading,
  isXchain,
  submitBlockedReason,
}: Pick<
  SendReviewStepProps,
  | 'tab'
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
      <h2 className={styles.title}>Review your send</h2>
      <FlowAmountHero amount={amount} />
      <SendTransferSummary
        tab={tab}
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

export function SendReviewStepFooter({
  submitBlockedReason,
  onBack,
  onConfirm,
  isSubmitting = false,
}: Pick<
  SendReviewStepProps,
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
        label={isSubmitting ? 'Confirming…' : 'Confirm send'}
        showIcon={false}
        disabled={Boolean(submitBlockedReason) || isSubmitting}
        onClick={onConfirm}
      />
    </div>
  )
}

export function SendReviewStep(props: SendReviewStepProps) {
  return (
    <>
      <SendReviewStepContent {...props} />
      <SendReviewStepFooter {...props} />
    </>
  )
}
