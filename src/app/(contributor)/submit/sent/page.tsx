'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function SentContent() {
  const router = useRouter()
  const params = useSearchParams()
  const id = params.get('id')

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: 'calc(100dvh - 57px)',
      padding: '32px 0', textAlign: 'center',
    }}>
      <div style={{ fontSize: 48, marginBottom: 24 }}>✓</div>
      <p style={{ fontSize: 20, fontFamily: 'var(--display)', marginBottom: 8, lineHeight: 1.3 }}>
        Sent to your reviewer
      </p>
      <p style={{ fontSize: 14, color: 'var(--ink-faint)', marginBottom: 40, lineHeight: 1.5, maxWidth: 260 }}>
        We&apos;ll let you know when it&apos;s ready. You can check the status in your requests.
      </p>
      <button
        onClick={() => router.push('/requests')}
        style={{
          background: 'var(--surface)', color: 'var(--ink)',
          border: '1.5px solid var(--line-soft)', borderRadius: 14,
          padding: '0 28px', minHeight: 'var(--touch)', fontSize: 14,
          marginBottom: 12, cursor: 'pointer',
        }}
      >
        See my requests
      </button>
      <button
        onClick={() => router.push('/submit')}
        style={{ background: 'none', border: 'none', color: 'var(--violet)', fontSize: 14, cursor: 'pointer' }}
      >
        Create another post
      </button>
    </div>
  )
}

export default function SentPage() {
  return <Suspense><SentContent /></Suspense>
}
