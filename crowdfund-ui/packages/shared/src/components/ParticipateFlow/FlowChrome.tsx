// ABOUTME: Top chrome for participate commit steps — back, centered title, close.
// ABOUTME: Replaces the Steps progress header after the Before you start intro.

import type { ReactNode } from 'react'
import { ArrowLeftIcon, XMarkIcon } from '@heroicons/react/24/outline'
import styles from './FlowChrome.module.css'

const ICON_PX = 16

export interface FlowChromeProps {
  /** Screen title centered between the controls. Omit for close-only chrome. */
  title?: ReactNode
  /** Optional id for the title heading (aria / form labels). */
  titleId?: string
  onBack?: () => void
  onClose?: () => void
  /** When false, keeps layout balance with an empty left slot. */
  showBack?: boolean
  backAriaLabel?: string
  closeAriaLabel?: string
}

export function FlowChrome({
  title,
  titleId,
  onBack,
  onClose,
  showBack = true,
  backAriaLabel = 'Back',
  closeAriaLabel = 'Close participate flow',
}: FlowChromeProps) {
  const showBackBtn = showBack && !!onBack

  return (
    <div className={styles.bar}>
      {showBackBtn ? (
        <button
          type="button"
          className={styles.iconBtn}
          onClick={onBack}
          aria-label={backAriaLabel}
        >
          <ArrowLeftIcon width={ICON_PX} height={ICON_PX} aria-hidden />
        </button>
      ) : (
        <span className={styles.spacer} aria-hidden />
      )}
      {title != null && title !== '' ? (
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
      ) : (
        <span className={styles.titleSpacer} aria-hidden />
      )}
      {onClose ? (
        <button
          type="button"
          className={styles.iconBtn}
          onClick={onClose}
          aria-label={closeAriaLabel}
        >
          <XMarkIcon width={ICON_PX} height={ICON_PX} aria-hidden />
        </button>
      ) : (
        <span className={styles.spacer} aria-hidden />
      )}
    </div>
  )
}
