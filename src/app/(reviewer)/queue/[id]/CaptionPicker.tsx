'use client'

import { useState } from 'react'
import { CaptionOption } from '@/types/request'
import { Button, SectionLabel, InlineError } from '@/components/ui'
import { useQueueExit } from './exit-context'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1.5px solid var(--field-line)',
  background: 'var(--field)',
  color: 'var(--ink)',
  fontSize: 14,
  fontFamily: 'var(--body)',
  lineHeight: 1.6,
  boxSizing: 'border-box',
  resize: 'none',
}

export default function CaptionPicker({
  requestId,
  options,
  recommendedCaption,
}: {
  requestId: string
  options: CaptionOption[]
  recommendedCaption: string | null
}) {
  const triggerExit = useQueueExit()
  const [caption, setCaption] = useState(recommendedCaption ?? options[0]?.text ?? '')
  const [direction, setDirection] = useState('')
  const [notes, setNotes] = useState('')
  const [improving, setImproving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAlternatives, setShowAlternatives] = useState(false)

  const alternatives = options.filter(o => o.text !== caption || o.text !== recommendedCaption)
  const otherOptions = options.filter(o => o.text !== caption)

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
          ...(decision === 'approved' ? { edited_caption: caption } : {}),
          notes: notes.trim() || undefined,
        }),
      })
      const json = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Review failed')
      triggerExit(decision === 'approved' ? 'left' : 'right')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  const disabled = improving || submitting

  return (
    <div>
      {/* Editable caption — always open */}
      <SectionLabel marginBottom={8}>Caption</SectionLabel>
      <textarea
        value={caption}
        onChange={e => setCaption(e.target.value)}
        rows={6}
        disabled={disabled}
        style={{ ...inputStyle, marginBottom: 16, opacity: disabled ? 0.7 : 1 }}
      />

      {/* Improve with AI */}
      <SectionLabel marginBottom={8}>Improve with AI</SectionLabel>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          type="text"
          value={direction}
          onChange={e => setDirection(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleImprove()}
          placeholder="Shorter, more playful, add a hook…"
          disabled={disabled}
          style={{
            flex: 1, padding: '11px 14px', borderRadius: 10,
            border: '1.5px solid var(--field-line)', background: 'var(--field)',
            color: 'var(--ink)', fontSize: 14, fontFamily: 'var(--body)',
            opacity: disabled ? 0.7 : 1,
          }}
        />
        <button
          onClick={handleImprove}
          disabled={!direction.trim() || disabled}
          style={{
            height: 46, paddingInline: 18, borderRadius: 100,
            background: 'var(--ink)', color: '#fff', border: 'none',
            fontSize: 12, fontFamily: 'var(--mono)', letterSpacing: '0.04em',
            cursor: !direction.trim() || disabled ? 'not-allowed' : 'pointer',
            opacity: !direction.trim() || disabled ? 0.5 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {improving ? 'Improving…' : '↑ Improve'}
        </button>
      </div>

      {/* Other options — collapsible */}
      {otherOptions.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => setShowAlternatives(v => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              display: 'flex', alignItems: 'center', gap: 6, padding: 0, marginBottom: 8,
            }}
          >
            {showAlternatives ? '↑ Hide' : '↓ Other options'}
          </button>
          {showAlternatives && otherOptions.map(opt => (
            <button
              key={opt.style}
              onClick={() => { setCaption(opt.text); setShowAlternatives(false) }}
              style={{
                width: '100%', textAlign: 'left', cursor: 'pointer',
                border: '1px solid var(--line-soft)', borderRadius: 10,
                padding: '12px 14px', background: 'var(--surface)',
                marginBottom: 8,
              }}
            >
              <p style={{
                fontSize: 10, fontFamily: 'var(--mono)', textTransform: 'uppercase',
                color: 'var(--ink-faint)', marginBottom: 4,
              }}>
                {opt.style} — tap to use
              </p>
              <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.6, margin: 0 }}>
                {opt.text}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Notes for creator */}
      <SectionLabel marginBottom={8}>Notes for creator (optional)</SectionLabel>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Any context or guidance…"
        rows={2}
        disabled={disabled}
        style={{ ...inputStyle, marginBottom: 24, opacity: disabled ? 0.7 : 1 }}
      />

      {error && (
        <div style={{ marginBottom: 16 }}>
          <InlineError>{error}</InlineError>
        </div>
      )}

      {/* Approve */}
      <div style={{ marginBottom: 10 }}>
        <Button variant="action" fullWidth onClick={() => handleDecision('approved')} disabled={disabled}>
          {submitting ? 'Sending…' : '✓ Approve & send to creator'}
        </Button>
      </div>

      {/* Decline */}
      <Button variant="ghost" fullWidth onClick={() => handleDecision('declined')} disabled={disabled}>
        Decline
      </Button>
    </div>
  )
}
