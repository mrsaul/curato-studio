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
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [photoMissing, setPhotoMissing] = useState(false)
  const [photoMimeType, setPhotoMimeType] = useState<string>('image/jpeg')

  useEffect(() => {
    let mounted = true
    const supabase = createClient()
    supabase.auth.getUser()
      .then(({ data }) => {
        if (!mounted) return
        if (!data.user) { router.replace('/login'); return }
        return fetch('/api/reviewer')
          .then(r => r.json())
          .then((json: { reviewer?: { id: string; context_id: string } }) => {
            if (!mounted) return
            if (json.reviewer) {
              setReviewerId(json.reviewer.id)
              setContextId(json.reviewer.context_id)
            } else {
              setError('No reviewer found for your account')
            }
          })
      })
      .catch(() => {
        if (mounted) setError('Could not load reviewer — please try again')
      })

    if (mode === 'photo') {
      const b64 = sessionStorage.getItem('photo_blob_b64')
      if (!b64) {
        if (mounted) setPhotoMissing(true)
      } else {
        try {
          const parts = b64.split(',')
          const mime = parts[0].split(':')[1].split(';')[0]
          const byteStr = atob(parts[1])
          const ab = new ArrayBuffer(byteStr.length)
          const ia = new Uint8Array(ab)
          for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i)
          const blob = new Blob([ab], { type: mime })
          if (mounted) {
            setPhotoMimeType(mime)
            setPhotoBlob(blob)
            const url = URL.createObjectURL(blob)
            setPhotoPreviewUrl(url)
          }
        } catch {
          if (mounted) setPhotoMissing(true)
        }
      }
    }

    return () => { mounted = false }
  }, [mode, router])

  useEffect(() => {
    return () => { if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl) }
  }, [photoPreviewUrl])

  async function handleSubmit() {
    if (!reviewerId) { setError('No reviewer found'); return }
    setLoading(true)
    setError(null)
    try {
      let photoUrl: string | null = null

      if (mode === 'photo' && photoBlob) {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')
        const ext = photoMimeType.split('/')[1] ?? 'jpg'
        const filename = `${user.id}/${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('post-photos')
          .upload(filename, photoBlob, { contentType: photoMimeType, upsert: false })
        if (uploadError) throw new Error('Photo upload failed: ' + uploadError.message)
        const { data: { publicUrl } } = supabase.storage
          .from('post-photos')
          .getPublicUrl(filename)
        photoUrl = publicUrl
      }

      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewer_id: reviewerId,
          context_id: contextId,
          source_type: mode,
          raw_text: mode === 'text' ? text : undefined,
          transcript: mode === 'voice' ? transcript : undefined,
          photo_url: photoUrl ?? undefined,
        }),
      })
      const json = await res.json() as { request?: { id: string }; error?: string }
      if (!json.request) throw new Error(json.error ?? 'Failed to create request')

      const requestId = json.request.id

      const interpretRes = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
      })
      if (!interpretRes.ok) throw new Error('Interpret failed')
      const interpretJson = await interpretRes.json() as { status?: string }

      if (interpretJson.status === 'draft_ready') {
        const draftRes = await fetch('/api/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_id: requestId }),
        })
        if (!draftRes.ok) throw new Error('Draft generation failed')
      }

      sessionStorage.removeItem('photo_blob_b64')
      setLoading(false)
      router.push(`/submit/sent?id=${requestId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setLoading(false)
    }
  }

  const inputSummary = mode === 'voice' ? transcript : text

  if (mode === 'photo' && photoMissing) {
    return (
      <div style={{ paddingTop: 24 }}>
        <p style={{ color: 'var(--red)', marginBottom: 16 }}>
          Photo not found — please go back and try again.
        </p>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: 'var(--violet)', cursor: 'pointer', fontSize: 14 }}
        >
          ← Go back
        </button>
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 24, paddingBottom: 32 }}>
      {photoPreviewUrl && mode === 'photo' ? (
        <>
          <p style={{ fontSize: 18, fontFamily: 'var(--display)', marginBottom: 12, lineHeight: 1.3 }}>
            Your edited photo
          </p>
          <img
            src={photoPreviewUrl}
            alt="Photo preview"
            style={{ width: '100%', borderRadius: 10, maxHeight: 300, objectFit: 'cover', marginBottom: 28 }}
          />
        </>
      ) : mode !== 'photo' ? (
        <>
          <p style={{ fontSize: 18, fontFamily: 'var(--display)', marginBottom: 8, lineHeight: 1.3 }}>
            Here&apos;s what you said
          </p>
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '14px 16px', marginBottom: 28 }}>
            <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.6 }}>
              {inputSummary || (mode ? `${mode} input` : 'input')}
            </p>
          </div>
        </>
      ) : null}
      <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginBottom: 28, lineHeight: 1.5 }}>
        We&apos;ll turn this into an on-brand post and send it to your reviewer.
      </p>
      {error && (
        <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{error}</p>
      )}
      <button
        onClick={handleSubmit}
        disabled={loading || !reviewerId || (mode === 'photo' && !photoBlob)}
        style={{
          width: '100%', minHeight: 'var(--touch)', borderRadius: 14,
          background: 'var(--violet)', color: '#fff', border: 'none', fontSize: 15,
          opacity: (loading || !reviewerId || (mode === 'photo' && !photoBlob)) ? 0.6 : 1,
          cursor: (loading || !reviewerId || (mode === 'photo' && !photoBlob)) ? 'not-allowed' : 'pointer',
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
