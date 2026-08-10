'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Brand {
  id: string
  name: string
  description: string
  reviewerId: string
  ruleCount: number
  templateCount: number
  assetCount: number
}

interface Props {
  brands: Brand[]
}

export default function BrandPickerClient({ brands }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Brand | null>(brands[0] ?? null)

  function handleStart() {
    if (!selected) return
    const params = new URLSearchParams({
      brandId: selected.id,
      reviewerId: selected.reviewerId,
    })
    router.push(`/submit/input?${params.toString()}`)
  }

  return (
    <div style={{ paddingTop: 24, paddingBottom: 32 }}>
      <p style={{ fontSize: 10, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-faint)', marginBottom: 16 }}>
        New brief
      </p>
      <h1 style={{ fontSize: 26, fontWeight: 400, fontFamily: 'var(--display)', letterSpacing: '-0.02em', lineHeight: 1.15, color: 'var(--ink)', marginBottom: 6 }}>
        Working for
      </h1>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 24, lineHeight: 1.5 }}>
        Choose the brand this brief is for
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
        {brands.map(brand => {
          const isSelected = selected?.id === brand.id
          return (
            <button
              key={brand.id}
              onClick={() => setSelected(brand)}
              style={{
                textAlign: 'left', cursor: 'pointer', width: '100%',
                background: 'var(--surface)',
                border: isSelected ? '2px solid var(--violet)' : '1.5px solid var(--line-soft)',
                borderRadius: 14, padding: '14px 16px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 15, fontWeight: isSelected ? 500 : 400, color: 'var(--ink)', marginBottom: 2 }}>
                    {brand.name}
                  </p>
                  {brand.description && (
                    <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 8 }}>
                      {brand.description}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {brand.ruleCount > 0 && (
                      <span style={{ fontSize: 9, fontFamily: 'var(--mono)', background: 'rgba(74,61,176,0.08)', color: 'var(--violet)', borderRadius: 4, padding: '2px 5px' }}>
                        {brand.ruleCount} rules
                      </span>
                    )}
                    {brand.templateCount > 0 && (
                      <span style={{ fontSize: 9, fontFamily: 'var(--mono)', background: 'var(--bg)', color: 'var(--ink-faint)', borderRadius: 4, padding: '2px 5px' }}>
                        {brand.templateCount} templates
                      </span>
                    )}
                    {brand.assetCount > 0 && (
                      <span style={{ fontSize: 9, fontFamily: 'var(--mono)', background: 'var(--bg)', color: 'var(--ink-faint)', borderRadius: 4, padding: '2px 5px' }}>
                        {brand.assetCount} assets
                      </span>
                    )}
                  </div>
                </div>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginLeft: 12,
                  background: isSelected ? 'var(--violet)' : 'transparent',
                  border: isSelected ? 'none' : '1.5px solid var(--line-soft)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isSelected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <button
        onClick={handleStart}
        disabled={!selected}
        style={{
          width: '100%', minHeight: 52, borderRadius: 100,
          background: selected ? 'var(--ink)' : 'var(--surface)',
          color: selected ? '#fff' : 'var(--ink-faint)',
          border: 'none', fontSize: 13, fontFamily: 'var(--mono)',
          letterSpacing: '0.06em', textTransform: 'uppercase',
          cursor: selected ? 'pointer' : 'not-allowed',
        }}
      >
        {selected ? `Start with ${selected.name}` : 'Select a brand'}
      </button>
    </div>
  )
}
