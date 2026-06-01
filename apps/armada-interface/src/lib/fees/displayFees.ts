// ABOUTME: Display fee breakdown for action flows — protocol (CCTP) + relayer gas estimate (USDC) + total.
// ABOUTME: Used for amount-card tooltips, review summaries, and max-fill (balance − total fee).

import type { FeeSchedule } from '@/lib/relayer'
import { userFeeForKind } from '@/lib/relayer'
import type { TxKind } from '@/lib/tx/types'

export interface DisplayFees {
  protocolFee: bigint
  gasFee: bigint
  totalFee: bigint
}

type RelayerFeeKey = keyof FeeSchedule['fees']

export function relayerFeeKeyForKind(kind: TxKind): RelayerFeeKey {
  switch (kind) {
    case 'shield-xchain':
      return 'crossChainShield'
    case 'unshield-xchain':
      return 'crossChainUnshield'
    case 'shield':
    case 'yield-deposit':
    case 'yield-withdraw':
      return 'crossContract'
    case 'unshield-local':
      return 'unshield'
    case 'transfer-shielded':
      return 'transfer'
  }
}

/**
 * USDC relayer reimbursement from the fee schedule. Today every stage handler submits via the
 * user's wallet (see lib/relayer.ts `userFeeForKind`) — native gas only, no USDC relayer fee.
 * The relayer quote uses a 2M-gas `crossContract` estimate meant for relayed privacy txs; showing
 * it on Deposit would wrongly imply ~$100+ USDC fees. Returns 0 until `submitRelay` is wired.
 */
export function relayerGasFeeForKind(_kind: TxKind, _quote: FeeSchedule | null): bigint {
  return 0n
}

/** Protocol + relayer gas (USDC raw). Gas is an estimate; user also pays native gas in-wallet. */
export function computeDisplayFees(
  kind: TxKind,
  amount: bigint,
  quote: FeeSchedule | null,
): DisplayFees {
  const protocolFee = userFeeForKind(kind, amount)
  const gasFee = relayerGasFeeForKind(kind, quote)
  return {
    protocolFee,
    gasFee,
    totalFee: protocolFee + gasFee,
  }
}

/** Max USDC the user can enter — spendable balance minus total estimated USDC fees. */
export function maxInputAmount(balance: bigint, totalFee: bigint): bigint {
  return balance > totalFee ? balance - totalFee : 0n
}
