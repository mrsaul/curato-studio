'use client'

import { useState, useEffect } from 'react'

export default function CaptionShare({ requestId }: { requestId: string }) {
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [caption, setCaption] = useState<string | null>(null)
  const [notes, setNotes] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/draft-caption?request_id=${requestId}`)
      .then(r => r.json())
      .then((json: { caption?: string; notes?: string }) => {
        setCaption(json.caption ?? null)
        setNotes(json.notes ?? null)
      })
      .catch(() => { /* non-critical */ })
  }, [requestId])

  function buildText() {
    return caption ?? ''
  }

  async function handleCopy() {
    setLoading(true)
    try {
      await navigator.clipboard.writeText(buildText())
      setFeedback('Copied!')
      setTimeout(() => setFeedback(null), 2000)
    } catch {
      setFeedback('Could not copy')
      setTimeout(() => setFeedback(null), 2000)
    } finally {
      setLoading(false)
    }
  }

  async function handleShare() {
    setLoading(true)
    try {
      const text = buildText()
      if (navigator.share) {
        await navigator.share({ text })
      } else {
        await navigator.clipboard.writeText(text)
        setFeedback('Copied!')
        setTimeout(() => setFeedback(null), 2000)
      }
    } catch {
      // user cancelled share or error
    } finally {
      setLoading(false)
    }
  }

  const btnBase: React.CSSProperties = {
    flex: 1,
    height: 36,
    borderRadius: 8,
    fontSize: 12,
    fontFamily: 'var(--mono)',
    letterSpacing: '0.04em',
    border: '1px solid var(--line-soft)',
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.6 : 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    transition: 'opacity 0.1s',
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ height: 1, background: 'var(--line-soft)', marginBottom: 12 }} />

      {/* Approved caption text */}
      {caption && (
        <p style={{
          fontSize: 14,
          color: 'var(--ink)',
          lineHeight: 1.6,
          marginBottom: notes ? 8 : 12,
          padding: '10px 12px',
          background: 'var(--bg)',
          borderRadius: 8,
          border: '1px solid var(--line-soft)',
        }}>
          {caption}
        </p>
      )}

      {/* Director notes */}
      {notes && (
        <p style={{
          fontSize: 12,
          color: 'var(--ink-faint)',
          lineHeight: 1.5,
          marginBottom: 12,
          fontStyle: 'italic',
        }}>
          Note from director: {notes}
        </p>
      )}

      {feedback && (
        <p style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--green)', marginBottom: 8, letterSpacing: '0.04em' }}>
          {feedback}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleCopy}
          disabled={loading || !caption}
          style={{ ...btnBase, background: 'var(--surface)', color: 'var(--ink)', opacity: (!caption || loading) ? 0.4 : 1 }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M1 9V2a1 1 0 011-1h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          Copy caption
        </button>
        <button
          onClick={handleShare}
          disabled={loading || !caption}
          style={{ ...btnBase, background: 'var(--ink)', color: '#fff', border: 'none', opacity: (!caption || loading) ? 0.4 : 1 }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M9 1.5l2.5 2.5L9 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M11.5 4H5a3 3 0 000 6h1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          Share
        </button>
      </div>
    </div>
  )
}
