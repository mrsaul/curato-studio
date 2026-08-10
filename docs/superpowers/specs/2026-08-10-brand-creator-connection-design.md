# Brand–Creator Connection Design

## Design Decisions

Three decisions made via visual brainstorm:

1. **Connection model — C: Creator picks a Brand when submitting.** No permanent single-brand link. Creator is connected to N brands and chooses which one applies per request. Art Director controls which brands a creator can see.
2. **Access mechanism — A: Art Director invites via link.** Each brand has a per-brand invite link. AD copies it and shares it (WhatsApp, email, etc). Creator clicks → lands on join page → one confirm tap → connected. AD can revoke by regenerating the link (invalidates the old one).
3. **Submit flow — A: Brand first, then create.** Brand picker is the first step of the submit flow. The AI uses the selected brand's rules, templates, and assets from the start.

---

## Architecture

### Data Model

Two new tables:

**`brand_invites`** — one active invite per brand (upsert on regenerate):

```sql
id          uuid primary key default gen_random_uuid()
context_id  uuid not null references contexts(id) on delete cascade
token       text not null unique default encode(gen_random_bytes(6), 'hex')
created_at  timestamptz default now()
unique (context_id)
```

RLS: owner of the context can read/write. No public read — token is the auth.

**`brand_members`** — creators linked to a brand:

```sql
id          uuid primary key default gen_random_uuid()
context_id  uuid not null references contexts(id) on delete cascade
user_id     uuid not null references auth.users(id) on delete cascade
joined_at   timestamptz default now()
unique (context_id, user_id)
```

RLS:
- Art Director (context owner): can SELECT and DELETE rows where `context_id IN (SELECT id FROM contexts WHERE user_id = auth.uid())`
- Creator: can SELECT rows where `user_id = auth.uid()`
- Join (INSERT): authenticated user can insert only their own `user_id` — handled via API route using service role after token validation

### File Map

**New files:**

| File | Purpose |
|---|---|
| `supabase/migrations/20260810_brand_members.sql` | Creates `brand_invites` + `brand_members` tables + RLS |
| `src/app/api/studio/brands/[id]/invite/route.ts` | GET (get/create token) · POST body `{action:"regenerate"}` |
| `src/app/api/studio/brands/[id]/members/route.ts` | GET (list members) · DELETE body `{userId}` |
| `src/app/api/join/[token]/route.ts` | GET (validate token, public) · POST (accept invite, auth) |
| `src/app/api/contributor/brands/route.ts` | GET — lists brands a creator has joined |
| `src/app/(reviewer)/studio/[brandId]/creators/page.tsx` | Server page — Creators tab (AD view) |
| `src/app/(reviewer)/studio/[brandId]/creators/CreatorsClient.tsx` | Client component — copy link + remove |
| `src/app/join/[token]/page.tsx` | Server page — join confirmation (root level, standalone layout, no BottomNav) |
| `src/app/join/[token]/JoinClient.tsx` | Client component — confirm button, POST to API, redirect on success |

**Modified files:**

| File | Change |
|---|---|
| `src/app/(reviewer)/studio/[brandId]/page.tsx` | Add 5th "Creators" tile; query `brand_members` count |
| `src/app/(contributor)/submit/page.tsx` | Replace landing with brand picker. 0 brands → empty state; 1 brand → auto-navigate; 2+ brands → picker |
| `src/app/(contributor)/submit/input/page.tsx` | Accept `?brandId=xxx` search param; pass `context_id` through to API |
| `src/app/(contributor)/submit/confirm/page.tsx` | Thread `brandId` through to the POST request body |

---

## Feature Sections

### 1. Art Director — Creators Tab

Route: `/studio/[brandId]/creators`

The server page fetches:
- All rows from `brand_members` where `context_id = brandId`, joining to `auth.users` for email/name
- Request count per member via `judgments` or `requests` table (if available)
- The current invite token from `brand_invites`

If no invite exists yet, the page creates one on first load (server-side, via service role).

**UI elements:**
- Header: "Creators — [brand name]"
- Member list: name/email, "joined N days ago", request count, Remove button
- Empty state: "No creators yet — share the invite link below"
- Invite link card:
  - Token URL displayed as `curato.app/join/[token]` (read-only monospace field)
  - "Copy link" button (client-side clipboard API)
  - "Regenerate" button with confirmation prompt: "This invalidates the current link. Creators who haven't joined yet will need the new link."
  - Warning: "Regenerating invalidates the old link"

**CreatorsClient.tsx** handles:
- Clipboard copy (`navigator.clipboard.writeText`)
- Regenerate: POST to `/api/studio/brands/[id]/invite` with `{action:"regenerate"}`, updates displayed token
- Remove: DELETE to `/api/studio/brands/[id]/members`, removes from list with `Set<string>` loading guard

### 2. Studio Brand Detail — Creators Tile

The existing 2×2 grid (Rules · Mind · Templates · Assets) gains a 5th tile: **Creators**.

Layout change: tiles render as a 2-column grid; the 5th tile spans both columns (full width, shorter height). Alternatively: 3 tiles in first row (Rules · Mind · Templates) and 2 in second row (Assets · Creators). Preferred: keep 2×2 and add Creators as a full-width 5th tile below. This avoids breaking the visual rhythm.

Data added to server query: `brand_members` count where `context_id = brandId`.

Tile shows: count of active members. No `pending` highlight (always neutral styling). Link: `/studio/[brandId]/creators`.

### 3. Invite API

`GET /api/studio/brands/[id]/invite`:
- Auth check: user must own the context
- Query `brand_invites` where `context_id = id`
- If none: insert a new row (use `gen_random_bytes(6)` hex as token)
- Return `{ token, url: "https://curato.app/join/[token]" }`

