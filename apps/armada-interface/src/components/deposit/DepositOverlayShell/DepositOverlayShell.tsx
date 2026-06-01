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
import { OVERLAY_STEP_LABELS } from '@/components/flow/overlayFlow'
import styles from './DepositOverlayShell.module.css'

export interface DepositOverlayShellProps {
  open: boolean
  /** Shown in the step indicator (e.g. Deposit, Withdraw, Send, Earn). */
  flowLabel?: string
  /** Dialog aria-label; defaults to flowLabel. */
  ariaLabel?: string
  /** 1-based step index for the 3-segment bar. */
  currentStep: number
  totalSteps?: number
  /** Lavender while in progress; green when the flow is confirmed. */
  status?: FlowStepIndicatorStatus
  children: ReactNode
}

export function DepositOverlayShell({
  open,
  flowLabel = 'Deposit',
  ariaLabel,
  currentStep,
  totalSteps = OVERLAY_STEP_LABELS.length,
  status = 'default',
  children,
}: DepositOverlayShellProps) {
  const label = ariaLabel ?? flowLabel
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
      aria-label={label}
      data-exiting={exiting ? true : undefined}
    >
      <div className={styles.backdrop} aria-hidden />
      <div className={styles.column}>
        <FlowStepIndicator
          flowLabel={flowLabel}
          currentStep={currentStep}
          totalSteps={totalSteps}
          steps={[...OVERLAY_STEP_LABELS]}
          status={status}
        />
        {children}
      </div>
    </div>,
    document.body,
  )
}

export { styles as depositOverlayShellStyles }
