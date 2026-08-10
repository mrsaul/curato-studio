# Brand–Creator Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Art Directors invite Creators to brands via a shareable link, and let Creators pick which brand their content is for when submitting a brief.

**Architecture:** Two new Supabase tables (`brand_invites`, `brand_members`) back a full invite-link flow. The AD generates a per-brand invite link from a new Creators tab in Studio. The Creator clicks it, confirms, and is permanently linked. On the submit flow, the existing landing page becomes a brand picker: the Creator selects which brand the brief is for, and that brand's `context_id` + `reviewer_id` flow through the rest of the submit pipeline.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (postgres + RLS), `@supabase/ssr` (server auth), `@supabase/supabase-js` (service role), inline CSS matching existing patterns.

---

## Codebase Context

Before starting, read these files to understand patterns used in every task:

- `src/lib/supabase-server.ts` — exports `createServerSupabaseClient()` (auth-aware) and `createServiceSupabaseClient()` (service role, bypasses RLS)
- `src/app/api/studio/brands/[id]/route.ts` — example of auth check + `getOwnedBrand` helper pattern
- `src/app/(reviewer)/studio/[brandId]/page.tsx` — example of server component with parallel Supabase queries and tile grid
- `src/app/(contributor)/submit/confirm/page.tsx` — the confirm page we modify in Task 10

CSS variables available everywhere (defined in `globals.css`): `--ink`, `--ink-soft`, `--ink-faint`, `--surface`, `--line`, `--line-soft`, `--violet`, `--red`, `--bg`, `--mono`, `--display`, `--touch`.

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/004_brand_members.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/004_brand_members.sql

