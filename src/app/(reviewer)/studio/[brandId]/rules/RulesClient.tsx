'use client'

import { useState } from 'react'
import { Rule } from '@/types/brand'

const RULE_ADDED_STYLE = `
@keyframes ruleHighlight {
  0%   { border-color: var(--green); box-shadow: 0 0 0 3px rgba(31,122,80,0.15); }
  60%  { border-color: var(--green); box-shadow: 0 0 0 3px rgba(31,122,80,0.08); }
  100% { border-color: var(--line-soft); box-shadow: none; }
}
`

const VERBS = ['always', 'never', 'prefer', 'avoid'] as const
const DOMAINS = ['voice', 'visual', 'content', 'format', 'timing'] as const

const VERB_COLORS: Record<string, { bg: string; color: string }> = {
  always: { bg: '#e8e4ff', color: '#4A3DB0' },
  never:  { bg: '#ffe4e4', color: '#c0392b' },
  prefer: { bg: '#e4f0e4', color: '#27ae60' },
  avoid:  { bg: '#fffbe6', color: '#b8920a' },
}

export default function RulesClient({ brandId, initialRules }: { brandId: string; initialRules: Rule[] }) {
  const [rules, setRules] = useState<Rule[]>(initialRules)
  const [verb, setVerb] = useState<Rule['verb']>('always')
  const [domain, setDomain] = useState<Rule['domain']>('voice')
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [newIndex, setNewIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function addRule() {
    if (!text.trim()) return
    setAdding(true)
    setError(null)
    try {
      const res = await fetch(`/api/studio/brands/${brandId}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verb, domain, text: text.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not add the rule')
      setNewIndex(data.rules.length - 1)
      setRules(data.rules)
      setText('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setAdding(false)
    }
  }

  async function deleteRule(index: number) {
    setDeleting(index)
    setError(null)
    try {
      const res = await fetch(`/api/studio/brands/${brandId}/rules/${index}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not delete the rule')
      setRules(data.rules)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setDeleting(null)
    }
  }

  const selectStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line-soft)', background: '#f5f4ff', color: 'var(--violet)', fontSize: 12, fontFamily: 'var(--mono)', cursor: 'pointer' }

  return (
    <div>
      <style>{RULE_ADDED_STYLE}</style>
      {rules.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginBottom: 16 }}>No rules yet. Add the first one below.</p>
      )}

      {rules.map((rule, i) => {
        const colors = VERB_COLORS[rule.verb] ?? { bg: 'var(--surface)', color: 'var(--ink)' }
        const isNew = i === newIndex
        return (
          <div
            key={i}
            onAnimationEnd={isNew ? (e) => { if (e.animationName === 'ruleHighlight') setNewIndex(null) } : undefined}
            style={{
              background: 'var(--surface)', borderRadius: 12, padding: 12, marginBottom: 8,
              border: '1px solid var(--line-soft)', display: 'flex',
              justifyContent: 'space-between', alignItems: 'flex-start',
              ...(isNew ? {
                animation: 'fadeUp 0.25s var(--ease-decel) both, ruleHighlight 1.4s ease forwards',
              } : {}),
            }}
          >
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--mono)', background: colors.bg, color: colors.color, borderRadius: 4, padding: '2px 6px', marginRight: 8 }}>
                {rule.verb}
              </span>
              <span style={{ fontSize: 11, color: 'var(--ink-faint)', marginRight: 6 }}>{rule.domain}:</span>
              <span style={{ fontSize: 11, color: 'var(--ink)' }}>{rule.text}</span>
            </div>
            <button onClick={() => deleteRule(i)} disabled={deleting === i} style={{ background: 'none', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: 16, padding: '0 0 0 8px', lineHeight: 1 }}>
              {deleting === i ? '…' : '×'}
            </button>
          </div>
        )
      })}

      <div style={{ border: '1.5px dashed rgba(74,61,176,0.3)', borderRadius: 12, padding: 12, marginTop: 12 }}>
        <p style={{ fontSize: 10, color: 'var(--violet)', fontFamily: 'var(--mono)', marginBottom: 8 }}>+ Add rule</p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <select value={verb} onChange={e => setVerb(e.target.value as Rule['verb'])} style={selectStyle}>
            {VERBS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={domain} onChange={e => setDomain(e.target.value as Rule['domain'])} style={selectStyle}>
            {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addRule()}
          placeholder="write the rule…"
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line-soft)', background: '#f7f7f7', fontSize: 12, color: 'var(--ink)', marginBottom: 8, boxSizing: 'border-box' }}
        />
        {error && (
          <p role="alert" style={{ fontSize: 11, color: 'var(--red)', marginBottom: 8, lineHeight: 1.5 }}>
            {error}
          </p>
        )}
        <button
          onClick={addRule}
          disabled={adding || !text.trim()}
          style={{ background: 'var(--ink)', color: '#fff', border: 'none', borderRadius: 100, padding: '8px 20px', fontSize: 11, fontFamily: 'var(--mono)', cursor: adding ? 'wait' : 'pointer', opacity: !text.trim() ? 0.4 : 1 }}
        >
          {adding ? 'Adding…' : 'Add'}
        </button>
      </div>
    </div>
  )
}
