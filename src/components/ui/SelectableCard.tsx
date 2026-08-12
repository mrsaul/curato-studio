import type { ReactNode } from 'react'
import styles from './SelectableCard.module.css'

interface SelectableCardProps {
  selected?: boolean
  onClick?: () => void
  disabled?: boolean
  children: ReactNode
}

export function SelectableCard({
  selected = false,
  onClick,
  disabled = false,
  children,
}: SelectableCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        styles.card,
        selected ? styles.selected : '',
      ].filter(Boolean).join(' ')}
    >
      {children}
    </button>
  )
}
