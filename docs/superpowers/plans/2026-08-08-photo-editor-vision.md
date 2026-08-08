# Photo Editor + Vision Caption Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare photo picker with a canvas-based editor (crop, filter, brightness, text overlay), upload the edited image to Supabase Storage, and feed the real photo to Claude Haiku 4.5 Vision when generating intent and captions.

**Architecture:** `PhotoEditor.tsx` is a `forwardRef` client component with a `<canvas>` preview and four swappable tool panels (Crop, Filter, Light, Text). It exposes `triggerExport(): Promise<Blob>`. The input page calls `triggerExport()` on Continue, stores the blob as base64 in `sessionStorage`, and navigates to confirm. The confirm page reads it, uploads to Supabase Storage `post-photos`, gets a public URL, and passes `photo_url` to `/api/requests`. `/api/interpret` and `/api/draft` branch on `request.photo_url` to include the image in Claude calls.

**Tech Stack:** Next.js 14 App Router, React `forwardRef`/`useImperativeHandle`, browser Canvas API, Supabase Storage, Anthropic API direct fetch, Claude Haiku 4.5 Vision (`claude-haiku-4-5-20251001`).

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/002_photo_url.sql` | Create | Add `photo_url TEXT` column + Storage bucket + RLS |
| `src/types/request.ts` | Modify | Add `photo_url: string \| null` to `CreativeRequest` |
| `src/lib/requests.ts` | Modify | Add `photo_url` to `createRequest` params and insert |
| `src/app/(contributor)/submit/input/PhotoEditor.tsx` | Create | Canvas editor component with 4 tool panels |
| `src/app/(contributor)/submit/input/page.tsx` | Modify | Replace `<img>` block with `<PhotoEditor>`, update `handleContinue` |
| `src/app/(contributor)/submit/confirm/page.tsx` | Modify | Read sessionStorage blob, upload, pass `photo_url` |
| `src/app/api/requests/route.ts` | Modify | Accept `photo_url` in body, pass to `createRequest` |
| `src/app/api/interpret/route.ts` | Modify | Vision branch when `request.photo_url` is set |
| `src/app/api/draft/route.ts` | Modify | Vision branch for caption prompt |

---

### Task 27: Database migration + TypeScript types

**Files:**
- Create: `supabase/migrations/002_photo_url.sql`
- Modify: `src/types/request.ts`
- Modify: `src/lib/requests.ts`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/002_photo_url.sql`:

