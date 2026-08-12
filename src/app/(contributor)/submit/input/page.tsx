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

function InputPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const brandId = searchParams.get('brandId') ?? ''
  const reviewerId = searchParams.get('reviewerId') ?? ''
  const [mode, setMode] = useState<InputMode>('text')
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

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 4px', fontSize: 'var(--text-sm)',
    fontFamily: 'var(--mono)', letterSpacing: 'var(--tracking-wide)',
    textTransform: 'uppercase',
    background: active ? 'var(--violet)' : 'var(--surface)',
    color: active ? 'var(--ink-on-dark)' : 'var(--ink-soft)',
    border: 'none', cursor: 'pointer', minHeight: 'var(--touch)',
    transition: 'background var(--duration-base), color var(--duration-base)',
  })

  return (
    <div style={{ paddingTop: 24, paddingBottom: 32 }}>
      <h1 style={{
        fontSize: 'var(--text-2xl)', fontWeight: 400,
        fontFamily: 'var(--display)', color: 'var(--ink)',
        marginBottom: 'var(--space-5)', lineHeight: 'var(--leading-tight)',
      }}>
        What&apos;s the idea?
      </h1>

      {/* Mode switcher */}
      <div style={{
        display: 'flex', borderRadius: 'var(--r-md)', overflow: 'hidden',
        marginBottom: 'var(--space-6)', border: '1.5px solid var(--line-soft)',
      }}>
        {(['text', 'voice', 'photo'] as InputMode[]).map(m => (
          <button key={m} onClick={() => { setMode(m); setError(null) }} style={tabStyle(mode === m)}>
            {modeLabel[m]}
          </button>
        ))}
      </div>

      {/* Write */}
      {mode === 'text' && (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Write what you'd like to share…"
          rows={6}
          style={{
            width: '100%', padding: 'var(--space-4)', borderRadius: 'var(--r-md)',
            border: '1.5px solid var(--line-soft)', background: 'var(--surface)',
            color: 'var(--ink)', fontSize: 'var(--text-md)', resize: 'none',
            fontFamily: 'var(--body)', lineHeight: 'var(--leading-normal)', outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      )}

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
