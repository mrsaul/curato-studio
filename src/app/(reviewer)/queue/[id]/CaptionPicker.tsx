'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CaptionOption } from '@/types/request'

export default function CaptionPicker({
  requestId,
  options,
  recommendedCaption,
}: {
  requestId: string
  options: CaptionOption[]
  recommendedCaption: string | null
}) {
  const router = useRouter()
  const defaultIndex = Math.max(options.findIndex(o => o.text === recommendedCaption), 0)
  const [selectedIndex, setSelectedIndex] = useState<number>(defaultIndex)

  function handleUse() {
    router.push(`/queue/${requestId}/approve?option=${selectedIndex}`)
  }

  return (
    <div>
      {options.map((opt, i) => {
        const isSelected = selectedIndex === i
        return (
          <div
            key={i}
            onClick={() => setSelectedIndex(i)}
            style={{
              background: isSelected ? 'var(--bg)' : 'var(--surface)',
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 8,
              border: isSelected
                ? '2px solid var(--violet)'
                : '1px solid var(--line-soft)',
              cursor: 'pointer',
              transition: 'border-color 0.12s, background 0.12s',
            }}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 6,
            }}>
              <p style={{
                fontSize: 11, fontFamily: 'var(--mono)',
                color: 'var(--ink-faint)', textTransform: 'uppercase', margin: 0,
              }}>
                {opt.style}{recommendedCaption === opt.text ? ' · recommended' : ''}
              </p>
              {isSelected && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7.5" fill="var(--violet)"/>
                  <path d="M5 8l2 2 4-4" stroke="#fff" strokeWidth="1.5"
                    strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink)', margin: 0 }}>
              {opt.text}
            </p>
          </div>
        )
      })}

      <button
        onClick={handleUse}
        style={{
          width: '100%',
          height: 52,
          borderRadius: 100,
          background: 'var(--violet)',
          color: '#fff',
          border: 'none',
          fontSize: 13,
          fontFamily: 'var(--mono)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          marginTop: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
        }}
      >
        Use this
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  )
}
