'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const InboxIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M1.5 8.5h3.5l1.5 2h3l1.5-2h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
)

const ClockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M8 5.5V8.5l2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const StudioIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 2l1.5 3.5H13l-2.8 2 1.1 3.5L8 9 4.7 11 5.8 7.5 3 5.5h3.5L8 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
  </svg>
)

export default function ReviewerBottomNav() {
  const pathname = usePathname()

  const tabs = [
    {
      label: 'QUEUE',
      href: '/queue',
      icon: <InboxIcon />,
      active: pathname === '/queue' || pathname.startsWith('/queue/'),
    },
    {
      label: 'DONE',
      href: '/history',
      icon: <ClockIcon />,
      active: pathname === '/history',
    },
    {
      label: 'STUDIO',
      href: '/studio',
      icon: <StudioIcon />,
      active: pathname === '/studio' || pathname.startsWith('/studio/'),
    },
  ]

  return (
    <nav style={{
      position: 'fixed',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--ink)',
      borderRadius: 100,
      padding: 5,
      display: 'flex',
      gap: 2,
      boxShadow: '0 4px 28px rgba(26,23,20,0.28)',
      zIndex: 200,
    }}>
      {tabs.map(tab => (
        <Link
          key={tab.href}
          href={tab.href}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '9px 20px',
            borderRadius: 100,
            background: tab.active ? 'rgba(255,255,255,0.13)' : 'transparent',
            color: tab.active ? '#fff' : 'rgba(255,255,255,0.38)',
            textDecoration: 'none',
            fontSize: 11,
            fontFamily: 'var(--mono)',
            letterSpacing: '0.06em',
            minHeight: 44,
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
