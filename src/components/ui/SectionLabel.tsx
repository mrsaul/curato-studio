import type { ReactNode, CSSProperties } from 'react'

interface SectionLabelProps {
  children: ReactNode
  marginBottom?: string | number
}

export function SectionLabel({ children, marginBottom = 'var(--space-2)' }: SectionLabelProps) {
  const style: CSSProperties = {
    display: 'block',
    fontSize: 'var(--text-sm)',
    fontFamily: 'var(--mono)',
    color: 'var(--ink-faint)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--tracking-wider)',
    marginBottom,
  }
  return <span style={style}>{children}</span>
}
