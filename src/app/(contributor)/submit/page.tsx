'use client'

import { useRouter } from 'next/navigation'

export default function SubmitPage() {
  const router = useRouter()

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: 'calc(100dvh - 57px)', padding: '32px 0',
    }}>
      <p style={{
        fontSize: 22, fontFamily: 'var(--display)', fontWeight: 400,
        color: 'var(--ink)', letterSpacing: '-0.01em',
        textAlign: 'center', lineHeight: 1.3, marginBottom: 8,
      }}>
        What would you like to share?
      </p>
      <p style={{ fontSize: 14, color: 'var(--ink-faint)', marginBottom: 48, textAlign: 'center' }}>
        Tell us in your own words — voice, text, or photo.
      </p>
      <button
        onClick={() => router.push('/submit/input')}
        style={{
          background: 'var(--violet)', color: '#fff',
          border: 'none', borderRadius: 14,
          padding: '0 32px', minHeight: 'var(--touch)',
          fontSize: 15, letterSpacing: '0.01em',
          width: '100%', maxWidth: 280,
          cursor: 'pointer',
        }}
      >
        Create a post
      </button>
    </div>
  )
}