```sql
-- Add photo_url column to creative_requests
ALTER TABLE creative_requests ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Create post-photos storage bucket (public, for Claude Vision URL access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-photos', 'post-photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload to their own folder
CREATE POLICY "Users can upload own photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'post-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: anyone can read photos (needed for Claude Vision URL access)
CREATE POLICY "Photos are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'post-photos');
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Run the SQL from `supabase/migrations/002_photo_url.sql` against the project `duppejolqfwxodglbibc`.

If the Supabase MCP is not available, apply manually in the Supabase SQL editor at https://supabase.com/dashboard/project/duppejolqfwxodglbibc/sql.

- [ ] **Step 3: Add `photo_url` to the TypeScript type**

In `src/types/request.ts`, add the `photo_url` field to `CreativeRequest` (after `contributor_reply`):

```typescript
export interface CreativeRequest {
  id: string
  contributor_id: string
  reviewer_id: string
  context_id: string | null
  status: RequestStatus
  source_type: SourceType
  raw_text: string | null
  media_url: string | null
  transcript: string | null
  intent_summary: string | null
  clarification_question: string | null
  contributor_reply: string | null
  photo_url: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 4: Add `photo_url` to `createRequest` in `src/lib/requests.ts`**

Update the params interface and the insert call:

```typescript
export async function createRequest(
  supabase: SupabaseClient,
  params: {
    contributor_id: string
    reviewer_id: string
    context_id: string | null
    source_type: 'text' | 'voice' | 'photo'
    raw_text?: string
    media_url?: string
    transcript?: string
    photo_url?: string
  }
): Promise<CreativeRequest> {
  const { data, error } = await supabase
    .from('creative_requests')
    .insert({
      contributor_id: params.contributor_id,
      reviewer_id: params.reviewer_id,
      context_id: params.context_id,
      source_type: params.source_type,
      status: 'new',
      raw_text: params.raw_text ?? null,
      media_url: params.media_url ?? null,
      transcript: params.transcript ?? null,
      photo_url: params.photo_url ?? null,
    })
    .select()
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Failed to create request')
  return data as CreativeRequest
}
```

- [ ] **Step 5: Type-check**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio"
npx tsc --noEmit
```

Expected: no errors related to `photo_url`.

- [ ] **Step 6: Commit**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio"
git add supabase/migrations/002_photo_url.sql src/types/request.ts src/lib/requests.ts
git commit -m "feat: add photo_url column, storage bucket, and TypeScript types"
```

---

### Task 28: PhotoEditor component

**Files:**
- Create: `src/app/(contributor)/submit/input/PhotoEditor.tsx`

This is a `'use client'` component using `forwardRef` + `useImperativeHandle`. It renders a `<canvas>` preview and four swappable tool panels below it.

- [ ] **Step 1: Create the component file**

Create `src/app/(contributor)/submit/input/PhotoEditor.tsx` with the full implementation:

```typescript
'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

type AspectRatio = 'free' | '1:1' | '4:5' | '9:16'
type FilterName = 'original' | 'warm' | 'cool' | 'vivid' | 'muted' | 'bw'
type ActiveTool = 'crop' | 'filter' | 'light' | 'text'

const FILTER_CSS: Record<FilterName, string> = {
  original: 'none',
  warm: 'sepia(0.3) saturate(1.4) brightness(1.05)',
  cool: 'hue-rotate(20deg) saturate(0.9) brightness(1.02)',
  vivid: 'saturate(1.8) contrast(1.1)',
  muted: 'saturate(0.6) brightness(1.05)',
  bw: 'grayscale(1) contrast(1.1)',
}

const FILTER_LABELS: Record<FilterName, string> = {
  original: 'Original',
  warm: 'Warm',
  cool: 'Cool',
  vivid: 'Vivid',
  muted: 'Muted',
  bw: 'B&W',
}

const ASPECT_LABELS: AspectRatio[] = ['free', '1:1', '4:5', '9:16']

export interface PhotoEditorHandle {
  triggerExport: () => Promise<Blob>
}

interface PhotoEditorProps {
  sourceUrl: string
}

function getCanvasDimensions(img: HTMLImageElement, ratio: AspectRatio): { w: number; h: number } {
  const MAX = 1080
  if (ratio === 'free') {
    const scale = Math.min(1, MAX / img.naturalWidth, MAX / img.naturalHeight)
    return { w: Math.round(img.naturalWidth * scale), h: Math.round(img.naturalHeight * scale) }
  }
  const [rw, rh] = ratio === '1:1' ? [1, 1] : ratio === '4:5' ? [4, 5] : [9, 16]
  if (rw >= rh) {
    const w = MAX
    return { w, h: Math.round(w * rh / rw) }
  } else {
    const h = MAX
    return { w: Math.round(h * rw / rh), h }
  }
}

const PhotoEditor = forwardRef<PhotoEditorHandle, PhotoEditorProps>(function PhotoEditor(
  { sourceUrl },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null)
  const [activeTool, setActiveTool] = useState<ActiveTool>('crop')
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [rotation, setRotation] = useState(0)
  const [filter, setFilter] = useState<FilterName>('original')
  const [brightness, setBrightness] = useState(0)
  const [contrast, setContrast] = useState(0)
  const [overlayText, setOverlayText] = useState('')

  // Load image from sourceUrl
  useEffect(() => {
    const img = new Image()
    img.onload = () => setImageEl(img)
    img.src = sourceUrl
  }, [sourceUrl])

  // Render canvas whenever any edit state changes
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !imageEl || !canvas) return

    const { w, h } = getCanvasDimensions(imageEl, aspectRatio)
    canvas.width = w
    canvas.height = h
    ctx.clearRect(0, 0, w, h)

    // Build filter string
    const base = FILTER_CSS[filter]
    const brightnessVal = 1 + brightness / 100
    const contrastVal = 1 + contrast / 100
    ctx.filter = base === 'none'
      ? `brightness(${brightnessVal}) contrast(${contrastVal})`
      : `${base} brightness(${brightnessVal}) contrast(${contrastVal})`

    // Draw image rotated to cover canvas
    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.rotate((rotation * Math.PI) / 180)
    const isRotated90 = rotation % 180 !== 0
    const srcW = isRotated90 ? imageEl.naturalHeight : imageEl.naturalWidth
    const srcH = isRotated90 ? imageEl.naturalWidth : imageEl.naturalHeight
    const scale = Math.max(w / srcW, h / srcH)
    const drawW = srcW * scale
    const drawH = srcH * scale
    ctx.drawImage(imageEl, -drawW / 2, -drawH / 2, drawW, drawH)
    ctx.restore()

    // Text overlay
    if (overlayText.trim()) {
      ctx.filter = 'none'
      const fontSize = Math.round(w / 18)
      ctx.font = `bold ${fontSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.shadowColor = 'rgba(0,0,0,0.8)'
      ctx.shadowBlur = 6
      ctx.fillStyle = '#ffffff'
      ctx.fillText(overlayText, w / 2, h - fontSize * 0.5)
      ctx.shadowBlur = 0
    }

