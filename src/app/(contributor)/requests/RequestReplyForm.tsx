'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RequestReplyForm({
  requestId,
  question,
}: {
  requestId: string
  question: string
}) {
  const router = useRouter()
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit() {
    if (!reply.trim()) return
    setLoading(true)
    setError(null)
    try {
      const clarifyRes = await fetch('/api/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, reply: reply.trim() }),
      })
      if (!clarifyRes.ok) throw new Error('Could not send reply')

      const draftRes = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
      })
      if (!draftRes.ok) throw new Error('Could not generate draft')

      setDone(true)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginTop: 10, fontFamily: 'var(--mono)' }}>
        Sent to your reviewer.
      </p>
    )
  }

  return (
    <div style={{ marginTop: 10 }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: 8 }}>
        {question}
      </p>
      <textarea
        value={reply}
        onChange={e => setReply(e.target.value)}
        placeholder="Type your answer…"
        rows={3}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8,
          border: '1.5px solid var(--line-soft)', background: 'var(--bg)',
          color: 'var(--ink)', fontSize: 14, resize: 'none',
          fontFamily: 'var(--body)', lineHeight: 1.5, outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {error && (
        <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{error}</p>
      )}
      <button
        onClick={handleSubmit}
        disabled={loading || !reply.trim()}
        style={{
          marginTop: 8, width: '100%', minHeight: 'var(--touch)',
          background: reply.trim() ? 'var(--violet)' : 'var(--surface)',
          color: reply.trim() ? '#fff' : 'var(--ink-faint)',
          border: 'none', borderRadius: 10, fontSize: 14,
          cursor: loading || !reply.trim() ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Sending…' : 'Send answer'}
      </button>
    </div>
  )
}
