'use client'

import { useState } from 'react'
import { AtelierTemplate } from '@/types/brand'

const TYPES = ['photo_post', 'quote_card', 'announcement', 'carousel'] as const
const TYPE_LABELS: Record<string, string> = {
  photo_post: 'Photo post',
  quote_card: 'Quote card',
  announcement: 'Announcement',
  carousel: 'Carousel',
}

export default function TemplatesClient({ brandId, initialTemplates }: { brandId: string; initialTemplates: AtelierTemplate[] }) {
  const [templates, setTemplates] = useState<AtelierTemplate[]>(initialTemplates)
  const [toggling, setToggling] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState<Set<string>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<AtelierTemplate['type']>('photo_post')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  async function toggleActive(t: AtelierTemplate) {
    setToggling(prev => new Set(prev).add(t.id))
    try {
      const res = await fetch(`/api/studio/brands/${brandId}/templates/${t.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !t.active }),
      })
      if (res.ok) {
        const data = await res.json() as { template: AtelierTemplate }
        setTemplates(prev => prev.map(x => x.id === t.id ? data.template : x))
      }
    } finally {
      setToggling(prev => { const s = new Set(prev); s.delete(t.id); return s })
    }
  }

  async function deleteTemplate(id: string) {
    setDeleting(prev => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/studio/brands/${brandId}/templates/${id}`, { method: 'DELETE' })
      if (res.ok) setTemplates(prev => prev.filter(x => x.id !== id))
    } finally {
      setDeleting(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  async function addTemplate() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/studio/brands/${brandId}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type, description: description.trim() }),
      })
      if (res.ok) {
        const data = await res.json() as { template: AtelierTemplate }
        setTemplates(prev => [...prev, data.template])
        setName(''); setDescription(''); setShowForm(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const selectStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line-soft)', background: '#f5f4ff', color: 'var(--violet)', fontSize: 12, fontFamily: 'var(--mono)', cursor: 'pointer' }

  return (
    <div>
      {templates.length === 0 && !showForm && (
        <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginBottom: 16 }}>No templates yet.</p>
      )}

      {templates.map(t => (
        <div key={t.id} style={{ background: 'var(--surface)', borderRadius: 12, padding: 12, marginBottom: 8, border: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: t.description ? 3 : 0 }}>
              <p style={{ fontSize: 13, color: 'var(--ink)', margin: 0 }}>{t.name}</p>
              <span style={{ fontSize: 9, fontFamily: 'var(--mono)', background: '#e8e4ff', color: '#4A3DB0', borderRadius: 4, padding: '2px 6px' }}>
                {TYPE_LABELS[t.type] ?? t.type}
              </span>
            </div>
            {t.description && <p style={{ fontSize: 10, color: 'var(--ink-faint)', margin: 0 }}>{t.description}</p>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => toggleActive(t)}
              disabled={toggling.has(t.id)}
              style={{
                fontSize: 10, fontFamily: 'var(--mono)', borderRadius: 4, padding: '2px 8px', border: 'none', cursor: 'pointer',
                background: t.active ? '#e8e4ff' : '#f0f0f0', color: t.active ? '#4A3DB0' : 'var(--ink-faint)',
              }}
            >
              {t.active ? 'active' : 'inactive'}
            </button>
            <button
              onClick={() => deleteTemplate(t.id)}
              disabled={deleting.has(t.id)}
              style={{ background: 'none', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 0 0 4px' }}
            >
              {deleting.has(t.id) ? '…' : '×'}
            </button>
          </div>
        </div>
      ))}

      {showForm ? (
        <div style={{ border: '1.5px dashed rgba(74,61,176,0.3)', borderRadius: 12, padding: 12, marginTop: 8 }}>
          <p style={{ fontSize: 10, color: 'var(--violet)', fontFamily: 'var(--mono)', marginBottom: 8 }}>New template</p>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Name…"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line-soft)', background: '#f7f7f7', fontSize: 12, color: 'var(--ink)', marginBottom: 8, boxSizing: 'border-box' }}
          />
          <select value={type} onChange={e => setType(e.target.value as AtelierTemplate['type'])} style={{ ...selectStyle, marginBottom: 8, width: '100%' }}>
            {TYPES.map(tp => <option key={tp} value={tp}>{TYPE_LABELS[tp]}</option>)}
          </select>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)…"
            rows={2}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line-soft)', background: '#f7f7f7', fontSize: 12, color: 'var(--ink)', marginBottom: 8, boxSizing: 'border-box', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={addTemplate}
              disabled={saving || !name.trim()}
              style={{ background: 'var(--ink)', color: '#fff', border: 'none', borderRadius: 100, padding: '8px 20px', fontSize: 11, fontFamily: 'var(--mono)', cursor: saving ? 'wait' : 'pointer', opacity: !name.trim() ? 0.4 : 1 }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { setShowForm(false); setName(''); setDescription('') }}
              style={{ background: 'none', border: '1px solid var(--line-soft)', borderRadius: 100, padding: '8px 16px', fontSize: 11, color: 'var(--ink-faint)', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => setShowForm(true)}
          style={{ border: '1.5px dashed rgba(74,61,176,0.3)', borderRadius: 12, padding: 12, textAlign: 'center', color: 'var(--violet)', fontSize: 12, cursor: 'pointer', marginTop: 8 }}
        >
          + New template
        </div>
      )}
    </div>
  )
}
