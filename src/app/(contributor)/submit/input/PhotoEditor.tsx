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

  useEffect(() => {
    const img = new Image()
    img.onload = () => setImageEl(img)
    img.src = sourceUrl
  }, [sourceUrl])

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !imageEl || !canvas) return

    const { w, h } = getCanvasDimensions(imageEl, aspectRatio)
    canvas.width = w
    canvas.height = h
    ctx.clearRect(0, 0, w, h)

    const base = FILTER_CSS[filter]
    const brightnessVal = 1 + brightness / 100
    const contrastVal = 1 + contrast / 100
    ctx.filter = base === 'none'
      ? `brightness(${brightnessVal}) contrast(${contrastVal})`
      : `${base} brightness(${brightnessVal}) contrast(${contrastVal})`

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
      <div style={{ background: '#111', display: 'flex', justifyContent: 'center', borderRadius: '10px 10px 0 0', overflow: 'hidden', minHeight: 240 }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', maxHeight: 340, objectFit: 'contain', display: 'block' }}
        />
      </div>

      <div style={{ display: 'flex', background: 'var(--surface)' }}>
        {toolTab('crop', 'Crop')}
        {toolTab('filter', 'Filter')}
        {toolTab('light', 'Light')}
        {toolTab('text', 'Text')}
      </div>

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
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { label: 'Brightness', value: brightness, setter: setBrightness },
              { label: 'Contrast', value: contrast, setter: setContrast },
            ].map(({ label, value, setter }) => (
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
        borderRadius: '50%',
        border: active ? '2.5px solid var(--violet)' : '2.5px solid transparent',
        outline: active ? '1.5px solid rgba(74,61,176,0.25)' : 'none',
        display: 'block',
      }}
    />
  )
}
