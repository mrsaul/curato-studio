import type { ReactNode } from 'react'

type TagVariant = 'accent' | 'neutral' | 'status'

const variantStyles: Record<TagVariant, { background: string; color: string }> = {
  accent:  { background: 'var(--violet-subtle)', color: 'var(--violet)' },
  neutral: { background: 'var(--bg)',            color: 'var(--ink-faint)' },
  status:  { background: 'var(--amber-surface)', color: 'var(--amber-text)' },
}

export function Tag({
  children,
  variant = 'neutral',
}: {
  children: ReactNode
  variant?: TagVariant
}) {
  return (
    <span
      style={{
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--mono)',
        letterSpacing: 'var(--tracking-wider)',
        borderRadius: 4,
        padding: '2px 5px',
        display: 'inline-block',
        ...variantStyles[variant],
      }}
    >
      {children}
    </span>
  )
}
