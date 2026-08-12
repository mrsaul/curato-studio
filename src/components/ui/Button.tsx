import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'cta' | 'action' | 'ghost' | 'text' | 'compact'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  fullWidth?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  fullWidth = false,
  disabled,
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={[
        styles.btn,
        styles[variant],
        fullWidth ? styles.fullWidth : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}
