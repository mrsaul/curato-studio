'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
  </svg>
)

const ListIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M2 4.5h12M2 8h12M2 11.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

export default function ContributorBottomNav() {
  const pathname = usePathname()

  const tabs = [
    { label: 'CREATE', href: '/submit', icon: <PlusIcon />, active: pathname.startsWith('/submit') },
    { label: 'WORK', href: '/requests', icon: <ListIcon />, active: pathname === '/requests' },
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
          }}
        >
          {tab.icon}
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
