// ABOUTME: Shared progress step — renders the active tx's <TxLifecycleStepper> for any TxKind, with a Cancel CTA on in-flight records.
// ABOUTME: When no record exists yet (user clicked Confirm but executor hasn't written the first transition), shows a preparing placeholder.

import { useEffect } from 'react'
import { useAtomValue } from 'jotai'
import { isLocalMode } from '@/config/network'
import { cancelTx, executeTx } from '@/lib/tx/executor'
import type { TxRecord } from '@/lib/tx/types'
import { Button } from '@armada/ui'
import { TxActions, TxLifecycleStepper, txHasBroadcast } from '@/components/tx'
import { preferencesAtom } from '@/state/preferences'
import styles from './ProgressStep.module.css'

const DEFAULT_DISMISS_HINT = 'You can close this window while we finish'

const PRE_TERMINAL_STATES = new Set(['pending', 'active', 'waiting', 'retrying'])

export interface ProgressStepProps {
  /** The in-flight tx record. Null when the executor hasn't created a record yet (e.g. user just clicked Confirm). */
  record: TxRecord | null
  /** Screen title above the status card (e.g. "Deposit in progress"). */
  title?: string
  /**
   * Override the user's "Show technical details by default" preference. When undefined, falls back to
   * preferencesAtom. Modals don't need to thread the preference; ProgressStep handles it once here.
   */
  technicalDetailsDefaultOpen?: boolean
  /**
   * Deposit flow: centered Cancel while pre-broadcast; after broadcast, hint + Close (no stop tracking).
   */
  onClose?: () => void
  dismissHint?: string
}

function canCancelTx(record: TxRecord): boolean {
  return PRE_TERMINAL_STATES.has(record.executionState) && !txHasBroadcast(record)
}

export function ProgressStep({
  record,
  title,
  technicalDetailsDefaultOpen,
  onClose,
  dismissHint = DEFAULT_DISMISS_HINT,
}: ProgressStepProps) {
  const prefs = useAtomValue(preferencesAtom)
  const defaultOpen = technicalDetailsDefaultOpen ?? prefs.showTechnicalDetailsByDefault

  useEffect(() => {
    if (!record || !isLocalMode()) return
    if (record.executionState === 'completed' || record.executionState === 'failed'
      || record.executionState === 'expired' || record.executionState === 'cancelled') {
      return
    }
    executeTx(record.id)
  }, [record?.id, record?.executionState])

  if (!record) {
    return (
      <div className={styles.contentZone}>
        {title ? <h2 className={styles.title}>{title}</h2> : null}
        <section className={styles.statusCard} aria-label="Transaction status">
          <div className={styles.headline}>Preparing transaction</div>
          <div className={styles.sub}>Hang on a moment…</div>
        </section>
      </div>
    )
  }

  const showDepositActions = Boolean(onClose)
  const showCancel = showDepositActions && canCancelTx(record)
  const showDismiss = showDepositActions && !showCancel && PRE_TERMINAL_STATES.has(record.executionState)

  return (
    <div className={styles.contentZone}>
      {title ? <h2 className={styles.title}>{title}</h2> : null}
      <TxLifecycleStepper record={record} technicalDetailsDefaultOpen={defaultOpen} />
      {showDepositActions ? (
        <>
          {showCancel ? (
            <div className={styles.actionFooter}>
              <Button
                variant="secondary"
                size="lg"
                label="Cancel"
                showIcon={false}
                onClick={() => cancelTx(record.id)}
              />
            </div>
          ) : null}
          {showDismiss && onClose ? (
            <DismissFooter hint={dismissHint} onClose={onClose} />
          ) : null}
        </>
      ) : (
        <TxActions record={record} variant="cancel" />
      )}
    </div>
  )
}

function DismissFooter({ hint, onClose }: { hint: string; onClose: () => void }) {
  return (
    <footer className={styles.dismissFooter}>
      <p className={styles.dismissHint}>{hint}</p>
      <Button
        variant="secondary"
        size="lg"
        label="Close"
        showIcon={false}
        onClick={onClose}
      />
    </footer>
  )
}
