// src/app/(reviewer)/queue/[id]/approve/ApproveActions.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1.5px solid var(--line-soft)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  fontSize: 14,
  fontFamily: 'var(--body)',
  lineHeight: 1.5,
  outline: 'none',
  boxSizing: 'border-box',
  resize: 'none',
}

export default function ApproveActions({
  requestId,
  initialCaption,
}: {
  requestId: string
  initialCaption: string
}) {
  const router = useRouter()
  const [caption, setCaption] = useState(initialCaption)
  const [direction, setDirection] = useState('')
  const [notes, setNotes] = useState('')
  const [improving, setImproving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleImprove() {
    if (!direction.trim() || improving) return
    setImproving(true)
    setError(null)
    try {
      const res = await fetch('/api/improve-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          current_caption: caption,
          direction: direction.trim(),
        }),
      })
      const json = await res.json() as { improved_caption?: string; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Improve failed')
      setCaption(json.improved_caption ?? caption)
      setDirection('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setImproving(false)
    }
  }

  async function handleDecision(decision: 'approved' | 'declined') {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          decision,
          edited_caption: caption !== initialCaption ? caption : undefined,
          notes: notes.trim() || undefined,
        }),
      })
      const json = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Review failed')
      router.push('/queue')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  const disabled = improving || submitting

  return (
    <div>
      {/* Caption textarea */}
      <p style={{
        fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
        textTransform: 'uppercase', marginBottom: 8,
      }}>
        Caption
      </p>
      <textarea
        value={caption}
        onChange={e => setCaption(e.target.value)}
        rows={6}
        disabled={disabled}
        style={{ ...inputStyle, marginBottom: 20, opacity: disabled ? 0.7 : 1 }}
      />

      {/* Improve with AI */}
      <p style={{
        fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
        textTransform: 'uppercase', marginBottom: 8,
      }}>
        Improve with AI
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          type="text"
          value={direction}
          onChange={e => setDirection(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleImprove()}
          placeholder="Make it shorter, more playful, add a hook…"
          disabled={disabled}
          style={{
            flex: 1,
            padding: '11px 14px',
            borderRadius: 10,
            border: '1.5px solid var(--line-soft)',
            background: 'var(--surface)',
            color: 'var(--ink)',
            fontSize: 14,
            fontFamily: 'var(--body)',
            outline: 'none',
            opacity: disabled ? 0.7 : 1,
          }}
        />
        <button
          onClick={handleImprove}
          disabled={!direction.trim() || disabled}
          style={{
            height: 46,
            paddingInline: 18,
            borderRadius: 100,
            background: 'var(--ink)',
            color: '#fff',
            border: 'none',
            fontSize: 12,
            fontFamily: 'var(--mono)',
            letterSpacing: '0.04em',
            cursor: !direction.trim() || disabled ? 'not-allowed' : 'pointer',
            opacity: !direction.trim() || disabled ? 0.5 : 1,
            whiteSpace: 'nowrap',
            transition: 'opacity 0.12s',
          }}
        >
          {improving ? 'Improving…' : '↑ Improve'}
        </button>
      </div>

      {/* Notes */}
      <p style={{
        fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
        textTransform: 'uppercase', marginBottom: 8,
      }}>
        Notes for creator (optional)
      </p>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Any context or guidance for the creator…"
        rows={2}
        disabled={disabled}
        style={{ ...inputStyle, marginBottom: 24, opacity: disabled ? 0.7 : 1 }}
      />

      {/* Error */}
      {error && (
        <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{error}</p>
      )}

      {/* Approve */}
      <button
        onClick={() => handleDecision('approved')}
        disabled={disabled}
        style={{
          width: '100%',
          minHeight: 'var(--touch)',
          borderRadius: 14,
          background: 'var(--green)',
          color: '#fff',
          border: 'none',
          fontSize: 15,
          marginBottom: 10,
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {submitting ? 'Sending…' : '✓ Approve & send to creator'}
      </button>

      {/* Decline */}
      <button
        onClick={() => handleDecision('declined')}
        disabled={disabled}
        style={{
          width: '100%',
          minHeight: 'var(--touch)',
          borderRadius: 14,
          background: 'none',
          color: 'var(--red)',
          border: '1.5px solid var(--red)',
          fontSize: 15,
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        Decline
      </button>
    </div>
  )
}
