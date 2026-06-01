// ABOUTME: Earn review step — vault action summary with Back / Confirm CTAs.

import { Button } from '@armada/ui'
import { depositOverlayShellStyles } from '@/components/deposit/DepositOverlayShell/DepositOverlayShell'
import { FlowAmountHero } from '@/components/flow/FlowAmountHero'
import { EarnActionSummary } from './EarnActionSummary'
import type { DisplayFees } from '@/lib/fees/displayFees'
import type { YieldRate } from '@/hooks/useYieldRate'
import type { EarnTab } from './EarnInputStep'
import styles from '@/components/shield/ShieldReviewStep.module.css'
import earnStyles from './EarnReviewStep.module.css'

export interface EarnReviewStepProps {
  tab: EarnTab
  amount: bigint
  rate: YieldRate | null
  displayFees: DisplayFees | null
  feeLoading?: boolean
  submitBlockedReason?: string | null
  onBack: () => void
  onConfirm: () => void
  isSubmitting?: boolean
}

export function EarnReviewStepContent({
  tab,
  amount,
  rate,
  displayFees,
  feeLoading,
  submitBlockedReason,
}: Pick<
  EarnReviewStepProps,
  'tab' | 'amount' | 'rate' | 'displayFees' | 'feeLoading' | 'submitBlockedReason'
>) {
  return (
    <div className={styles.contentZone}>
      <h2 className={styles.title}>
        Review {tab === 'add' ? 'your deposit' : 'your withdrawal'}
      </h2>
      <FlowAmountHero amount={amount} />
      <EarnActionSummary
        tab={tab}
        amount={amount}
        rate={rate}
        displayFees={displayFees}
        feeLoading={feeLoading}
      />
      {tab === 'withdraw' ? (
        <div className={earnStyles.slippageNotice}>
          The vault rate moves with each new block. Your final USDC may differ slightly from
          this quote.
        </div>
      ) : null}
      {submitBlockedReason ? (
        <div className={styles.syncNotice} role="status" aria-live="polite">
          {submitBlockedReason}
        </div>
      ) : null}
    </div>
  )
}

export function EarnReviewStepFooter({
  tab,
  submitBlockedReason,
  onBack,
  onConfirm,
  isSubmitting = false,
}: Pick<
  EarnReviewStepProps,
  'tab' | 'submitBlockedReason' | 'onBack' | 'onConfirm' | 'isSubmitting'
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
        label={
          isSubmitting
            ? 'Confirming…'
            : tab === 'add'
              ? 'Confirm deposit'
              : 'Confirm withdrawal'
        }
        showIcon={false}
        disabled={Boolean(submitBlockedReason) || isSubmitting}
        onClick={onConfirm}
      />
    </div>
  )
}

export function EarnReviewStep(props: EarnReviewStepProps) {
  return (
    <>
      <EarnReviewStepContent {...props} />
      <EarnReviewStepFooter {...props} />
    </>
  )
}
