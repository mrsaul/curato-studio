'use client'

import { useState, useRef } from 'react'
import { BrandAsset } from '@/types/brand'

export default function AssetsClient({ brandId, initialAssets }: { brandId: string; initialAssets: BrandAsset[] }) {
  const [assets, setAssets] = useState<BrandAsset[]>(initialAssets)
  const [uploading, setUploading] = useState(false)
  const [selected, setSelected] = useState<BrandAsset | null>(null)
  const [deleting, setDeleting] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/studio/brands/${brandId}/assets`, { method: 'POST', body: form })
      if (res.ok) {
        const data = await res.json() as { asset: BrandAsset }
        setAssets(prev => [...prev, data.asset])
      }
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function deleteAsset(asset: BrandAsset) {
    setDeleting(prev => new Set(prev).add(asset.id))
    try {
      const res = await fetch(`/api/studio/brands/${brandId}/assets/${asset.id}`, { method: 'DELETE' })
      if (res.ok) {
        setAssets(prev => prev.filter(a => a.id !== asset.id))
        setSelected(null)
      }
    } finally {
      setDeleting(prev => { const s = new Set(prev); s.delete(asset.id); return s })
    }
  }

  const cellStyle: React.CSSProperties = { aspectRatio: '1', borderRadius: 8, overflow: 'hidden', position: 'relative', cursor: 'pointer' }

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={upload} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {assets.map(asset => (
          <div key={asset.id} style={cellStyle} onClick={() => setSelected(asset)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset.url} alt={asset.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ))}

        <div
          style={{ ...cellStyle, background: uploading ? 'var(--lilac)' : 'var(--lilac-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: uploading ? 'wait' : 'pointer' }}
          onClick={() => !uploading && fileRef.current?.click()}
        >
          {uploading
            ? <span style={{ fontSize: 10, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>…</span>
            : <span style={{ fontSize: 22, color: 'var(--ink)' }}>+</span>
          }
        </div>
      </div>

      {selected && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setSelected(null)}
        >
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: 360, width: '100%' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.url} alt={selected.name} style={{ width: '100%', borderRadius: 12, display: 'block', marginBottom: 12 }} />
            <p style={{ fontSize: 12, color: '#fff', marginBottom: 12, textAlign: 'center' }}>{selected.name}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                onClick={() => deleteAsset(selected)}
                disabled={deleting.has(selected.id)}
                style={{ background: '#c0392b', color: '#fff', border: 'none', borderRadius: 100, padding: '8px 20px', fontSize: 11, fontFamily: 'var(--mono)', cursor: 'pointer' }}
              >
                {deleting.has(selected.id) ? 'Deleting…' : 'Delete'}
              </button>
              <button
                onClick={() => setSelected(null)}
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 100, padding: '8px 16px', fontSize: 11, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
