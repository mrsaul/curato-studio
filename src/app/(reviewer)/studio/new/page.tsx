'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewBrandPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/studio/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create brand'); return }
      router.push(`/studio/${data.brand.id}`)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ paddingTop: 24, paddingBottom: 100 }}>
      <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: 'var(--ink-faint)', fontSize: 12, cursor: 'pointer', marginBottom: 16, padding: 0 }}>
        ← Studio
      </button>
      <h1 style={{ fontSize: 22, fontWeight: 400, color: 'var(--ink)', marginBottom: 24 }}>New brand</h1>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Brand name
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Cafeto"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line-soft)', background: 'var(--surface)', fontSize: 14, color: 'var(--ink)', boxSizing: 'border-box' as const }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Coffee delivery · Medellín"
            rows={3}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line-soft)', background: 'var(--surface)', fontSize: 14, color: 'var(--ink)', resize: 'vertical', boxSizing: 'border-box' as const }}
          />
        </div>

        {error && <p style={{ color: '#c0392b', fontSize: 12, marginBottom: 12 }}>{error}</p>}

        <button
          type="submit"
          disabled={saving || !name.trim()}
          style={{ width: '100%', padding: '12px', background: 'var(--ink)', color: '#fff', border: 'none', borderRadius: 100, fontSize: 13, fontFamily: 'var(--mono)', letterSpacing: '0.06em', cursor: saving ? 'wait' : 'pointer', opacity: !name.trim() ? 0.4 : 1 }}
        >
          {saving ? 'Creating…' : 'Create brand'}
        </button>
      </form>
    </div>
  )
}
