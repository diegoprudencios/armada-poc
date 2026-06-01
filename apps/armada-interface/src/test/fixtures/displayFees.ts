// ABOUTME: Shared DisplayFees fixtures for component tests.

import type { DisplayFees } from '@/lib/fees/displayFees'

export const ZERO_DISPLAY_FEES: DisplayFees = {
  protocolFee: 0n,
  gasFee: 0n,
  totalFee: 0n,
}

export function displayFeesWithTotal(totalFee: bigint): DisplayFees {
  return {
    protocolFee: 0n,
    gasFee: totalFee,
    totalFee,
  }
}
