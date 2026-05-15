// ABOUTME: App header with logo, centered nav, wallet button, and gradient CTA; auto-hides on scroll.
// ABOUTME: Ported from the mockup; the local ArmadaLogo SVG was hoisted to a sibling primitive for reuse.

import { useEffect, useRef, useState } from 'react'
import { ArmadaLogo } from '../ArmadaLogo'
import { NavBar, NavBarItem } from '../NavBar'
import { Button } from '../Button'
import styles from './Header.module.css'

export interface HeaderProps {
  navItems?: NavBarItem[]
  ctaLabel?: string
  onCtaClick?: () => void
  walletAddress?: string
  onWalletClick?: () => void
  className?: string
  /** Hide header when scrolling down; show when scrolling up (near top always visible). */
  autoHideOnScroll?: boolean
}

const DEFAULT_NAV: NavBarItem[] = [
  { label: 'The project' },
  { label: 'Crowdfund', active: true },
  { label: 'My position' },
  { label: 'Claim' },
]

const SCROLL_DELTA = 6

export function Header({
  navItems = DEFAULT_NAV,
  ctaLabel = 'Participate',
  onCtaClick,
  walletAddress = '0x63c2...84c6',
  onWalletClick,
  className,
  autoHideOnScroll = true,
}: HeaderProps) {
  const [concealed, setConcealed] = useState(false)
  const lastY = useRef(0)

  useEffect(() => {
    if (!autoHideOnScroll) {
      setConcealed(false)
      return
    }

    lastY.current = window.scrollY

    const onScroll = () => {
      const y = window.scrollY
      if (y < 48) {
        setConcealed(false)
      } else if (y > lastY.current + SCROLL_DELTA) {
        setConcealed(true)
      } else if (y < lastY.current - SCROLL_DELTA) {
        setConcealed(false)
      }
      lastY.current = y
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [autoHideOnScroll])

  return (
    <header
      className={[styles.header, concealed && styles.concealed, className].filter(Boolean).join(' ')}
    >
      <div className={styles.logo}>
        <ArmadaLogo />
      </div>
      <div className={styles.nav}>
        <NavBar items={navItems} />
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.walletBtn} onClick={onWalletClick} aria-label="Wallet">
          <span className={styles.walletIcon} aria-hidden />
          <span className={styles.walletText}>{walletAddress}</span>
        </button>
        <Button variant="gradient" size="md" label={ctaLabel} showIcon onClick={onCtaClick} />
      </div>
    </header>
  )
}
