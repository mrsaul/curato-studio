'use client'

import { useRouter } from 'next/navigation'

export default function SubmitPage() {
  const router = useRouter()

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      minHeight: 'calc(100dvh - 57px - 96px)',
      padding: '40px 0 20px',
    }}>
      {/* Eyebrow */}
      <p className="fade-up" style={{
        fontFamily: 'var(--mono)',
        fontSize: 10,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--ink-faint)',
        marginBottom: 20,
      }}>
        New brief
      </p>

      {/* Editorial headline */}
      <h1 className="fade-up fade-up-1" style={{
        fontFamily: 'var(--display)',
        fontSize: 34,
        fontWeight: 400,
        letterSpacing: '-0.025em',
        lineHeight: 1.15,
        color: 'var(--ink)',
        marginBottom: 16,
      }}>
        What&apos;s the<br />
        story today?
      </h1>

      {/* Divider */}
      <div className="fade-up fade-up-1" style={{
        width: 32,
        height: 1,
        background: 'var(--line)',
        marginBottom: 20,
      }} />

      <p className="fade-up fade-up-2" style={{
        fontSize: 14,
        color: 'var(--ink-soft)',
        lineHeight: 1.6,
        marginBottom: 48,
        maxWidth: 260,
      }}>
        Voice, text, or photo — share it in your own words. Your art director does the rest.
      </p>

      <button
        className="fade-up fade-up-3"
        onClick={() => router.push('/submit/input')}
        style={{
          background: 'var(--ink)',
          color: '#fff',
          border: 'none',
          borderRadius: 100,
          padding: '0 28px',
          height: 52,
          fontSize: 13,
          fontFamily: 'var(--mono)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          width: 'fit-content',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        Start a brief
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  )
}