    // Rule-of-thirds grid (only in crop mode)
    if (activeTool === 'crop') {
      ctx.filter = 'none'
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 0.75
      ctx.beginPath()
      ctx.moveTo(w / 3, 0); ctx.lineTo(w / 3, h)
      ctx.moveTo((w * 2) / 3, 0); ctx.lineTo((w * 2) / 3, h)
      ctx.moveTo(0, h / 3); ctx.lineTo(w, h / 3)
      ctx.moveTo(0, (h * 2) / 3); ctx.lineTo(w, (h * 2) / 3)
      ctx.stroke()
    }
  }, [imageEl, aspectRatio, rotation, filter, brightness, contrast, overlayText, activeTool])

  useEffect(() => { drawCanvas() }, [drawCanvas])

  useImperativeHandle(ref, () => ({
    triggerExport: () => new Promise<Blob>((resolve, reject) => {
      const canvas = canvasRef.current
      if (!canvas) { reject(new Error('Canvas not ready')); return }
      canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new Error('Export failed'))
      }, 'image/jpeg', 0.85)
    }),
  }))

  // SVG icons for tool tabs — minimal line art, same style as Lightroom Mobile
  const TOOL_ICONS: Record<ActiveTool, React.ReactNode> = {
    crop: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2v14a2 2 0 002 2h14"/>
        <path d="M18 22V8a2 2 0 00-2-2H2"/>
      </svg>
    ),
    filter: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="6" r="2"/><line x1="2" y1="6" x2="10" y2="6"/><line x1="14" y1="6" x2="22" y2="6"/>
        <circle cx="8" cy="12" r="2"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="10" y1="12" x2="22" y2="12"/>
        <circle cx="16" cy="18" r="2"/><line x1="2" y1="18" x2="14" y2="18"/><line x1="18" y1="18" x2="22" y2="18"/>
      </svg>
    ),
    light: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="4"/>
        <line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
    ),
    text: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>
      </svg>
    ),
  }

  const toolTab = (t: ActiveTool, label: string) => (
    <button
      key={t}
      onClick={() => setActiveTool(t)}
      style={{
        flex: 1, padding: '10px 0 8px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 4,
        background: 'var(--surface)',
        color: activeTool === t ? 'var(--violet)' : 'var(--ink-soft)',
        border: 'none', cursor: 'pointer',
        borderTop: activeTool === t ? '2px solid var(--violet)' : '2px solid transparent',
      }}
    >
      {TOOL_ICONS[t]}
      <span style={{ fontSize: 9, letterSpacing: '0.07em', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>
        {label}
      </span>
    </button>
  )

  return (
    <div style={{ width: '100%' }}>
      {/* Canvas preview — dark letterbox background like native camera apps */}
      <div style={{ background: '#111', display: 'flex', justifyContent: 'center', borderRadius: '10px 10px 0 0', overflow: 'hidden', minHeight: 240 }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', maxHeight: 340, objectFit: 'contain', display: 'block' }}
        />
      </div>

      {/* Tool tabs — icon + label, indicator on top border (Lightroom Mobile pattern) */}
      <div style={{ display: 'flex', background: 'var(--surface)' }}>
        {toolTab('crop', 'Crop')}
        {toolTab('filter', 'Filter')}
        {toolTab('light', 'Light')}
        {toolTab('text', 'Text')}
      </div>

      {/* Tool panels */}
      <div style={{ background: 'var(--surface)', padding: '14px 14px 18px', borderRadius: '0 0 10px 10px', border: '1px solid var(--line-soft)', borderTop: '1px solid var(--line-soft)' }}>

        {activeTool === 'crop' && (
          <div>
            <p style={{ fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Aspect ratio</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {ASPECT_LABELS.map(r => (
                <button
                  key={r}
                  onClick={() => setAspectRatio(r)}
                  style={{
                    flex: 1, padding: '7px 0', fontSize: 11, borderRadius: 8,
                    background: aspectRatio === r ? 'var(--violet)' : 'var(--bg)',
                    color: aspectRatio === r ? '#fff' : 'var(--ink-soft)',
                    border: aspectRatio === r ? '1.5px solid var(--violet)' : '1.5px solid var(--line-soft)',
                    cursor: 'pointer', fontWeight: aspectRatio === r ? 600 : 400,
                  }}
                >
                  {r === 'free' ? 'Free' : r}
                </button>
              ))}
            </div>
            {/* Rotate buttons — icon glyphs, same row */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setRotation(r => (r - 90 + 360) % 360)}
                style={{ flex: 1, padding: '8px 0', fontSize: 13, borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--line-soft)', cursor: 'pointer', color: 'var(--ink-soft)' }}
              >
                ↺ Left
              </button>
              <button
                onClick={() => setRotation(r => (r + 90) % 360)}
                style={{ flex: 1, padding: '8px 0', fontSize: 13, borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--line-soft)', cursor: 'pointer', color: 'var(--ink-soft)' }}
              >
                ↻ Right
              </button>
            </div>
          </div>
        )}

        {activeTool === 'filter' && (
          /* Horizontally scrollable filter strip — circular thumbnails + name below (VSCO pattern) */
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'] }}>
            {(Object.keys(FILTER_CSS) as FilterName[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                <FilterChip imageEl={imageEl} filterCss={FILTER_CSS[f]} active={filter === f} />
                <span style={{
                  fontSize: 10, fontFamily: 'var(--mono)',
                  color: filter === f ? 'var(--violet)' : 'var(--ink-faint)',
                  fontWeight: filter === f ? 600 : 400,
                }}>
                  {FILTER_LABELS[f]}
                </span>
              </button>
            ))}
          </div>
        )}

        {activeTool === 'light' && (
          /* Slider rows — label left, value right, full-width track (Lightroom Mobile pattern) */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {([
              { label: 'Brightness', value: brightness, setter: setBrightness },
              { label: 'Contrast',   value: contrast,   setter: setContrast },
            ] as const).map(({ label, value, setter }) => (
              <div key={label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{label}</span>
                  <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: value !== 0 ? 'var(--violet)' : 'var(--ink-faint)', minWidth: 32, textAlign: 'right' }}>
                    {value > 0 ? `+${value}` : value}
                  </span>
                </div>
                <input
                  type="range" min={-50} max={50} step={1} value={value}
                  onChange={e => setter(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--violet)', height: 4 }}
                />
              </div>
            ))}
          </div>
        )}

        {activeTool === 'text' && (
          <div>
            <p style={{ fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Overlay text</p>
            <input
              type="text"
              value={overlayText}
              onChange={e => setOverlayText(e.target.value)}
              placeholder="Add text to photo…"
              style={{
                width: '100%', padding: '11px 14px', borderRadius: 10,
                border: '1.5px solid var(--line-soft)',
                background: 'var(--bg)', color: 'var(--ink)', fontSize: 15,
                fontFamily: 'var(--body)', outline: 'none',
              }}
            />
            <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 8 }}>
              Text appears centered at the bottom of the photo.
            </p>
          </div>
        )}
      </div>
    </div>
  )
})

export default PhotoEditor

// FilterChip — circular thumbnail (VSCO pattern), 60×60, active state = violet ring
function FilterChip({
  imageEl,
  filterCss,
  active,
}: {
  imageEl: HTMLImageElement | null
  filterCss: string
  active: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const SIZE = 60

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !imageEl || !canvas) return
    canvas.width = SIZE
    canvas.height = SIZE
    ctx.filter = filterCss === 'none' ? 'none' : filterCss
    const scale = Math.max(SIZE / imageEl.naturalWidth, SIZE / imageEl.naturalHeight)
    const drawW = imageEl.naturalWidth * scale
    const drawH = imageEl.naturalHeight * scale
    ctx.drawImage(imageEl, (SIZE - drawW) / 2, (SIZE - drawH) / 2, drawW, drawH)
  }, [imageEl, filterCss])

  return (
    <canvas
      ref={ref}
      width={SIZE}
      height={SIZE}
      style={{
        borderRadius: '50%',                                           // circular — VSCO pattern
        border: active ? '2.5px solid var(--violet)' : '2.5px solid transparent',
        outline: active ? '1.5px solid rgba(74,61,176,0.25)' : 'none', // subtle outer glow ring
        display: 'block',
      }}
    />
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio"
git add src/app/\(contributor\)/submit/input/PhotoEditor.tsx
git commit -m "feat: add PhotoEditor canvas component with crop, filter, light, text tools"
```

---

### Task 29: Update Input page to use PhotoEditor

**Files:**
- Modify: `src/app/(contributor)/submit/input/page.tsx`

The current photo mode renders an `<img>` preview. Replace it with `<PhotoEditor>` and update `handleContinue` to export the canvas as base64 into `sessionStorage`.

- [ ] **Step 1: Rewrite `src/app/(contributor)/submit/input/page.tsx`**

```typescript
'use client'

import { useState, useRef, useCallback } from 'react'
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
    setPhotoFile(file)
    setPhotoUrl(URL.createObjectURL(file))
  }

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
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
        sessionStorage.setItem('photo_blob_b64', b64)
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
        disabled={!canContinue() || exporting}
        style={{
          marginTop: 32, width: '100%', minHeight: 'var(--touch)',
          background: canContinue() && !exporting ? 'var(--violet)' : 'var(--surface)',
          color: canContinue() && !exporting ? '#fff' : 'var(--ink-faint)',
          border: 'none', borderRadius: 14, fontSize: 15,
          cursor: canContinue() && !exporting ? 'pointer' : 'not-allowed',
        }}
      >
        {exporting ? 'Preparing…' : 'Continue'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio"
git add src/app/\(contributor\)/submit/input/page.tsx
git commit -m "feat: integrate PhotoEditor into input page, export canvas to sessionStorage on Continue"
```

---

### Task 30: Update Confirm page — storage upload and photo_url

**Files:**
- Modify: `src/app/(contributor)/submit/confirm/page.tsx`

The confirm page needs to: (1) read the base64 blob from `sessionStorage` on mount when mode is `photo`, (2) show a thumbnail, (3) upload to Supabase Storage before creating the request, (4) pass `photo_url` in the request body, (5) clean up `sessionStorage` on success.

- [ ] **Step 1: Rewrite `src/app/(contributor)/submit/confirm/page.tsx`**

```typescript
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

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/login'); return }
      fetch('/api/reviewer')
        .then(r => r.json())
        .then((json: { reviewer?: { id: string; context_id: string } }) => {
          if (json.reviewer) {
            setReviewerId(json.reviewer.id)
            setContextId(json.reviewer.context_id)
          }
        })
    })

    // Read photo blob from sessionStorage when in photo mode
    if (mode === 'photo') {
      const b64 = sessionStorage.getItem('photo_blob_b64')
      if (!b64) {
        setError('Photo not found — go back and choose a photo again.')
        return
      }
      const commaIdx = b64.indexOf(',')
      const mimeString = b64.slice(5, b64.indexOf(';'))
      const byteString = atob(b64.slice(commaIdx + 1))
      const ab = new ArrayBuffer(byteString.length)
      const ia = new Uint8Array(ab)
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i)
      const blob = new Blob([ab], { type: mimeString })
      setPhotoBlob(blob)
      setPhotoPreviewUrl(URL.createObjectURL(blob))
    }
  }, [router, mode])

  async function handleSubmit() {
    if (!reviewerId) { setError('No reviewer found'); return }
    setLoading(true)
    setError(null)
    try {
      let uploadedPhotoUrl: string | undefined

      // Upload photo to Supabase Storage if in photo mode
      if (mode === 'photo' && photoBlob) {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')
        const filename = `${user.id}/${crypto.randomUUID()}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('post-photos')
          .upload(filename, photoBlob, { contentType: 'image/jpeg', upsert: false })
        if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`)
        const { data: { publicUrl } } = supabase.storage
          .from('post-photos')
          .getPublicUrl(filename)
        uploadedPhotoUrl = publicUrl
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
          photo_url: uploadedPhotoUrl,
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
        const draftRes = await fetch('/api/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_id: requestId }),
        })
        if (!draftRes.ok) throw new Error('Draft generation failed')
      }

      // Clean up sessionStorage after successful submission
      if (mode === 'photo') sessionStorage.removeItem('photo_blob_b64')

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
        {mode === 'photo' ? 'Your photo' : 'Here’s what you said'}
      </p>

      {/* Photo thumbnail */}
      {photoPreviewUrl && mode === 'photo' && (
        <img
          src={photoPreviewUrl}
          alt="Edited photo"
          style={{ width: '100%', borderRadius: 10, maxHeight: 200, objectFit: 'cover', marginBottom: 16 }}
        />
      )}

      {/* Text/voice summary */}
      {mode !== 'photo' && (
        <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '14px 16px', marginBottom: 28 }}>
          <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.6 }}>
            {inputSummary || `${mode} input`}
          </p>
        </div>
      )}

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
```

- [ ] **Step 2: Type-check**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio"
git add src/app/\(contributor\)/submit/confirm/page.tsx
git commit -m "feat: upload photo to Supabase Storage on confirm, pass photo_url to API"
```

