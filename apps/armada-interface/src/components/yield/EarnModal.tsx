// ABOUTME: EarnModal — vault deposit + withdrawal using full-viewport overlay shell.
// ABOUTME: Matches openModalAtom yield-deposit or yield-withdraw for initial tab.

import { useEffect, useMemo, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { openModalAtom, type ModalKind } from '@/state/ui'
import { shieldedUsdcAtom, yieldSharesAtom } from '@/state/wallet'
import { useTx } from '@/hooks/useTx'
import { useFees } from '@/hooks/useFees'
import { useSpendableSyncGate } from '@/hooks/useSpendableSyncGate'
import { useYieldRate } from '@/hooks/useYieldRate'
import { parseUsdcInput } from '@/lib/format'
import { resolveFeeCacheId } from '@/lib/relayer/resolveFeeCacheId'
import { computeDisplayFees, maxInputAmount } from '@/lib/fees/displayFees'
import { getNetworkConfig } from '@/config/network'
import { displayTxHash, txExplorerUrl } from '@/lib/explorer'
import { sharesToUsdc } from '@/lib/yield'
import { DepositOverlayShell } from '@/components/deposit/DepositOverlayShell/DepositOverlayShell'
import {
  ProgressStep,
  ErrorStep,
  overlayIndicatorStep,
  overlayIndicatorStatus,
  type FlowStep,
  type FlowVisibleStep,
} from '@/components/flow'
import { EarnInputStepContent, EarnInputStepFooter, type EarnTab } from './EarnInputStep'
import { EarnReviewStepContent, EarnReviewStepFooter } from './EarnReviewStep'
import { EarnCompleteStep } from './EarnCompleteStep'

type LocalStep = FlowStep

const EARN_KINDS: ReadonlyArray<ModalKind> = ['yield-deposit', 'yield-withdraw']

export function EarnModal() {
  const [openModal, setOpenModal] = useAtom(openModalAtom)
  const isOpen = EARN_KINDS.includes(openModal)
  const initialTab: EarnTab = openModal === 'yield-withdraw' ? 'withdraw' : 'add'

  const [tab, setTab] = useState<EarnTab>(initialTab)
  const [amountStr, setAmountStr] = useState<string>('')

  const [step, setStep] = useState<LocalStep>('input')
  const [errorAtStep, setErrorAtStep] = useState<FlowVisibleStep | undefined>(undefined)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedKind, setSubmittedKind] = useState<'yield-deposit' | 'yield-withdraw' | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const shieldedUsdc = useAtomValue(shieldedUsdcAtom)
  const yieldShares = useAtomValue(yieldSharesAtom)
  const { rate: yieldRate, refresh: refreshYieldRate } = useYieldRate()
  const earningUsdc =
    yieldShares !== null && yieldRate !== null ? sharesToUsdc(yieldShares, yieldRate.rate) : null
  const max = tab === 'add' ? shieldedUsdc ?? 0n : earningUsdc ?? 0n

  const { value: amount } = parseUsdcInput(amountStr)
  const { quote, isStale, refresh } = useFees()
  const syncGate = useSpendableSyncGate()
  const hubChainId = getNetworkConfig().hub.chainId
  const yieldKind: 'yield-deposit' | 'yield-withdraw' = tab === 'add' ? 'yield-deposit' : 'yield-withdraw'
  const displayFees = useMemo(
    () => computeDisplayFees(yieldKind, amount, quote ?? null),
    [yieldKind, amount, quote],
  )
  const maxInput = maxInputAmount(max, displayFees.totalFee)
  const feeLoading = !quote
  const netAmount = amount > displayFees.totalFee ? amount - displayFees.totalFee : 0n

  const txDeposit = useTx({ kind: 'yield-deposit' })
  const txWithdraw = useTx({ kind: 'yield-withdraw' })
  const activeTx =
    submittedKind === 'yield-deposit' ? txDeposit
    : submittedKind === 'yield-withdraw' ? txWithdraw
    : null
  const record = activeTx?.record ?? null

  useEffect(() => {
    if (!isOpen) return
    setStep('input')
    setSubmitError(null)
    setErrorAtStep(undefined)
    setAmountStr('')
    setSubmittedKind(null)
    setIsSubmitting(false)
    setTab(initialTab)
    void refreshYieldRate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (!record) return
    if (record.executionState === 'completed') {
      setStep('complete')
      void refreshYieldRate()
    }
    else if (record.executionState === 'failed' || record.executionState === 'expired') {
      setStep('error')
      setErrorAtStep('progress')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.executionState])

  function close() {
    setOpenModal(null)
  }

  async function handleSubmit() {
    if (isSubmitting) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const feeCacheId = await resolveFeeCacheId({ quote, isStale, refresh })
      if (tab === 'add') {
        setSubmittedKind('yield-deposit')
        await txDeposit.submit({
          amount,
          feeCacheId,
        })
      } else {
        setSubmittedKind('yield-withdraw')
        const freshRate = await refreshYieldRate()
        const effectiveRate = freshRate ?? yieldRate
        const shares =
          effectiveRate !== null && effectiveRate.rate > 0n
            ? (amount * 1_000_000_000_000_000_000n) / effectiveRate.rate
            : 0n
        await txWithdraw.submit({
          amount,
          feeCacheId,
          shares,
        })
      }
      setStep('progress')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submit failed.')
      setStep('error')
      setErrorAtStep('review')
    } finally {
      setIsSubmitting(false)
    }
  }

  const indicatorStep = overlayIndicatorStep(step)
  const indicatorStatus = overlayIndicatorStatus(step)
  const progressTitle = tab === 'add' ? 'Deposit to vault in progress' : 'Withdrawal from vault in progress'

  return (
    <DepositOverlayShell
      open={isOpen}
      flowLabel="Earn"
      currentStep={indicatorStep}
      status={indicatorStatus}
    >
      {step === 'input' ? (
        <EarnInputStepContent
          tab={tab}
          onTabChange={t => {
            setTab(t)
            setAmountStr('')
          }}
          amountStr={amountStr}
          onAmountChange={setAmountStr}
          max={max}
          maxInput={maxInput}
          displayFees={displayFees}
          feeLoading={feeLoading}
          gasChainId={hubChainId}
          rate={yieldRate}
        />
      ) : null}

      {step === 'review' ? (
        <EarnReviewStepContent
          tab={tab}
          amount={amount}
          rate={yieldRate}
          displayFees={displayFees}
          feeLoading={feeLoading}
          submitBlockedReason={syncGate.reason}
        />
      ) : null}

      {step === 'input' ? (
        <EarnInputStepFooter
          amountStr={amountStr}
          maxInput={maxInput}
          onCancel={close}
          onContinue={() => setStep('review')}
        />
      ) : null}

      {step === 'review' ? (
        <EarnReviewStepFooter
          tab={tab}
          submitBlockedReason={syncGate.reason}
          onBack={() => setStep('input')}
          onConfirm={handleSubmit}
          isSubmitting={isSubmitting}
        />
      ) : null}

      {step === 'progress' ? (
        <ProgressStep
          record={record}
          title={progressTitle}
          onClose={close}
        />
      ) : null}
      {step === 'complete' ? (
        <EarnCompleteStep
          tab={tab}
          amount={amount}
          rate={yieldRate}
          displayFees={displayFees}
          feeLoading={feeLoading}
          netAmount={netAmount}
          explorerUrl={txExplorerUrl(
            record?.walletContext.sourceChainId,
            displayTxHash(record),
          )}
          onDone={close}
        />
      ) : null}
      {step === 'error' ? (
        <ErrorStep
          error={record?.artifacts.error ?? null}
          message={submitError ?? undefined}
          explorerUrl={txExplorerUrl(record?.walletContext.sourceChainId, displayTxHash(record))}
          onRetry={errorAtStep === 'review' ? () => setStep('review') : () => activeTx?.retry()}
        />
      ) : null}
    </DepositOverlayShell>
  )
}
