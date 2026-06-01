// ABOUTME: Full-viewport two-panel onboarding shell — decorative brand graphic + step content area.

import type { ReactNode } from 'react'
import styles from './OnboardingLayout.module.css'

export interface OnboardingLayoutProps {
  children: ReactNode
}

export function OnboardingLayout({ children }: OnboardingLayoutProps) {
  return (
    <div className={styles.root}>
      <aside className={styles.brandPanel} aria-hidden="true">
        <div className={styles.brandCard}>
          <img
            className={styles.symbol}
            src="/assets/symbol-white.svg"
            alt=""
            decoding="async"
          />
          <img
            className={styles.wordmark}
            src="/assets/armada-wordmark.svg"
            alt="ARMADA"
            decoding="async"
          />
        </div>
      </aside>
      <div className={styles.contentPanel}>
        <div className={styles.contentInner}>{children}</div>
      </div>
    </div>
  )
}
