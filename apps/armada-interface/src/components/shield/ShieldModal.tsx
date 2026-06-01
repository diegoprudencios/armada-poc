// ABOUTME: ShieldModal — deposit flow orchestrator using full-viewport DepositOverlayShell (not ActionFlowShell modal).
// ABOUTME: Dispatches same-chain shield vs shield-xchain; progress/complete/error steps unchanged.

import { useEffect, useMemo, useState } from 'react'
import { useAtom } from 'jotai'
import { openModalAtom } from '@/state/ui'
import { useTx } from '@/hooks/useTx'
import { useFees } from '@/hooks/useFees'
import { resolveFeeCacheId } from '@/lib/relayer/resolveFeeCacheId'
import { computeDisplayFees, maxInputAmount } from '@/lib/fees/displayFees'
import { useBalances } from '@/hooks/useBalances'
import { getNetworkConfig } from '@/config/network'
import { parseUsdcInput } from '@/lib/format'
import { displayTxHash, txExplorerUrl } from '@/lib/explorer'
import { DepositOverlayShell } from '@/components/deposit/DepositOverlayShell/DepositOverlayShell'
import {
  ProgressStep,
  ErrorStep,
  overlayIndicatorStep,
  overlayIndicatorStatus,
  type FlowStep,
  type FlowVisibleStep,
} from '@/components/flow'
import { ShieldInputStepContent, ShieldInputStepFooter } from './ShieldInputStep'
import { ShieldReviewStepContent, ShieldReviewStepFooter } from './ShieldReviewStep'
import { ShieldCompleteStep } from './ShieldCompleteStep'

type LocalStep = FlowStep
type SubmittedKind = 'shield' | 'shield-xchain'

function computeKind(fromChainId: number, hubChainId: number): SubmittedKind {
  return fromChainId === hubChainId ? 'shield' : 'shield-xchain'
}

export function ShieldModal() {
  const [openModal, setOpenModal] = useAtom(openModalAtom)
  const isOpen = openModal === 'shield'

  const hubChainId = getNetworkConfig().hub.chainId
  const [fromChainId, setFromChainId] = useState<number>(hubChainId)
  const [amountStr, setAmountStr] = useState<string>('')

  const [step, setStep] = useState<LocalStep>('input')
  const [errorAtStep, setErrorAtStep] = useState<FlowVisibleStep | undefined>(undefined)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedKind, setSubmittedKind] = useState<SubmittedKind | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const balances = useBalances()
  const max = balances.unshielded[fromChainId] ?? 0n
  const { value: amount } = parseUsdcInput(amountStr)

  const { quote, isStale, refresh } = useFees()
  const computedKind: SubmittedKind = computeKind(fromChainId, hubChainId)
  const displayFees = useMemo(
    () => computeDisplayFees(computedKind, amount, quote ?? null),
    [computedKind, amount, quote],
  )
  const maxInput = maxInputAmount(max, displayFees.totalFee)
  const feeLoading = !quote
  const netAmount = amount > displayFees.protocolFee ? amount - displayFees.protocolFee : 0n

  const txShield = useTx({ kind: 'shield' })
  const txShieldXchain = useTx({ kind: 'shield-xchain' })
  const activeTx =
    submittedKind === 'shield' ? txShield
    : submittedKind === 'shield-xchain' ? txShieldXchain
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
  }, [isOpen])

  useEffect(() => {
    if (!record) return
    if (record.executionState === 'completed') setStep('complete')
    else if (record.executionState === 'failed' || record.executionState === 'expired') {
      setStep('error')
      setErrorAtStep('progress')
    }
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
      if (computedKind === 'shield') {
        setSubmittedKind('shield')
        await txShield.submit({ amount, feeCacheId, fromChainId })
      } else {
        setSubmittedKind('shield-xchain')
        await txShieldXchain.submit({ amount, feeCacheId, fromChainId })
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

  return (
    <DepositOverlayShell
      open={isOpen}
      flowLabel="Deposit"
      currentStep={indicatorStep}
      status={indicatorStatus}
    >
      {step === 'input' ? (
        <ShieldInputStepContent
          fromChainId={fromChainId}
          onFromChainIdChange={setFromChainId}
          amountStr={amountStr}
          onAmountChange={setAmountStr}
          max={max}
          maxInput={maxInput}
          displayFees={displayFees}
          feeLoading={feeLoading}
        />
      ) : null}

      {step === 'review' ? (
        <ShieldReviewStepContent
          fromChainId={fromChainId}
          amount={amount}
          displayFees={displayFees}
          feeLoading={feeLoading}
        />
      ) : null}

      {step === 'input' ? (
        <ShieldInputStepFooter
          amountStr={amountStr}
          maxInput={maxInput}
          onCancel={close}
          onContinue={() => setStep('review')}
        />
      ) : null}

      {step === 'review' ? (
        <ShieldReviewStepFooter
          onBack={() => setStep('input')}
          onConfirm={handleSubmit}
          isSubmitting={isSubmitting}
        />
      ) : null}

      {step === 'progress' ? (
        <ProgressStep
          record={record}
          title="Deposit in progress"
          onClose={close}
        />
      ) : null}
      {step === 'complete' ? (
        <ShieldCompleteStep
          fromChainId={fromChainId}
          amount={amount}
          displayFees={displayFees}
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
