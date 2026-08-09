# Reviewer Select → Edit → Approve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-page review form with a two-page flow: Art Director picks a caption on the detail page, then edits/AI-improves and approves on a dedicated Approve page.

**Architecture:** Add `CaptionPicker` client component to `/queue/[id]` for interactive selection; new `/queue/[id]/approve` server+client page pair for editing; new `/api/improve-caption` POST endpoint that calls Claude to rewrite a caption per the director's direction. No DB schema changes.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (existing client helpers), Anthropic Claude API (existing `callClaude` fetch pattern from `/api/draft/route.ts`), inline CSS variables (no Tailwind).

---

## File Map

| Action | File |
|---|---|
| Create | `src/app/api/improve-caption/route.ts` |
| Create | `src/app/(reviewer)/queue/[id]/CaptionPicker.tsx` |
| Modify | `src/app/(reviewer)/queue/[id]/page.tsx` |
| Create | `src/app/(reviewer)/queue/[id]/approve/page.tsx` |
| Create | `src/app/(reviewer)/queue/[id]/approve/ApproveActions.tsx` |

`ReviewActions.tsx` becomes dead code after Task 3 — leave the file, it just won't be imported.

---

### Task 1: `/api/improve-caption` route

**Files:**
- Create: `src/app/api/improve-caption/route.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/app/api/improve-caption/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getRequest } from '@/lib/requests'
import { getBrandContext, formatBrandSystem } from '@/lib/brand'

const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY

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
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Claude error: ${response.status}`)
  const data = await response.json() as { content: Array<{ type: string; text: string }> }
  return data.content.find(b => b.type === 'text')?.text ?? ''
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!CLAUDE_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const body = await req.json() as {
    request_id?: string
    current_caption?: string
    direction?: string
  }

  if (!body.request_id || !body.current_caption || !body.direction?.trim()) {
    return NextResponse.json(
      { error: 'request_id, current_caption, and direction are required' },
      { status: 400 }
    )
  }

  const request = await getRequest(supabase, body.request_id)
  if (!request || request.reviewer_id !== user.id) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }
  if (request.status !== 'awaiting_review') {
    return NextResponse.json({ error: 'Request is not awaiting review' }, { status: 400 })
  }

  let brandSystem = ''
  if (request.context_id) {
    try {
      const brand = await getBrandContext(request.context_id, supabase)
      brandSystem = formatBrandSystem(brand)
    } catch { /* proceed without brand context */ }
  }

  const prompt = `You are helping an Art Director refine a social media caption.

Original brief: ${request.transcript ?? request.raw_text ?? '(no text — media upload)'}
Intent: ${request.intent_summary ?? ''}
${brandSystem ? `Brand voice:\n${brandSystem}` : ''}

Current caption:
"${body.current_caption}"

Art Director's direction: "${body.direction}"

Rewrite the caption following the direction exactly. Return ONLY the improved caption text — no quotes, no explanation, no JSON wrapper.`

  try {
    const improved = await callClaude(prompt)
    return NextResponse.json({ improved_caption: improved.trim() })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Claude call failed' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (zero errors).

- [ ] **Step 3: Commit**

```bash
git -C "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio" add src/app/api/improve-caption/route.ts
git -C "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio" commit -m "feat: add /api/improve-caption endpoint"
```

---

### Task 2: `CaptionPicker` client component

**Files:**
- Create: `src/app/(reviewer)/queue/[id]/CaptionPicker.tsx`

- [ ] **Step 1: Create the file**

```typescript
// src/app/(reviewer)/queue/[id]/CaptionPicker.tsx
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
```

- [ ] **Step 2: Type-check**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git -C "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio" add src/app/(reviewer)/queue/[id]/CaptionPicker.tsx
git -C "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio" commit -m "feat: add CaptionPicker client component"
```

---

### Task 3: Update `/queue/[id]/page.tsx`

**Files:**
- Modify: `src/app/(reviewer)/queue/[id]/page.tsx`

Replace the static caption options block and remove `ReviewActions`. The page becomes selection-only.

- [ ] **Step 1: Overwrite the file**

```typescript
// src/app/(reviewer)/queue/[id]/page.tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getRequest, getRequestDraft } from '@/lib/requests'
import CaptionPicker from './CaptionPicker'

export default async function RequestDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const request = await getRequest(supabase, params.id)
  if (!request || request.reviewer_id !== user.id) notFound()

  const draft = await getRequestDraft(supabase, request.id)

  return (
    <div style={{ paddingTop: 24, paddingBottom: 32 }}>
      {/* Back */}
      <Link href="/queue" style={{
        fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
        textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
        gap: 6, marginBottom: 20,
      }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Queue
      </Link>

      {/* Original input */}
      <section style={{ marginBottom: 24 }}>
        <p style={{
          fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
          textTransform: 'uppercase', marginBottom: 8,
        }}>
          Original — {request.source_type}
        </p>
        <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.6, margin: 0 }}>
            {request.transcript ?? request.raw_text ?? '(media upload)'}
          </p>
        </div>
      </section>

      {/* Interpretation */}
      {request.intent_summary && (
        <section style={{ marginBottom: 24 }}>
          <p style={{
            fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
            textTransform: 'uppercase', marginBottom: 8,
          }}>
            Interpretation
          </p>
          <p style={{ fontSize: 14, color: 'var(--violet)', lineHeight: 1.5, margin: 0 }}>
            {request.intent_summary}
          </p>
        </section>
      )}

      {/* Caption picker / draft state */}
      {draft ? (
        <>
          <section style={{ marginBottom: 16 }}>
            <p style={{
              fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
              textTransform: 'uppercase', marginBottom: 8,
            }}>
              Caption options — pick one
            </p>
            {request.status === 'awaiting_review' ? (
              <CaptionPicker
                requestId={request.id}
                options={draft.caption_options}
                recommendedCaption={draft.recommended_caption}
              />
            ) : (
              <>
                {draft.caption_options.map((opt, i) => (
                  <div key={i} style={{
                    background: draft.recommended_caption === opt.text ? 'var(--bg)' : 'var(--surface)',
                    borderRadius: 10, padding: '12px 14px', marginBottom: 8,
                    border: draft.recommended_caption === opt.text
                      ? '2px solid var(--violet)' : '1px solid var(--line-soft)',
                  }}>
                    <p style={{
                      fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
                      textTransform: 'uppercase', marginBottom: 4, margin: '0 0 4px',
                    }}>
                      {opt.style}{draft.recommended_caption === opt.text ? ' · recommended' : ''}
                    </p>
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink)', margin: 0 }}>
                      {opt.text}
                    </p>
                  </div>
                ))}
                <p style={{
                  fontSize: 14, color: 'var(--ink-faint)', textAlign: 'center', marginTop: 16,
                }}>
                  This request is {request.status}.
                </p>
              </>
            )}
          </section>

          {/* CTA */}
          {draft.cta && (
            <section style={{ marginBottom: 16 }}>
              <p style={{
                fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
                textTransform: 'uppercase', marginBottom: 6,
              }}>CTA</p>
              <p style={{ fontSize: 14, color: 'var(--ink)', margin: 0 }}>{draft.cta}</p>
            </section>
          )}

          {/* Hashtags */}
          {draft.hashtags.length > 0 && (
            <section style={{ marginBottom: 16 }}>
              <p style={{
                fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
                textTransform: 'uppercase', marginBottom: 6,
              }}>Hashtags</p>
              <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>
                {draft.hashtags.map(h => `#${h}`).join(' ')}
              </p>
            </section>
          )}

          {/* Visual brief */}
          {draft.visual_brief && (
            <section style={{ marginBottom: 16 }}>
              <p style={{
                fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
                textTransform: 'uppercase', marginBottom: 6,
              }}>Visual brief</p>
              <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.5, margin: 0 }}>
                {draft.visual_brief}
              </p>
            </section>
          )}

          {/* Flags */}
          {draft.flags.length > 0 && (
            <section style={{ marginBottom: 16 }}>
              <p style={{
                fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--amber)',
                textTransform: 'uppercase', marginBottom: 6,
              }}>Flags</p>
              {draft.flags.map((f, i) => (
                <p key={i} style={{ fontSize: 13, color: 'var(--amber)', marginBottom: 4 }}>
                  {f.type}: {f.note}
                </p>
              ))}
            </section>
          )}
        </>
      ) : (
        <p style={{ color: 'var(--ink-faint)', fontSize: 14 }}>Draft is being generated…</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git -C "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio" add src/app/(reviewer)/queue/[id]/page.tsx
git -C "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio" commit -m "feat: make caption options interactive, remove ReviewActions from detail page"
```

---

### Task 4: `ApproveActions` client component

**Files:**
- Create: `src/app/(reviewer)/queue/[id]/approve/ApproveActions.tsx`

- [ ] **Step 1: Create the file**

```typescript
// src/app/(reviewer)/queue/[id]/approve/ApproveActions.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1.5px solid var(--line-soft)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  fontSize: 14,
  fontFamily: 'var(--body)',
  lineHeight: 1.5,
  outline: 'none',
  boxSizing: 'border-box',
  resize: 'none',
}

