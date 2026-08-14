'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
  </svg>
)

const ListIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2 4.5h12M2 8h12M2 11.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

export default function ContributorBottomNav({ needsAttention = 0 }: { needsAttention?: number }) {
  const pathname = usePathname()

  const tabs = [
    { label: 'CREATE', href: '/submit',   icon: <PlusIcon />, active: pathname.startsWith('/submit'), badge: 0 },
    { label: 'WORK',   href: '/requests', icon: <ListIcon />, active: pathname === '/requests', badge: needsAttention },
  ]

  return (
    <nav data-app-nav style={{
      position: 'fixed',
      bottom: 'calc(20px + env(safe-area-inset-bottom))',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--ink)',
      borderRadius: 100,
      padding: 5,
      display: 'flex',
      gap: 2,
      boxShadow: '0 4px 28px rgba(26,23,20,0.28)',
      zIndex: 200,
      maxWidth: 'calc(100vw - 32px)',
    }}>
      {tabs.map(tab => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-label={tab.badge > 0 ? `${tab.label}, ${tab.badge} need your attention` : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '9px clamp(14px, 5vw, 20px)',
            borderRadius: 100,
            background: tab.active ? 'rgba(255,255,255,0.13)' : 'transparent',
            color: tab.active ? '#fff' : 'rgba(255,255,255,0.62)',
            textDecoration: 'none',
            fontSize: 11,
            fontFamily: 'var(--mono)',
            letterSpacing: '0.06em',
            minHeight: 48,
            transition: 'background 0.15s, color 0.15s',
            whiteSpace: 'nowrap',
            position: 'relative',
          }}
        >
          {tab.icon}
          {tab.label}
          {/* Trailing pill rather than an overlay on the icon: these tabs are
              horizontal icon+label, so a badge pinned to the icon lands on the
              text. */}
          {tab.badge > 0 && (
            <span
              aria-hidden="true"
              style={{
                minWidth: 17, height: 17, padding: '0 5px',
                borderRadius: 100, background: 'var(--alert)',
                color: '#fff', fontSize: 10, fontFamily: 'var(--mono)',
                lineHeight: '17px', textAlign: 'center',
                flexShrink: 0,
              }}
            >
              {tab.badge > 9 ? '9+' : tab.badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  )
}
