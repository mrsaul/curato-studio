# Director's Atelier — Design Spec

**Date:** 2026-08-09  
**Status:** Approved for implementation

---

## Goal

Give the Director a dedicated Studio section where they build and maintain everything the AI uses to generate captions: brand identities, voice rules, confirmed AI judgments, post templates, and image assets. Everything is brand-centric — the Director thinks in terms of "Cafeto" and "Venecia", not abstract feature categories.

---

## Navigation

A **Studio** tab is added as the third item in the Director's bottom nav (`(reviewer)/BottomNav.tsx`):

```
QUEUE  |  DONE  |  ✦ STUDIO
```

The Studio tab is active whenever the path starts with `/studio`.

---

## Route Structure

All routes live inside the `(reviewer)` route group.

```
/studio                              → brand list (+ create)
/studio/[brandId]                    → brand detail: 4 summary tiles
/studio/[brandId]/rules              → rules list + add/delete
/studio/[brandId]/mind               → judgment review (pending → confirm/reject, confirmed list)
/studio/[brandId]/templates          → template list + create/edit/delete
/studio/[brandId]/assets             → image grid + upload/delete
```

---

## Database Changes

### Migration: `supabase/migrations/003_atelier.sql`

Three changes required:

**1. Add `context_id` to `templates`** — templates are currently global per reviewer; they need to be scoped per brand.

```sql
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS context_id uuid REFERENCES public.contexts(id) ON DELETE SET NULL;
```

Existing template rows get `context_id = NULL` (still valid — treated as unscoped legacy).

**2. New `brand_assets` table:**

```sql
CREATE TABLE public.brand_assets (
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
```

**3. Storage bucket `brand-assets` (private):**