---

### Task 31: /api/requests — accept photo_url

**Files:**
- Modify: `src/app/api/requests/route.ts`

- [ ] **Step 1: Update the route to accept and forward `photo_url`**

Replace the entire file content of `src/app/api/requests/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createRequest } from '@/lib/requests'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    reviewer_id?: string
    context_id?: string | null
    source_type?: string
    raw_text?: string
    transcript?: string
    media_url?: string
    photo_url?: string
  }

  if (!body.reviewer_id) {
    return NextResponse.json({ error: 'reviewer_id is required' }, { status: 400 })
  }
  if (!body.source_type || !['text', 'voice', 'photo'].includes(body.source_type)) {
    return NextResponse.json({ error: 'source_type must be text, voice, or photo' }, { status: 400 })
  }

  const request = await createRequest(supabase, {
    contributor_id: user.id,
    reviewer_id: body.reviewer_id,
    context_id: body.context_id ?? null,
    source_type: body.source_type as 'text' | 'voice' | 'photo',
    raw_text: body.raw_text,
    transcript: body.transcript,
    media_url: body.media_url,
    photo_url: body.photo_url,
  })

  return NextResponse.json({ request })
}
```

- [ ] **Step 2: Type-check**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio"
git add src/app/api/requests/route.ts
git commit -m "feat: /api/requests accepts and stores photo_url"
```

---

### Task 32: /api/interpret — vision support

**Files:**
- Modify: `src/app/api/interpret/route.ts`

When `request.photo_url` is present, build a multimodal message (image + text) and switch to `claude-haiku-4-5-20251001` for cost-efficiency. The structured JSON output format is unchanged — Claude's response is still the same JSON schema.

- [ ] **Step 1: Update `/api/interpret/route.ts` with vision branching**

Replace the file with the full updated version:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getRequest, updateRequest } from '@/lib/requests'
import { getBrandContext, formatBrandSystem } from '@/lib/brand'

const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY

interface InterpretResult {
  source_summary: string
  intent: string
  subject: string
  confirmed_facts: string[]
  uncertain_facts: string[]
  suggested_audience: string
  likely_cta: string
  emotional_tone: string
  recommended_format: string
  clarification_question: string | null
  confirmation_sentence: string
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!CLAUDE_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const body = await req.json() as { request_id?: string }
  if (!body.request_id) return NextResponse.json({ error: 'request_id required' }, { status: 400 })

  const request = await getRequest(supabase, body.request_id)
  if (!request || request.contributor_id !== user.id) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  await updateRequest(supabase, request.id, { status: 'interpreting' })

  const input = request.transcript ?? request.raw_text ?? ''

  let brandSystem = ''
  if (request.context_id) {
    try {
      const brand = await getBrandContext(request.context_id, supabase)
      brandSystem = formatBrandSystem(brand)
    } catch {
      // proceed without brand context
    }
  }

  const promptText = `Read the contributor's input below. Extract only information that is explicitly stated or safely implied. Do not improve facts by guessing.

