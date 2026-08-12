import type { ReactNode } from 'react'

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      style={{
        color: 'var(--red)',
        fontSize: 'var(--text-base)',
        lineHeight: 'var(--leading-normal)',
        marginBottom: 'var(--space-4)',
      }}
    >
      {children}
    </p>
  )
}
