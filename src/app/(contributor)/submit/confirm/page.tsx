'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Button, SelectableCard, SectionLabel, InlineError } from '@/components/ui'

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

  async function handleGetCaptionIdeas() {
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
        throw new Error('Could not understand your input — please go back and try again')
      }

      const draftRes = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: reqId }),
      })
      if (!draftRes.ok) throw new Error('Could not write caption ideas')
      const draftJson = await draftRes.json() as { draft?: Draft; error?: string }
      if (!draftJson.draft) throw new Error(draftJson.error ?? 'Could not write caption ideas')

      sessionStorage.removeItem('photo_blob_b64')
      setDraftId(draftJson.draft.id)
      setCaptionOptions(draftJson.draft.caption_options ?? [])
      setPhase('choosing')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setPhase('idle')
    }
  }

  async function handleSendForReview() {
    if (!selectedCaption || !draftId || !requestId) return
    setPhase('sending')
    setError(null)
    try {
      const res = await fetch('/api/draft', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draftId, request_id: requestId, chosen_caption: selectedCaption }),
      })
      if (!res.ok) throw new Error('Failed to send for review')
      router.push(`/submit/sent?id=${requestId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setPhase('choosing')
    }
  }

  function handleTryAgain() {
    setPhase('idle')
    setSelectedCaption(null)
    setCaptionOptions([])
    setDraftId(null)
    setRequestId(null)
    setError(null)
  }

  const inputSummary = mode === 'voice' ? transcript : text

  // Photo missing error state
  if (mode === 'photo' && photoMissing) {
    return (
      <div style={{ paddingTop: 24 }}>
        <InlineError>Photo not found — please go back and add it again.</InlineError>
        <Button variant="text" onClick={() => router.back()}>← Go back</Button>
      </div>
    )
  }

  // Caption picker phase
  if (phase === 'choosing' || phase === 'sending') {
    return (
      <div style={{ paddingTop: 24, paddingBottom: 48 }}>
        {photoPreviewUrl && (
          <img
            src={photoPreviewUrl}
            alt="Photo preview"
            style={{
              width: '100%', borderRadius: 'var(--r-lg)',
              maxHeight: 200, objectFit: 'cover', marginBottom: 'var(--space-6)',
            }}
          />
        )}

        <h1 style={{
          fontSize: 'var(--text-xl)', fontFamily: 'var(--display)', fontWeight: 400,
          color: 'var(--ink)', marginBottom: 'var(--space-2)', lineHeight: 'var(--leading-tight)',
        }}>
          Pick your caption
        </h1>
        <p style={{
          fontSize: 'var(--text-base)', color: 'var(--ink-faint)',
          marginBottom: 'var(--space-5)', lineHeight: 'var(--leading-normal)',
        }}>
          Choose the version that sounds most like you.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
          {captionOptions.map((option) => {
            const isSelected = selectedCaption === option.text
            return (
              <SelectableCard
                key={option.style}
                selected={isSelected}
                onClick={() => setSelectedCaption(option.text)}
              >
                <SectionLabel marginBottom="var(--space-2)">{option.style}</SectionLabel>
                <p style={{ fontSize: 'var(--text-base)', color: 'var(--ink)', lineHeight: 'var(--leading-relaxed)', margin: 0 }}>
                  {option.text}
                </p>
              </SelectableCard>
            )
          })}
        </div>

        {error && <InlineError>{error}</InlineError>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Button
            variant="cta"
            fullWidth
            onClick={handleSendForReview}
            disabled={!selectedCaption || phase === 'sending'}
          >
            {phase === 'sending' ? 'Sending…' : 'Send for review'}
          </Button>
          <Button variant="text" onClick={handleTryAgain}>
            ← Try again
          </Button>
        </div>
      </div>
    )
  }

  // Generating (loading) state
  if (phase === 'generating') {
    return (
      <div style={{ paddingTop: 24, paddingBottom: 32 }}>
        {photoPreviewUrl && (
          <img
            src={photoPreviewUrl}
            alt="Photo preview"
            style={{
              width: '100%', borderRadius: 'var(--r-lg)',
              maxHeight: 200, objectFit: 'cover', marginBottom: 'var(--space-6)',
            }}
          />
        )}
        <div style={{
          background: 'var(--surface)', borderRadius: 'var(--r-xl)',
          border: '1px solid var(--line-soft)',
          padding: 'var(--space-8)', textAlign: 'center',
          marginTop: 'var(--space-4)',
        }}>
          <p className="pulse" style={{
            fontSize: 'var(--text-md)', color: 'var(--ink)',
            marginBottom: 'var(--space-2)', fontFamily: 'var(--display)',
          }}>
            Writing caption ideas…
          </p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)' }}>
            This takes a few seconds
          </p>
        </div>
      </div>
    )
  }

  // Idle phase — review content + CTA
  return (
    <div style={{ paddingTop: 24, paddingBottom: 32 }}>
      <button
        onClick={() => router.back()}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--ink-faint)', fontSize: 'var(--text-sm)',
          fontFamily: 'var(--mono)', letterSpacing: 'var(--tracking-wide)',
          textTransform: 'uppercase', padding: 0,
          marginBottom: 'var(--space-5)', display: 'block',
        }}
      >
        ← Edit
      </button>

      {photoPreviewUrl && mode === 'photo' ? (
        <>
          <h2 style={{
            fontSize: 'var(--text-md)', fontFamily: 'var(--display)', fontWeight: 400,
            color: 'var(--ink)', marginBottom: 'var(--space-3)',
          }}>
            Your photo
          </h2>
          <img
            src={photoPreviewUrl}
            alt="Photo preview"
            style={{
              width: '100%', borderRadius: 'var(--r-lg)',
              maxHeight: 300, objectFit: 'cover', marginBottom: 'var(--space-6)',
            }}
          />
        </>
      ) : mode !== 'photo' ? (
        <>
          <h2 style={{
            fontSize: 'var(--text-md)', fontFamily: 'var(--display)', fontWeight: 400,
            color: 'var(--ink)', marginBottom: 'var(--space-3)',
          }}>
            {mode === 'voice' ? 'Here\'s what you said' : 'Here\'s what you wrote'}
          </h2>
          <div style={{
            background: 'var(--surface)', borderRadius: 'var(--r-md)',
            border: '1px solid var(--line-soft)',
            padding: 'var(--space-4)', marginBottom: 'var(--space-6)',
          }}>
            <p style={{ fontSize: 'var(--text-base)', color: 'var(--ink)', lineHeight: 'var(--leading-relaxed)', margin: 0 }}>
              {inputSummary || (mode ? `${mode} input` : 'input')}
            </p>
          </div>
        </>
      ) : null}

      {error && <InlineError>{error}</InlineError>}

      <Button
        variant="cta"
        fullWidth
        onClick={handleGetCaptionIdeas}
        disabled={!reviewerId || (mode === 'photo' && !photoBlob)}
      >
        Get caption ideas
      </Button>
    </div>
  )
}

export default function ConfirmPage() {
  return <Suspense><ConfirmContent /></Suspense>
}