Contributor input: ${input || '(no text — analyze the photo)'}
${brandSystem ? `\nBrand context:\n${brandSystem}` : ''}

Return a JSON object with these exact fields (no markdown, raw JSON only):
{
  "source_summary": "string — what the contributor shared in their own terms",
  "intent": "string — one of: promote, inform, celebrate, invite, reflect, sell, other",
  "subject": "string — what or who the post is about",
  "confirmed_facts": ["string"],
  "uncertain_facts": ["string"],
  "suggested_audience": "string",
  "likely_cta": "string",
  "emotional_tone": "string",
  "recommended_format": "string — one of: photo_post, quote_card, announcement, carousel",
  "clarification_question": "string or null — one question only if a missing fact prevents a useful draft, else null",
  "confirmation_sentence": "string — begins with 'Here\\'s what I\\'ll make: '"
}`

  // Build messages — use vision format when photo_url is present
  type MessageContent =
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image'; source: { type: 'url'; url: string } }
      >

  const messageContent: MessageContent = request.photo_url
    ? [
        { type: 'image', source: { type: 'url', url: request.photo_url } },
        { type: 'text', text: promptText },
      ]
    : promptText

  // Use Haiku for vision calls (cheap + fast); Sonnet for text-only
  const model = request.photo_url ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6'

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: messageContent }],
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    await updateRequest(supabase, request.id, { status: 'new' })
    const err = await response.text()
    return NextResponse.json({ error: err }, { status: response.status })
  }

  const data = await response.json() as { content: Array<{ type: string; text: string }> }
  const raw = data.content.find(b => b.type === 'text')?.text ?? ''
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()

  let parsed: InterpretResult
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    await updateRequest(supabase, request.id, { status: 'new' })
    return NextResponse.json({ error: 'Failed to parse interpret response' }, { status: 500 })
  }

  const newStatus = parsed.clarification_question ? 'needs_info' : 'draft_ready'
  await updateRequest(supabase, request.id, {
    status: newStatus,
    intent_summary: parsed.confirmation_sentence,
    clarification_question: parsed.clarification_question,
  })

  return NextResponse.json({ interpret: parsed, status: newStatus })
}
```

