# Director's Atelier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Director's Studio section — a brand-centric workspace for managing voice rules, AI judgments, post templates, and image assets.

**Architecture:** New `(reviewer)/studio/` route group with a Studio tab in the bottom nav. Seven API route groups under `/api/studio/brands/`. All data scoped to the authenticated reviewer via RLS. Assets stored in a private `brand-assets` Supabase storage bucket.

**Tech Stack:** Next.js 14 App Router, Supabase (auth + RLS + storage), TypeScript. No test framework — verification is `npm run build` (TypeScript) + manual browser check.

---

## File Map

**New files:**
- `supabase/migrations/003_atelier.sql`
- `src/types/brand.ts` ← modify (add new types)
- `src/app/(reviewer)/BottomNav.tsx` ← modify (add Studio tab)
- `src/app/api/studio/brands/route.ts`
- `src/app/api/studio/brands/[id]/route.ts`
- `src/app/api/studio/brands/[id]/rules/route.ts`
- `src/app/api/studio/brands/[id]/rules/[index]/route.ts`
- `src/app/api/studio/brands/[id]/mind/route.ts`
- `src/app/api/studio/brands/[id]/mind/[judgmentId]/route.ts`
- `src/app/api/studio/brands/[id]/templates/route.ts`
- `src/app/api/studio/brands/[id]/templates/[tid]/route.ts`
- `src/app/api/studio/brands/[id]/assets/route.ts`
- `src/app/api/studio/brands/[id]/assets/[assetId]/route.ts`
- `src/app/(reviewer)/studio/page.tsx`
- `src/app/(reviewer)/studio/new/page.tsx`
- `src/app/(reviewer)/studio/[brandId]/page.tsx`
- `src/app/(reviewer)/studio/[brandId]/rules/page.tsx`
- `src/app/(reviewer)/studio/[brandId]/rules/RulesClient.tsx`
- `src/app/(reviewer)/studio/[brandId]/mind/page.tsx`
- `src/app/(reviewer)/studio/[brandId]/mind/MindClient.tsx`
- `src/app/(reviewer)/studio/[brandId]/templates/page.tsx`
- `src/app/(reviewer)/studio/[brandId]/templates/TemplatesClient.tsx`
- `src/app/(reviewer)/studio/[brandId]/assets/page.tsx`
- `src/app/(reviewer)/studio/[brandId]/assets/AssetsClient.tsx`

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/003_atelier.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/003_atelier.sql
-- Apply in Supabase dashboard → SQL editor

-- 1. Scope templates to a brand (context)
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS context_id uuid REFERENCES public.contexts(id) ON DELETE SET NULL;