-- brand_invites: one active invite link per brand
CREATE TABLE IF NOT EXISTS public.brand_invites (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  context_id uuid NOT NULL REFERENCES public.contexts(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (context_id)
);

ALTER TABLE public.brand_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "art director manages invites"
  ON public.brand_invites FOR ALL
  USING (
    context_id IN (SELECT id FROM public.contexts WHERE user_id = auth.uid())
  )
  WITH CHECK (
    context_id IN (SELECT id FROM public.contexts WHERE user_id = auth.uid())
  );

-- brand_members: creators linked to brands
-- email stored at join time so we don't need auth.admin API to display it
CREATE TABLE IF NOT EXISTS public.brand_members (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  context_id uuid NOT NULL REFERENCES public.contexts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (context_id, user_id)
);

ALTER TABLE public.brand_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creator reads own memberships"
  ON public.brand_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "art director manages members"
  ON public.brand_members FOR ALL
  USING (
    context_id IN (SELECT id FROM public.contexts WHERE user_id = auth.uid())
  )
  WITH CHECK (
    context_id IN (SELECT id FROM public.contexts WHERE user_id = auth.uid())
  );
```

- [ ] **Step 2: Apply in Supabase SQL editor**

Go to Supabase dashboard → SQL editor for project `duppejolqfwxodglbibc`. Paste the entire file above and run it.

Expected: No errors. Tables `brand_invites` and `brand_members` appear in the Table Editor.

- [ ] **Step 3: Verify tables exist**

Run in SQL editor:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('brand_invites', 'brand_members');
```
Expected: 2 rows returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/004_brand_members.sql
git commit -m "feat: add brand_invites and brand_members tables"
```

---

## Task 2: Invite API

**Files:**
- Create: `src/app/api/studio/brands/[id]/invite/route.ts`

This API lets the Art Director get or create the invite link for a brand they own, and regenerate it on demand. Uses service role for `brand_invites` writes (simpler than threading auth cookies into an upsert-or-create pattern).

- [ ] **Step 1: Create the route file**

```typescript
// src/app/api/studio/brands/[id]/invite/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'

async function getOwnedContext(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  id: string,
  userId: string,
) {
  const { data } = await supabase
    .from('contexts').select('id').eq('id', id).eq('user_id', userId).single()
  return data
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!await getOwnedContext(supabase, id, user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const service = createServiceSupabaseClient()
  let { data: invite } = await service
    .from('brand_invites').select('token').eq('context_id', id).single()

  if (!invite) {
    const { data: newInvite, error } = await service
      .from('brand_invites').insert({ context_id: id }).select('token').single()
    if (error || !newInvite) {
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
    }
    invite = newInvite
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://curato.app'
  return NextResponse.json({ token: invite.token, url: `${base}/join/${invite.token}` })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!await getOwnedContext(supabase, id, user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let body: { action?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  if (body.action !== 'regenerate') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const service = createServiceSupabaseClient()
  await service.from('brand_invites').delete().eq('context_id', id)

  const { data: invite, error } = await service
    .from('brand_invites').insert({ context_id: id }).select('token').single()
  if (error || !invite) {
    return NextResponse.json({ error: 'Failed to regenerate invite' }, { status: 500 })
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://curato.app'
  return NextResponse.json({ token: invite.token, url: `${base}/join/${invite.token}` })
}
```

- [ ] **Step 2: Verify GET creates an invite**

```bash
# Replace TOKEN with a valid session cookie from browser devtools
curl -s http://localhost:3000/api/studio/brands/<BRAND_ID>/invite \
  -H "Cookie: sb-duppejolqfwxodglbibc-auth-token=TOKEN"
```
Expected: `{ "token": "...", "url": "http://localhost:3000/join/..." }`

- [ ] **Step 3: Verify POST regenerates the invite**

```bash
curl -s -X POST http://localhost:3000/api/studio/brands/<BRAND_ID>/invite \
  -H "Cookie: sb-duppejolqfwxodglbibc-auth-token=TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"regenerate"}'
```
Expected: New `token` value different from the one in Step 2.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/studio/brands/[id]/invite/route.ts
git commit -m "feat: add invite token API for brands"
```

---

## Task 3: Members API

**Files:**
- Create: `src/app/api/studio/brands/[id]/members/route.ts`

Lists creators joined to a brand, with their request counts. Removes a creator on DELETE.

- [ ] **Step 1: Create the route file**

```typescript
// src/app/api/studio/brands/[id]/members/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'

async function getOwnedContext(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  id: string,
  userId: string,
) {
  const { data } = await supabase
    .from('contexts').select('id').eq('id', id).eq('user_id', userId).single()
  return data
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!await getOwnedContext(supabase, id, user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const service = createServiceSupabaseClient()
  const { data: members } = await service
    .from('brand_members')
    .select('user_id, email, joined_at')
    .eq('context_id', id)
    .order('joined_at', { ascending: true })

  const memberIds = (members ?? []).map(m => m.user_id)
  const counts: Record<string, number> = {}

  if (memberIds.length > 0) {
    const { data: reqs } = await service
      .from('creative_requests')
      .select('contributor_id')
      .eq('context_id', id)
      .in('contributor_id', memberIds)
    for (const row of reqs ?? []) {
      counts[row.contributor_id] = (counts[row.contributor_id] ?? 0) + 1
    }
  }

  return NextResponse.json({
    members: (members ?? []).map(m => ({
      userId: m.user_id,
      email: m.email,
      joinedAt: m.joined_at,
      requestCount: counts[m.user_id] ?? 0,
    }))
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!await getOwnedContext(supabase, id, user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let body: { userId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  if (!body.userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const service = createServiceSupabaseClient()
  await service.from('brand_members').delete().eq('context_id', id).eq('user_id', body.userId)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify GET returns member list**

```bash
curl -s http://localhost:3000/api/studio/brands/<BRAND_ID>/members \
  -H "Cookie: sb-duppejolqfwxodglbibc-auth-token=TOKEN"
```
Expected: `{ "members": [] }` (empty until a creator joins in Task 8).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/studio/brands/[id]/members/route.ts
git commit -m "feat: add brand members API (list + remove)"
```

---

## Task 4: Join API

**Files:**
- Create: `src/app/api/join/[token]/route.ts`

GET validates a token without auth (public). POST accepts the invite and inserts the creator into `brand_members`.

- [ ] **Step 1: Create the route file**

```typescript
// src/app/api/join/[token]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = createServiceSupabaseClient()

  const { data: invite } = await service
    .from('brand_invites').select('context_id').eq('token', token).single()

  if (!invite) return NextResponse.json({ valid: false })

  const { data: ctx } = await service
    .from('contexts').select('name').eq('id', invite.context_id).single()

  return NextResponse.json({
    valid: true,
    brandName: ctx?.name ?? 'Unknown Brand',
    contextId: invite.context_id,
  })
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceSupabaseClient()

  const { data: invite } = await service
    .from('brand_invites').select('context_id').eq('token', token).single()

  if (!invite) {
    return NextResponse.json({ error: 'Invalid or expired invite link' }, { status: 404 })
  }

  const { data: ctx } = await service
    .from('contexts').select('name').eq('id', invite.context_id).single()

  const { error } = await service
    .from('brand_members')
    .insert({
      context_id: invite.context_id,
      user_id: user.id,
      email: user.email ?? '',
    })

  // error code 23505 = unique_violation (already a member — idempotent)
  if (error && error.code !== '23505') {
    return NextResponse.json({ error: 'Failed to join brand' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, brandName: ctx?.name ?? 'Brand' })
}
```

- [ ] **Step 2: Verify GET with invalid token**

```bash
curl -s http://localhost:3000/api/join/invalidtoken
```
Expected: `{ "valid": false }`

- [ ] **Step 3: Verify GET with valid token**

Use the token returned from Task 2 Step 2.

```bash
curl -s http://localhost:3000/api/join/<TOKEN>
```
Expected: `{ "valid": true, "brandName": "...", "contextId": "..." }`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/join/[token]/route.ts
git commit -m "feat: add join API for invite token acceptance"
```

---

## Task 5: Contributor Brands API

**Files:**
- Create: `src/app/api/contributor/brands/route.ts`

Returns all brands a creator has joined, with rule/template/asset counts and the `reviewerId` (context owner). The submit flow uses this to show the brand picker and thread the correct `reviewer_id` through to the request.

- [ ] **Step 1: Create the route file**

```typescript
// src/app/api/contributor/brands/route.ts
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: memberships } = await supabase
    .from('brand_members')
    .select('context_id')
    .eq('user_id', user.id)

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ brands: [] })
  }

  const contextIds = memberships.map(m => m.context_id)
  const service = createServiceSupabaseClient()

  const { data: contexts } = await service
    .from('contexts')
    .select('id, name, description, user_id')
    .in('id', contextIds)

  if (!contexts) return NextResponse.json({ brands: [] })

  const brands = await Promise.all(contexts.map(async (ctx) => {
    const [capsule, templates, assets] = await Promise.all([
      service.from('capsules').select('rules')
        .eq('context_id', ctx.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      service.from('templates').select('id', { count: 'exact', head: true })
        .eq('context_id', ctx.id).eq('active', true),
      service.from('brand_assets').select('id', { count: 'exact', head: true })
        .eq('context_id', ctx.id),
    ])
    const rules = (capsule.data?.rules ?? []) as unknown[]
    return {
      id: ctx.id,
      name: ctx.name,
      description: ctx.description ?? '',
      reviewerId: ctx.user_id,
      ruleCount: rules.length,
      templateCount: templates.count ?? 0,
      assetCount: assets.count ?? 0,
    }
  }))

  return NextResponse.json({ brands })
}
```

- [ ] **Step 2: Verify GET returns empty for a user with no brands**

```bash
curl -s http://localhost:3000/api/contributor/brands \
  -H "Cookie: sb-duppejolqfwxodglbibc-auth-token=CREATOR_TOKEN"
```
Expected: `{ "brands": [] }`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/contributor/brands/route.ts
git commit -m "feat: add contributor brands API"
```

---

## Task 6: Studio Brand Detail — Creators Tile

**Files:**
- Modify: `src/app/(reviewer)/studio/[brandId]/page.tsx`

Adds a 5th "Creators" tile below the existing 2×2 grid. The tile spans full width and links to `/studio/[brandId]/creators`.

- [ ] **Step 1: Read the current file first**

```bash
cat src/app/\(reviewer\)/studio/\[brandId\]/page.tsx
```

- [ ] **Step 2: Replace the file with the updated version**

The change adds one parallel query (`membersCount`) and one tile. The grid stays 2-column; the 5th tile spans both columns with `gridColumn: '1 / -1'`.

```typescript
// src/app/(reviewer)/studio/[brandId]/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export default async function BrandDetailPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: ctx } = await supabase
    .from('contexts').select('id, name, description, user_id').eq('id', brandId).single()
  if (!ctx || ctx.user_id !== user.id) redirect('/studio')

  const [capsule, pending, templates, assets, members] = await Promise.all([
    supabase.from('capsules').select('rules').eq('context_id', brandId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('judgments').select('id', { count: 'exact', head: true })
      .eq('context_id', brandId).eq('status', 'proposed'),
    supabase.from('templates').select('id', { count: 'exact', head: true })
      .eq('context_id', brandId).eq('active', true),
    supabase.from('brand_assets').select('id', { count: 'exact', head: true })
      .eq('context_id', brandId),
    supabase.from('brand_members').select('id', { count: 'exact', head: true })
      .eq('context_id', brandId),
  ])

  const ruleCount = ((capsule.data?.rules ?? []) as unknown[]).length
  const pendingMindCount = pending.count ?? 0
  const templateCount = templates.count ?? 0
  const assetCount = assets.count ?? 0
  const memberCount = members.count ?? 0

  const tiles = [
    { label: 'Rules', sub: 'voice & style', count: ruleCount, href: `/studio/${brandId}/rules`, pending: false, wide: false },
    { label: 'Mind', sub: pendingMindCount > 0 ? 'need review' : 'up to date', count: pendingMindCount, href: `/studio/${brandId}/mind`, pending: pendingMindCount > 0, wide: false },
    { label: 'Templates', sub: 'post formats', count: templateCount, href: `/studio/${brandId}/templates`, pending: false, wide: false },
    { label: 'Assets', sub: 'images & files', count: assetCount, href: `/studio/${brandId}/assets`, pending: false, wide: false },
    { label: 'Creators', sub: memberCount === 0 ? 'none yet' : 'active', count: memberCount, href: `/studio/${brandId}/creators`, pending: false, wide: true },
  ]

  return (
    <div style={{ paddingTop: 24, paddingBottom: 100 }}>
      <Link href="/studio" style={{ textDecoration: 'none', fontSize: 12, color: 'var(--ink-faint)', display: 'block', marginBottom: 12 }}>← Studio</Link>
      <h1 style={{ fontSize: 26, fontWeight: 400, color: 'var(--ink)', marginBottom: 2 }}>{ctx.name}</h1>
      {ctx.description && <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 20 }}>{ctx.description}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
        {tiles.map(tile => (
          <Link key={tile.href} href={tile.href} style={{ textDecoration: 'none', gridColumn: tile.wide ? '1 / -1' : undefined }}>
            <div style={{
              background: tile.pending ? '#fffbe8' : 'var(--surface)',
              border: `1px solid ${tile.pending ? '#f0d060' : 'var(--line-soft)'}`,
              borderRadius: 14, padding: tile.wide ? '12px 14px' : 14,
              display: tile.wide ? 'flex' : undefined,
              alignItems: tile.wide ? 'center' : undefined,
              gap: tile.wide ? 16 : undefined,
            }}>
              <p style={{ fontSize: 9, fontFamily: 'var(--mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: tile.pending ? '#c9960a' : 'var(--ink-faint)', marginBottom: tile.wide ? 0 : 6 }}>
                {tile.label}{tile.pending ? ' ●' : ''}
              </p>
              <p style={{ fontSize: tile.wide ? 22 : 28, fontWeight: 300, color: 'var(--ink)', lineHeight: 1, marginBottom: tile.wide ? 0 : 4 }}>{tile.count}</p>
              {!tile.wide && <p style={{ fontSize: 10, color: tile.pending ? '#c9960a' : 'var(--ink-faint)' }}>{tile.sub}</p>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Start dev server and verify**

```bash
npm run dev
```

Navigate to `http://localhost:3000/studio/[any-brand-id]` as the Art Director. Expected: 5 tiles visible; Creators tile spans full width at the bottom, shows count 0 initially.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(reviewer\)/studio/\[brandId\]/page.tsx
git commit -m "feat: add Creators tile to brand detail page"
```

---

## Task 7: Studio Creators Page

**Files:**
- Create: `src/app/(reviewer)/studio/[brandId]/creators/page.tsx`
- Create: `src/app/(reviewer)/studio/[brandId]/creators/CreatorsClient.tsx`

The Art Director's view of who has access to a brand. Shows members + invite link.

- [ ] **Step 1: Create the server page**

```typescript
// src/app/(reviewer)/studio/[brandId]/creators/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import CreatorsClient from './CreatorsClient'

export default async function CreatorsPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: ctx } = await supabase
    .from('contexts').select('id, name, user_id').eq('id', brandId).single()
  if (!ctx || ctx.user_id !== user.id) redirect('/studio')

  const service = createServiceSupabaseClient()

  // Get or create invite token
  let { data: invite } = await service
    .from('brand_invites').select('token').eq('context_id', brandId).single()
  if (!invite) {
    const { data: newInvite } = await service
      .from('brand_invites').insert({ context_id: brandId }).select('token').single()
    invite = newInvite
  }

  // Get members
  const { data: members } = await service
    .from('brand_members')
    .select('user_id, email, joined_at')
    .eq('context_id', brandId)
    .order('joined_at', { ascending: true })

  // Get request counts per member
  const memberIds = (members ?? []).map(m => m.user_id)
  const counts: Record<string, number> = {}
  if (memberIds.length > 0) {
    const { data: reqs } = await service
      .from('creative_requests')
      .select('contributor_id')
      .eq('context_id', brandId)
      .in('contributor_id', memberIds)
    for (const row of reqs ?? []) {
      counts[row.contributor_id] = (counts[row.contributor_id] ?? 0) + 1
    }
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://curato.app'
  const token = invite?.token ?? ''
  const inviteUrl = token ? `${base}/join/${token}` : ''

  return (
    <div style={{ paddingTop: 24, paddingBottom: 100 }}>
      <Link href={`/studio/${brandId}`} style={{ textDecoration: 'none', fontSize: 12, color: 'var(--ink-faint)', display: 'block', marginBottom: 12 }}>
        ← {ctx.name}
      </Link>
      <h1 style={{ fontSize: 26, fontWeight: 400, color: 'var(--ink)', marginBottom: 4 }}>Creators</h1>
      <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 24 }}>People working on this brand</p>

      <CreatorsClient
        brandId={brandId}
        initialMembers={(members ?? []).map(m => ({
          userId: m.user_id,
          email: m.email,
          joinedAt: m.joined_at,
          requestCount: counts[m.user_id] ?? 0,
        }))}
        initialToken={token}
        inviteUrl={inviteUrl}
      />
    </div>
  )
}
```

- [ ] **Step 2: Create the client component**

```typescript
// src/app/(reviewer)/studio/[brandId]/creators/CreatorsClient.tsx
'use client'

