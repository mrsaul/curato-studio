'use client'

import { useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { Button } from '@/components/ui'

function CheckCircle() {
  return (
    <div
      className="success-circle"
      style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'var(--green)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 'var(--space-6)',
      }}
    >
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <polyline
          className="success-check"
          points="7,16 13,22 25,10"
          stroke="white" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

function SentContent() {
  const router = useRouter()

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: 'calc(100dvh - 57px)',
      padding: '32px 0', textAlign: 'center',
    }}>
      <CheckCircle />

      <h1
        className="success-text-1"
        style={{
          fontSize: 'var(--text-2xl)', fontWeight: 400,
          fontFamily: 'var(--display)', color: 'var(--ink)',
          marginBottom: 'var(--space-2)', lineHeight: 'var(--leading-tight)',
        }}
      >
        It&apos;s on its way!
      </h1>
      <p
        className="success-text-2"
        style={{
          fontSize: 'var(--text-base)', color: 'var(--ink-faint)',
          marginBottom: 'var(--space-10)', lineHeight: 'var(--leading-relaxed)',
          maxWidth: 260,
        }}
      >
        Your Art Director will review it soon. Check your history to see when it&apos;s approved.
      </p>

      <div
        className="success-text-3"
        style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
      >
        <Button variant="cta" fullWidth onClick={() => router.push('/requests')}>
          See my history
        </Button>
        <Button variant="text" onClick={() => router.push('/submit')}>
          Create another post
        </Button>
      </div>
    </div>
  )
}

export default function SentPage() {
  return <Suspense><SentContent /></Suspense>
}
