// ABOUTME: Info icon (16px) with rich tooltip — protocol fee, gas estimate, total fee in USDC.

import { InformationCircleIcon } from '@heroicons/react/16/solid'
import { formatUsdcAmount } from '@/lib/format'
import type { DisplayFees } from '@/lib/fees/displayFees'
import { Tooltip } from '@/components/ui/Tooltip'
import styles from './FeeBreakdownTooltip.module.css'

function feeLine(label: string, amount: bigint): string {
  const value = amount === 0n ? 'No fee' : `${formatUsdcAmount(amount)} USDC`
  return `${label}: ${value}`
}

export interface FeeBreakdownTooltipProps {
  fees: DisplayFees
  /** Shown when the relayer quote has not loaded yet. */
  isLoading?: boolean
}

export function FeeBreakdownTooltip({ fees, isLoading = false }: FeeBreakdownTooltipProps) {
  const bullets = isLoading
    ? ['Loading fee estimate…']
    : [
        feeLine('Protocol fee', fees.protocolFee),
        feeLine('Gas', fees.gasFee),
        feeLine('Total fee', fees.totalFee),
      ]

  return (
    <Tooltip
      variant="rich"
      title="Fee breakdown"
      description="Gas is paid in your wallet's native token (e.g. ETH). Amounts below are USDC estimates."
      bullets={bullets}
    >
      <button
        type="button"
        className={styles.trigger}
        aria-label="Fee breakdown"
      >
        <InformationCircleIcon className={styles.iconMicro} aria-hidden />
      </button>
    </Tooltip>
  )
}
