// ABOUTME: UnshieldModal — withdraw private USDC to an EVM address using full-viewport overlay shell.
// ABOUTME: Selects unshield-local or unshield-xchain based on destination chain.

import { useEffect, useMemo, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { openModalAtom } from '@/state/ui'
import { evmAddressAtom, yieldSharesAtom } from '@/state/wallet'
import { usePrivateUsdcDisplay } from '@/hooks/usePrivateUsdcDisplay'
import { useYieldRate } from '@/hooks/useYieldRate'
import { formatUsdcAmount } from '@/lib/format'
import { sharesToUsdc } from '@/lib/yield'
import { useTx } from '@/hooks/useTx'
import { useFees } from '@/hooks/useFees'
import { useSpendableSyncGate } from '@/hooks/useSpendableSyncGate'
import { getNetworkConfig } from '@/config/network'
import { parseUsdcInput } from '@/lib/format'
import { displayTxHash, txExplorerUrl } from '@/lib/explorer'
import { resolveFeeCacheId } from '@/lib/relayer/resolveFeeCacheId'
import { computeDisplayFees, maxInputAmount } from '@/lib/fees/displayFees'
import { DepositOverlayShell } from '@/components/deposit/DepositOverlayShell/DepositOverlayShell'
import {
  ProgressStep,
  ErrorStep,
  overlayIndicatorStep,
  overlayIndicatorStatus,
  type FlowStep,
  type FlowVisibleStep,
} from '@/components/flow'
import { UnshieldInputStepContent, UnshieldInputStepFooter } from './UnshieldInputStep'
import { UnshieldReviewStepContent, UnshieldReviewStepFooter } from './UnshieldReviewStep'
import { UnshieldCompleteStep } from './UnshieldCompleteStep'

type LocalStep = FlowStep

type SubmittedKind = 'unshield-local' | 'unshield-xchain'

export function UnshieldModal() {
  const [openModal, setOpenModal] = useAtom(openModalAtom)
  const isOpen = openModal === 'unshield'

  const hubChainId = getNetworkConfig().hub.chainId
  const connectedEvm = useAtomValue(evmAddressAtom)
  const [destChainId, setDestChainId] = useState<number>(hubChainId)
  const [amountStr, setAmountStr] = useState<string>('')
  const recipient = connectedEvm ?? ''

  const [step, setStep] = useState<LocalStep>('input')
  const [errorAtStep, setErrorAtStep] = useState<FlowVisibleStep | undefined>(undefined)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedKind, setSubmittedKind] = useState<SubmittedKind | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { displayBalance, isSyncing: balanceSyncing } = usePrivateUsdcDisplay()
  const yieldShares = useAtomValue(yieldSharesAtom)
  const { rate: yieldRate } = useYieldRate()
  const earningUsdc =
    yieldShares !== null && yieldRate !== null
      ? sharesToUsdc(yieldShares, yieldRate.rate)
      : null
  const { value: amount } = parseUsdcInput(amountStr)
  const { quote, isStale, refresh } = useFees()
  const syncGate = useSpendableSyncGate()
  const totalPrivateUsdc = displayBalance + (earningUsdc ?? 0n)
  const max = totalPrivateUsdc
  const balanceLabel = balanceSyncing ? 'Syncing…' : formatUsdcAmount(totalPrivateUsdc)

  const txLocal = useTx({ kind: 'unshield-local' })
  const txXchain = useTx({ kind: 'unshield-xchain' })
  const activeTx = submittedKind === 'unshield-local' ? txLocal : submittedKind === 'unshield-xchain' ? txXchain : null
  const record = activeTx?.record ?? null

  const computedKind: SubmittedKind = destChainId === hubChainId ? 'unshield-local' : 'unshield-xchain'
  const displayFees = useMemo(
    () => computeDisplayFees(computedKind, amount, quote ?? null),
    [computedKind, amount, quote],
  )
  const maxInput = maxInputAmount(max, displayFees.totalFee)
  const feeLoading = !quote
  const netAmount = amount > displayFees.totalFee ? amount - displayFees.totalFee : 0n
  const isXchain = computedKind === 'unshield-xchain'

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
      if (computedKind === 'unshield-local') {
        setSubmittedKind('unshield-local')
        await txLocal.submit({
          amount,
          feeCacheId,
          recipient,
        })
      } else {
        setSubmittedKind('unshield-xchain')
        await txXchain.submit({
          amount,
          feeCacheId,
          toChainId: destChainId,
          recipient,
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

  return (
    <DepositOverlayShell
      open={isOpen}
      flowLabel="Withdraw"
      currentStep={indicatorStep}
      status={indicatorStatus}
    >
      {step === 'input' ? (
        <UnshieldInputStepContent
          destChainId={destChainId}
          onDestChainIdChange={setDestChainId}
          walletAddress={connectedEvm}
          amountStr={amountStr}
          onAmountChange={setAmountStr}
          maxInput={maxInput}
          balanceLabel={balanceLabel}
          balanceSyncing={balanceSyncing}
          displayFees={displayFees}
          feeLoading={feeLoading}
          gasChainId={hubChainId}
        />
      ) : null}

      {step === 'review' ? (
        <UnshieldReviewStepContent
          destChainId={destChainId}
          recipient={recipient}
          amount={amount}
          displayFees={displayFees}
          feeLoading={feeLoading}
          isXchain={isXchain}
          submitBlockedReason={syncGate.reason}
        />
      ) : null}

      {step === 'input' ? (
        <UnshieldInputStepFooter
          walletAddress={connectedEvm}
          amountStr={amountStr}
          maxInput={maxInput}
          balanceSyncing={balanceSyncing}
          onCancel={close}
          onContinue={() => setStep('review')}
        />
      ) : null}

      {step === 'review' ? (
        <UnshieldReviewStepFooter
          submitBlockedReason={syncGate.reason}
          onBack={() => setStep('input')}
          onConfirm={handleSubmit}
          isSubmitting={isSubmitting}
        />
      ) : null}

      {step === 'progress' ? (
        <ProgressStep
          record={record}
          title="Withdrawal in progress"
          onClose={close}
        />
      ) : null}
      {step === 'complete' ? (
        <UnshieldCompleteStep
          destChainId={destChainId}
          recipient={recipient}
          amount={amount}
          displayFees={displayFees}
          isXchain={isXchain}
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