-- 2. Brand assets table
CREATE TABLE IF NOT EXISTS public.brand_assets (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  context_id   uuid REFERENCES public.contexts(id) ON DELETE CASCADE NOT NULL,
  reviewer_id  uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name         text NOT NULL,
  storage_path text NOT NULL,
  url          text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviewer owns brand assets"
  ON public.brand_assets FOR ALL
  USING (reviewer_id = auth.uid())
  WITH CHECK (reviewer_id = auth.uid());

-- 3. Storage bucket for brand assets (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "reviewer can upload brand assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "reviewer can read own brand assets"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "reviewer can delete own brand assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: Apply in Supabase dashboard**

Go to [Supabase dashboard](https://supabase.com) → Project → SQL Editor → paste the SQL above → Run.

Verify: `brand_assets` table appears in Table Editor. `brand-assets` bucket appears in Storage.

- [ ] **Step 3: Verify `contexts` table has `reviewer_id`**

In SQL Editor run:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'contexts' ORDER BY column_name;
```

Expected output includes: `id`, `name`, `description`, `reviewer_id`, `created_at`.

If `reviewer_id` is missing, run:
```sql
ALTER TABLE public.contexts ADD COLUMN reviewer_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
```

- [ ] **Step 4: Commit the migration file**

```bash
git add supabase/migrations/003_atelier.sql
git commit -m "feat: add brand_assets table and scope templates to context"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/types/brand.ts`

- [ ] **Step 1: Add Atelier types to brand.ts**

Replace the entire file with:

```typescript
// src/types/brand.ts

export interface BrandRule {
  verb: string
  domain: string
  text: string
}

export interface BrandJudgment {
  verb: string
  statement: string
}

export interface BrandContext {
  contextName: string
  contextDescription: string
  rules: BrandRule[]
  judgments: BrandJudgment[]
}

// Atelier types

export interface AtelierBrand {
  id: string
  name: string
  description: string
  ruleCount: number
  pendingMindCount: number
  templateCount: number
  assetCount: number
}

export interface Rule {
  verb: 'always' | 'never' | 'prefer' | 'avoid'
  domain: 'voice' | 'visual' | 'content' | 'format' | 'timing'
  text: string
}

export interface Judgment {
  id: string
  verb: string
  statement: string
  status: 'proposed' | 'confirmed' | 'rejected'
  created_at: string
}

export interface AtelierTemplate {
  id: string
  context_id: string
  name: string
  type: 'photo_post' | 'quote_card' | 'announcement' | 'carousel'
  description: string
  active: boolean
  created_at: string
}

export interface BrandAsset {
  id: string
  context_id: string
  name: string
  url: string
  created_at: string
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npm run build 2>&1 | head -30
```

Expected: no type errors. The build may fail on missing pages (404 for new routes) — that's fine for now.

- [ ] **Step 3: Commit**

```bash
git add src/types/brand.ts
git commit -m "feat: add Atelier TypeScript types"
```

---

## Task 3: API — Brands CRUD

**Files:**
- Create: `src/app/api/studio/brands/route.ts`
- Create: `src/app/api/studio/brands/[id]/route.ts`

- [ ] **Step 1: Create `src/app/api/studio/brands/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: contexts } = await supabase
    .from('contexts')
    .select('id, name, description')
    .eq('reviewer_id', user.id)
    .order('created_at', { ascending: true })

  if (!contexts) return NextResponse.json({ brands: [] })

  const brands = await Promise.all(contexts.map(async (ctx) => {
    const [capsule, pending, templates, assets] = await Promise.all([
      supabase.from('capsules').select('rules').eq('context_id', ctx.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('judgments').select('id', { count: 'exact', head: true })
        .eq('context_id', ctx.id).eq('status', 'proposed'),
      supabase.from('templates').select('id', { count: 'exact', head: true })
        .eq('context_id', ctx.id).eq('active', true),
      supabase.from('brand_assets').select('id', { count: 'exact', head: true })
        .eq('context_id', ctx.id),
    ])
    const rules = (capsule.data?.rules ?? []) as unknown[]
    return {
      id: ctx.id,
      name: ctx.name,
      description: ctx.description ?? '',
      ruleCount: rules.length,
      pendingMindCount: pending.count ?? 0,
      templateCount: templates.count ?? 0,
      assetCount: assets.count ?? 0,
    }
  }))

  return NextResponse.json({ brands })
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { name?: string; description?: string }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('contexts')
    .insert({ name: body.name.trim(), description: body.description?.trim() ?? '', reviewer_id: user.id })
    .select('id, name, description')
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create brand' }, { status: 500 })
  return NextResponse.json({ brand: data })
}
```

- [ ] **Step 2: Create `src/app/api/studio/brands/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

async function getOwnedBrand(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, id: string, userId: string) {
  const { data } = await supabase
    .from('contexts')
    .select('id, name, description, reviewer_id')
    .eq('id', id)
    .single()
  if (!data || data.reviewer_id !== userId) return null
  return data
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const brand = await getOwnedBrand(supabase, id, user.id)
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [capsule, pending, templates, assets] = await Promise.all([
    supabase.from('capsules').select('rules').eq('context_id', id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('judgments').select('id', { count: 'exact', head: true })
      .eq('context_id', id).eq('status', 'proposed'),
    supabase.from('templates').select('id', { count: 'exact', head: true })
      .eq('context_id', id).eq('active', true),
    supabase.from('brand_assets').select('id', { count: 'exact', head: true })
      .eq('context_id', id),
  ])
  const rules = (capsule.data?.rules ?? []) as unknown[]

  return NextResponse.json({
    brand: {
      id: brand.id, name: brand.name, description: brand.description ?? '',
      ruleCount: rules.length,
      pendingMindCount: pending.count ?? 0,
      templateCount: templates.count ?? 0,
      assetCount: assets.count ?? 0,
    }
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const brand = await getOwnedBrand(supabase, id, user.id)
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as { name?: string; description?: string }
  const updates: Record<string, string> = {}
  if (body.name?.trim()) updates.name = body.name.trim()
  if (body.description !== undefined) updates.description = body.description.trim()

  const { data, error } = await supabase
    .from('contexts')
    .update(updates)
    .eq('id', id)
    .select('id, name, description')
    .single()

  if (error) return NextResponse.json({ error: 'Failed to update brand' }, { status: 500 })
  return NextResponse.json({ brand: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const brand = await getOwnedBrand(supabase, id, user.id)
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabase.from('contexts').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no TypeScript errors in the new files.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/studio/
git commit -m "feat: API routes for brand CRUD"
```

---

## Task 4: API — Rules

**Files:**
- Create: `src/app/api/studio/brands/[id]/rules/route.ts`
- Create: `src/app/api/studio/brands/[id]/rules/[index]/route.ts`

The `capsules` table stores rules as a JSONB array on the most recent row. We treat it as a single mutable row per context (upsert by context_id).

- [ ] **Step 1: Create `src/app/api/studio/brands/[id]/rules/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Rule } from '@/types/brand'

const VERBS = ['always', 'never', 'prefer', 'avoid'] as const
const DOMAINS = ['voice', 'visual', 'content', 'format', 'timing'] as const

async function getRules(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, contextId: string): Promise<Rule[]> {
  const { data } = await supabase
    .from('capsules')
    .select('id, rules')
    .eq('context_id', contextId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.rules ?? []) as Rule[]
}

async function saveRules(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, contextId: string, rules: Rule[]) {
  const { data: existing } = await supabase
    .from('capsules')
    .select('id')
    .eq('context_id', contextId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    await supabase.from('capsules').update({ rules }).eq('id', existing.id)
  } else {
    await supabase.from('capsules').insert({ context_id: contextId, rules })
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: ctx } = await supabase.from('contexts').select('reviewer_id').eq('id', id).single()
  if (!ctx || ctx.reviewer_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const rules = await getRules(supabase, id)
  return NextResponse.json({ rules })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: ctx } = await supabase.from('contexts').select('reviewer_id').eq('id', id).single()
  if (!ctx || ctx.reviewer_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as { verb?: string; domain?: string; text?: string }
  if (!body.verb || !body.domain || !body.text?.trim()) {
    return NextResponse.json({ error: 'verb, domain, and text are required' }, { status: 400 })
  }
  if (!VERBS.includes(body.verb as typeof VERBS[number])) {
    return NextResponse.json({ error: `verb must be one of: ${VERBS.join(', ')}` }, { status: 400 })
  }
  if (!DOMAINS.includes(body.domain as typeof DOMAINS[number])) {
    return NextResponse.json({ error: `domain must be one of: ${DOMAINS.join(', ')}` }, { status: 400 })
  }

  const rules = await getRules(supabase, id)
  const newRule: Rule = { verb: body.verb as Rule['verb'], domain: body.domain as Rule['domain'], text: body.text.trim() }
  rules.push(newRule)
  await saveRules(supabase, id, rules)

  return NextResponse.json({ rules })
}
```

- [ ] **Step 2: Create `src/app/api/studio/brands/[id]/rules/[index]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Rule } from '@/types/brand'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; index: string }> }) {
  const { id, index } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: ctx } = await supabase.from('contexts').select('reviewer_id').eq('id', id).single()
  if (!ctx || ctx.reviewer_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: capsule } = await supabase
    .from('capsules').select('id, rules').eq('context_id', id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  const rules = ((capsule?.rules ?? []) as Rule[])
  const idx = parseInt(index, 10)
  if (isNaN(idx) || idx < 0 || idx >= rules.length) {
    return NextResponse.json({ error: 'Invalid index' }, { status: 400 })
  }

  rules.splice(idx, 1)

  if (capsule?.id) {
    await supabase.from('capsules').update({ rules }).eq('id', capsule.id)
  }

  return NextResponse.json({ rules })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/studio/brands/
git commit -m "feat: API routes for brand rules"
```

---

## Task 5: API — Mind (Judgments)

**Files:**
- Create: `src/app/api/studio/brands/[id]/mind/route.ts`
- Create: `src/app/api/studio/brands/[id]/mind/[judgmentId]/route.ts`

- [ ] **Step 1: Create `src/app/api/studio/brands/[id]/mind/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: ctx } = await supabase.from('contexts').select('reviewer_id').eq('id', id).single()
  if (!ctx || ctx.reviewer_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: all } = await supabase
    .from('judgments')
    .select('id, verb, statement, status, created_at')
    .eq('context_id', id)
    .in('status', ['proposed', 'confirmed'])
    .order('created_at', { ascending: false })

  const pending = (all ?? []).filter(j => j.status === 'proposed')
  const confirmed = (all ?? []).filter(j => j.status === 'confirmed')

  return NextResponse.json({ pending, confirmed })
}
```

- [ ] **Step 2: Create `src/app/api/studio/brands/[id]/mind/[judgmentId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; judgmentId: string }> }) {
  const { id, judgmentId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: ctx } = await supabase.from('contexts').select('reviewer_id').eq('id', id).single()
  if (!ctx || ctx.reviewer_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as { status?: string }
  if (!body.status || !['confirmed', 'rejected'].includes(body.status)) {
    return NextResponse.json({ error: 'status must be confirmed or rejected' }, { status: 400 })
  }

  const { error } = await supabase
    .from('judgments')
    .update({ status: body.status })
    .eq('id', judgmentId)
    .eq('context_id', id)

  if (error) return NextResponse.json({ error: 'Failed to update judgment' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/studio/brands/
git commit -m "feat: API routes for Mind judgment review"
```

---

## Task 6: API — Templates

**Files:**
- Create: `src/app/api/studio/brands/[id]/templates/route.ts`
- Create: `src/app/api/studio/brands/[id]/templates/[tid]/route.ts`

- [ ] **Step 1: Create `src/app/api/studio/brands/[id]/templates/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const TYPES = ['photo_post', 'quote_card', 'announcement', 'carousel'] as const

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: ctx } = await supabase.from('contexts').select('reviewer_id').eq('id', id).single()
  if (!ctx || ctx.reviewer_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: templates } = await supabase
    .from('templates')
    .select('id, context_id, name, type, description, active, created_at')
    .eq('context_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ templates: templates ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: ctx } = await supabase.from('contexts').select('reviewer_id').eq('id', id).single()
  if (!ctx || ctx.reviewer_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as { name?: string; type?: string; description?: string }
  if (!body.name?.trim() || !body.type) {
    return NextResponse.json({ error: 'name and type are required' }, { status: 400 })
  }
  if (!TYPES.includes(body.type as typeof TYPES[number])) {
    return NextResponse.json({ error: `type must be one of: ${TYPES.join(', ')}` }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('templates')
    .insert({
      reviewer_id: user.id,
      context_id: id,
      name: body.name.trim(),
      type: body.type,
      description: body.description?.trim() ?? '',
    })
    .select('id, context_id, name, type, description, active, created_at')
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  return NextResponse.json({ template: data })
}
```

- [ ] **Step 2: Create `src/app/api/studio/brands/[id]/templates/[tid]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; tid: string }> }) {
  const { id, tid } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: ctx } = await supabase.from('contexts').select('reviewer_id').eq('id', id).single()
  if (!ctx || ctx.reviewer_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as { name?: string; description?: string; active?: boolean }
  const updates: Record<string, unknown> = {}
  if (body.name?.trim()) updates.name = body.name.trim()
  if (body.description !== undefined) updates.description = body.description
  if (body.active !== undefined) updates.active = body.active

  const { data, error } = await supabase
    .from('templates')
    .update(updates)
    .eq('id', tid)
    .eq('context_id', id)
    .select('id, context_id, name, type, description, active, created_at')
    .single()

  if (error) return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
  return NextResponse.json({ template: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; tid: string }> }) {
  const { id, tid } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: ctx } = await supabase.from('contexts').select('reviewer_id').eq('id', id).single()
  if (!ctx || ctx.reviewer_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabase.from('templates').delete().eq('id', tid).eq('context_id', id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/studio/brands/
git commit -m "feat: API routes for templates"
```

---

## Task 7: API — Assets

**Files:**
- Create: `src/app/api/studio/brands/[id]/assets/route.ts`
- Create: `src/app/api/studio/brands/[id]/assets/[assetId]/route.ts`

- [ ] **Step 1: Create `src/app/api/studio/brands/[id]/assets/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: ctx } = await supabase.from('contexts').select('reviewer_id').eq('id', id).single()
  if (!ctx || ctx.reviewer_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: assets } = await supabase
    .from('brand_assets')
    .select('id, context_id, name, url, created_at')
    .eq('context_id', id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ assets: assets ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: ctx } = await supabase.from('contexts').select('reviewer_id').eq('id', id).single()
  if (!ctx || ctx.reviewer_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

  const ext = file.name.split('.').pop() ?? 'jpg'
  const fileName = `${crypto.randomUUID()}.${ext}`
  const storagePath = `${user.id}/${fileName}`

  const service = createServiceSupabaseClient()
  const { error: uploadError } = await service.storage
    .from('brand-assets')
    .upload(storagePath, file, { contentType: file.type, upsert: false })

  if (uploadError) return NextResponse.json({ error: 'Upload failed' }, { status: 500 })

  const { data: signedData } = await service.storage
    .from('brand-assets')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365) // 1 year

  const url = signedData?.signedUrl ?? ''

  const { data: asset, error: dbError } = await supabase
    .from('brand_assets')
    .insert({ context_id: id, reviewer_id: user.id, name: file.name, storage_path: storagePath, url })
    .select('id, context_id, name, url, created_at')
    .single()

  if (dbError) return NextResponse.json({ error: 'Failed to save asset' }, { status: 500 })
  return NextResponse.json({ asset })
}
```

- [ ] **Step 2: Create `src/app/api/studio/brands/[id]/assets/[assetId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: asset } = await supabase
    .from('brand_assets')
    .select('id, storage_path, reviewer_id')
    .eq('id', assetId)
    .eq('context_id', id)
    .single()

  if (!asset || asset.reviewer_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const service = createServiceSupabaseClient()
  await service.storage.from('brand-assets').remove([asset.storage_path])
  await supabase.from('brand_assets').delete().eq('id', assetId)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Build check**

```bash
npm run build 2>&1 | grep -E "^.*error" | head -20
```

Expected: no errors in API routes.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/studio/
git commit -m "feat: API routes for brand assets"
```

---

## Task 8: BottomNav + Studio Brand List

**Files:**
- Modify: `src/app/(reviewer)/BottomNav.tsx`
- Create: `src/app/(reviewer)/studio/page.tsx`
- Create: `src/app/(reviewer)/studio/new/page.tsx`

- [ ] **Step 1: Add Studio tab to `src/app/(reviewer)/BottomNav.tsx`**

Add a Studio icon SVG and add the tab to the array. Full file:

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const InboxIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M1.5 8.5h3.5l1.5 2h3l1.5-2h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
)

const ClockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M8 5.5V8.5l2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const StudioIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 2l1.5 3.5H13l-2.8 2 1.1 3.5L8 9 4.7 11 5.8 7.5 3 5.5h3.5L8 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
  </svg>
)

export default function ReviewerBottomNav() {
  const pathname = usePathname()

  const tabs = [
    {
      label: 'QUEUE',
      href: '/queue',
      icon: <InboxIcon />,
      active: pathname === '/queue' || pathname.startsWith('/queue/'),
    },
    {
      label: 'DONE',
      href: '/history',
      icon: <ClockIcon />,
      active: pathname === '/history',
    },
    {
      label: 'STUDIO',
      href: '/studio',
      icon: <StudioIcon />,
      active: pathname === '/studio' || pathname.startsWith('/studio/'),
    },
  ]

  return (
    <nav style={{
      position: 'fixed',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--ink)',
      borderRadius: 100,
      padding: 5,
      display: 'flex',
      gap: 2,
      boxShadow: '0 4px 28px rgba(26,23,20,0.28)',
      zIndex: 200,
    }}>
      {tabs.map(tab => (
        <Link
          key={tab.href}
          href={tab.href}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '9px 20px',
            borderRadius: 100,
            background: tab.active ? 'rgba(255,255,255,0.13)' : 'transparent',
            color: tab.active ? '#fff' : 'rgba(255,255,255,0.38)',
            textDecoration: 'none',
            fontSize: 11,
            fontFamily: 'var(--mono)',
            letterSpacing: '0.06em',
            minHeight: 44,
            transition: 'background 0.15s, color 0.15s',
            whiteSpace: 'nowrap',
          }}
        >
          {tab.icon}
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
```

- [ ] **Step 2: Create `src/app/(reviewer)/studio/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { AtelierBrand } from '@/types/brand'

export default async function StudioPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/studio/brands`,
    { headers: { cookie: '' }, cache: 'no-store' }
  )

  // Direct DB query (avoids self-fetch complexity in server components)
  const { data: contexts } = await supabase
    .from('contexts')
    .select('id, name, description')
    .eq('reviewer_id', user.id)
    .order('created_at', { ascending: true })

  const brands: AtelierBrand[] = await Promise.all((contexts ?? []).map(async (ctx) => {
    const [capsule, pending, templates, assets] = await Promise.all([
      supabase.from('capsules').select('rules').eq('context_id', ctx.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('judgments').select('id', { count: 'exact', head: true })
        .eq('context_id', ctx.id).eq('status', 'proposed'),
      supabase.from('templates').select('id', { count: 'exact', head: true })
        .eq('context_id', ctx.id).eq('active', true),
      supabase.from('brand_assets').select('id', { count: 'exact', head: true })
        .eq('context_id', ctx.id),
    ])
    const rules = (capsule.data?.rules ?? []) as unknown[]
    return {
      id: ctx.id, name: ctx.name, description: ctx.description ?? '',
      ruleCount: rules.length,
      pendingMindCount: pending.count ?? 0,
      templateCount: templates.count ?? 0,
      assetCount: assets.count ?? 0,
    }
  }))

  return (
    <div style={{ paddingTop: 24 }}>
      <p style={{ fontSize: 9, fontFamily: 'var(--mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>
        ART DIRECTOR
      </p>
      <h1 style={{ fontSize: 26, fontWeight: 400, color: 'var(--ink)', marginBottom: 20 }}>Studio</h1>

      {brands.map(brand => (
        <Link key={brand.id} href={`/studio/${brand.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block', marginBottom: 10 }}>
          <div style={{
            background: 'var(--surface)', borderRadius: 14, padding: '14px 16px',
            border: '1px solid var(--line-soft)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>{brand.name}</span>
              {brand.pendingMindCount > 0 && (
                <span style={{
                  fontSize: 9, fontFamily: 'var(--mono)', background: '#fffbe6',
                  color: '#b8920a', borderRadius: 4, padding: '2px 6px',
                }}>
                  {brand.pendingMindCount} pending
                </span>
              )}
            </div>
            {brand.description && (
              <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 8 }}>{brand.description}</p>
            )}
            <p style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', letterSpacing: '0.04em' }}>
              {brand.ruleCount} rules · {brand.pendingMindCount > 0 ? `${brand.pendingMindCount} mind` : `${brand.templateCount} templates`} · {brand.assetCount} assets
            </p>
          </div>
        </Link>
      ))}

      <Link href="/studio/new" style={{ textDecoration: 'none', display: 'block' }}>
        <div style={{
          border: '1.5px dashed var(--line-soft)', borderRadius: 14, padding: '14px 16px',
          textAlign: 'center', color: 'var(--violet)', fontSize: 13,
        }}>
          + New brand
        </div>
      </Link>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/app/(reviewer)/studio/new/page.tsx`**

```typescript
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
    <div style={{ paddingTop: 24 }}>
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
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line-soft)', background: 'var(--surface)', fontSize: 14, color: 'var(--ink)', boxSizing: 'border-box' }}
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
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line-soft)', background: 'var(--surface)', fontSize: 14, color: 'var(--ink)', resize: 'vertical', boxSizing: 'border-box' }}
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
```

- [ ] **Step 4: Build check**

```bash
npm run build 2>&1 | grep -E "error TS|Error:" | head -20
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/(reviewer)/BottomNav.tsx src/app/(reviewer)/studio/
git commit -m "feat: Studio tab in nav + brand list + new brand form"
```

---

## Task 9: Brand Detail + Rules + Mind Pages

**Files:**
- Create: `src/app/(reviewer)/studio/[brandId]/page.tsx`
- Create: `src/app/(reviewer)/studio/[brandId]/rules/page.tsx`
- Create: `src/app/(reviewer)/studio/[brandId]/rules/RulesClient.tsx`
- Create: `src/app/(reviewer)/studio/[brandId]/mind/page.tsx`
- Create: `src/app/(reviewer)/studio/[brandId]/mind/MindClient.tsx`

- [ ] **Step 1: Create `src/app/(reviewer)/studio/[brandId]/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export default async function BrandDetailPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: ctx } = await supabase
    .from('contexts').select('id, name, description, reviewer_id').eq('id', brandId).single()
  if (!ctx || ctx.reviewer_id !== user.id) redirect('/studio')

  const [capsule, pending, templates, assets] = await Promise.all([
    supabase.from('capsules').select('rules').eq('context_id', brandId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('judgments').select('id', { count: 'exact', head: true })
      .eq('context_id', brandId).eq('status', 'proposed'),
    supabase.from('templates').select('id', { count: 'exact', head: true })
      .eq('context_id', brandId).eq('active', true),
    supabase.from('brand_assets').select('id', { count: 'exact', head: true })
      .eq('context_id', brandId),
  ])

  const ruleCount = ((capsule.data?.rules ?? []) as unknown[]).length
  const pendingMindCount = pending.count ?? 0
  const templateCount = templates.count ?? 0
  const assetCount = assets.count ?? 0

  const tiles = [
    { label: 'Rules', sub: 'voice & style', count: ruleCount, href: `/studio/${brandId}/rules`, pending: false },
    { label: 'Mind', sub: pendingMindCount > 0 ? 'need review' : 'up to date', count: pendingMindCount > 0 ? pendingMindCount : ruleCount, href: `/studio/${brandId}/mind`, pending: pendingMindCount > 0 },
    { label: 'Templates', sub: 'post formats', count: templateCount, href: `/studio/${brandId}/templates`, pending: false },
    { label: 'Assets', sub: 'images & files', count: assetCount, href: `/studio/${brandId}/assets`, pending: false },
  ]

  return (
    <div style={{ paddingTop: 24 }}>
      <Link href="/studio" style={{ textDecoration: 'none', fontSize: 12, color: 'var(--ink-faint)', display: 'block', marginBottom: 12 }}>← Studio</Link>
      <h1 style={{ fontSize: 26, fontWeight: 400, color: 'var(--ink)', marginBottom: 2 }}>{ctx.name}</h1>
      {ctx.description && <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 20 }}>{ctx.description}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
        {tiles.map(tile => (
          <Link key={tile.href} href={tile.href} style={{ textDecoration: 'none' }}>
            <div style={{
              background: tile.pending ? '#fffbe8' : 'var(--surface)',
              border: `1px solid ${tile.pending ? '#f0d060' : 'var(--line-soft)'}`,
              borderRadius: 14, padding: 14,
            }}>
              <p style={{ fontSize: 9, fontFamily: 'var(--mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: tile.pending ? '#c9960a' : 'var(--ink-faint)', marginBottom: 6 }}>
                {tile.label}{tile.pending ? ' ●' : ''}
              </p>
              <p style={{ fontSize: 28, fontWeight: 300, color: 'var(--ink)', lineHeight: 1, marginBottom: 4 }}>{tile.count}</p>
              <p style={{ fontSize: 10, color: tile.pending ? '#c9960a' : 'var(--ink-faint)' }}>{tile.sub}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/app/(reviewer)/studio/[brandId]/rules/RulesClient.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Rule } from '@/types/brand'

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

  async function addRule() {
    if (!text.trim()) return
    setAdding(true)
    const res = await fetch(`/api/studio/brands/${brandId}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verb, domain, text: text.trim() }),
    })
    const data = await res.json()
    if (res.ok) { setRules(data.rules); setText('') }
    setAdding(false)
  }

  async function deleteRule(index: number) {
    const res = await fetch(`/api/studio/brands/${brandId}/rules/${index}`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok) setRules(data.rules)
  }

  const selectStyle = { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line-soft)', background: '#f5f4ff', color: 'var(--violet)', fontSize: 12, fontFamily: 'var(--mono)', cursor: 'pointer' }

  return (
    <div>
      {rules.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginBottom: 16 }}>No rules yet. Add the first one below.</p>
      )}

      {rules.map((rule, i) => {
        const colors = VERB_COLORS[rule.verb] ?? { bg: 'var(--surface)', color: 'var(--ink)' }
        return (
          <div key={i} style={{ background: 'var(--surface)', borderRadius: 12, padding: 12, marginBottom: 8, border: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--mono)', background: colors.bg, color: colors.color, borderRadius: 4, padding: '2px 6px', marginRight: 8 }}>
                {rule.verb}
              </span>
              <span style={{ fontSize: 11, color: 'var(--ink-faint)', marginRight: 6 }}>{rule.domain}:</span>
              <span style={{ fontSize: 11, color: 'var(--ink)' }}>{rule.text}</span>
            </div>
            <button onClick={() => deleteRule(i)} style={{ background: 'none', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: 16, padding: '0 0 0 8px', lineHeight: 1 }}>×</button>
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
```

- [ ] **Step 3: Create `src/app/(reviewer)/studio/[brandId]/rules/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Rule } from '@/types/brand'
import RulesClient from './RulesClient'

export default async function RulesPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: ctx } = await supabase.from('contexts').select('name, reviewer_id').eq('id', brandId).single()
  if (!ctx || ctx.reviewer_id !== user.id) redirect('/studio')

  const { data: capsule } = await supabase
    .from('capsules').select('rules').eq('context_id', brandId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  const rules = ((capsule?.rules ?? []) as Rule[])

  return (
    <div style={{ paddingTop: 24 }}>
      <Link href={`/studio/${brandId}`} style={{ textDecoration: 'none', fontSize: 12, color: 'var(--ink-faint)', display: 'block', marginBottom: 12 }}>← {ctx.name}</Link>
      <h1 style={{ fontSize: 22, fontWeight: 400, color: 'var(--ink)', marginBottom: 20 }}>Rules</h1>
      <RulesClient brandId={brandId} initialRules={rules} />
    </div>
  )
}
```

- [ ] **Step 4: Create `src/app/(reviewer)/studio/[brandId]/mind/MindClient.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Judgment } from '@/types/brand'

export default function MindClient({ brandId, initialPending, initialConfirmed }: {
  brandId: string
  initialPending: Judgment[]
  initialConfirmed: Judgment[]
}) {
  const [pending, setPending] = useState<Judgment[]>(initialPending)
  const [confirmed, setConfirmed] = useState<Judgment[]>(initialConfirmed)
  const [acting, setActing] = useState<string | null>(null)

  async function decide(judgment: Judgment, status: 'confirmed' | 'rejected') {
    setActing(judgment.id)
    const res = await fetch(`/api/studio/brands/${brandId}/mind/${judgment.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setPending(prev => prev.filter(j => j.id !== judgment.id))
      if (status === 'confirmed') setConfirmed(prev => [judgment, ...prev])
    }
    setActing(null)
  }

  return (
    <div>
      {pending.length === 0 && confirmed.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--ink-faint)' }}>No judgments yet. They appear here after each approved review.</p>
      )}

      {pending.length > 0 && (
        <>
          <p style={{ fontSize: 9, fontFamily: 'var(--mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#c9960a', marginBottom: 10 }}>{pending.length} pending</p>
          {pending.map(j => (
            <div key={j.id} style={{ background: '#fffbe8', border: '1px solid #f0d060', borderRadius: 12, padding: 12, marginBottom: 10 }}>
              <p style={{ fontSize: 11, color: 'var(--ink)', lineHeight: 1.4, marginBottom: 12 }}>
                <span style={{ fontFamily: 'var(--mono)', color: '#c9960a', fontSize: 10 }}>{j.verb}: </span>
                {j.statement}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => decide(j, 'confirmed')}
                  disabled={acting === j.id}
                  style={{ flex: 1, background: 'var(--ink)', color: '#fff', border: 'none', borderRadius: 8, padding: 8, fontSize: 11, fontFamily: 'var(--mono)', cursor: 'pointer' }}
                >
                  ✓ Confirm
                </button>
                <button
                  onClick={() => decide(j, 'rejected')}
                  disabled={acting === j.id}
                  style={{ flex: 1, background: '#fff', color: 'var(--ink-faint)', border: '1px solid var(--line-soft)', borderRadius: 8, padding: 8, fontSize: 11, fontFamily: 'var(--mono)', cursor: 'pointer' }}
                >
                  ✗ Reject
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {confirmed.length > 0 && (
        <>
          <p style={{ fontSize: 9, fontFamily: 'var(--mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8, marginTop: pending.length > 0 ? 16 : 0 }}>{confirmed.length} confirmed</p>
          {confirmed.map(j => (
            <div key={j.id} style={{ background: 'var(--surface)', borderRadius: 10, padding: 10, marginBottom: 6, border: '1px solid var(--line-soft)' }}>
              <p style={{ fontSize: 10, color: 'var(--ink-faint)', lineHeight: 1.4 }}>
                ✓ <span style={{ fontFamily: 'var(--mono)' }}>{j.verb}:</span> {j.statement}
              </p>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Create `src/app/(reviewer)/studio/[brandId]/mind/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Judgment } from '@/types/brand'
import MindClient from './MindClient'

export default async function MindPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: ctx } = await supabase.from('contexts').select('name, reviewer_id').eq('id', brandId).single()
  if (!ctx || ctx.reviewer_id !== user.id) redirect('/studio')

  const { data: all } = await supabase
    .from('judgments').select('id, verb, statement, status, created_at')
    .eq('context_id', brandId).in('status', ['proposed', 'confirmed'])
    .order('created_at', { ascending: false })

  const pending = (all ?? []).filter(j => j.status === 'proposed') as Judgment[]
  const confirmed = (all ?? []).filter(j => j.status === 'confirmed') as Judgment[]

  return (
    <div style={{ paddingTop: 24 }}>
      <Link href={`/studio/${brandId}`} style={{ textDecoration: 'none', fontSize: 12, color: 'var(--ink-faint)', display: 'block', marginBottom: 12 }}>← {ctx.name}</Link>
      <h1 style={{ fontSize: 22, fontWeight: 400, color: 'var(--ink)', marginBottom: 4 }}>Mind</h1>
      <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 20 }}>AI learns from every review. Confirm what's right, reject what's wrong.</p>
      <MindClient brandId={brandId} initialPending={pending} initialConfirmed={confirmed} />
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/(reviewer)/studio/
git commit -m "feat: brand detail, rules, and mind pages"
```

---

## Task 10: Templates + Assets Pages

**Files:**
- Create: `src/app/(reviewer)/studio/[brandId]/templates/page.tsx`
- Create: `src/app/(reviewer)/studio/[brandId]/templates/TemplatesClient.tsx`
- Create: `src/app/(reviewer)/studio/[brandId]/assets/page.tsx`
- Create: `src/app/(reviewer)/studio/[brandId]/assets/AssetsClient.tsx`

- [ ] **Step 1: Create `src/app/(reviewer)/studio/[brandId]/templates/TemplatesClient.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { AtelierTemplate } from '@/types/brand'

const TYPES = ['photo_post', 'quote_card', 'announcement', 'carousel'] as const
const TYPE_LABEL: Record<string, string> = {
  photo_post: 'Photo post', quote_card: 'Quote card',
  announcement: 'Announcement', carousel: 'Carousel',
}

export default function TemplatesClient({ brandId, initialTemplates }: { brandId: string; initialTemplates: AtelierTemplate[] }) {
  const [templates, setTemplates] = useState<AtelierTemplate[]>(initialTemplates)
  const [name, setName] = useState('')
  const [type, setType] = useState<AtelierTemplate['type']>('photo_post')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  async function addTemplate() {
    if (!name.trim()) return
    setSaving(true)
    const res = await fetch(`/api/studio/brands/${brandId}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), type, description: description.trim() }),
    })
    const data = await res.json()
    if (res.ok) { setTemplates(prev => [...prev, data.template]); setName(''); setDescription('') }
    setSaving(false)
  }

  async function toggleActive(template: AtelierTemplate) {
    const res = await fetch(`/api/studio/brands/${brandId}/templates/${template.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !template.active }),
    })
    const data = await res.json()
    if (res.ok) setTemplates(prev => prev.map(t => t.id === template.id ? data.template : t))
  }

  async function deleteTemplate(id: string) {
    await fetch(`/api/studio/brands/${brandId}/templates/${id}`, { method: 'DELETE' })
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  const selectStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line-soft)', background: 'var(--surface)', fontSize: 12, color: 'var(--ink)', width: '100%', boxSizing: 'border-box' as const }

  return (
    <div>
      {templates.map(t => (
        <div key={t.id} style={{ background: 'var(--surface)', borderRadius: 12, padding: 12, marginBottom: 8, border: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{t.name}</span>
              <span style={{ fontSize: 9, fontFamily: 'var(--mono)', background: t.active ? '#e8e4ff' : 'var(--line-soft)', color: t.active ? 'var(--violet)' : 'var(--ink-faint)', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }} onClick={() => toggleActive(t)}>
                {t.active ? 'active' : 'inactive'}
              </span>
            </div>
            <p style={{ fontSize: 10, color: 'var(--ink-faint)' }}>{TYPE_LABEL[t.type]} · {t.description}</p>
          </div>
          <button onClick={() => deleteTemplate(t.id)} style={{ background: 'none', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: 16, padding: '0 0 0 8px' }}>×</button>
        </div>
      ))}

      <div style={{ border: '1.5px dashed var(--line-soft)', borderRadius: 12, padding: 14, marginTop: 12 }}>
        <p style={{ fontSize: 10, color: 'var(--violet)', fontFamily: 'var(--mono)', marginBottom: 10 }}>+ New template</p>
        <div style={{ marginBottom: 8 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Template name" style={{ ...selectStyle }} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <select value={type} onChange={e => setType(e.target.value as AtelierTemplate['type'])} style={selectStyle}>
            {TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 10 }}>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description" style={{ ...selectStyle }} />
        </div>
        <button
          onClick={addTemplate}
          disabled={saving || !name.trim()}
          style={{ background: 'var(--ink)', color: '#fff', border: 'none', borderRadius: 100, padding: '8px 20px', fontSize: 11, fontFamily: 'var(--mono)', cursor: saving ? 'wait' : 'pointer', opacity: !name.trim() ? 0.4 : 1 }}
        >
          {saving ? 'Creating…' : 'Create'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/app/(reviewer)/studio/[brandId]/templates/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { AtelierTemplate } from '@/types/brand'
import TemplatesClient from './TemplatesClient'

export default async function TemplatesPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: ctx } = await supabase.from('contexts').select('name, reviewer_id').eq('id', brandId).single()
  if (!ctx || ctx.reviewer_id !== user.id) redirect('/studio')

  const { data: templates } = await supabase
    .from('templates').select('id, context_id, name, type, description, active, created_at')
    .eq('context_id', brandId).order('created_at', { ascending: true })

  return (
    <div style={{ paddingTop: 24 }}>
      <Link href={`/studio/${brandId}`} style={{ textDecoration: 'none', fontSize: 12, color: 'var(--ink-faint)', display: 'block', marginBottom: 12 }}>← {ctx.name}</Link>
      <h1 style={{ fontSize: 22, fontWeight: 400, color: 'var(--ink)', marginBottom: 20 }}>Templates</h1>
      <TemplatesClient brandId={brandId} initialTemplates={(templates ?? []) as AtelierTemplate[]} />
    </div>
  )
}
```

- [ ] **Step 3: Create `src/app/(reviewer)/studio/[brandId]/assets/AssetsClient.tsx`**

```typescript
'use client'

import { useRef, useState } from 'react'
import { BrandAsset } from '@/types/brand'

export default function AssetsClient({ brandId, initialAssets }: { brandId: string; initialAssets: BrandAsset[] }) {
  const [assets, setAssets] = useState<BrandAsset[]>(initialAssets)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<BrandAsset | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/studio/brands/${brandId}/assets`, { method: 'POST', body: form })
    const data = await res.json()
    if (res.ok) setAssets(prev => [data.asset, ...prev])
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function deleteAsset(asset: BrandAsset) {
    await fetch(`/api/studio/brands/${brandId}/assets/${asset.id}`, { method: 'DELETE' })
    setAssets(prev => prev.filter(a => a.id !== asset.id))
    if (preview?.id === asset.id) setPreview(null)
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {assets.map(asset => (
          <div key={asset.id} onClick={() => setPreview(asset)} style={{ aspectRatio: '1', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--line-soft)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset.url} alt={asset.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ))}

        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{ aspectRatio: '1', borderRadius: 10, border: '1.5px dashed var(--line-soft)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: 'var(--violet)', cursor: uploading ? 'wait' : 'pointer' }}
        >
          {uploading ? '⏳' : '+'}
        </button>
      </div>

      {preview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setPreview(null)}>
          <div style={{ background: 'var(--bg)', borderRadius: 16, overflow: 'hidden', maxWidth: 400, width: '100%' }} onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.url} alt={preview.name} style={{ width: '100%', display: 'block' }} />
            <div style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{preview.name}</span>
              <button onClick={() => deleteAsset(preview)} style={{ background: '#c0392b', color: '#fff', border: 'none', borderRadius: 100, padding: '6px 14px', fontSize: 11, cursor: 'pointer' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `src/app/(reviewer)/studio/[brandId]/assets/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { BrandAsset } from '@/types/brand'
import AssetsClient from './AssetsClient'

export default async function AssetsPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: ctx } = await supabase.from('contexts').select('name, reviewer_id').eq('id', brandId).single()
  if (!ctx || ctx.reviewer_id !== user.id) redirect('/studio')

  const { data: assets } = await supabase
    .from('brand_assets').select('id, context_id, name, url, created_at')
    .eq('context_id', brandId).order('created_at', { ascending: false })

  return (
    <div style={{ paddingTop: 24 }}>
      <Link href={`/studio/${brandId}`} style={{ textDecoration: 'none', fontSize: 12, color: 'var(--ink-faint)', display: 'block', marginBottom: 12 }}>← {ctx.name}</Link>
      <h1 style={{ fontSize: 22, fontWeight: 400, color: 'var(--ink)', marginBottom: 20 }}>Assets</h1>
      <AssetsClient brandId={brandId} initialAssets={(assets ?? []) as BrandAsset[]} />
    </div>
  )
}
```

- [ ] **Step 5: Full build check**

```bash
npm run build 2>&1 | grep -E "error TS|Error:|Failed" | head -30
```

Expected: clean build with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/(reviewer)/studio/
git commit -m "feat: templates and assets pages"
```

---

## Task 11: Deploy & Verify

- [ ] **Step 1: Final build check**

```bash
npm run build
```

Expected: `✓ Compiled successfully` with all 24+ routes listed.

- [ ] **Step 2: Manual browser test (dev server)**

```bash
npm run dev
```

Open `http://localhost:3000` and sign in as a reviewer. Verify:

1. Bottom nav shows Queue · Done · Studio
2. Tap Studio → brand list loads (may be empty — that's correct)
3. Tap "+ New brand" → form appears → create "Test Brand"
4. Redirects to `/studio/[id]` → 4 tiles show (all at 0)
5. Tap Rules → add a rule with "always · voice · be warm"
6. Tap Mind → shows "No judgments yet" (correct for new brand)
7. Tap Templates → add a "Photo post" template
8. Tap Assets → tap + → upload an image → appears in grid → tap to preview → delete works

- [ ] **Step 3: Deploy to production**

```bash
vercel --prod
```

Expected: `▲ Aliased https://curato-studio-azure.vercel.app`

- [ ] **Step 4: Commit push**

```bash
git push origin main
```
