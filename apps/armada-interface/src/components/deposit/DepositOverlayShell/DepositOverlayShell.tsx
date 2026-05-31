// ABOUTME: Full-viewport deposit overlay — replaces ActionFlowShell/Modal for the shield (deposit) flow.
// ABOUTME: Backdrop fades in first, then content; on close, content exits then backdrop.

import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { OVERLAY_EXIT_MS } from '@/constants/overlayMotion'
import { useOverlayExitTransition } from '@/hooks/useOverlayExitTransition'
import {
  FlowStepIndicator,
  type FlowStepIndicatorStatus,
} from '@/components/flow/FlowStepIndicator'
import styles from './DepositOverlayShell.module.css'

export interface DepositOverlayShellProps {
  open: boolean
  /** 1-based step index for the 3-segment deposit bar. */
  currentStep: number
  totalSteps?: number
  /** Lavender while in progress; green when the deposit is confirmed. */
  status?: FlowStepIndicatorStatus
  children: ReactNode
}

const DEPOSIT_STEP_LABELS = ['Amount', 'Review', 'Confirm'] as const

export function DepositOverlayShell({
  open,
  currentStep,
  totalSteps = DEPOSIT_STEP_LABELS.length,
  status = 'default',
  children,
}: DepositOverlayShellProps) {
  const { mounted, exiting } = useOverlayExitTransition(open, OVERLAY_EXIT_MS)

  useEffect(() => {
    if (!mounted) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mounted])

  if (!mounted) return null

  return createPortal(
    <div
      className={styles.root}
      role="dialog"
      aria-modal="true"
      aria-label="Deposit"
      data-exiting={exiting ? true : undefined}
    >
      <div className={styles.backdrop} aria-hidden />
      <div className={styles.column}>
        <FlowStepIndicator
          flowLabel="Deposit"
          currentStep={currentStep}
          totalSteps={totalSteps}
          steps={[...DEPOSIT_STEP_LABELS]}
          status={status}
        />
        {children}
      </div>
    </div>,
    document.body,
  )
}

export { styles as depositOverlayShellStyles }
