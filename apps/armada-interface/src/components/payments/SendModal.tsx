// ABOUTME: SendModal — pay USDC privately or to an external wallet using full-viewport overlay shell.
// ABOUTME: Picks transfer-shielded / unshield-local / unshield-xchain based on tab + destination chain.

import { useEffect, useMemo, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { openModalAtom } from '@/state/ui'
import { shieldedUsdcAtom } from '@/state/wallet'
import { useTx } from '@/hooks/useTx'
import { useFees } from '@/hooks/useFees'
import { useSpendableSyncGate } from '@/hooks/useSpendableSyncGate'
import { getNetworkConfig } from '@/config/network'
import {
  findDeploymentForChain,
  loadDeployments,
  type ResolvedDeployments,
} from '@/config/deployments'
import { parseUsdcInput } from '@/lib/format'
import { resolveFeeCacheId } from '@/lib/relayer/resolveFeeCacheId'
import { computeDisplayFees, maxInputAmount } from '@/lib/fees/displayFees'
import { displayTxHash, txExplorerUrl } from '@/lib/explorer'
import { trackError } from '@/lib/telemetry'
import { DepositOverlayShell } from '@/components/deposit/DepositOverlayShell/DepositOverlayShell'
import {
  ProgressStep,
  ErrorStep,
  overlayIndicatorStep,
  overlayIndicatorStatus,
  type FlowStep,
  type FlowVisibleStep,
} from '@/components/flow'
import { SendInputStepContent, SendInputStepFooter, type SendTab } from './SendInputStep'
import { SendReviewStepContent, SendReviewStepFooter } from './SendReviewStep'
import { SendCompleteStep } from './SendCompleteStep'

type LocalStep = FlowStep

type SubmittedKind = 'transfer-shielded' | 'unshield-local' | 'unshield-xchain'

function computeKind(tab: SendTab, destChainId: number, hubChainId: number): SubmittedKind {
  if (tab === 'private') return 'transfer-shielded'
  return destChainId === hubChainId ? 'unshield-local' : 'unshield-xchain'
}

export function SendModal() {
  const [openModal, setOpenModal] = useAtom(openModalAtom)
  const isOpen = openModal === 'payment'

  const hubChainId = getNetworkConfig().hub.chainId
  const [tab, setTab] = useState<SendTab>('private')
  const [destChainId, setDestChainId] = useState<number>(hubChainId)
  const [recipient, setRecipient] = useState<string>('')
  const [amountStr, setAmountStr] = useState<string>('')

  const [step, setStep] = useState<LocalStep>('input')
  const [errorAtStep, setErrorAtStep] = useState<FlowVisibleStep | undefined>(undefined)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedKind, setSubmittedKind] = useState<SubmittedKind | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const shieldedUsdc = useAtomValue(shieldedUsdcAtom)
  const max = shieldedUsdc ?? 0n
  const { value: amount } = parseUsdcInput(amountStr)
  const { quote, isStale, refresh } = useFees()
  const syncGate = useSpendableSyncGate()

  const [deployments, setDeployments] = useState<ResolvedDeployments | null>(null)
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    void loadDeployments()
      .then(d => { if (!cancelled) setDeployments(d) })
      .catch(err => {
        trackError('SendModal.loadDeployments', err, {
          scope: 'send.deployments',
          message: 'failed to load deployment manifests for destination-chain check',
        })
      })
    return () => { cancelled = true }
  }, [isOpen])
  const destHasDeployment =
    tab === 'private' || !deployments
      ? true
      : findDeploymentForChain(deployments, destChainId) !== undefined
  const destDeploymentError = destHasDeployment
    ? undefined
    : 'This destination chain has no deployment manifest. Pick another chain.'

  const txTransfer = useTx({ kind: 'transfer-shielded' })
  const txUnshieldLocal = useTx({ kind: 'unshield-local' })
  const txUnshieldXchain = useTx({ kind: 'unshield-xchain' })

  const activeTx =
    submittedKind === 'transfer-shielded' ? txTransfer
    : submittedKind === 'unshield-local' ? txUnshieldLocal
    : submittedKind === 'unshield-xchain' ? txUnshieldXchain
    : null
  const record = activeTx?.record ?? null

  const computedKind: SubmittedKind = computeKind(tab, destChainId, hubChainId)
  const isXchain = computedKind === 'unshield-xchain'
  const displayFees = useMemo(
    () => computeDisplayFees(computedKind, amount, quote ?? null),
    [computedKind, amount, quote],
  )
  const maxInput = maxInputAmount(max, displayFees.totalFee)
  const feeLoading = !quote
  const gasChainId =
    computedKind === 'unshield-local' ? destChainId : hubChainId
  const netAmount =
    amount > displayFees.totalFee ? amount - displayFees.totalFee : 0n

  useEffect(() => {
    if (!isOpen) return
    setStep('input')
    setSubmitError(null)
    setErrorAtStep(undefined)
    setAmountStr('')
    setRecipient('')
    setTab('private')
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
      if (computedKind === 'transfer-shielded') {
        setSubmittedKind('transfer-shielded')
        await txTransfer.submit({
          amount,
          feeCacheId,
          recipient,
        })
      } else if (computedKind === 'unshield-local') {
        setSubmittedKind('unshield-local')
        await txUnshieldLocal.submit({
          amount,
          feeCacheId,
          recipient,
        })
      } else {
        setSubmittedKind('unshield-xchain')
        await txUnshieldXchain.submit({
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
      flowLabel="Send"
      currentStep={indicatorStep}
      status={indicatorStatus}
    >
      {step === 'input' ? (
        <SendInputStepContent
          tab={tab}
          onTabChange={next => {
            setTab(next)
            setRecipient('')
          }}
          destChainId={destChainId}
          onDestChainIdChange={setDestChainId}
          recipient={recipient}
          onRecipientChange={setRecipient}
          amountStr={amountStr}
          onAmountChange={setAmountStr}
          max={max}
          maxInput={maxInput}
          displayFees={displayFees}
          feeLoading={feeLoading}
          gasChainId={gasChainId}
          destDeploymentError={destDeploymentError}
        />
      ) : null}

      {step === 'review' ? (
        <SendReviewStepContent
          tab={tab}
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
        <SendInputStepFooter
          tab={tab}
          recipient={recipient}
          amountStr={amountStr}
          maxInput={maxInput}
          destDeploymentError={destDeploymentError}
          onCancel={close}
          onContinue={() => setStep('review')}
        />
      ) : null}

      {step === 'review' ? (
        <SendReviewStepFooter
          submitBlockedReason={syncGate.reason}
          onBack={() => setStep('input')}
          onConfirm={handleSubmit}
          isSubmitting={isSubmitting}
        />
      ) : null}

      {step === 'progress' ? (
        <ProgressStep
          record={record}
          title="Send in progress"
          onClose={close}
        />
      ) : null}
      {step === 'complete' ? (
        <SendCompleteStep
          tab={tab}
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
