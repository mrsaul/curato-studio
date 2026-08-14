'use client'

import { useState } from 'react'

interface Member {
  userId: string
  email: string
  joinedAt: string
  requestCount: number
}

interface Props {
  brandId: string
  initialMembers: Member[]
  initialToken: string
  inviteUrl: string
}

export default function CreatorsClient({ brandId, initialMembers, initialToken: _initialToken, inviteUrl: initialUrl }: Props) {
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [currentUrl, setCurrentUrl] = useState(initialUrl)
  const [removing, setRemoving] = useState<Set<string>>(new Set())
  const [regenerating, setRegenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(currentUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleRegenerate() {
    if (!confirm('Regenerate the invite link? The current link will stop working immediately.')) return
    setRegenerating(true)
    try {
      const res = await fetch(`/api/studio/brands/${brandId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate' }),
      })
      if (!res.ok) return
      const json = await res.json() as { token: string; url: string }
      setCurrentUrl(json.url)
    } finally {
      setRegenerating(false)
    }
  }

  async function handleRemove(userId: string) {
    setRemoving(prev => new Set(prev).add(userId))
    try {
      const res = await fetch(`/api/studio/brands/${brandId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (res.ok) setMembers(prev => prev.filter(m => m.userId !== userId))
    } finally {
      setRemoving(prev => { const s = new Set(prev); s.delete(userId); return s })
    }
  }

  function daysAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'today'
    if (days === 1) return '1 day ago'
    return `${days} days ago`
  }

  return (
    <div>
      {members.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginBottom: 24 }}>
          No creators yet — share the invite link below.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {members.map(m => (
            <div
              key={m.userId}
              style={{
                background: 'var(--surface)', border: '1px solid var(--line-soft)',
                borderRadius: 12, padding: '12px 14px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div>
                <p style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 2 }}>{m.email}</p>
                <p style={{ fontSize: 10, color: 'var(--ink-faint)' }}>
                  joined {daysAgo(m.joinedAt)} · {m.requestCount} request{m.requestCount !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => handleRemove(m.userId)}
                disabled={removing.has(m.userId)}
                style={{
                  fontSize: 11, color: '#c0392b', background: 'none', border: 'none',
                  cursor: removing.has(m.userId) ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--mono)', opacity: removing.has(m.userId) ? 0.5 : 1,
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 9, fontFamily: 'var(--mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
        Invite link
      </p>
      <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, border: '1px solid var(--line-soft)' }}>
        <div style={{
          background: 'var(--violet-subtle)', borderRadius: 8, padding: '8px 10px',
          fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--violet)',
          marginBottom: 10, wordBreak: 'break-all',
        }}>
          {currentUrl || 'Generating…'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleCopy}
            disabled={!currentUrl}
            style={{
              flex: 1, background: 'var(--ink)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 0', fontSize: 11,
              fontFamily: 'var(--mono)', cursor: currentUrl ? 'pointer' : 'not-allowed',
            }}
          >
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            style={{
              flex: 1, background: 'var(--surface)', color: 'var(--ink-soft)',
              border: '1px solid var(--line-soft)', borderRadius: 8,
              padding: '10px 0', fontSize: 11, fontFamily: 'var(--mono)',
              cursor: regenerating ? 'not-allowed' : 'pointer',
              opacity: regenerating ? 0.5 : 1,
            }}
          >
            {regenerating ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>
        <p style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 8, textAlign: 'center' }}>
          Regenerating invalidates the old link
        </p>
      </div>
    </div>
  )
}
