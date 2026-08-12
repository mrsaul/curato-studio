'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, SelectableCard, SectionLabel } from '@/components/ui'

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
      <SectionLabel marginBottom="var(--space-4)">New post</SectionLabel>
      <h1 style={{
        fontSize: 26, fontWeight: 400, fontFamily: 'var(--display)',
        letterSpacing: '-0.02em', lineHeight: 1.15, color: 'var(--ink)', marginBottom: 6,
      }}>
        Which brand?
      </h1>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 24, lineHeight: 1.5 }}>
        Choose the brand this post is for
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
        {brands.map(brand => {
          const isSelected = selected?.id === brand.id
          return (
            <SelectableCard
              key={brand.id}
              selected={isSelected}
              onClick={() => setSelected(brand)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 15, fontWeight: isSelected ? 500 : 400, color: 'var(--ink)', marginBottom: brand.description ? 2 : 0 }}>
                    {brand.name}
                  </p>
                  {brand.description && (
                    <p style={{ fontSize: 12, color: 'var(--ink-faint)', lineHeight: 1.4 }}>
                      {brand.description}
                    </p>
                  )}
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
            </SelectableCard>
          )
        })}
      </div>

      <Button
        variant="cta"
        fullWidth
        onClick={handleStart}
        disabled={!selected}
      >
        {selected ? `Continue with ${selected.name}` : 'Select a brand'}
      </Button>
    </div>
  )
}
