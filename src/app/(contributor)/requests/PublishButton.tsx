'use client'

import { useState } from 'react'
import { PublishFormat } from '@/types/instagram'

const InstagramIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.9" />
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.9" />
    <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" />
  </svg>
)

export default function PublishButton({
  requestId, hasImage, alreadyPublished,
}: {
  requestId: string
  hasImage: boolean
  alreadyPublished: { format: PublishFormat; permalink: string | null }[]
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<PublishFormat | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(alreadyPublished)

  const publishedFormats = new Set(done.map(d => d.format))
  const permalink = done.find(d => d.permalink)?.permalink ?? null

  async function publish(format: PublishFormat) {
    setBusy(format)
    setError(null)
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, format }),
      })
      const json = await res.json() as { ok?: boolean; permalink?: string | null; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Could not publish.')
      setDone(d => [...d, { format, permalink: json.permalink ?? null }])
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  const btn: React.CSSProperties = {
    flex: 1, minHeight: 'var(--touch)', borderRadius: 'var(--r-sm)',
    fontSize: 'var(--text-sm)', fontFamily: 'var(--mono)', letterSpacing: '0.04em',
    border: '1px solid var(--line-soft)', background: 'var(--surface)',
    color: 'var(--ink)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  }

  if (!hasImage) {
    return (
      <p style={{
        fontSize: 'var(--text-sm)', color: 'var(--ink-faint)',
        marginTop: 'var(--space-3)', lineHeight: 'var(--leading-normal)',
      }}>
        Instagram posts need an image.
      </p>
    )
  }

  return (
    <div style={{ marginTop: 'var(--space-3)' }}>
      {error && (
        <p role="alert" style={{
          fontSize: 'var(--text-sm)', color: 'var(--red)',
          marginBottom: 'var(--space-2)', lineHeight: 'var(--leading-normal)',
        }}>
          {error}
        </p>
      )}

      {publishedFormats.size > 0 && (
        <p style={{
          fontSize: 'var(--text-sm)', fontFamily: 'var(--mono)',
          color: 'var(--green)', marginBottom: 'var(--space-2)',
        }}>
          Posted to Instagram
          {permalink && (
            <> · <a href={permalink} target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--violet)' }}>View</a></>
          )}
        </p>
      )}

      {!open ? (
        <button style={{ ...btn, width: '100%' }} onClick={() => setOpen(true)}>
          <InstagramIcon /> Publish to Instagram
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            style={{ ...btn, opacity: publishedFormats.has('feed') ? 0.4 : 1 }}
            disabled={busy !== null || publishedFormats.has('feed')}
            onClick={() => publish('feed')}
          >
            {busy === 'feed' ? 'Posting…' : 'Feed post'}
          </button>
          <button
            style={{ ...btn, opacity: publishedFormats.has('story') ? 0.4 : 1 }}
            disabled={busy !== null || publishedFormats.has('story')}
            onClick={() => publish('story')}
          >
            {busy === 'story' ? 'Posting…' : 'Story'}
          </button>
        </div>
      )}
    </div>
  )
}