import { useState } from 'react'

interface Member {
  userId: string
  email: string
  joinedAt: string
  requestCount: number
}

interface Props {
  brandId: string
  initialMembers: Member[]
  initialToken: string
  inviteUrl: string
}

export default function CreatorsClient({ brandId, initialMembers, initialToken, inviteUrl: initialUrl }: Props) {
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [currentUrl, setCurrentUrl] = useState(initialUrl)
  const [removing, setRemoving] = useState<Set<string>>(new Set())
  const [regenerating, setRegenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(currentUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleRegenerate() {
    if (!confirm('Regenerate the invite link? The current link will stop working immediately.')) return
    setRegenerating(true)
    try {
      const res = await fetch(`/api/studio/brands/${brandId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate' }),
      })
      if (!res.ok) return
      const json = await res.json() as { token: string; url: string }
      setCurrentUrl(json.url)
    } finally {
      setRegenerating(false)
    }
  }

  async function handleRemove(userId: string) {
    setRemoving(prev => new Set(prev).add(userId))
    try {
      const res = await fetch(`/api/studio/brands/${brandId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (res.ok) setMembers(prev => prev.filter(m => m.userId !== userId))
    } finally {
      setRemoving(prev => { const s = new Set(prev); s.delete(userId); return s })
    }
  }

  function daysAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'today'
    if (days === 1) return '1 day ago'
    return `${days} days ago`
  }

  return (
    <div>
      {members.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginBottom: 24 }}>
          No creators yet — share the invite link below.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {members.map(m => (
            <div
              key={m.userId}
              style={{
                background: 'var(--surface)', border: '1px solid var(--line-soft)',
                borderRadius: 12, padding: '12px 14px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div>
                <p style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 2 }}>{m.email}</p>
                <p style={{ fontSize: 10, color: 'var(--ink-faint)' }}>
                  joined {daysAgo(m.joinedAt)} · {m.requestCount} request{m.requestCount !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => handleRemove(m.userId)}
                disabled={removing.has(m.userId)}
                style={{
                  fontSize: 11, color: '#c0392b', background: 'none', border: 'none',
                  cursor: removing.has(m.userId) ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--mono)',
                  opacity: removing.has(m.userId) ? 0.5 : 1,
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 9, fontFamily: 'var(--mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
        Invite link
      </p>
      <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, border: '1px solid var(--line-soft)' }}>
        <div style={{
          background: 'rgba(74,61,176,0.06)', borderRadius: 8, padding: '8px 10px',
          fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--violet)',
          marginBottom: 10, wordBreak: 'break-all',
        }}>
          {currentUrl || 'Generating…'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleCopy}
            disabled={!currentUrl}
            style={{
              flex: 1, background: 'var(--ink)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 0', fontSize: 11,
              fontFamily: 'var(--mono)', cursor: currentUrl ? 'pointer' : 'not-allowed',
            }}
          >
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            style={{
              flex: 1, background: 'var(--surface)', color: 'var(--ink-soft)',
              border: '1px solid var(--line-soft)', borderRadius: 8,
              padding: '10px 0', fontSize: 11, fontFamily: 'var(--mono)',
              cursor: regenerating ? 'not-allowed' : 'pointer',
              opacity: regenerating ? 0.5 : 1,
            }}
          >
            {regenerating ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>
        <p style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 8, textAlign: 'center' }}>
          Regenerating invalidates the old link
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify in browser**

Navigate to `http://localhost:3000/studio/[brand-id]/creators`. Expected:
- "No creators yet" message
- Invite link card with the token URL
- Copy and Regenerate buttons work

- [ ] **Step 4: Commit**

```bash
git add src/app/\(reviewer\)/studio/\[brandId\]/creators/page.tsx \
        src/app/\(reviewer\)/studio/\[brandId\]/creators/CreatorsClient.tsx
git commit -m "feat: add Studio Creators page with invite link management"
```

---

## Task 8: Join Page

**Files:**
- Create: `src/app/join/[token]/page.tsx`
- Create: `src/app/join/[token]/JoinClient.tsx`

Standalone page (no nav bar — uses root layout only). Creator lands here from the invite link, sees the brand name, clicks confirm.

> **MVP limitation:** If the creator is not logged in, they're redirected to `/login`. After logging in, they return to `/` (not back to the invite link). The creator needs to click the invite link again. This is acceptable for MVP — the link remains valid.

- [ ] **Step 1: Create the server page**

```typescript
// src/app/join/[token]/page.tsx
import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import JoinClient from './JoinClient'

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login`)

  const service = createServiceSupabaseClient()

  const { data: invite } = await service
    .from('brand_invites').select('context_id').eq('token', token).single()

  if (!invite) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
        <p style={{ fontSize: 16, color: 'var(--ink)', marginBottom: 16 }}>
          This invite link is no longer valid.
        </p>
        <a href="/submit" style={{ color: 'var(--violet)', fontSize: 14, textDecoration: 'none' }}>
          ← Go to app
        </a>
      </div>
    )
  }

  const { data: ctx } = await service
    .from('contexts').select('name').eq('id', invite.context_id).single()

  // Check if already a member
  const { data: existing } = await service
    .from('brand_members')
    .select('id').eq('context_id', invite.context_id).eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
        <p style={{ fontSize: 16, color: 'var(--ink)', marginBottom: 8 }}>
          You&apos;re already connected to {ctx?.name ?? 'this brand'}.
        </p>
        <a href="/submit" style={{ color: 'var(--violet)', fontSize: 14, textDecoration: 'none' }}>
          Start creating →
        </a>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
        <JoinClient token={token} brandName={ctx?.name ?? 'this brand'} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the client component**

```typescript
// src/app/join/[token]/JoinClient.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  token: string
  brandName: string
}

export default function JoinClient({ token, brandName }: Props) {
  const router = useRouter()
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleJoin() {
    setJoining(true)
    setError(null)
    try {
      const res = await fetch(`/api/join/${token}`, { method: 'POST' })
      const json = await res.json() as { ok?: boolean; error?: string }
      if (!json.ok) throw new Error(json.error ?? 'Failed to join')
      router.push('/submit')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setJoining(false)
    }
  }

  return (
    <>
      <p style={{ fontSize: 10, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-faint)', marginBottom: 12 }}>
        You&apos;ve been invited
      </p>
      <h1 style={{ fontSize: 30, fontWeight: 400, fontFamily: 'var(--display)', letterSpacing: '-0.02em', color: 'var(--ink)', marginBottom: 10 }}>
        {brandName}
      </h1>
      <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6, marginBottom: 40, maxWidth: 260, margin: '0 auto 40px' }}>
        Join this brand to create content in their voice.
      </p>
      {error && (
        <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{error}</p>
      )}
      <button
        onClick={handleJoin}
        disabled={joining}
        style={{
          width: '100%', minHeight: 52, borderRadius: 100,
          background: joining ? 'var(--surface)' : 'var(--ink)',
          color: joining ? 'var(--ink-faint)' : '#fff',
          border: 'none', fontSize: 14, fontFamily: 'var(--mono)',
          letterSpacing: '0.06em', cursor: joining ? 'not-allowed' : 'pointer',
        }}
      >
        {joining ? 'Joining…' : `Join ${brandName} →`}
      </button>
    </>
  )
}
```

- [ ] **Step 3: Verify the full join flow**

1. As Art Director: copy invite URL from `/studio/[brand-id]/creators`
2. Open incognito window, paste URL
3. Expected: redirected to `/login` (since not logged in)
4. Log in as Creator account
5. Paste invite URL again
6. Expected: Join page shows brand name + "Join [brand] →" button
7. Click button
8. Expected: redirected to `/submit`
9. As Art Director: refresh `/studio/[brand-id]/creators`
10. Expected: Creator's email appears in the members list

- [ ] **Step 4: Commit**

```bash
git add src/app/join/\[token\]/page.tsx src/app/join/\[token\]/JoinClient.tsx
git commit -m "feat: add join page for brand invite links"
```

---

## Task 9: Submit Flow — Brand Picker

**Files:**
- Modify: `src/app/(contributor)/submit/page.tsx`
- Create: `src/app/(contributor)/submit/BrandPickerClient.tsx`

Replaces the editorial landing page with a brand picker. The server component fetches brands and handles the 0-brand and 1-brand cases server-side. The client component handles 2+ brand selection.

- [ ] **Step 1: Create BrandPickerClient.tsx**

```typescript
// src/app/(contributor)/submit/BrandPickerClient.tsx
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
                textAlign: 'left', cursor: 'pointer',
                background: 'var(--surface)',
                border: isSelected ? '2px solid var(--violet)' : '1.5px solid var(--line-soft)',
                borderRadius: 14, padding: '14px 16px',
                transition: 'border-color 0.12s',
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
          width: '100%', minHeight: 'var(--touch)', borderRadius: 100,
          background: selected ? 'var(--ink)' : 'var(--surface)',
          color: selected ? '#fff' : 'var(--ink-faint)',
          border: 'none', fontSize: 13, fontFamily: 'var(--mono)',
          letterSpacing: '0.06em', textTransform: 'uppercase',
          cursor: selected ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}
      >
        {selected ? `Start with ${selected.name}` : 'Select a brand'}
        {selected && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Replace submit/page.tsx with the server component**

```typescript
// src/app/(contributor)/submit/page.tsx
import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import BrandPickerClient from './BrandPickerClient'

export default async function SubmitPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('brand_members')
    .select('context_id')
    .eq('user_id', user.id)

  if (!memberships || memberships.length === 0) {
    return (
      <div style={{ paddingTop: 40, paddingBottom: 32 }}>
        <p style={{ fontSize: 10, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-faint)', marginBottom: 20 }}>
          New brief
        </p>
        <h1 style={{ fontSize: 34, fontWeight: 400, fontFamily: 'var(--display)', letterSpacing: '-0.025em', lineHeight: 1.15, color: 'var(--ink)', marginBottom: 16 }}>
          No brands yet
        </h1>
        <div style={{ width: 32, height: 1, background: 'var(--line)', marginBottom: 20 }} />
        <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6, maxWidth: 260 }}>
          Ask your Art Director for an invite link to get started.
        </p>
      </div>
    )
  }

  const contextIds = memberships.map(m => m.context_id)
  const service = createServiceSupabaseClient()

  const { data: contexts } = await service
    .from('contexts')
    .select('id, name, description, user_id')
    .in('id', contextIds)

  const brands = await Promise.all((contexts ?? []).map(async (ctx) => {
    const [capsule, templates, assets] = await Promise.all([
      service.from('capsules').select('rules').eq('context_id', ctx.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      service.from('templates').select('id', { count: 'exact', head: true })
        .eq('context_id', ctx.id).eq('active', true),
      service.from('brand_assets').select('id', { count: 'exact', head: true })
        .eq('context_id', ctx.id),
    ])
    const rules = (capsule.data?.rules ?? []) as unknown[]
    return {
      id: ctx.id,
      name: ctx.name,
      description: ctx.description ?? '',
      reviewerId: ctx.user_id,
      ruleCount: rules.length,
      templateCount: templates.count ?? 0,
      assetCount: assets.count ?? 0,
    }
  }))

  // 1 brand: skip the picker
  if (brands.length === 1) {
    const b = brands[0]
    redirect(`/submit/input?brandId=${b.id}&reviewerId=${b.reviewerId}`)
  }

  return <BrandPickerClient brands={brands} />
}
```

- [ ] **Step 3: Verify all three states**

As a Creator with 0 brands: open `/submit`. Expected: "No brands yet" message, no submit button.

As a Creator with 1 brand: open `/submit`. Expected: auto-redirected to `/submit/input?brandId=...&reviewerId=...`.

As a Creator with 2+ brands: open `/submit`. Expected: brand picker cards shown, CTA active after selecting one.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(contributor\)/submit/page.tsx \
        src/app/\(contributor\)/submit/BrandPickerClient.tsx
git commit -m "feat: replace submit landing with brand picker"
```

