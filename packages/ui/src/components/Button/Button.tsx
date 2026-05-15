// ABOUTME: Pill-shaped button primitive with primary/secondary/ghost/gradient variants and three sizes.
// ABOUTME: Ported byte-identical from the armada-crowdfund mockup; restyle via tokens, not edits here.

import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'gradient'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  label?: string
  showIcon?: boolean
  disabled?: boolean
  onClick?: () => void
  style?: React.CSSProperties
  className?: string
  type?: 'button' | 'submit' | 'reset'
}

const Arrow = () => (
  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
    <path d="M2 8H14M10 4L14 8L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export function Button({ variant = 'primary', size = 'md', label = 'Button', showIcon = true, disabled = false, onClick, className, type = 'button', style }: ButtonProps) {
  const cls = [
    styles.btn,
    styles[variant],
    styles[size],
    showIcon ? styles.icon : '',
    className ?? ''
  ].filter(Boolean).join(' ')

  return (
    <button type={type} className={cls} disabled={disabled} onClick={onClick} style={style}>
      <span>{label}</span>
      {showIcon && <span className={styles.iconWrap}><Arrow /></span>}
    </button>
  )
}