export default function ApproveActions({
  requestId,
  initialCaption,
}: {
  requestId: string
  initialCaption: string
}) {
  const router = useRouter()
  const [caption, setCaption] = useState(initialCaption)
  const [direction, setDirection] = useState('')
  const [notes, setNotes] = useState('')
  const [improving, setImproving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleImprove() {
    if (!direction.trim() || improving) return
    setImproving(true)
    setError(null)
    try {
      const res = await fetch('/api/improve-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          current_caption: caption,
          direction: direction.trim(),
        }),
      })
      const json = await res.json() as { improved_caption?: string; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Improve failed')
      setCaption(json.improved_caption ?? caption)
      setDirection('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setImproving(false)
    }
  }

  async function handleDecision(decision: 'approved' | 'declined') {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          decision,
          edited_caption: caption !== initialCaption ? caption : undefined,
          notes: notes.trim() || undefined,
        }),
      })
      const json = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Review failed')
      router.push('/queue')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  const disabled = improving || submitting

  return (
    <div>
      {/* Caption textarea */}
      <p style={{
        fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
        textTransform: 'uppercase', marginBottom: 8,
      }}>
        Caption
      </p>
      <textarea
        value={caption}
        onChange={e => setCaption(e.target.value)}
        rows={6}
        disabled={disabled}
        style={{ ...inputStyle, marginBottom: 20, opacity: disabled ? 0.7 : 1 }}
      />

      {/* Improve with AI */}
      <p style={{
        fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
        textTransform: 'uppercase', marginBottom: 8,
      }}>
        Improve with AI
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          type="text"
          value={direction}
          onChange={e => setDirection(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleImprove()}
          placeholder="Make it shorter, more playful, add a hook…"
          disabled={disabled}
          style={{
            flex: 1,
            padding: '11px 14px',
            borderRadius: 10,
            border: '1.5px solid var(--line-soft)',
            background: 'var(--surface)',
            color: 'var(--ink)',
            fontSize: 14,
            fontFamily: 'var(--body)',
            outline: 'none',
            opacity: disabled ? 0.7 : 1,
          }}
        />
        <button
          onClick={handleImprove}
          disabled={!direction.trim() || disabled}
          style={{
            height: 46,
            paddingInline: 18,
            borderRadius: 100,
            background: 'var(--ink)',
            color: '#fff',
            border: 'none',
            fontSize: 12,
            fontFamily: 'var(--mono)',
            letterSpacing: '0.04em',
            cursor: !direction.trim() || disabled ? 'not-allowed' : 'pointer',
            opacity: !direction.trim() || disabled ? 0.5 : 1,
            whiteSpace: 'nowrap',
            transition: 'opacity 0.12s',
          }}
        >
          {improving ? 'Improving…' : '↑ Improve'}
        </button>
      </div>

      {/* Notes */}
      <p style={{
        fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
        textTransform: 'uppercase', marginBottom: 8,
      }}>
        Notes for creator (optional)
      </p>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Any context or guidance for the creator…"
        rows={2}
        disabled={disabled}
        style={{ ...inputStyle, marginBottom: 24, opacity: disabled ? 0.7 : 1 }}
      />

      {/* Error */}
      {error && (
        <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{error}</p>
      )}

      {/* Approve */}
      <button
        onClick={() => handleDecision('approved')}
        disabled={disabled}
        style={{
          width: '100%',
          minHeight: 'var(--touch)',
          borderRadius: 14,
          background: 'var(--green)',
          color: '#fff',
          border: 'none',
          fontSize: 15,
          marginBottom: 10,
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {submitting ? 'Sending…' : '✓ Approve & send to creator'}
      </button>

      {/* Decline */}
      <button
        onClick={() => handleDecision('declined')}
        disabled={disabled}
        style={{
          width: '100%',
          minHeight: 'var(--touch)',
          borderRadius: 14,
          background: 'none',
          color: 'var(--red)',
          border: '1.5px solid var(--red)',
          fontSize: 15,
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        Decline
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git -C "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio" add src/app/(reviewer)/queue/[id]/approve/ApproveActions.tsx
git -C "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio" commit -m "feat: add ApproveActions client component with edit and AI improve"
```

---

### Task 5: `/queue/[id]/approve` server page

**Files:**
- Create: `src/app/(reviewer)/queue/[id]/approve/page.tsx`

- [ ] **Step 1: Create the file**

```typescript
// src/app/(reviewer)/queue/[id]/approve/page.tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getRequest, getRequestDraft } from '@/lib/requests'
import ApproveActions from './ApproveActions'

export default async function ApprovePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { option?: string }
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const request = await getRequest(supabase, params.id)
  if (!request || request.reviewer_id !== user.id) notFound()

  if (request.status !== 'awaiting_review') {
    redirect(`/queue/${params.id}`)
  }

  const draft = await getRequestDraft(supabase, request.id)
  if (!draft) redirect(`/queue/${params.id}`)

  const rawIndex = parseInt(searchParams.option ?? '0', 10)
  const optionIndex = isNaN(rawIndex)
    ? 0
    : Math.min(Math.max(rawIndex, 0), draft.caption_options.length - 1)

  const initialCaption =
    draft.caption_options[optionIndex]?.text ?? draft.recommended_caption ?? ''

  const chosenStyle = draft.caption_options[optionIndex]?.style ?? 'caption'

  return (
    <div style={{ paddingTop: 24, paddingBottom: 32 }}>
      {/* Back */}
      <Link href={`/queue/${params.id}`} style={{
        fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
        textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
        gap: 6, marginBottom: 20,
      }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Back to options
      </Link>

      {/* Header */}
      <p style={{
        fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.12em',
        textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4,
      }}>
        {chosenStyle} option
      </p>
      <h1 style={{
        fontFamily: 'var(--display)', fontSize: 26, fontWeight: 400,
        letterSpacing: '-0.02em', color: 'var(--ink)', marginBottom: 28,
      }}>
        Edit & approve
      </h1>

      <ApproveActions requestId={request.id} initialCaption={initialCaption} />
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git -C "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio" add src/app/(reviewer)/queue/[id]/approve/page.tsx
git -C "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio" commit -m "feat: add /queue/[id]/approve server page"
```

---

### Task 6: Deploy and verify

- [ ] **Step 1: Final type-check**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio" && npx tsc --noEmit 2>&1
```

Expected: no output (zero errors).

- [ ] **Step 2: Deploy to production**

```bash
cd "/Users/saulsuaza/Documents/CLAUDE CODE PROJECTS/curato-studio" && vercel --prod 2>&1
```

Expected: `▲ Aliased https://curato-studio-azure.vercel.app` in output, status READY.

- [ ] **Step 3: Verify the full flow**

As Art Director:
1. Open a request in the queue — caption options should be tappable cards (violet border on selected, checkmark icon).
2. Tap a non-recommended option — selection ring should move to that card.
3. Tap "Use this →" — should navigate to `/queue/[id]/approve?option=<index>`.
4. On Approve page: the chosen caption should be pre-loaded in the textarea. Edit it manually — text changes inline.
5. Type a direction ("make it shorter") in the Improve field, press Enter or tap "↑ Improve" — textarea should update with Claude's rewrite, direction field should clear.
6. Tap "✓ Approve & send to creator" — should redirect to `/queue`, request should disappear from queue.
7. As Creator: open `/requests` — the approved brief should appear in the Done section.
