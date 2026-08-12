import type { ReactNode } from 'react'

interface DashedCardProps {
  children: ReactNode
  accent?: boolean
  onClick?: () => void
}

export function DashedCard({ children, accent = false, onClick }: DashedCardProps) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
      style={{
        border: '1.5px dashed var(--line-soft)',
        borderRadius: 'var(--r-xl)',
        padding: '14px var(--space-4)',
        textAlign: 'center',
        color: accent ? 'var(--violet)' : 'var(--ink-faint)',
        fontSize: 'var(--text-base)',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </div>
  )
}
