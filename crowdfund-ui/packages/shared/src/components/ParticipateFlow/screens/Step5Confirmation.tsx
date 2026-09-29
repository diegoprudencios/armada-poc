// ABOUTME: Final confirmation screen — hero check, summary rows, useful links, and the "what happens next" FAQ.
// ABOUTME: Ported from the armada-crowdfund mockup (FlowChrome close-only header replaces the Steps bar); POC props (maxedOut / isAdditionalCommit / invite CTAs) preserved.

import { Fragment, type SVGProps } from 'react'
import { ChatBubbleLeftRightIcon, NewspaperIcon } from '@heroicons/react/24/outline'
import { CheckCircleIcon } from '@heroicons/react/24/solid'
import { Button } from '@armada/ui'
import styles from './Step5Confirmation.module.css'
import { FlowChrome } from '../FlowChrome'
import type { ParticipateStepBarProps } from '../participateFlowSteps'
import { WhatHappensNextSlider } from './WhatHappensNextSlider'

export interface Step5ConfirmationProps extends ParticipateStepBarProps {
  /** When false (e.g. Hop-2 with no invite capacity), hide Invite and promote View position. */
  canInvite?: boolean
  onInvite?: () => void
  onViewPosition?: () => void
  /** Shown as secondary when `canInvite` is false. */
  onBackToCrowdfund?: () => void
  /** Close control in the top chrome (preferred over the modal-level X). */
  onClose?: () => void
  /** @deprecated View your position now shows whenever `onViewPosition` is set. */
  showViewPositionButton?: boolean
  amount?: number
  estimatedArm?: number
  /** User committed more USDC in a follow-up visit (not first participation). */
  isAdditionalCommit?: boolean
  totalCommittedUsdc?: number
  /** User was already at their maximum on entry — they didn't commit anything
   *  this visit. Swaps in "already fully committed" copy (no amount added). */
  maxedOut?: boolean
  /** Commit-window countdown — forwarded to What happens next. */
  daysLeft?: number
  secondsLeft?: number
  endsAt?: number | Date | null
}

type SummaryRow = { label: string; value: string; accent?: boolean }

function DiscordIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}

function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.227-8.451L1.5 2.25h7.08l4.263 5.671L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  )
}

const RESOURCE_LINKS = [
  {
    label: 'Governance',
    // TODO: replace when the governance forum URL is ready.
    href: 'https://docs.armada.blue/',
    Icon: ChatBubbleLeftRightIcon,
  },
  {
    label: 'Twitter',
    href: 'https://x.com/ship_armada',
    Icon: XIcon,
  },
  {
    label: 'Blog',
    href: 'https://armada.ghost.io',
    Icon: NewspaperIcon,
  },
  {
    label: 'Discord',
    href: 'https://discord.gg/eyD58prEV',
    Icon: DiscordIcon,
  },
] as const

function formatUsd(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

function summaryRows(opts: {
  maxedOut: boolean
  isAdditionalCommit: boolean
  formattedAmount: string
  formattedTotal: string
  estimatedArm: number
}): SummaryRow[] {
  const { maxedOut, isAdditionalCommit, formattedAmount, formattedTotal, estimatedArm } = opts
  const armValue = `Up to ${estimatedArm.toLocaleString()} ARM`

  if (maxedOut) {
    return [
      { label: 'Committed the maximum', value: `${formattedTotal} USDC` },
      { label: 'EST. ARM reserved', value: armValue, accent: true },
    ]
  }

  if (isAdditionalCommit) {
    return [
      { label: 'Added', value: `${formattedAmount} USDC` },
      { label: 'Total committed', value: `${formattedTotal} USDC` },
      { label: 'EST. ARM reserved', value: armValue, accent: true },
    ]
  }

  return [
    { label: 'Committed', value: `${formattedAmount} USDC` },
    { label: 'EST. ARM reserved', value: armValue, accent: true },
  ]
}

export default function Step5Confirmation({
  canInvite = true,
  onInvite,
  onViewPosition,
  onBackToCrowdfund,
  onClose,
  amount = 1000,
  estimatedArm = 1000,
  isAdditionalCommit = false,
  totalCommittedUsdc,
  maxedOut = false,
  daysLeft = 3,
  secondsLeft,
  endsAt = null,
}: Step5ConfirmationProps) {
  const formattedAmount = formatUsd(amount)
  const totalCommitted = totalCommittedUsdc ?? estimatedArm
  const formattedTotal = formatUsd(totalCommitted)
  // Unlike the crowdfund mockup, a maxed-out participant keeps the Invite CTA:
  // the committer reaches this screen via the "already fully committed"
  // shortcut, where spending a free invite slot is the only way forward.
  const showInvite = canInvite && Boolean(onInvite)
  const shouldShowViewPosition = Boolean(onViewPosition)

  const headline = maxedOut
    ? "You're fully committed."
    : isAdditionalCommit
      ? 'Commitment updated.'
      : "You're in."

  const rows = summaryRows({
    maxedOut,
    isAdditionalCommit,
    formattedAmount,
    formattedTotal,
    estimatedArm,
  })

  return (
    <div className={styles.shell} data-flow-shell>
      <div className={styles.chromeRow}>
        <FlowChrome showBack={false} onClose={onClose ?? onBackToCrowdfund} />
      </div>

      <div className={styles.contentWrap}>
        <div className={styles.content}>
          <div className={styles.heroBlock}>
            <CheckCircleIcon className={styles.checkIcon} aria-hidden />
            <h1 className={styles.headline}>{headline}</h1>
          </div>

          <div className={styles.summaryCard}>
            {rows.map((row, i) => (
              <Fragment key={row.label}>
                {i > 0 ? <div className={styles.divider} aria-hidden /> : null}
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>{row.label}</span>
                  <span className={row.accent ? styles.summaryValueAccent : styles.summaryValue}>
                    {row.value}
                  </span>
                </div>
              </Fragment>
            ))}
          </div>

          <nav className={styles.resourceNav} aria-label="Useful links">
            <ul className={styles.iconLinkList}>
              {RESOURCE_LINKS.map(({ label, href, Icon }) => (
                <li key={href} className={styles.iconLinkItem}>
                  <a
                    className={styles.iconLink}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className={styles.iconTile}>
                      <Icon className={styles.brandIcon} aria-hidden />
                      <span className={styles.iconLabel}>
                        {label}
                        <span className={styles.visuallyHidden}> (opens in a new tab)</span>
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <WhatHappensNextSlider daysLeft={daysLeft} secondsLeft={secondsLeft} endsAt={endsAt} />
        </div>
        <div className={styles.contentFade} aria-hidden />
      </div>

      <div className={styles.footer}>
        <div className={styles.buttonRow}>
          {showInvite ? (
            <>
              {shouldShowViewPosition && onViewPosition && (
                <Button
                  variant="secondary"
                  size="lg"
                  label="View your position"
                  showIcon={false}
                  onClick={onViewPosition}
                />
              )}
              <Button
                variant="primary"
                size="lg"
                label="Whitelist a friend"
                showIcon={false}
                onClick={onInvite}
              />
            </>
          ) : (
            <>
              {onBackToCrowdfund && (
                <Button
                  variant="secondary"
                  size="lg"
                  label="Back to crowdfund"
                  showIcon={false}
                  onClick={onBackToCrowdfund}
                />
              )}
              {onViewPosition && (
                <Button
                  variant="primary"
                  size="lg"
                  label="View your position"
                  showIcon={false}
                  onClick={onViewPosition}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
