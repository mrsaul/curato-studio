'use client'

import { useState, useRef, useCallback, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button, InlineError } from '@/components/ui'
import PhotoEditor, { PhotoEditorHandle } from './PhotoEditor'

type InputMode = 'text' | 'voice' | 'photo'
type RecordingState = 'idle' | 'recording' | 'processing'

const modeLabel: Record<InputMode, string> = {
  text: 'Write',
  voice: 'Voice note',
  photo: 'Photo',
}

const ArrowLeftIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M19 12H5m0 0 6-6m-6 6 6 6" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const MicIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="9" y="2" width="6" height="11.5" rx="3" stroke="currentColor" strokeWidth="1.75" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18.5V22" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
)

const ImageIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
    <circle cx="8.75" cy="10" r="1.4" fill="currentColor" />
    <path d="m3.5 17 4.4-4.4a2 2 0 0 1 2.83 0L15 17m1.9-3.2 1.2-1.2a2 2 0 0 1 2.83 0l.57.57"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function InputPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const brandId = searchParams.get('brandId') ?? ''
  const reviewerId = searchParams.get('reviewerId') ?? ''
  const startParam = searchParams.get('start')
  const [mode, setMode] = useState<InputMode>(
    startParam === 'voice' || startParam === 'photo' ? startParam : 'text',
  )
  const [text, setText] = useState('')
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [transcript, setTranscript] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const photoEditorRef = useRef<PhotoEditorHandle>(null)

  async function startRecording() {
    if (recordingState !== 'idle') return
    setError(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Microphone access is off. Check your phone\'s settings to allow it.')
      return
    }
    const recorder = new MediaRecorder(stream)
    chunksRef.current = []
    recorder.ondataavailable = e => chunksRef.current.push(e.data)
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      setRecordingState('processing')
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const fd = new FormData()
      fd.append('audio', blob)
      try {
        const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
        const json = await res.json() as { transcript?: string; error?: string }
        if (json.transcript) setTranscript(json.transcript)
        else setError(json.error ?? 'Could not understand the recording — please try again.')
      } catch {
        setError('Could not send the recording — please try again.')
      }
      setRecordingState('idle')
    }
    mediaRef.current = recorder
    recorder.start()
    setRecordingState('recording')
  }

  function stopRecording() {
    mediaRef.current?.stop()
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (photoUrl) URL.revokeObjectURL(photoUrl)
    setPhotoFile(file)
    setPhotoUrl(URL.createObjectURL(file))
  }

  useEffect(() => {
    return () => { if (photoUrl) URL.revokeObjectURL(photoUrl) }
  }, [photoUrl])

  function canContinue() {
    if (mode === 'text') return text.trim().length > 0
    if (mode === 'voice') return transcript.length > 0
    if (mode === 'photo') return photoFile !== null
    return false
  }

  const handleContinue = useCallback(async () => {
    const carry = new URLSearchParams()
    if (brandId) carry.set('brandId', brandId)
    if (reviewerId) carry.set('reviewerId', reviewerId)

    if (mode === 'photo' && photoEditorRef.current) {
      setExporting(true)
      setError(null)
      try {
        const blob = await photoEditorRef.current.triggerExport()
        const b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(new Error('FileReader failed'))
          reader.readAsDataURL(blob)
        })
        sessionStorage.setItem('photo_blob_b64', b64)
        setExporting(false)
        carry.set('mode', 'photo')
        router.push(`/submit/confirm?${carry.toString()}`)
      } catch {
        setError('Could not save the photo. Please try again.')
        setExporting(false)
      }
      return
    }
    carry.set('mode', mode)
    if (mode === 'text') carry.set('text', text)
    if (mode === 'voice') carry.set('transcript', transcript)
    router.push(`/submit/confirm?${carry.toString()}`)
  }, [mode, text, transcript, router, brandId, reviewerId])

  const ok = canContinue()
  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  // Compose mode owns the viewport: lock the page behind it and hide the
  // floating nav, which otherwise paints over the composer at z-index 200.
  useEffect(() => {
    if (mode !== 'text') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('composing')
    return () => {
      document.body.style.overflow = prev
      document.body.classList.remove('composing')
    }
  }, [mode])

  const chipButton: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    background: 'var(--surface)', border: '1px solid var(--line-soft)',
    borderRadius: 'var(--r-full)', padding: '0 16px',
    minHeight: 'var(--touch)', cursor: 'pointer',
    fontSize: 'var(--text-base)', fontFamily: 'var(--body)',
    color: 'var(--ink-soft)', whiteSpace: 'nowrap',
  }

  /* ─── Write: a full-screen note surface, nothing else on screen ─── */
  if (mode === 'text') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'var(--field)',
        maxWidth: 430, margin: '0 auto',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Top bar — back, and a quiet word count */}
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'calc(4px + env(safe-area-inset-top)) clamp(12px, 4vw, 16px) 0 clamp(8px, 3vw, 12px)',
        }}>
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              minWidth: 'var(--touch)', minHeight: 'var(--touch)',
              color: 'var(--ink-soft)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ArrowLeftIcon />
          </button>
          <span aria-hidden="true" style={{
            fontSize: 'var(--text-sm)', fontFamily: 'var(--mono)',
            color: 'var(--ink-faint)',
          }}>
            {words > 0 ? `${words} ${words === 1 ? 'word' : 'words'}` : ''}
          </span>
        </div>

        {/* The page */}
        <div style={{
          flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
          padding: '0 clamp(16px, 5vw, 24px)', overflowY: 'auto',
        }}>
          <h1 id="compose-title" style={{
            fontSize: 'clamp(26px, 7.5vw, 32px)', fontWeight: 400,
            fontFamily: 'var(--display)', color: 'var(--ink)',
            lineHeight: 'var(--leading-tight)', letterSpacing: '-0.02em',
            margin: '4px 0 var(--space-4)', flexShrink: 0,
          }}>
            What&apos;s the idea?
          </h1>

          <textarea
            className="compose-field"
            autoFocus
            aria-labelledby="compose-title"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Start typing…"
            style={{
              flex: 1, width: '100%', minHeight: 180,
              border: 'none', background: 'transparent', padding: 0,
              color: 'var(--ink)',
              fontSize: 'clamp(21px, 6vw, 26px)',
              fontFamily: 'var(--body)',
              lineHeight: 1.45, letterSpacing: '-0.01em',
              resize: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Bottom — stays empty until there's something to do */}
        <div style={{
          flexShrink: 0, padding: '8px clamp(16px, 5vw, 24px)',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        }}>
          {error && (
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <InlineError>{error}</InlineError>
            </div>
          )}

          {words === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
              flexWrap: 'wrap',
            }}>
              <button style={chipButton} onClick={() => { setMode('voice'); setError(null) }}>
                <MicIcon /> Voice note
              </button>
              <button style={chipButton} onClick={() => { setMode('photo'); setError(null) }}>
                <ImageIcon /> Photo
              </button>
            </div>
          ) : (
            <Button variant="primary" fullWidth onClick={handleContinue}>
              Continue
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 24, paddingBottom: 32 }}>
      <button
        onClick={() => { setMode('text'); setError(null) }}
        style={{
          background: 'none', border: 'none', padding: '0 0 var(--space-4)',
          minHeight: 'var(--touch)', cursor: 'pointer',
          fontSize: 'var(--text-base)', fontFamily: 'var(--body)',
          color: 'var(--violet)', display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <ArrowLeftIcon /> Back to writing
      </button>

      <h1 style={{
        fontSize: 'var(--text-2xl)', fontWeight: 400,
        fontFamily: 'var(--display)', color: 'var(--ink)',
        marginBottom: 'var(--space-6)', lineHeight: 'var(--leading-tight)',
      }}>
        {modeLabel[mode]}
      </h1>

      {/* Voice note */}
      {mode === 'voice' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
          {recordingState === 'processing' ? (
            <p className="pulse" style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-base)', marginTop: 16 }}>
              Working on it…
            </p>
          ) : (
            <>
              <button
                onPointerDown={startRecording}
                onPointerUp={stopRecording}
                onPointerLeave={stopRecording}
                aria-label={recordingState === 'recording' ? 'Release to stop recording' : 'Hold to record a voice note'}
                style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: recordingState === 'recording' ? 'var(--red)' : 'var(--violet)',
                  border: 'none', color: 'var(--ink-on-dark)',
                  fontSize: 10, fontFamily: 'var(--mono)',
                  letterSpacing: 0, lineHeight: 1.3, textAlign: 'center',
                  cursor: 'pointer',
                  boxShadow: recordingState === 'recording' ? '0 0 0 8px var(--red-soft)' : 'none',
                  transition: 'background var(--duration-base), box-shadow var(--duration-base)',
                }}
              >
                {recordingState === 'recording' ? 'Release\nto stop' : 'Hold to\nrecord'}
              </button>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)', textAlign: 'center' }}>
                {recordingState === 'recording' ? 'Recording…' : 'Hold the button and speak'}
              </p>
            </>
          )}
          {transcript && (
            <div style={{
              background: 'var(--surface)', borderRadius: 'var(--r-md)',
              padding: 'var(--space-4)', width: '100%',
              border: '1px solid var(--line-soft)',
            }}>
              <p style={{ fontSize: 'var(--text-base)', color: 'var(--ink)', lineHeight: 'var(--leading-relaxed)', margin: 0 }}>
                {transcript}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Photo */}
      {mode === 'photo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhoto}
            style={{ display: 'none' }}
          />
          {photoUrl ? (
            <>
              <PhotoEditor ref={photoEditorRef} sourceUrl={photoUrl} />
              <Button variant="text" onClick={() => fileInputRef.current?.click()}>
                Use a different photo
              </Button>
            </>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%', minHeight: 180, borderRadius: 'var(--r-md)',
                background: 'var(--surface)', border: '2px dashed var(--line-soft)',
                color: 'var(--ink-faint)', fontSize: 'var(--text-base)', cursor: 'pointer',
              }}
            >
              Add a photo
            </button>
          )}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <InlineError>{error}</InlineError>
        </div>
      )}

      <div style={{ marginTop: 'var(--space-8)' }}>
        <Button
          variant="primary"
          fullWidth
          onClick={handleContinue}
          disabled={!ok || exporting}
        >
          {exporting ? 'One moment…' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}

export default function InputPage() {
  return <Suspense><InputPageInner /></Suspense>
}