```sql
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

### Existing tables (already in Supabase, no migration needed)

| Table | Key columns | Notes |
|-------|-------------|-------|
| `contexts` | `id, name, description, reviewer_id` | Brand identity |
| `capsules` | `id, context_id, rules jsonb [{verb, domain, text}], created_at` | Rules stored as versioned JSONB array; latest row per `context_id` wins |
| `judgments` | `id, context_id, verb, statement, status (proposed/confirmed/rejected), created_at` | AI-proposed learnings from `/api/memory` |
| `templates` | `id, reviewer_id, context_id (new), name, type, description, visual_spec, active` | Post format templates |

---

## API Routes

All routes are under `src/app/api/studio/`. All require an authenticated reviewer session.

### Brands (`contexts`)

| Method | Path | Body / Params | Returns |
|--------|------|---------------|---------|
| `GET` | `/api/studio/brands` | — | `{ brands: Brand[] }` with counts |
| `POST` | `/api/studio/brands` | `{ name, description }` | `{ brand: Brand }` |
| `GET` | `/api/studio/brands/[id]` | — | `{ brand: Brand }` |
| `PUT` | `/api/studio/brands/[id]` | `{ name?, description? }` | `{ brand: Brand }` |
| `DELETE` | `/api/studio/brands/[id]` | — | `{ ok: true }` |

`Brand` shape returned from GET list includes aggregated counts:
```ts
interface Brand {
  id: string
  name: string
  description: string
  ruleCount: number        // from latest capsule.rules.length
  pendingMindCount: number // judgments where status = 'proposed'
  templateCount: number    // active templates with this context_id
  assetCount: number       // brand_assets rows
}
```

### Rules (`capsules`)

Rules are stored as a JSONB array on the latest capsule row. All mutations read the latest row, modify the array in-memory, then upsert a single capsule row per `context_id` (overwrite, not version).

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `GET` | `/api/studio/brands/[id]/rules` | — | `{ rules: Rule[] }` |
| `POST` | `/api/studio/brands/[id]/rules` | `{ verb, domain, text }` | `{ rules: Rule[] }` |
| `DELETE` | `/api/studio/brands/[id]/rules/[index]` | — | `{ rules: Rule[] }` |

`Rule`: `{ verb: 'always'|'never'|'prefer'|'avoid', domain: string, text: string }`

Verb options: `always`, `never`, `prefer`, `avoid`  
Domain options: `voice`, `visual`, `content`, `format`, `timing`

### Mind (`judgments`)

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `GET` | `/api/studio/brands/[id]/mind` | — | `{ pending: Judgment[], confirmed: Judgment[] }` |
| `PATCH` | `/api/studio/brands/[id]/mind/[judgmentId]` | `{ status: 'confirmed'|'rejected' }` | `{ ok: true }` |

`Judgment`: `{ id, verb, statement, status, created_at }`

### Templates

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `GET` | `/api/studio/brands/[id]/templates` | — | `{ templates: Template[] }` |
| `POST` | `/api/studio/brands/[id]/templates` | `{ name, type, description }` | `{ template: Template }` |
| `PUT` | `/api/studio/brands/[id]/templates/[tid]` | `{ name?, description?, active? }` | `{ template: Template }` |
| `DELETE` | `/api/studio/brands/[id]/templates/[tid]` | — | `{ ok: true }` |

`type` values: `photo_post`, `quote_card`, `announcement`, `carousel`

### Assets

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `GET` | `/api/studio/brands/[id]/assets` | — | `{ assets: Asset[] }` |
| `POST` | `/api/studio/brands/[id]/assets` | `FormData: file (image)` | `{ asset: Asset }` |
| `DELETE` | `/api/studio/brands/[id]/assets/[assetId]` | — | `{ ok: true }` |

Upload: server receives the file, uploads to `brand-assets/<reviewer_id>/<uuid>.<ext>`, generates a signed URL, inserts into `brand_assets`.

`Asset`: `{ id, name, url, created_at }`

---

## UI Components & Pages

### BottomNav update — `src/app/(reviewer)/BottomNav.tsx`

Add Studio tab as third item. Active when `pathname.startsWith('/studio')`.

```tsx
{ href: '/studio', label: 'STUDIO', icon: '✦' }
```

### `/studio` — Brand List

**File:** `src/app/(reviewer)/studio/page.tsx` (Server Component)

- Fetches all `contexts` where `reviewer_id = auth.uid()` with aggregated counts via `/api/studio/brands`
- Renders a list of `BrandCard` components
- "New brand" dashed card at bottom → links to `/studio/new`
- Brand card shows: name, description, counts row (N rules · N mind · N templates · N assets), amber "N pending" badge if `pendingMindCount > 0`

**File:** `src/app/(reviewer)/studio/new/page.tsx` (Client Component)

- Form: name (text input) + description (textarea)
- POST `/api/studio/brands` on submit → redirect to `/studio/[id]`

### `/studio/[brandId]` — Brand Detail

**File:** `src/app/(reviewer)/studio/[brandId]/page.tsx` (Server Component)

- Fetches brand with counts
- Renders 4 summary tiles in 2×2 grid
- Mind tile: amber background + "N need review" when `pendingMindCount > 0`
- Each tile links to its section
- "Edit brand info" link → opens inline edit form (or separate `/studio/[brandId]/edit` page)

### `/studio/[brandId]/rules` — Rules

**File:** `src/app/(reviewer)/studio/[brandId]/rules/page.tsx` (Server Component)  
**File:** `src/app/(reviewer)/studio/[brandId]/rules/RulesClient.tsx` (Client Component)

- List existing rules with verb badge (color-coded: `always` = violet, `never` = red, `prefer` = green, `avoid` = amber) + text
- Each rule has a delete button (⋯ → delete)
- Add rule form at bottom:
  - Verb dropdown: `always | never | prefer | avoid`
  - Domain dropdown: `voice | visual | content | format | timing`
  - Text input: free text
  - POST `/api/studio/brands/[id]/rules` on submit

### `/studio/[brandId]/mind` — Judgment Review

**File:** `src/app/(reviewer)/studio/[brandId]/mind/page.tsx` (Server Component)  
**File:** `src/app/(reviewer)/studio/[brandId]/mind/MindClient.tsx` (Client Component)

- **Pending section** (amber header): judgment cards with ✓ Confirm / ✗ Reject buttons
  - PATCH `/api/studio/brands/[id]/mind/[judgmentId]` with `{ status: 'confirmed' | 'rejected' }`
  - Card disappears from pending on action (optimistic update)
- **Confirmed section** (muted header): read-only list of confirmed judgments
- If no pending: show "All up to date — no new learnings to review" message

### `/studio/[brandId]/templates` — Templates

**File:** `src/app/(reviewer)/studio/[brandId]/templates/page.tsx` (Server Component)  
**File:** `src/app/(reviewer)/studio/[brandId]/templates/TemplatesClient.tsx` (Client Component)

- List of templates: name, type badge, description, active toggle
- Active toggle → PUT `/api/studio/brands/[id]/templates/[tid]` with `{ active: bool }`
- "New template" dashed card → inline form:
  - Name (text)
  - Type (select: photo_post | quote_card | announcement | carousel)
  - Description (textarea)
- Delete button per template

### `/studio/[brandId]/assets` — Assets

**File:** `src/app/(reviewer)/studio/[brandId]/assets/page.tsx` (Server Component)  
**File:** `src/app/(reviewer)/studio/[brandId]/assets/AssetsClient.tsx` (Client Component)

- 3-column image grid with `<img>` tags (signed URLs from Supabase storage)
- Last cell (or floating button) = "+" → triggers `<input type="file" accept="image/*">`
- On file select: POST FormData to `/api/studio/brands/[id]/assets`
- Loading state while uploading (spinner overlay on the "+" cell)
- Tap image → modal: full-size preview + Delete button
- Delete → DELETE `/api/studio/brands/[id]/assets/[assetId]` + remove from storage

---

## TypeScript Types

Add to `src/types/brand.ts`:

```ts
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

---

## Out of Scope (MVP)

- Sharing brands across multiple reviewers
- Brand asset categories / folders
- Template visual_spec JSON editor (field exists in DB, not exposed in UI)
- Bulk delete rules or assets
- Reordering rules

---

## Implementation Order

1. DB migration (003_atelier.sql) — apply in Supabase
2. TypeScript types
3. API routes (brands → rules → mind → templates → assets)
4. BottomNav update + `/studio` brand list
5. `/studio/[brandId]` detail page
6. `/studio/[brandId]/rules`
7. `/studio/[brandId]/mind`
8. `/studio/[brandId]/templates`
9. `/studio/[brandId]/assets`
10. Deploy
