'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Phase = 'idle' | 'generating' | 'choosing' | 'sending'

interface CaptionOption {
  style: string
  text: string
}

interface Draft {
  id: string
  caption_options: CaptionOption[]
  recommended_caption: string
  cta: string
  hashtags: string[]
}

function ConfirmContent() {
  const router = useRouter()
  const params = useSearchParams()
  const mode = params.get('mode') as 'text' | 'voice' | 'photo' | null
  const text = params.get('text') ?? ''
  const transcript = params.get('transcript') ?? ''
  const brandId = params.get('brandId') ?? ''
  const reviewerIdParam = params.get('reviewerId') ?? ''

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [reviewerId, setReviewerId] = useState<string | null>(reviewerIdParam || null)
  const [contextId, setContextId] = useState<string | null>(brandId || null)
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [photoMissing, setPhotoMissing] = useState(false)
  const [photoMimeType, setPhotoMimeType] = useState<string>('image/jpeg')
  const [requestId, setRequestId] = useState<string | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [captionOptions, setCaptionOptions] = useState<CaptionOption[]>([])
  const [selectedCaption, setSelectedCaption] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const supabase = createClient()
    supabase.auth.getUser()
      .then(({ data }) => {
        if (!mounted) return
        if (!data.user) { router.replace('/login'); return }
        // If brandId + reviewerId came from URL, skip the API call
        if (brandId && reviewerIdParam) return
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
  }, [mode, router, brandId, reviewerIdParam])

  useEffect(() => {
    return () => { if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl) }
  }, [photoPreviewUrl])

  async function handleGenerateOptions() {
    if (!reviewerId) { setError('No reviewer found'); return }
    setPhase('generating')
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

      const reqId = json.request.id
      setRequestId(reqId)

      const interpretRes = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: reqId }),
      })
      if (!interpretRes.ok) throw new Error('Interpret failed')
      const interpretJson = await interpretRes.json() as { status?: string }

      if (interpretJson.status !== 'draft_ready') {
        throw new Error('Could not interpret your input — please try again')
      }

      const draftRes = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: reqId }),
      })
      if (!draftRes.ok) throw new Error('Caption generation failed')
      const draftJson = await draftRes.json() as { draft?: Draft; error?: string }
      if (!draftJson.draft) throw new Error(draftJson.error ?? 'Draft generation failed')

      sessionStorage.removeItem('photo_blob_b64')
      setDraftId(draftJson.draft.id)
      setCaptionOptions(draftJson.draft.caption_options ?? [])
      setPhase('choosing')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setPhase('idle')
    }
  }

  async function handleSendToDirector() {
    if (!selectedCaption || !draftId || !requestId) return
    setPhase('sending')
    setError(null)
    try {
      const res = await fetch('/api/draft', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draftId, request_id: requestId, chosen_caption: selectedCaption }),
      })
      if (!res.ok) throw new Error('Failed to send to Director')
      router.push(`/submit/sent?id=${requestId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setPhase('choosing')
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

  if (phase === 'choosing' || phase === 'sending') {
    return (
      <div style={{ paddingTop: 24, paddingBottom: 48 }}>
        {photoPreviewUrl && (
          <img
            src={photoPreviewUrl}
            alt="Photo preview"
            style={{ width: '100%', borderRadius: 10, maxHeight: 180, objectFit: 'cover', marginBottom: 24 }}
          />
        )}
        <p style={{ fontSize: 16, fontFamily: 'var(--display)', marginBottom: 4, lineHeight: 1.3 }}>
          Pick your caption
        </p>
        <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginBottom: 20, lineHeight: 1.5 }}>
          Choose the version that sounds most like you.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
          {captionOptions.map((option) => {
            const isSelected = selectedCaption === option.text
            return (
              <button
                key={option.style}
                onClick={() => setSelectedCaption(option.text)}
                style={{
                  textAlign: 'left', cursor: 'pointer',
                  border: isSelected ? '2px solid var(--violet)' : '1.5px solid var(--line-soft)',
                  borderRadius: 12, padding: '14px 16px',
                  background: isSelected ? 'rgba(74,61,176,0.06)' : 'var(--surface)',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <p style={{
                  fontSize: 10, fontFamily: 'var(--mono)', textTransform: 'uppercase',
                  color: isSelected ? 'var(--violet)' : 'var(--ink-faint)',
                  marginBottom: 8, letterSpacing: '0.06em',
                }}>
                  {option.style}
                </p>
                <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.65, margin: 0 }}>
                  {option.text}
                </p>
              </button>
            )
          })}
        </div>

        {error && (
          <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{error}</p>
        )}

        <button
          onClick={handleSendToDirector}
          disabled={!selectedCaption || phase === 'sending'}
          style={{
            width: '100%', minHeight: 'var(--touch)', borderRadius: 14,
            background: 'var(--violet)', color: '#fff', border: 'none', fontSize: 15,
            opacity: (!selectedCaption || phase === 'sending') ? 0.5 : 1,
            cursor: (!selectedCaption || phase === 'sending') ? 'not-allowed' : 'pointer',
          }}
        >
          {phase === 'sending' ? 'Sending…' : 'Send to Director'}
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

      {phase === 'generating' ? (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <p style={{ fontSize: 14, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
            Crafting 3 caption ideas…
          </p>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginBottom: 28, lineHeight: 1.5 }}>
            AI will generate 3 caption options for you to choose from before sending to your Director.
          </p>
          {error && (
            <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{error}</p>
          )}
          <button
            onClick={handleGenerateOptions}
            disabled={!reviewerId || (mode === 'photo' && !photoBlob)}
            style={{
              width: '100%', minHeight: 'var(--touch)', borderRadius: 14,
              background: 'var(--violet)', color: '#fff', border: 'none', fontSize: 15,
              opacity: (!reviewerId || (mode === 'photo' && !photoBlob)) ? 0.6 : 1,
              cursor: (!reviewerId || (mode === 'photo' && !photoBlob)) ? 'not-allowed' : 'pointer',
            }}
          >
            Generate caption options
          </button>
        </>
      )}
    </div>
  )
}

export default function ConfirmPage() {
  return <Suspense><ConfirmContent /></Suspense>
}