---

## Task 10: Thread brandId Through Confirm Page

**Files:**
- Modify: `src/app/(contributor)/submit/input/page.tsx`
- Modify: `src/app/(contributor)/submit/confirm/page.tsx`

The `brandId` and `reviewerId` from the brand picker need to flow from the input page through to the confirm page, where they replace the `/api/reviewer` call.

- [ ] **Step 1: Read both files**

```bash
cat src/app/\(contributor\)/submit/input/page.tsx
cat src/app/\(contributor\)/submit/confirm/page.tsx
```

- [ ] **Step 2: Modify input/page.tsx to forward brandId and reviewerId**

In `input/page.tsx`, the component reads search params and the `handleContinue` function navigates to `/submit/confirm`. Currently it builds params like:

```typescript
const params = new URLSearchParams()
params.set('mode', mode)
if (mode === 'text') params.set('text', text)
if (mode === 'voice') params.set('transcript', transcript)
router.push(`/submit/confirm?${params.toString()}`)
```

And for photo mode:
```typescript
router.push('/submit/confirm?mode=photo')
```

The page component signature needs to accept searchParams. Wrap the client component to receive `brandId` and `reviewerId` from the URL.

Since `input/page.tsx` is currently a pure client component with no server wrapper, add a server-side wrapper to read search params and pass them as props:

