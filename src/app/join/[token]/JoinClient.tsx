'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, InlineError } from '@/components/ui'

interface Props {
  token: string
  brandName: string
}

function JoinedState({ brandName }: { brandName: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
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
      <h1
        className="success-text-1"
        style={{
          fontSize: 'var(--text-2xl)', fontWeight: 400, fontFamily: 'var(--display)',
          color: 'var(--ink)', marginBottom: 'var(--space-2)', lineHeight: 'var(--leading-tight)',
        }}
      >
        You&apos;re in!
      </h1>
      <p
        className="success-text-2"
        style={{
          fontSize: 'var(--text-base)', color: 'var(--ink-faint)',
          lineHeight: 'var(--leading-relaxed)', maxWidth: 240,
        }}
      >
        Welcome to {brandName}. Taking you to your workspace…
      </p>
    </div>
  )
}

export default function JoinClient({ token, brandName }: Props) {
  const router = useRouter()
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleJoin() {
    setJoining(true)
    setError(null)
    try {
      const res = await fetch(`/api/join/${token}`, { method: 'POST' })
      const json = await res.json() as { ok?: boolean; error?: string }
      if (!json.ok) throw new Error(json.error ?? 'Failed to join')
      setJoined(true)
      setTimeout(() => router.push('/submit'), 1400)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setJoining(false)
    }
  }

  if (joined) return <JoinedState brandName={brandName} />

  return (
    <>
      <p style={{
        fontSize: 'var(--text-xs)', fontFamily: 'var(--mono)',
        textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)',
        color: 'var(--ink-faint)', marginBottom: 'var(--space-3)',
      }}>
        You&apos;ve been invited
      </p>
      <h1 style={{
        fontSize: 30, fontWeight: 400, fontFamily: 'var(--display)',
        letterSpacing: '-0.02em', color: 'var(--ink)', marginBottom: 'var(--space-3)',
      }}>
        {brandName}
      </h1>
      <p style={{
        fontSize: 'var(--text-base)', color: 'var(--ink-soft)',
        lineHeight: 'var(--leading-relaxed)', maxWidth: 280,
        margin: '0 auto var(--space-10)',
      }}>
        Join {brandName} and you&apos;ll be able to send ideas for their posts.
      </p>

      {error && <InlineError>{error}</InlineError>}

      <Button variant="cta" fullWidth onClick={handleJoin} disabled={joining}>
        {joining ? 'Joining…' : `Join ${brandName}`}
      </Button>
    </>
  )
}
