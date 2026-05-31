// ABOUTME: Deposit amount card — chain dropdown, large mono amount, balance/fee row. Matches crowdfund showcase DepositAmountCard.
// ABOUTME: Chain list from parent (network config); icons via @web3icons when mapped, else letter fallback.

import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDownIcon, WalletIcon } from '@heroicons/react/24/solid'
import TokenUSDC from '@web3icons/react/icons/tokens/TokenUSDC'
import { hasActiveAmount, sanitizeAmountInput } from '@/utils/amountInput'
import { chainIconForChainId } from '@/components/deposit/depositChainIcons'
import styles from './DepositAmountCard.module.css'

const ICON_SIZE = 32

export interface DepositChainOption {
  chainId: number
  label: string
}

export interface DepositAmountCardProps {
  chains: ReadonlyArray<DepositChainOption>
  chainId: number
  onChainIdChange?: (chainId: number) => void
  token?: string
  amount: string
  onAmountChange: (value: string) => void
  balance?: string
  fee?: string
  onMax?: () => void
  error?: string
}

function ChainIcon({ chainId, label }: { chainId: number; label: string }) {
  const Icon = chainIconForChainId(chainId)
  if (Icon) {
    return (
      <span className={styles.chainIconSlot} aria-hidden>
        <Icon size={ICON_SIZE} variant="branded" />
      </span>
    )
  }
  return (
    <span className={styles.chainIconSlot} aria-hidden>
      {label.charAt(0).toUpperCase()}
    </span>
  )
}

export function DepositAmountCard({
  chains,
  chainId,
  onChainIdChange,
  token = 'USDC',
  amount,
  onAmountChange,
  balance = '0.00',
  fee = '0.00',
  onMax,
  error,
}: DepositAmountCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const chainRootRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const amountInputId = useId()

  const selected = chains.find((c) => c.chainId === chainId) ?? chains[0]
  const chainSelectable = Boolean(onChainIdChange) && chains.length > 1

  useEffect(() => {
    if (!menuOpen) return
    function handlePointerDown(event: MouseEvent) {
      if (!chainRootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [menuOpen])

  function selectChain(nextId: number) {
    onChainIdChange?.(nextId)
    setMenuOpen(false)
  }

  function handleAmountInput(raw: string) {
    const next = sanitizeAmountInput(raw)
    onAmountChange(hasActiveAmount(next) ? next : '')
  }

  const showActiveAmount = hasActiveAmount(amount)

  return (
    <div className={styles.card}>
      <div className={styles.topRow}>
        <div className={styles.chainRoot} ref={chainRootRef}>
          {chainSelectable ? (
            <button
              type="button"
              className={styles.chainTrigger}
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              aria-controls={listboxId}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <ChainIcon chainId={chainId} label={selected?.label ?? ''} />
              <span className={styles.chainName}>{selected?.label}</span>
              <ChevronDownIcon className={styles.chevron} aria-hidden />
            </button>
          ) : (
            <div className={styles.chainTriggerStatic}>
              <ChainIcon chainId={chainId} label={selected?.label ?? ''} />
              <span className={styles.chainName}>{selected?.label}</span>
            </div>
          )}

          {menuOpen && chainSelectable ? (
            <ul id={listboxId} className={styles.chainMenu} role="listbox" aria-label="Network">
              {chains.map((option) => (
                <li key={option.chainId} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.chainId === chainId}
                    className={styles.chainOption}
                    onClick={() => selectChain(option.chainId)}
                  >
                    <ChainIcon chainId={option.chainId} label={option.label} />
                    <span className={styles.chainOptionLabel}>{option.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className={styles.tokenGroup}>
          <span className={styles.tokenIconSlot} aria-hidden>
            <TokenUSDC size={ICON_SIZE} variant="branded" />
          </span>
          <span className={styles.tokenName}>{token}</span>
        </div>
      </div>

      <label className={styles.amountWrapper} htmlFor={amountInputId}>
        <span className={styles.visuallyHidden}>Deposit amount</span>
        <span
          className={[styles.amountField, showActiveAmount && styles.amountFieldHasValue]
            .filter(Boolean)
            .join(' ')}
        >
          <span
            className={[styles.amountDisplay, showActiveAmount && styles.amountDisplayActive]
              .filter(Boolean)
              .join(' ')}
            aria-hidden="true"
          >
            {showActiveAmount ? amount : '0'}
          </span>
          <input
            id={amountInputId}
            type="text"
            inputMode="decimal"
            className={styles.amountInput}
            value={amount}
            onChange={(e) => handleAmountInput(e.target.value)}
            aria-label="Deposit amount"
            aria-invalid={Boolean(error)}
          />
        </span>
      </label>

      {error ? (
        <p className={styles.amountError} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.bottomRow}>
        <div className={styles.balanceGroup}>
          <WalletIcon className={styles.walletIcon} aria-hidden />
          <span className={styles.balanceText}>{balance}</span>
          {onMax ? (
            <button type="button" className={styles.maxBtn} onClick={onMax}>
              Max
            </button>
          ) : null}
        </div>
        <span className={styles.feeText}>
          FEE {fee} {token}
        </span>
      </div>
    </div>
  )
}
