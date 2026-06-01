// ABOUTME: Vitest setup — registers @testing-library/jest-dom matchers and the fake IndexedDB shim.
// ABOUTME: Loaded automatically via vitest.config.ts → test.setupFiles.

import '@testing-library/jest-dom'
import 'fake-indexeddb/auto'
import { vi } from 'vitest'

vi.mock('@/hooks/useGasBalanceWarning', () => ({
  useGasBalanceWarning: () => ({
    show: false,
    nativeSymbol: 'ETH',
    formattedBalance: '0',
  }),
}))

vi.mock('@/hooks/useDisplayFees', async (importOriginal) => {
  const { computeDisplayFees } = await importOriginal<typeof import('@/lib/fees/displayFees')>()
  return {
    useDisplayFees: (kind: import('@/lib/tx/types').TxKind, amount: bigint) => ({
      fees: computeDisplayFees(kind, amount, null),
      isLoading: false,
    }),
    maxSpendableAmount: (balance: bigint, fees: ReturnType<typeof computeDisplayFees>) =>
      fees.feeInclusive ? balance : balance > fees.totalFee ? balance - fees.totalFee : 0n,
    netAmountAfterFees: (amount: bigint, fees: ReturnType<typeof computeDisplayFees>) =>
      amount > fees.protocolFee ? amount - fees.protocolFee : 0n,
  }
})