Create a new server wrapper `src/app/(contributor)/submit/input/page.tsx` and rename the current component to `InputClient.tsx`.

However, the existing `input/page.tsx` imports `PhotoEditor` from the same directory — do NOT move it. Instead, add a thin server wrapper at the top of the existing file using a different approach: read params client-side with `useSearchParams()`.

The cleanest change: add `useSearchParams()` call to the existing `InputPage` component (it's already a client component and already uses hooks) to read `brandId` and `reviewerId`, then forward them in the navigation call.

Here is the exact diff — find these two sections in `input/page.tsx` and replace them:

**Old `handleContinue` function (the photo-mode branch):**
```typescript
  const handleContinue = useCallback(async () => {
    if (mode === 'photo' && photoEditorRef.current) {
      setExporting(true)
      setError(null)
      try {
        const blob = await photoEditorRef.current.triggerExport()
        const b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(new Error('FileReader failed'))
          reader.readAsDataURL(blob)
        })
        sessionStorage.setItem('photo_blob_b64', b64)
        setExporting(false)
        router.push('/submit/confirm?mode=photo')
      } catch {
        setError('Could not export photo. Please try again.')
        setExporting(false)
      }
      return
    }
    const params = new URLSearchParams()
    params.set('mode', mode)
    if (mode === 'text') params.set('text', text)
    if (mode === 'voice') params.set('transcript', transcript)
    router.push(`/submit/confirm?${params.toString()}`)
  }, [mode, text, transcript, router])
```

**New version — read brandId/reviewerId from URL, forward them:**
```typescript
  const searchParams = useSearchParams()
  const brandId = searchParams.get('brandId') ?? ''
  const reviewerId = searchParams.get('reviewerId') ?? ''

  const handleContinue = useCallback(async () => {
    const carry = new URLSearchParams()
    if (brandId) carry.set('brandId', brandId)
    if (reviewerId) carry.set('reviewerId', reviewerId)

    if (mode === 'photo' && photoEditorRef.current) {
      setExporting(true)
      setError(null)
      try {
        const blob = await photoEditorRef.current.triggerExport()
        const b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(new Error('FileReader failed'))
          reader.readAsDataURL(blob)
        })
        sessionStorage.setItem('photo_blob_b64', b64)
        setExporting(false)
        carry.set('mode', 'photo')
        router.push(`/submit/confirm?${carry.toString()}`)
      } catch {
        setError('Could not export photo. Please try again.')
        setExporting(false)
      }
      return
    }
    carry.set('mode', mode)
    if (mode === 'text') carry.set('text', text)
    if (mode === 'voice') carry.set('transcript', transcript)
    router.push(`/submit/confirm?${carry.toString()}`)
  }, [mode, text, transcript, router, brandId, reviewerId])
```

Also add `useSearchParams` to the import at the top:

```typescript
import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
```

Wrap the component in `Suspense` since `useSearchParams()` requires it:

Add at the bottom of the file:
```typescript
import { Suspense } from 'react'

function InputPageInner() {
  // ... all existing code (rename from InputPage) ...
}

export default function InputPage() {
  return <Suspense><InputPageInner /></Suspense>
}
```

So the full modified `input/page.tsx` is:

```typescript
// src/app/(contributor)/submit/input/page.tsx
'use client'

import { useState, useRef, useCallback, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import PhotoEditor, { PhotoEditorHandle } from './PhotoEditor'

type InputMode = 'text' | 'voice' | 'photo'
type RecordingState = 'idle' | 'recording' | 'processing'

function InputPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const brandId = searchParams.get('brandId') ?? ''
  const reviewerId = searchParams.get('reviewerId') ?? ''
  const [mode, setMode] = useState<InputMode>('text')
  const [text, setText] = useState('')
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [transcript, setTranscript] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const photoEditorRef = useRef<PhotoEditorHandle>(null)

  async function startRecording() {
    if (recordingState !== 'idle') return
    setError(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Microphone access denied. Please allow microphone access and try again.')
      return
    }
    const recorder = new MediaRecorder(stream)
    chunksRef.current = []
    recorder.ondataavailable = e => chunksRef.current.push(e.data)
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      setRecordingState('processing')
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const fd = new FormData()
      fd.append('audio', blob)
      try {
        const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
        const json = await res.json() as { transcript?: string; error?: string }
        if (json.transcript) setTranscript(json.transcript)
        else setError(json.error ?? 'Transcription failed')
      } catch {
        setError('Could not transcribe audio')
      }
      setRecordingState('idle')
    }
    mediaRef.current = recorder
    recorder.start()
    setRecordingState('recording')
  }

  function stopRecording() {
    mediaRef.current?.stop()
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (photoUrl) URL.revokeObjectURL(photoUrl)
    setPhotoFile(file)
    setPhotoUrl(URL.createObjectURL(file))
  }

  useEffect(() => {
    return () => { if (photoUrl) URL.revokeObjectURL(photoUrl) }
  }, [photoUrl])

  function canContinue() {
    if (mode === 'text') return text.trim().length > 0
    if (mode === 'voice') return transcript.length > 0
    if (mode === 'photo') return photoFile !== null
    return false
  }

  const handleContinue = useCallback(async () => {
    const carry = new URLSearchParams()
    if (brandId) carry.set('brandId', brandId)
    if (reviewerId) carry.set('reviewerId', reviewerId)

    if (mode === 'photo' && photoEditorRef.current) {
      setExporting(true)
      setError(null)
      try {
        const blob = await photoEditorRef.current.triggerExport()
        const b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(new Error('FileReader failed'))
          reader.readAsDataURL(blob)
        })
        sessionStorage.setItem('photo_blob_b64', b64)
        setExporting(false)
        carry.set('mode', 'photo')
        router.push(`/submit/confirm?${carry.toString()}`)
      } catch {
        setError('Could not export photo. Please try again.')
        setExporting(false)
      }
      return
    }
    carry.set('mode', mode)
    if (mode === 'text') carry.set('text', text)
    if (mode === 'voice') carry.set('transcript', transcript)
    router.push(`/submit/confirm?${carry.toString()}`)
  }, [mode, text, transcript, router, brandId, reviewerId])

  const ok = canContinue()

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 0', fontSize: 13,
    background: active ? 'var(--violet)' : 'var(--surface)',
    color: active ? '#fff' : 'var(--ink-soft)',
    border: 'none', cursor: 'pointer', minHeight: 'var(--touch)',
  })

  return (
    <div style={{ paddingTop: 24, paddingBottom: 32 }}>
      <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', marginBottom: 28, border: '1.5px solid var(--line-soft)' }}>
        {(['text', 'voice', 'photo'] as InputMode[]).map(m => (
          <button key={m} onClick={() => setMode(m)} style={tabStyle(mode === m)}>
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {mode === 'text' && (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Write what you'd like to share…"
          rows={6}
          style={{
            width: '100%', padding: '14px', borderRadius: 10,
            border: '1.5px solid var(--line-soft)', background: 'var(--surface)',
            color: 'var(--ink)', fontSize: 15, resize: 'none', fontFamily: 'var(--body)',
            lineHeight: 1.5, outline: 'none',
          }}
        />
      )}

      {mode === 'voice' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          {recordingState === 'processing' && (
            <p style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Transcribing…</p>
          )}
          {recordingState !== 'processing' && (
            <button
              onPointerDown={startRecording}
              onPointerUp={stopRecording}
              onPointerLeave={stopRecording}
              style={{
                width: 80, height: 80, borderRadius: '50%',
                background: recordingState === 'recording' ? 'var(--red)' : 'var(--violet)',
                border: 'none', color: '#fff', fontSize: 13,
              }}
            >
              {recordingState === 'recording' ? 'Stop' : 'Hold'}
            </button>
          )}
          {transcript && (
            <p style={{ fontSize: 14, color: 'var(--ink)', background: 'var(--surface)', padding: '12px 14px', borderRadius: 10, lineHeight: 1.5, width: '100%' }}>
              {transcript}
            </p>
          )}
        </div>
      )}

      {mode === 'photo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhoto}
            style={{ display: 'none' }}
          />
          {photoUrl ? (
            <>
              <PhotoEditor ref={photoEditorRef} sourceUrl={photoUrl} />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ fontSize: 13, color: 'var(--violet)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Change photo
              </button>
            </>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%', minHeight: 180, borderRadius: 10, background: 'var(--surface)',
                border: '2px dashed var(--line-soft)', color: 'var(--ink-faint)', fontSize: 14, cursor: 'pointer',
              }}
            >
              Tap to take or choose a photo
            </button>
          )}
        </div>
      )}

      {error && (
        <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p>
      )}

      <button
        onClick={handleContinue}
        disabled={!ok || exporting}
        style={{
          marginTop: 32, width: '100%', minHeight: 'var(--touch)',
          background: ok && !exporting ? 'var(--violet)' : 'var(--surface)',
          color: ok && !exporting ? '#fff' : 'var(--ink-faint)',
          border: 'none', borderRadius: 14, fontSize: 15,
          cursor: ok && !exporting ? 'pointer' : 'not-allowed',
        }}
      >
        {exporting ? 'Preparing…' : 'Continue'}
      </button>
    </div>
  )
}

export default function InputPage() {
  return <Suspense><InputPageInner /></Suspense>
}
```

- [ ] **Step 3: Modify confirm/page.tsx to read brandId/reviewerId from URL**

In `ConfirmContent`, the `useEffect` currently calls `/api/reviewer` to get `reviewerId` and `contextId`. Add URL param reading. If both `brandId` and `reviewerId` are present in the URL, skip the API call.

Find the beginning of `ConfirmContent` (lines 23–35 of the current file) and the `useEffect` that fetches `/api/reviewer`. Replace it with:

```typescript
function ConfirmContent() {
  const router = useRouter()
  const params = useSearchParams()
  const mode = params.get('mode') as 'text' | 'voice' | 'photo' | null
  const text = params.get('text') ?? ''
  const transcript = params.get('transcript') ?? ''
  const brandId = params.get('brandId') ?? ''
  const reviewerIdParam = params.get('reviewerId') ?? ''

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [reviewerId, setReviewerId] = useState<string | null>(reviewerIdParam || null)
  const [contextId, setContextId] = useState<string | null>(brandId || null)
  // ... rest of state unchanged ...

  useEffect(() => {
    let mounted = true
    const supabase = createClient()
    supabase.auth.getUser()
      .then(({ data }) => {
        if (!mounted) return
        if (!data.user) { router.replace('/login'); return }
        // If brandId + reviewerId came from URL, skip the API call
        if (brandId && reviewerIdParam) return
        return fetch('/api/reviewer')
          .then(r => r.json())
          .then((json: { reviewer?: { id: string; context_id: string } }) => {
            if (!mounted) return
            if (json.reviewer) {
              setReviewerId(json.reviewer.id)
              setContextId(json.reviewer.context_id)
            } else {
              setError('No reviewer found for your account')
            }
          })
      })
      .catch(() => {
        if (mounted) setError('Could not load reviewer — please try again')
      })
    // ... rest of useEffect (photo blob loading) unchanged ...
  }, [mode, router, brandId, reviewerIdParam])
```

The full modified `confirm/page.tsx`:

```typescript
// src/app/(contributor)/submit/confirm/page.tsx
'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Phase = 'idle' | 'generating' | 'choosing' | 'sending'

interface CaptionOption {
  style: string
  text: string
}

interface Draft {
  id: string
  caption_options: CaptionOption[]
  recommended_caption: string
  cta: string
  hashtags: string[]
}

function ConfirmContent() {
  const router = useRouter()
  const params = useSearchParams()
  const mode = params.get('mode') as 'text' | 'voice' | 'photo' | null
  const text = params.get('text') ?? ''
  const transcript = params.get('transcript') ?? ''
  const brandId = params.get('brandId') ?? ''
  const reviewerIdParam = params.get('reviewerId') ?? ''

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [reviewerId, setReviewerId] = useState<string | null>(reviewerIdParam || null)
  const [contextId, setContextId] = useState<string | null>(brandId || null)
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [photoMissing, setPhotoMissing] = useState(false)
  const [photoMimeType, setPhotoMimeType] = useState<string>('image/jpeg')
  const [requestId, setRequestId] = useState<string | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [captionOptions, setCaptionOptions] = useState<CaptionOption[]>([])
  const [selectedCaption, setSelectedCaption] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const supabase = createClient()
    supabase.auth.getUser()
      .then(({ data }) => {
        if (!mounted) return
        if (!data.user) { router.replace('/login'); return }
        if (brandId && reviewerIdParam) return
        return fetch('/api/reviewer')
          .then(r => r.json())
          .then((json: { reviewer?: { id: string; context_id: string } }) => {
            if (!mounted) return
            if (json.reviewer) {
              setReviewerId(json.reviewer.id)
              setContextId(json.reviewer.context_id)
            } else {
              setError('No reviewer found for your account')
            }
          })
      })
      .catch(() => {
        if (mounted) setError('Could not load reviewer — please try again')
      })

    if (mode === 'photo') {
      const b64 = sessionStorage.getItem('photo_blob_b64')
      if (!b64) {
        if (mounted) setPhotoMissing(true)
      } else {
        try {
          const parts = b64.split(',')
          const mime = parts[0].split(':')[1].split(';')[0]
          const byteStr = atob(parts[1])
          const ab = new ArrayBuffer(byteStr.length)
          const ia = new Uint8Array(ab)
          for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i)
          const blob = new Blob([ab], { type: mime })
          if (mounted) {
            setPhotoMimeType(mime)
            setPhotoBlob(blob)
            const url = URL.createObjectURL(blob)
            setPhotoPreviewUrl(url)
          }
        } catch {
          if (mounted) setPhotoMissing(true)
        }
      }
    }

    return () => { mounted = false }
  }, [mode, router, brandId, reviewerIdParam])

  useEffect(() => {
    return () => { if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl) }
  }, [photoPreviewUrl])

  async function handleGenerateOptions() {
    if (!reviewerId) { setError('No reviewer found'); return }
    setPhase('generating')
    setError(null)
    try {
      let photoUrl: string | null = null

      if (mode === 'photo' && photoBlob) {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')
        const ext = photoMimeType.split('/')[1] ?? 'jpg'
        const filename = `${user.id}/${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('post-photos')
          .upload(filename, photoBlob, { contentType: photoMimeType, upsert: false })
        if (uploadError) throw new Error('Photo upload failed: ' + uploadError.message)
        const { data: { publicUrl } } = supabase.storage
          .from('post-photos')
          .getPublicUrl(filename)
        photoUrl = publicUrl
      }

      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewer_id: reviewerId,
          context_id: contextId,
          source_type: mode,
          raw_text: mode === 'text' ? text : undefined,
          transcript: mode === 'voice' ? transcript : undefined,
          photo_url: photoUrl ?? undefined,
        }),
      })
      const json = await res.json() as { request?: { id: string }; error?: string }
      if (!json.request) throw new Error(json.error ?? 'Failed to create request')

      const reqId = json.request.id
      setRequestId(reqId)

      const interpretRes = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: reqId }),
      })
      if (!interpretRes.ok) throw new Error('Interpret failed')
      const interpretJson = await interpretRes.json() as { status?: string }

      if (interpretJson.status !== 'draft_ready') {
        throw new Error('Could not interpret your input — please try again')
      }

      const draftRes = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: reqId }),
      })
      if (!draftRes.ok) throw new Error('Caption generation failed')
      const draftJson = await draftRes.json() as { draft?: Draft; error?: string }
      if (!draftJson.draft) throw new Error(draftJson.error ?? 'Draft generation failed')

      sessionStorage.removeItem('photo_blob_b64')
      setDraftId(draftJson.draft.id)
      setCaptionOptions(draftJson.draft.caption_options ?? [])
      setPhase('choosing')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setPhase('idle')
    }
  }

  async function handleSendToDirector() {
    if (!selectedCaption || !draftId || !requestId) return
    setPhase('sending')
    setError(null)
    try {
      const res = await fetch('/api/draft', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draftId, request_id: requestId, chosen_caption: selectedCaption }),
      })
      if (!res.ok) throw new Error('Failed to send to Director')
      router.push(`/submit/sent?id=${requestId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setPhase('choosing')
    }
  }

  const inputSummary = mode === 'voice' ? transcript : text

  if (mode === 'photo' && photoMissing) {
    return (
      <div style={{ paddingTop: 24 }}>
        <p style={{ color: 'var(--red)', marginBottom: 16 }}>
          Photo not found — please go back and try again.
        </p>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: 'var(--violet)', cursor: 'pointer', fontSize: 14 }}
        >
          ← Go back
        </button>
      </div>
    )
  }

  if (phase === 'choosing' || phase === 'sending') {
    return (
      <div style={{ paddingTop: 24, paddingBottom: 48 }}>
        {photoPreviewUrl && (
          <img
            src={photoPreviewUrl}
            alt="Photo preview"
            style={{ width: '100%', borderRadius: 10, maxHeight: 180, objectFit: 'cover', marginBottom: 24 }}
          />
        )}
        <p style={{ fontSize: 16, fontFamily: 'var(--display)', marginBottom: 4, lineHeight: 1.3 }}>
          Pick your caption
        </p>
        <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginBottom: 20, lineHeight: 1.5 }}>
          Choose the version that sounds most like you.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
          {captionOptions.map((option) => {
            const isSelected = selectedCaption === option.text
            return (
              <button
                key={option.style}
                onClick={() => setSelectedCaption(option.text)}
                style={{
                  textAlign: 'left', cursor: 'pointer',
                  border: isSelected ? '2px solid var(--violet)' : '1.5px solid var(--line-soft)',
                  borderRadius: 12, padding: '14px 16px',
                  background: isSelected ? 'rgba(74,61,176,0.06)' : 'var(--surface)',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <p style={{
                  fontSize: 10, fontFamily: 'var(--mono)', textTransform: 'uppercase',
                  color: isSelected ? 'var(--violet)' : 'var(--ink-faint)',
                  marginBottom: 8, letterSpacing: '0.06em',
                }}>
                  {option.style}
                </p>
                <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.65, margin: 0 }}>
                  {option.text}
                </p>
              </button>
            )
          })}
        </div>

        {error && (
          <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{error}</p>
        )}

        <button
          onClick={handleSendToDirector}
          disabled={!selectedCaption || phase === 'sending'}
          style={{
            width: '100%', minHeight: 'var(--touch)', borderRadius: 14,
            background: 'var(--violet)', color: '#fff', border: 'none', fontSize: 15,
            opacity: (!selectedCaption || phase === 'sending') ? 0.5 : 1,
            cursor: (!selectedCaption || phase === 'sending') ? 'not-allowed' : 'pointer',
          }}
        >
          {phase === 'sending' ? 'Sending…' : 'Send to Director'}
        </button>
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 24, paddingBottom: 32 }}>
      {photoPreviewUrl && mode === 'photo' ? (
        <>
          <p style={{ fontSize: 18, fontFamily: 'var(--display)', marginBottom: 12, lineHeight: 1.3 }}>
            Your edited photo
          </p>
          <img
            src={photoPreviewUrl}
            alt="Photo preview"
            style={{ width: '100%', borderRadius: 10, maxHeight: 300, objectFit: 'cover', marginBottom: 28 }}
          />
        </>
      ) : mode !== 'photo' ? (
        <>
          <p style={{ fontSize: 18, fontFamily: 'var(--display)', marginBottom: 8, lineHeight: 1.3 }}>
            Here&apos;s what you said
          </p>
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '14px 16px', marginBottom: 28 }}>
            <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.6 }}>
              {inputSummary || (mode ? `${mode} input` : 'input')}
            </p>
          </div>
        </>
      ) : null}

      {phase === 'generating' ? (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <p style={{ fontSize: 14, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
            Crafting 3 caption ideas…
          </p>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginBottom: 28, lineHeight: 1.5 }}>
            AI will generate 3 caption options for you to choose from before sending to your Director.
          </p>
          {error && (
            <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{error}</p>
          )}
          <button
            onClick={handleGenerateOptions}
            disabled={!reviewerId || (mode === 'photo' && !photoBlob)}
            style={{
              width: '100%', minHeight: 'var(--touch)', borderRadius: 14,
              background: 'var(--violet)', color: '#fff', border: 'none', fontSize: 15,
              opacity: (!reviewerId || (mode === 'photo' && !photoBlob)) ? 0.6 : 1,
              cursor: (!reviewerId || (mode === 'photo' && !photoBlob)) ? 'not-allowed' : 'pointer',
            }}
          >
            Generate caption options
          </button>
        </>
      )}
    </div>
  )
}

export default function ConfirmPage() {
  return <Suspense><ConfirmContent /></Suspense>
}
```

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 5: Verify the full submit flow end-to-end**

1. As Creator (with ≥1 brand joined), open `/submit`
2. Select a brand, click "Start with [brand] →"
3. Expected: `/submit/input?brandId=xxx&reviewerId=yyy`
4. Enter text, click Continue
5. Expected: `/submit/confirm?brandId=xxx&reviewerId=yyy&mode=text&text=...`
6. In browser devtools → Network tab: watch for the POST to `/api/requests`
7. Expected: request body includes `context_id: "xxx"` and `reviewer_id: "yyy"`
8. Continue through caption selection and send
9. Expected: request appears in the Art Director's queue

- [ ] **Step 6: Commit**

```bash
git add src/app/\(contributor\)/submit/input/page.tsx \
        src/app/\(contributor\)/submit/confirm/page.tsx
git commit -m "feat: thread brandId/reviewerId through submit flow"
```

---

## Task 11: Deploy & Verify

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 2: Check for uncommitted files**

```bash
git status
```
Expected: clean working tree.

- [ ] **Step 3: Deploy to production**

```bash
vercel --prod
```

- [ ] **Step 4: Apply migration in production**

Go to Supabase dashboard → SQL editor for the production project. Run the contents of `supabase/migrations/004_brand_members.sql`. Verify the two tables appear.

- [ ] **Step 5: Verify invite flow in production**

1. Log in as Art Director → open a brand in Studio
2. Click "Creators" tile → verify Creators page loads with invite link
3. Copy the invite link (format: `https://curato.app/join/[token]`)
4. Open a new browser window / incognito as Creator
5. Paste invite link → verify join page shows brand name
6. Click Join → verify redirect to `/submit`
7. On `/submit`: verify brand appears in the picker
8. On Art Director → Creators page: verify creator email appears in members list

- [ ] **Step 6: Verify regenerate invalidates old link**

1. Copy the current invite URL
2. Click Regenerate → confirm
3. Open the old URL in a new tab
4. Expected: "This invite link is no longer valid" page

- [ ] **Step 7: Verify remove works**

1. On Creators page → click Remove next to a member
2. Expected: member disappears from the list
3. Refresh the page: member is still gone
4. That creator opens `/submit`: brand no longer appears in their list