`POST /api/studio/brands/[id]/invite` with body `{action: "regenerate"}`:
- Auth check: user must own the context
- Delete existing row for `context_id`, insert new one (new token auto-generated)
- Return `{ token, url }`

### 4. Members API

`GET /api/studio/brands/[id]/members`:
- Auth check: user must own the context
- Join `brand_members` → `auth.users` (via service role `admin.listUsers()` or a `profiles` table if one exists)
- Return `{ members: [{ userId, email, joinedAt }] }`

`DELETE /api/studio/brands/[id]/members` with body `{userId}`:
- Auth check: user must own the context
- Delete row from `brand_members` where `context_id = id AND user_id = userId`
- Return `{ ok: true }`

> **Note:** Supabase does not expose `auth.users` to the client or anon role. The members API uses the **service role** client (`createClient(url, serviceRoleKey)`) to look up user emails. This client is server-only (never sent to the browser).

### 5. Join Flow

Route: `/join/[token]`

This page lives at the **root level** (`src/app/join/[token]/`), outside the `(contributor)` route group, so it renders without the BottomNav. The server page checks auth directly and redirects to `/login?next=/join/[token]` if not logged in.

**Server page (`/join/[token]/page.tsx`):**
- Calls `GET /api/join/[token]` to validate token → gets `{ contextId, brandName, valid: true/false }`
- If `valid: false` → shows "This invite link is no longer valid"
- If already a member → shows "You're already connected to [brand name]"
- Otherwise → renders `JoinClient` with `{ brandName, token }`

**JoinClient.tsx:**
- Renders brand name and a single "Join [brand name]" confirm button
- On click: POST to `/api/join/[token]`
- On success: `router.push('/submit')` with a brief "Connected!" flash
- On error: shows error message inline

**`GET /api/join/[token]`** (no auth required):
- Query `brand_invites` where `token = [token]` → get `context_id`
- If not found: return `{ valid: false }`
- Query `contexts` for brand name
- Return `{ valid: true, brandName, contextId }`

**`POST /api/join/[token]`** (auth required):
- Validate token → get `context_id`
- Check if already a member (graceful: return `{ ok: true }` if duplicate)
- Insert into `brand_members` using service role (to bypass RLS on insert)
- Return `{ ok: true, brandName }`

### 6. Creator — Contributor Brands API

`GET /api/contributor/brands`:
- Auth check
- Query `brand_members` where `user_id = auth.uid()`, join to `contexts` for `id, name, description`
- For each brand, fetch `ruleCount`, `templateCount`, `assetCount` (parallel, same pattern as studio brands API)
- Return `{ brands: [{ id, name, description, ruleCount, templateCount, assetCount }] }`

### 7. Creator — Brand Picker (Submit Flow)

`/submit/page.tsx` is replaced with a brand picker server component. Three states:

**0 brands:** Show message: "You haven't joined any brands yet. Ask your Art Director for an invite link." No submit button.

**1 brand:** Auto-navigate to `/submit/input?brandId=[id]` on mount (client-side redirect). Show a brief "Working for [brand name]..." loading state.

**2+ brands:** Show brand cards (as designed):
- Each card: brand name, description, rule/template/asset counts as small tags
- Radio-style selection with purple border on selected card
- "Start with [Brand Name] →" CTA button navigates to `/submit/input?brandId=[id]`

The server component fetches brands from `GET /api/contributor/brands`. The brand picker state (selected brand) is client-side only — extracted into a `BrandPickerClient.tsx` component.

### 8. Threading brandId Through Submit Flow

The submit flow currently: `/submit/input` → `/submit/confirm` → `/submit/sent`

With this change: `/submit` (brand picker) → `/submit/input?brandId=xxx` → `/submit/confirm?brandId=xxx` → `/submit/sent`

Each step reads `brandId` from the URL search params and passes it forward via the navigation call. The confirm page includes `brandId` in the request body sent to `/api/requests`, which maps it to `context_id` in the database insert.

The existing `/api/requests` POST already accepts `context_id`. The confirm page just needs to supply it.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Invalid/expired invite token | `/join/[token]` shows "This invite link is no longer valid" |
| Creator already a member | Join POST returns `{ ok: true }` — idempotent, no error shown |
| Art Director removes creator mid-session | Next time creator loads `/submit`, brand disappears from their list |
| Creator has 0 brands, tries to go to `/submit/input` directly | Input page checks for `brandId` param; if missing, redirects to `/submit` |
| Service role key missing | API returns 500; log error server-side |

---

## RLS Policies (SQL)

```sql
-- brand_members: creator reads own rows
CREATE POLICY "creator reads own memberships"
  ON brand_members FOR SELECT
  USING (user_id = auth.uid());

-- brand_members: art director reads/deletes for owned brands
CREATE POLICY "art director manages members"
  ON brand_members FOR ALL
  USING (
    context_id IN (SELECT id FROM contexts WHERE user_id = auth.uid())
  );

-- brand_invites: only context owner
CREATE POLICY "art director manages invites"
  ON brand_invites FOR ALL
  USING (
    context_id IN (SELECT id FROM contexts WHERE user_id = auth.uid())
  );
```

Inserts into `brand_members` on join are done via the **service role** client (server-only), bypassing RLS.

---

## Out of Scope

- Creator profile pages
- Notification when a creator joins
- Multiple invite links per brand (one active link is sufficient for MVP)
- Creator-to-creator visibility (each creator sees only their own requests)
- Brand-level creator permissions (all creators on a brand have the same access)
