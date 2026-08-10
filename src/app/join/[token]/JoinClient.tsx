'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  token: string
  brandName: string
}

export default function JoinClient({ token, brandName }: Props) {
  const router = useRouter()
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleJoin() {
    setJoining(true)
    setError(null)
    try {
      const res = await fetch(`/api/join/${token}`, { method: 'POST' })
      const json = await res.json() as { ok?: boolean; error?: string }
      if (!json.ok) throw new Error(json.error ?? 'Failed to join')
      router.push('/submit')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setJoining(false)
    }
  }

  return (
    <>
      <p style={{ fontSize: 10, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-faint)', marginBottom: 12 }}>
        You&apos;ve been invited
      </p>
      <h1 style={{ fontSize: 30, fontWeight: 400, fontFamily: 'var(--display)', letterSpacing: '-0.02em', color: 'var(--ink)', marginBottom: 10 }}>
        {brandName}
      </h1>
      <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6, maxWidth: 260, margin: '0 auto 40px' }}>
        Join this brand to create content in their voice.
      </p>
      {error && (
        <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{error}</p>
      )}
      <button
        onClick={handleJoin}
        disabled={joining}
        style={{
          width: '100%', minHeight: 52, borderRadius: 100,
          background: joining ? 'var(--surface)' : 'var(--ink)',
          color: joining ? 'var(--ink-faint)' : '#fff',
          border: 'none', fontSize: 14, fontFamily: 'var(--mono)',
          letterSpacing: '0.06em', cursor: joining ? 'not-allowed' : 'pointer',
        }}
      >
        {joining ? 'Joining…' : `Join ${brandName} →`}
      </button>
    </>
  )
}
