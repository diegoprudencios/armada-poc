// ABOUTME: Shield amount step — DepositAmountCard + Review/Cancel CTAs (full-viewport deposit flow).
// ABOUTME: Chain list from network config; balance/fee from live unshielded balance.

import { useMemo } from 'react'
import { Button } from '@armada/ui'
import { DepositAmountCard } from '@/components/deposit/DepositAmountCard/DepositAmountCard'
import { depositOverlayShellStyles } from '@/components/deposit/DepositOverlayShell/DepositOverlayShell'
import { getAllChainIdentities } from '@/config/network'
import { formatUsdcPlain, parseUsdcInput, usdcInputErrorMessage } from '@/lib/format'
import { hasActiveAmount } from '@/utils/amountInput'
import styles from './ShieldInputStep.module.css'

export interface ShieldInputStepProps {
  fromChainId: number
  onFromChainIdChange: (chainId: number) => void
  amountStr: string
  onAmountChange: (next: string) => void
  max: bigint
  fee: bigint
  onCancel: () => void
  onContinue: () => void
}

export function ShieldInputStepContent({
  fromChainId,
  onFromChainIdChange,
  amountStr,
  onAmountChange,
  max,
  fee,
}: Pick<
  ShieldInputStepProps,
  'fromChainId' | 'onFromChainIdChange' | 'amountStr' | 'onAmountChange' | 'max' | 'fee'
>) {
  const chains = useMemo(
    () => getAllChainIdentities().map((c) => ({ chainId: c.chainId, label: c.name })),
    [],
  )
  const { value: amount, error: amountError } = parseUsdcInput(amountStr)
  const tooMuch = amount > max
  const errorMessage = usdcInputErrorMessage(amountError)
    ?? (tooMuch ? 'Amount exceeds your available balance.' : undefined)

  const balanceDisplay = formatUsdcPlain(max)
  const feeDisplay = formatUsdcPlain(fee)

  return (
    <div className={styles.contentZone}>
      <p className={styles.question}>How much USDC you want to deposit?</p>
      <DepositAmountCard
        chains={chains}
        chainId={fromChainId}
        onChainIdChange={onFromChainIdChange}
        amount={amountStr}
        onAmountChange={onAmountChange}
        balance={balanceDisplay}
        fee={feeDisplay}
        onMax={() => onAmountChange(formatUsdcPlain(max))}
        error={errorMessage}
      />
    </div>
  )
}

export function ShieldInputStepFooter({
  amountStr,
  max,
  onCancel,
  onContinue,
}: Pick<ShieldInputStepProps, 'amountStr' | 'max' | 'onCancel' | 'onContinue'>) {
  const { value: amount, error: amountError } = parseUsdcInput(amountStr)
  const tooMuch = amount > max
  const canReview = hasActiveAmount(amountStr) && !tooMuch && !amountError

  return (
    <div className={depositOverlayShellStyles.buttonRow}>
      <Button
        variant="secondary"
        size="lg"
        label="Cancel"
        showIcon={false}
        onClick={onCancel}
      />
      <Button
        variant="primary"
        size="lg"
        label="Review"
        showIcon={false}
        disabled={!canReview}
        onClick={onContinue}
      />
    </div>
  )
}

export function ShieldInputStep(props: ShieldInputStepProps) {
  return (
    <>
      <ShieldInputStepContent {...props} />
      <ShieldInputStepFooter {...props} />
    </>
  )
}
