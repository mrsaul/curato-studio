'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ReviewActions({
  requestId,
  defaultCaption,
}: {
  requestId: string
  defaultCaption: string
}) {
  const router = useRouter()
  const [editedCaption, setEditedCaption] = useState(defaultCaption)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(decision: 'approved' | 'changes_requested' | 'declined') {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          decision,
          edited_caption: editedCaption !== defaultCaption ? editedCaption : undefined,
          notes: notes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const json = await res.json() as { error?: string }
        throw new Error(json.error ?? 'Review failed')
      }
      const json = await res.json() as { ok?: boolean; error?: string }
      if (!json.ok) throw new Error(json.error ?? 'Review failed')
      router.push('/queue')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <section style={{ marginTop: 24 }}>
      <p style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 8 }}>
        Edit caption (optional)
      </p>
      <textarea
        value={editedCaption}
        onChange={e => setEditedCaption(e.target.value)}
        rows={5}
        style={{
          width: '100%', padding: '12px 14px', borderRadius: 10,
          border: '1.5px solid var(--field-line)', background: 'var(--field)',
          color: 'var(--ink)', fontSize: 14, resize: 'none', fontFamily: 'var(--body)',
          lineHeight: 1.5, marginBottom: 10,
          boxSizing: 'border-box',
        }}
      />
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Notes for contributor (optional)"
        rows={2}
        style={{
          width: '100%', padding: '12px 14px', borderRadius: 10,
          border: '1.5px solid var(--field-line)', background: 'var(--field)',
          color: 'var(--ink)', fontSize: 14, resize: 'none', fontFamily: 'var(--body)',
          lineHeight: 1.5, marginBottom: 16,
          boxSizing: 'border-box',
        }}
      />
      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
      <button
        onClick={() => submit('approved')}
        disabled={loading}
        style={{
          width: '100%', minHeight: 'var(--touch)', borderRadius: 14,
          background: 'var(--green)', color: '#fff', border: 'none',
          fontSize: 15, marginBottom: 10, opacity: loading ? 0.6 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        Approve
      </button>
      <button
        onClick={() => submit('changes_requested')}
        disabled={loading}
        style={{
          width: '100%', minHeight: 'var(--touch)', borderRadius: 14,
          background: 'var(--surface)', color: 'var(--ink)',
          border: '1.5px solid var(--line-soft)', fontSize: 15, marginBottom: 10,
          opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        Request changes
      </button>
      <button
        onClick={() => submit('declined')}
        disabled={loading}
        style={{
          width: '100%', minHeight: 'var(--touch)', borderRadius: 14,
          background: 'none', color: 'var(--red)',
          border: '1.5px solid var(--red)', fontSize: 15,
          opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        Decline
      </button>
    </section>
  )
}
