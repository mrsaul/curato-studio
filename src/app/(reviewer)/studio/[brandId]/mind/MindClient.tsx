'use client'

import { useState } from 'react'
import { Judgment } from '@/types/brand'

export default function MindClient({ brandId, initialPending, initialConfirmed }: {
  brandId: string
  initialPending: Judgment[]
  initialConfirmed: Judgment[]
}) {
  const [pending, setPending] = useState<Judgment[]>(initialPending)
  const [confirmed, setConfirmed] = useState<Judgment[]>(initialConfirmed)
  const [acting, setActing] = useState<string | null>(null)

  async function decide(judgment: Judgment, status: 'confirmed' | 'rejected') {
    setActing(judgment.id)
    try {
      const res = await fetch(`/api/studio/brands/${brandId}/mind/${judgment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        setPending(prev => prev.filter(j => j.id !== judgment.id))
        if (status === 'confirmed') setConfirmed(prev => [{ ...judgment, status: 'confirmed' }, ...prev])
      }
    } finally {
      setActing(null)
    }
  }

  return (
    <div>
      {pending.length === 0 && confirmed.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--ink-faint)' }}>No judgments yet. They appear here after each approved review.</p>
      )}

      {pending.length === 0 && confirmed.length > 0 && (
        <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginBottom: 16 }}>All caught up — no new learnings to review.</p>
      )}

      {pending.length > 0 && (
        <>
          <p style={{ fontSize: 9, fontFamily: 'var(--mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#c9960a', marginBottom: 10 }}>{pending.length} pending</p>
          {pending.map(j => (
            <div key={j.id} style={{ background: '#fffbe8', border: '1px solid #f0d060', borderRadius: 12, padding: 12, marginBottom: 10 }}>
              <p style={{ fontSize: 11, color: 'var(--ink)', lineHeight: 1.4, marginBottom: 12 }}>
                <span style={{ fontFamily: 'var(--mono)', color: '#c9960a', fontSize: 10 }}>{j.verb}: </span>
                {j.statement}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => decide(j, 'confirmed')}
                  disabled={acting === j.id}
                  style={{ flex: 1, background: 'var(--ink)', color: '#fff', border: 'none', borderRadius: 8, padding: 8, fontSize: 11, fontFamily: 'var(--mono)', cursor: 'pointer' }}
                >
                  ✓ Confirm
                </button>
                <button
                  onClick={() => decide(j, 'rejected')}
                  disabled={acting === j.id}
                  style={{ flex: 1, background: '#fff', color: 'var(--ink-faint)', border: '1px solid var(--line-soft)', borderRadius: 8, padding: 8, fontSize: 11, fontFamily: 'var(--mono)', cursor: 'pointer' }}
                >
                  ✗ Reject
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {confirmed.length > 0 && (
        <>
          <p style={{ fontSize: 9, fontFamily: 'var(--mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8, marginTop: pending.length > 0 ? 16 : 0 }}>{confirmed.length} confirmed</p>
          {confirmed.map(j => (
            <div key={j.id} style={{ background: 'var(--surface)', borderRadius: 10, padding: 10, marginBottom: 6, border: '1px solid var(--line-soft)' }}>
              <p style={{ fontSize: 10, color: 'var(--ink-faint)', lineHeight: 1.4 }}>
                ✓ <span style={{ fontFamily: 'var(--mono)' }}>{j.verb}:</span> {j.statement}
              </p>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
