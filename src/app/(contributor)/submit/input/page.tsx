'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

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
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function startRecording() {
    setError(null)
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
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
    setPhotoFile(file)
    setPhotoUrl(URL.createObjectURL(file))
  }

  function canContinue() {
    if (mode === 'text') return text.trim().length > 0
    if (mode === 'voice') return transcript.length > 0
    if (mode === 'photo') return photoFile !== null
    return false
  }

  function handleContinue() {
    const params = new URLSearchParams()
    params.set('mode', mode)
    if (mode === 'text') params.set('text', text)
    if (mode === 'voice') params.set('transcript', transcript)
    router.push(`/submit/confirm?${params.toString()}`)
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 0', fontSize: 13,
    background: active ? 'var(--violet)' : 'var(--surface)',
    color: active ? '#fff' : 'var(--ink-soft)',
    border: 'none', cursor: 'pointer', minHeight: 'var(--touch)',
  })

  return (
    <div style={{ paddingTop: 24, paddingBottom: 32 }}>
      {/* Mode tabs */}
      <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', marginBottom: 28, border: '1.5px solid var(--line-soft)' }}>
        {(['text', 'voice', 'photo'] as InputMode[]).map(m => (
          <button key={m} onClick={() => setMode(m)} style={tabStyle(mode === m)}>
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* Text mode */}
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

      {/* Voice mode */}
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
              disabled={recordingState === 'processing'}
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

      {/* Photo mode */}
      {mode === 'photo' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: 'none' }} />
          {photoUrl ? (
            <img src={photoUrl} alt="Selected" style={{ width: '100%', borderRadius: 10, maxHeight: 300, objectFit: 'cover' }} />
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%', minHeight: 180, borderRadius: 10, background: 'var(--surface)',
                border: '2px dashed var(--line)', color: 'var(--ink-faint)', fontSize: 14,
              }}
            >
              Tap to take or choose a photo
            </button>
          )}
          {photoUrl && (
            <button onClick={() => fileInputRef.current?.click()} style={{ fontSize: 13, color: 'var(--violet)', background: 'none', border: 'none' }}>
              Change photo
            </button>
          )}
        </div>
      )}

      {error && (
        <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p>
      )}

      <button
        onClick={handleContinue}
        disabled={!canContinue()}
        style={{
          marginTop: 32, width: '100%', minHeight: 'var(--touch)',
          background: canContinue() ? 'var(--violet)' : 'var(--surface)',
          color: canContinue() ? '#fff' : 'var(--ink-faint)',
          border: 'none', borderRadius: 14, fontSize: 15,
        }}
      >
        Continue
      </button>
    </div>
  )
}
