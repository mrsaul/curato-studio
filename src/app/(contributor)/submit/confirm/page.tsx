'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

function ConfirmContent() {
  const router = useRouter()
  const params = useSearchParams()
  const mode = params.get('mode') as 'text' | 'voice' | 'photo' | null
  const text = params.get('text') ?? ''
  const transcript = params.get('transcript') ?? ''
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewerId, setReviewerId] = useState<string | null>(null)
  const [contextId, setContextId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/login'); return }
      // In a real implementation, reviewer_id and context_id come from an invite link
      // stored in sessionStorage or URL params. For MVP, look up the first available
      // reviewer from the contexts table (users who have a context record).
      supabase
        .from('contexts')
        .select('id, user_id')
        .neq('user_id', data.user.id)
        .limit(1)
        .then(({ data: ctxData }) => {
          if (ctxData?.[0]) {
            setReviewerId(ctxData[0].user_id as string)
            setContextId(ctxData[0].id as string)
          }
        })
    })
  }, [router])

  async function handleSubmit() {
    if (!reviewerId) { setError('No reviewer found'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewer_id: reviewerId,
          context_id: contextId,
          source_type: mode,
          raw_text: mode === 'text' ? text : undefined,
          transcript: mode === 'voice' ? transcript : undefined,
        }),
      })
      const json = await res.json() as { request?: { id: string }; error?: string }
      if (!json.request) throw new Error(json.error ?? 'Failed to create request')

      const requestId = json.request.id

      // Run interpret
      const interpretRes = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
      })
      if (!interpretRes.ok) throw new Error('Interpret failed')
      const interpretJson = await interpretRes.json() as { status?: string }

      if (interpretJson.status === 'draft_ready') {
        // Auto-generate draft
        const draftRes = await fetch('/api/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_id: requestId }),
        })
        if (!draftRes.ok) throw new Error('Draft generation failed')
      }

      router.push(`/submit/sent?id=${requestId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setLoading(false)
    }
  }

  const inputSummary = mode === 'voice' ? transcript : text

  return (
    <div style={{ paddingTop: 24, paddingBottom: 32 }}>
      <p style={{ fontSize: 18, fontFamily: 'var(--display)', marginBottom: 8, lineHeight: 1.3 }}>
        Here&apos;s what you said
      </p>
      <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '14px 16px', marginBottom: 28 }}>
        <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.6 }}>
          {inputSummary || `${mode} input`}
        </p>
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginBottom: 28, lineHeight: 1.5 }}>
        We&apos;ll turn this into an on-brand post and send it to your reviewer.
      </p>
      {error && (
        <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{error}</p>
      )}
      <button
        onClick={handleSubmit}
        disabled={loading || !reviewerId}
        style={{
          width: '100%', minHeight: 'var(--touch)', borderRadius: 14,
          background: 'var(--violet)', color: '#fff', border: 'none', fontSize: 15,
          opacity: (loading || !reviewerId) ? 0.6 : 1,
          cursor: (loading || !reviewerId) ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Sending…' : 'Send to reviewer'}
      </button>
    </div>
  )
}

export default function ConfirmPage() {
  return <Suspense><ConfirmContent /></Suspense>
}
