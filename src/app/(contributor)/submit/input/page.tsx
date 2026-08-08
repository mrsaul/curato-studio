'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import PhotoEditor, { PhotoEditorHandle } from './PhotoEditor'

type InputMode = 'text' | 'voice' | 'photo'
type RecordingState = 'idle' | 'recording' | 'processing'

export default function InputPage() {
  const router = useRouter()
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
      setError('Microphone access denied. Please allow microphone access and try again.')
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
        else setError(json.error ?? 'Transcription failed')
      } catch {
        setError('Could not transcribe audio')
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
        router.push('/submit/confirm?mode=photo')
      } catch {
        setError('Could not export photo. Please try again.')
        setExporting(false)
      }
      return
    }
    const params = new URLSearchParams()
    params.set('mode', mode)
    if (mode === 'text') params.set('text', text)
    if (mode === 'voice') params.set('transcript', transcript)
    router.push(`/submit/confirm?${params.toString()}`)
  }, [mode, text, transcript, router])

  const ok = canContinue()

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 0', fontSize: 13,
    background: active ? 'var(--violet)' : 'var(--surface)',
    color: active ? '#fff' : 'var(--ink-soft)',
    border: 'none', cursor: 'pointer', minHeight: 'var(--touch)',
  })

  return (
    <div style={{ paddingTop: 24, paddingBottom: 32 }}>
      <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', marginBottom: 28, border: '1.5px solid var(--line-soft)' }}>
        {(['text', 'voice', 'photo'] as InputMode[]).map(m => (
          <button key={m} onClick={() => setMode(m)} style={tabStyle(mode === m)}>
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {mode === 'text' && (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Write what you'd like to share…"
          rows={6}
          style={{
            width: '100%', padding: '14px', borderRadius: 10,
            border: '1.5px solid var(--line-soft)', background: 'var(--surface)',
            color: 'var(--ink)', fontSize: 15, resize: 'none', fontFamily: 'var(--body)',
            lineHeight: 1.5, outline: 'none',
          }}
        />
      )}

      {mode === 'voice' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          {recordingState === 'processing' && (
            <p style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Transcribing…</p>
          )}
          {recordingState !== 'processing' && (
            <button
              onPointerDown={startRecording}
              onPointerUp={stopRecording}
              onPointerLeave={stopRecording}
              style={{
                width: 80, height: 80, borderRadius: '50%',
                background: recordingState === 'recording' ? 'var(--red)' : 'var(--violet)',
                border: 'none', color: '#fff', fontSize: 13,
              }}
            >
              {recordingState === 'recording' ? 'Stop' : 'Hold'}
            </button>
          )}
          {transcript && (
            <p style={{ fontSize: 14, color: 'var(--ink)', background: 'var(--surface)', padding: '12px 14px', borderRadius: 10, lineHeight: 1.5, width: '100%' }}>
              {transcript}
            </p>
          )}
        </div>
      )}

      {mode === 'photo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ fontSize: 13, color: 'var(--violet)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Change photo
              </button>
            </>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%', minHeight: 180, borderRadius: 10, background: 'var(--surface)',
                border: '2px dashed var(--line-soft)', color: 'var(--ink-faint)', fontSize: 14, cursor: 'pointer',
              }}
            >
              Tap to take or choose a photo
            </button>
          )}
        </div>
      )}

      {error && (
        <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p>
      )}

      <button
        onClick={handleContinue}
        disabled={!ok || exporting}
        style={{
          marginTop: 32, width: '100%', minHeight: 'var(--touch)',
          background: ok && !exporting ? 'var(--violet)' : 'var(--surface)',
          color: ok && !exporting ? '#fff' : 'var(--ink-faint)',
          border: 'none', borderRadius: 14, fontSize: 15,
          cursor: ok && !exporting ? 'pointer' : 'not-allowed',
        }}
      >
        {exporting ? 'Preparing…' : 'Continue'}
      </button>
    </div>
  )
}