- [ ] **Step 2: Type-check**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio"
git add src/app/api/interpret/route.ts
git commit -m "feat: /api/interpret uses Claude Haiku vision when photo_url is present"
```

---

### Task 33: /api/draft — vision support for caption generation

**Files:**
- Modify: `src/app/api/draft/route.ts`

When `request.photo_url` is present, the caption prompt includes the image so Claude generates captions that match the actual photo. A new helper `callClaudeWithMessages` handles multimodal calls alongside the existing `callClaude` (string-only).

- [ ] **Step 1: Update `/api/draft/route.ts` with vision branching**

Replace the file with the full updated version:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { getRequest, updateRequest, getReviewerTemplates } from '@/lib/requests'
import { getBrandContext, formatBrandSystem } from '@/lib/brand'

const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY

type ClaudeMessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image'; source: { type: 'url'; url: string } }
    >

async function callClaude(prompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error(`Claude error: ${response.status}`)
  const data = await response.json() as { content: Array<{ type: string; text: string }> }
  return data.content.find(b => b.type === 'text')?.text ?? ''
}

async function callClaudeWithMessages(content: ClaudeMessageContent): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content }],
    }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error(`Claude error: ${response.status}`)
  const data = await response.json() as { content: Array<{ type: string; text: string }> }
  return data.content.find(b => b.type === 'text')?.text ?? ''
}

function parseJson<T>(raw: string): T {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(cleaned) as T
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!CLAUDE_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const body = await req.json() as { request_id?: string }
  if (!body.request_id) return NextResponse.json({ error: 'request_id required' }, { status: 400 })

  const request = await getRequest(supabase, body.request_id)
  if (!request || request.contributor_id !== user.id) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }
  if (request.status !== 'draft_ready') {
    return NextResponse.json({ error: 'Request must be in draft_ready status' }, { status: 400 })
  }

  let brandSystem = ''
  if (request.context_id) {
    try {
      const brand = await getBrandContext(request.context_id, supabase)
      brandSystem = formatBrandSystem(brand)
    } catch { /* proceed without */ }
  }

  const templates = await getReviewerTemplates(supabase, request.reviewer_id)
  const templateList = templates.map(t => `${t.name} (${t.type}): ${t.description}`).join('\n') || 'No templates configured'

  const requestContext = `Intent: ${request.intent_summary ?? 'Not interpreted yet'}
