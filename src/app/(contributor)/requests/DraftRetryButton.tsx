'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DraftRetryButton({ requestId }: { requestId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRetry() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
      })
      if (!res.ok) throw new Error('Draft generation failed')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      {error && (
        <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 6 }}>{error}</p>
      )}
      <button
        onClick={handleRetry}
        disabled={loading}
        style={{
          width: '100%', minHeight: 'var(--touch)', borderRadius: 10,
          background: 'var(--violet)', color: '#fff', border: 'none', fontSize: 14,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Generating…' : 'Generate draft'}
      </button>
    </div>
  )
}