Source type: ${request.source_type}
Input: ${request.transcript ?? request.raw_text ?? ''}
${request.contributor_reply ? `Contributor reply: ${request.contributor_reply}` : ''}`

  const captionPromptText = `Write Instagram copy for this Creative Request.

Request: ${requestContext}
${brandSystem ? `Brand voice:\n${brandSystem}` : ''}

Return JSON only:
{
  "caption_options": [
    { "style": "warm", "text": "string" },
    { "style": "concise", "text": "string" },
    { "style": "story", "text": "string" }
  ],
  "recommended_caption": "string — copy one of the above verbatim",
  "cta": "string — one clear call to action",
  "hashtags": ["string"],
  "alt_text": "string — descriptive alt text for accessibility",
  "flags": [{ "type": "string", "note": "string" }]
}`

  const templatePrompt = `Choose the best template for this Creative Request.

Request: ${requestContext}
Available templates:\n${templateList}

Return JSON only:
{
  "template_name": "string or null if no template fits",
  "visual_brief": "string — art direction for the visual"
}`

  interface CaptionResult {
    caption_options: Array<{ style: string; text: string }>
    recommended_caption: string
    cta: string
    hashtags: string[]
    alt_text: string
    flags: Array<{ type: string; note: string }>
  }
  interface TemplateResult {
    template_name: string | null
    visual_brief: string
  }

  // Build caption message content — include photo when available
  const captionContent: ClaudeMessageContent = request.photo_url
    ? [
        { type: 'image', source: { type: 'url', url: request.photo_url } },
        { type: 'text', text: captionPromptText },
      ]
    : captionPromptText

  const [captionRaw, templateRaw] = await Promise.all([
    callClaudeWithMessages(captionContent),
    callClaude(templatePrompt),
  ])

  const captionData = parseJson<CaptionResult>(captionRaw)
  const templateData = parseJson<TemplateResult>(templateRaw)

  const matchedTemplate = templates.find(t => t.name === templateData.template_name)

  const service = createServiceSupabaseClient()
  const { data: draft, error: draftError } = await service
    .from('request_drafts')
    .insert({
      request_id: request.id,
      caption_options: captionData.caption_options,
      recommended_caption: captionData.recommended_caption,
      cta: captionData.cta,
      hashtags: captionData.hashtags,
      alt_text: captionData.alt_text,
      template_id: matchedTemplate?.id ?? null,
      visual_brief: templateData.visual_brief,
      flags: captionData.flags,
    })
    .select()
    .single()

  if (draftError || !draft) {
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 })
  }

  await updateRequest(supabase, request.id, { status: 'awaiting_review' })

  return NextResponse.json({ draft })
}
```

- [ ] **Step 2: Type-check**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio"
git add src/app/api/draft/route.ts
git commit -m "feat: /api/draft includes photo in caption prompt when photo_url is present"
```

---

### Task 34: Deploy and verify

**Files:** none (deploy only)

- [ ] **Step 1: Final type-check across the whole project**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio"
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Deploy to production**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio"
vercel --prod
```

- [ ] **Step 3: Smoke test — photo upload flow**

1. Log in as the Creator
2. Go to `/submit/input`, tap the Photo tab
3. Tap "Tap to take or choose a photo" — pick any photo from disk
4. Verify the photo loads into the canvas editor (aspect ratio 1:1 default, dark background)
5. Switch to the Filter tab — verify 6 filter chips appear with thumbnails
6. Try Light tab — move brightness slider — verify canvas updates in real time
7. Try Text tab — type text — verify it appears on the canvas
8. Tap Continue — verify "Preparing…" appears briefly
9. On the confirm page, verify the photo thumbnail appears
10. Tap "Send to reviewer" — verify the request is created and you're redirected to `/submit/sent`

- [ ] **Step 4: Smoke test — Art Director sees captions**

1. Log in as the Art Director
2. Go to `/queue` — the new photo request should appear
3. Open the request — verify 3 caption options appear (warm, concise, story)
4. The captions should reference the photo's content, not just the text description

- [ ] **Step 5: Commit any fixes and log result**

If the deploy has issues, fix them, type-check again, and redeploy.

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio"
git log --oneline -8
```
