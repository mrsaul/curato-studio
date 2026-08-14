# Instagram Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Creator publish an approved post to a brand's Instagram account as a feed post or story, from the Ready to post list.

**Architecture:** Four isolated units — a Graph API HTTP wrapper, a publish-sequence layer, error translation, and token handling — sit under `src/lib/instagram/`. Route handlers own authorization and persistence. The brand's access token lives in a table with no RLS policies, so only the service-role client can read it and it never reaches the browser.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + Auth), Meta Graph API, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-14-instagram-publishing-design.md`

---

## Context an engineer needs before starting

**The project has no test framework.** `package.json` has only `dev`, `build`, `start`, `lint`. Task 1 adds Vitest. Do not skip it — every later task depends on it.

**Migrations are applied by hand.** Files live in `supabase/migrations/00N_name.sql` and carry the header `-- Apply in Supabase dashboard → SQL editor`. There is no migration runner. After writing a migration you must paste it into the Supabase SQL editor yourself.

**Two Supabase clients** (`src/lib/supabase-server.ts`):
- `createServerSupabaseClient()` — carries the user's session, respects RLS. Use for authorization checks.
- `createServiceSupabaseClient()` — service role, bypasses RLS. Use only for reading `instagram_accounts`.

**Instagram constraints that drive the code:**
- Meta *fetches* media from a public URL. You never upload bytes. `request.photo_url` is already a Supabase public URL.
- Publishing is two calls: create a container, then publish it.
- Stories ignore captions.
- Long-lived tokens last ~60 days.

**Existing status buckets** live in `src/app/(contributor)/requests/status.ts`. `bucketOf(status) === 'ready'` means approved or delivered.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/005_instagram.sql` | Both tables, RLS, indexes |
| `src/types/instagram.ts` | Shared types |
| `src/lib/instagram/errors.ts` | Meta error code → user-facing message |
| `src/lib/instagram/client.ts` | Graph HTTP calls, version pin, `GraphApiError` |
| `src/lib/instagram/publish.ts` | Container payload builders + publish sequence |
| `src/lib/instagram/tokens.ts` | Token exchange, refresh, expiry window |
| `src/app/api/publish/route.ts` | Authorization, idempotency, persistence |
| `src/app/api/instagram/connect/route.ts` | OAuth redirect |
| `src/app/api/instagram/callback/route.ts` | OAuth callback, account discovery |
| `src/app/api/instagram/refresh/route.ts` | Cron token refresh |
| `src/app/(reviewer)/studio/[brandId]/instagram/page.tsx` | Director connect UI (server) |
| `src/app/(reviewer)/studio/[brandId]/instagram/InstagramClient.tsx` | Director connect UI (client) |
| `src/app/(contributor)/requests/PublishButton.tsx` | Creator publish UI |
| `vercel.json` | Cron schedule |

---

## Task 1: Test infrastructure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/lib/instagram/smoke.test.ts`

- [ ] **Step 1: Install Vitest**

```bash
cd ~/dev/curato-studio
npm install -D vitest@^2 @vitejs/plugin-react vite-tsconfig-paths
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Add the test script to `package.json`**

Add to the `scripts` object:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test proving the `@/` alias resolves**

Create `src/lib/instagram/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { RequestStatus } from '@/types/request'

describe('test harness', () => {
  it('resolves the @/ path alias', () => {
    const s: RequestStatus = 'approved'
    expect(s).toBe('approved')
  })
})
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: `1 passed`. If the alias fails to resolve, `vite-tsconfig-paths` is not loading — confirm `tsconfig.json` has `"paths": { "@/*": ["./src/*"] }`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/instagram/smoke.test.ts
git commit -m "Add Vitest test harness"
```

---

## Task 2: Database migration

**Files:**
- Create: `supabase/migrations/005_instagram.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/005_instagram.sql
-- Apply in Supabase dashboard → SQL editor

-- 1. Connected Instagram account, one per brand.
--    Deliberately has NO RLS policies: the access token must never be
--    readable by any client role. Service role only.
CREATE TABLE IF NOT EXISTS public.instagram_accounts (
  context_id       uuid PRIMARY KEY REFERENCES public.contexts(id) ON DELETE CASCADE,
  ig_user_id       text        NOT NULL,
  username         text,
  access_token     text        NOT NULL,
  token_expires_at timestamptz NOT NULL,
  needs_reconnect  boolean     NOT NULL DEFAULT false,
  connected_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;
-- No policies by design. Any client-side read returns zero rows.

-- 2. Publish history. Also the idempotency record.
CREATE TABLE IF NOT EXISTS public.publish_attempts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id    uuid NOT NULL REFERENCES public.creative_requests(id) ON DELETE CASCADE,
  context_id    uuid NOT NULL REFERENCES public.contexts(id) ON DELETE CASCADE,
  published_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  format        text NOT NULL CHECK (format IN ('feed','story')),
  status        text NOT NULL CHECK (status IN ('pending','published','failed')),
  ig_media_id   text,
  permalink     text,
  error_code    text,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS publish_attempts_request_idx
  ON public.publish_attempts (request_id);

-- One successful publish per request per format. This is the backstop
-- against a double tap racing the application-level check.
CREATE UNIQUE INDEX IF NOT EXISTS publish_attempts_one_success
  ON public.publish_attempts (request_id, format)
  WHERE status = 'published';

ALTER TABLE public.publish_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read brand attempts" ON public.publish_attempts;
CREATE POLICY "members read brand attempts"
  ON public.publish_attempts FOR SELECT
  USING (
    context_id IN (SELECT context_id FROM public.brand_members WHERE user_id = auth.uid())
    OR context_id IN (SELECT id FROM public.contexts WHERE user_id = auth.uid())
  );
```

- [ ] **Step 2: Apply it**

Open the Supabase dashboard → SQL editor, paste the file contents, run.

- [ ] **Step 3: Verify both tables exist**

In the SQL editor:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('instagram_accounts','publish_attempts');
```

Expected: 2 rows.

- [ ] **Step 4: Verify the token table is not client-readable**

```sql
SELECT count(*) FROM pg_policies
WHERE tablename = 'instagram_accounts';
```

Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/005_instagram.sql
git commit -m "Add instagram_accounts and publish_attempts tables"
```

---

## Task 3: Shared types

**Files:**
- Create: `src/types/instagram.ts`

- [ ] **Step 1: Write the types**

```ts
export type PublishFormat = 'feed' | 'story'
export type PublishStatus = 'pending' | 'published' | 'failed'

export interface InstagramAccount {
  context_id: string
  ig_user_id: string
  username: string | null
  access_token: string
  token_expires_at: string
  needs_reconnect: boolean
  connected_by: string | null
  created_at: string
  updated_at: string
}

export interface PublishAttempt {
  id: string
  request_id: string
  context_id: string
  published_by: string | null
  format: PublishFormat
  status: PublishStatus
  ig_media_id: string | null
  permalink: string | null
  error_code: string | null
  error_message: string | null
  created_at: string
}

/** Shape Meta returns inside an error response body. */
export interface MetaErrorBody {
  code?: number
  error_subcode?: number
  type?: string
  message?: string
}

/** What error translation produces for the UI and the attempt row. */
export interface TranslatedError {
  code: string
  userMessage: string
  needsReconnect: boolean
  retryable: boolean
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/instagram.ts
git commit -m "Add Instagram types"
```

---

## Task 4: Error translation

Pure logic, no I/O. Build it first so later layers can lean on it.

**Files:**
- Create: `src/lib/instagram/errors.ts`
- Test: `src/lib/instagram/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { translateIgError } from './errors'

describe('translateIgError', () => {
  it('flags an expired token as needing reconnect', () => {
    const r = translateIgError({ code: 190, message: 'Error validating access token' })
    expect(r.needsReconnect).toBe(true)
    expect(r.retryable).toBe(false)
    expect(r.userMessage).toBe('Instagram needs reconnecting — ask your director.')
  })

  it.each([4, 32, 613])('treats rate limit code %i as retryable', (code) => {
    const r = translateIgError({ code, message: 'rate limited' })
    expect(r.retryable).toBe(true)
    expect(r.needsReconnect).toBe(false)
    expect(r.userMessage).toBe("Instagram's limit was reached. Try again shortly.")
  })

  it('passes Meta’s own wording through for media errors', () => {
    const r = translateIgError({ code: 2207020, message: 'Media not found' })
    expect(r.userMessage).toBe("Instagram couldn't use this image: Media not found")
    expect(r.retryable).toBe(false)
  })

  it('falls back for an unrecognised code', () => {
    const r = translateIgError({ code: 99999, message: 'Something odd' })
    expect(r.code).toBe('99999')
    expect(r.userMessage).toBe("Instagram didn't accept the post: Something odd")
  })

  it('handles a missing code and message', () => {
    const r = translateIgError({})
    expect(r.code).toBe('unknown')
    expect(r.userMessage).toBe("Instagram didn't accept the post.")
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- errors`
Expected: FAIL — `Failed to resolve import "./errors"`.

- [ ] **Step 3: Implement**

```ts
import { MetaErrorBody, TranslatedError } from '@/types/instagram'

const RATE_LIMIT_CODES = new Set([4, 32, 613])

/**
 * Meta adds 2207xxx codes without notice, so this recognises the families
 * we act on and surfaces Meta's own wording for everything else rather
 * than swallowing it behind a generic failure.
 */
export function translateIgError(err: MetaErrorBody): TranslatedError {
  const code = err.code
  const message = err.message?.trim()

  if (code === 190) {
    return {
      code: '190',
      userMessage: 'Instagram needs reconnecting — ask your director.',
      needsReconnect: true,
      retryable: false,
    }
  }

  if (code !== undefined && RATE_LIMIT_CODES.has(code)) {
    return {
      code: String(code),
      userMessage: "Instagram's limit was reached. Try again shortly.",
      needsReconnect: false,
      retryable: true,
    }
  }

  if (code !== undefined && code >= 2207000 && code < 2208000) {
    return {
      code: String(code),
      userMessage: message
        ? `Instagram couldn't use this image: ${message}`
        : "Instagram couldn't use this image.",
      needsReconnect: false,
      retryable: false,
    }
  }

  return {
    code: code === undefined ? 'unknown' : String(code),
    userMessage: message
      ? `Instagram didn't accept the post: ${message}`
      : "Instagram didn't accept the post.",
    needsReconnect: false,
    retryable: false,
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- errors`
Expected: 5 passed (the `it.each` counts as 3).

- [ ] **Step 5: Commit**

```bash
git add src/lib/instagram/errors.ts src/lib/instagram/errors.test.ts
git commit -m "Add Instagram error translation"
```

---

## Task 5: Graph API client

**Files:**
- Create: `src/lib/instagram/client.ts`
- Test: `src/lib/instagram/client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { graphPost, graphGet, GraphApiError, graphUrl } from './client'

afterEach(() => { vi.unstubAllGlobals() })

describe('graphUrl', () => {
  it('builds a versioned URL', () => {
    expect(graphUrl('123/media')).toMatch(/^https:\/\/graph\.facebook\.com\/v[\d.]+\/123\/media$/)
  })
})

describe('graphPost', () => {
  it('posts params plus the token and returns parsed JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ id: 'container-1' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const out = await graphPost<{ id: string }>('123/media', { image_url: 'https://x/y.jpg' }, 'TOKEN')

    expect(out).toEqual({ id: 'container-1' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/123/media')
    expect(init.method).toBe('POST')
    const body = init.body as URLSearchParams
    expect(body.get('image_url')).toBe('https://x/y.jpg')
    expect(body.get('access_token')).toBe('TOKEN')
  })

  it('throws GraphApiError carrying the Meta error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: 190, message: 'bad token' } }),
    }))

    await expect(graphPost('123/media', {}, 'TOKEN')).rejects.toMatchObject({
      name: 'GraphApiError',
      meta: { code: 190, message: 'bad token' },
    })
  })

  it('throws GraphApiError when the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => { throw new Error('not json') },
    }))

    await expect(graphPost('123/media', {}, 'T')).rejects.toBeInstanceOf(GraphApiError)
  })
})

describe('graphGet', () => {
  it('puts params in the query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ permalink: 'https://instagram.com/p/abc' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const out = await graphGet<{ permalink: string }>('media-1', { fields: 'permalink' }, 'TOKEN')

    expect(out.permalink).toBe('https://instagram.com/p/abc')
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('fields=permalink')
    expect(url).toContain('access_token=TOKEN')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- client`
Expected: FAIL — cannot resolve `./client`.

- [ ] **Step 3: Implement**

```ts
import { MetaErrorBody } from '@/types/instagram'

/**
 * Pinned in one place. Meta deprecates versions on roughly a two-year
 * cycle — set GRAPH_VERSION to the current stable version rather than
 * trusting this default.
 */
export const GRAPH_VERSION = process.env.GRAPH_VERSION ?? 'v23.0'

const GRAPH_HOST = 'https://graph.facebook.com'

export function graphUrl(path: string): string {
  return `${GRAPH_HOST}/${GRAPH_VERSION}/${path}`
}

export class GraphApiError extends Error {
  readonly name = 'GraphApiError'
  readonly meta: MetaErrorBody
  constructor(meta: MetaErrorBody) {
    super(meta.message ?? 'Graph API request failed')
    this.meta = meta
  }
}

async function readError(res: { json: () => Promise<unknown> }): Promise<MetaErrorBody> {
  try {
    const body = (await res.json()) as { error?: MetaErrorBody }
    return body.error ?? {}
  } catch {
    return {}
  }
}

export async function graphPost<T>(
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<T> {
  const body = new URLSearchParams({ ...params, access_token: token })
  const res = await fetch(graphUrl(path), { method: 'POST', body })
  if (!res.ok) throw new GraphApiError(await readError(res))
  return (await res.json()) as T
}

export async function graphGet<T>(
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<T> {
  const qs = new URLSearchParams({ ...params, access_token: token })
  const res = await fetch(`${graphUrl(path)}?${qs.toString()}`)
  if (!res.ok) throw new GraphApiError(await readError(res))
  return (await res.json()) as T
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- client`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/instagram/client.ts src/lib/instagram/client.test.ts
git commit -m "Add Graph API client"
```

---

## Task 6: Publish sequence

**Files:**
- Create: `src/lib/instagram/publish.ts`
- Test: `src/lib/instagram/publish.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { containerParams, publishImage } from './publish'
import * as client from './client'

afterEach(() => { vi.restoreAllMocks() })

describe('containerParams', () => {
  it('includes the caption for a feed post', () => {
    expect(containerParams('feed', 'https://x/y.jpg', 'Hello')).toEqual({
      image_url: 'https://x/y.jpg',
      caption: 'Hello',
    })
  })

  it('omits the caption for a story and sets media_type', () => {
    expect(containerParams('story', 'https://x/y.jpg', 'Hello')).toEqual({
      image_url: 'https://x/y.jpg',
      media_type: 'STORIES',
    })
  })

  it('omits an empty caption on a feed post', () => {
    expect(containerParams('feed', 'https://x/y.jpg', '')).toEqual({
      image_url: 'https://x/y.jpg',
    })
  })
})

describe('publishImage', () => {
  it('creates a container, publishes it, then reads the permalink', async () => {
    const post = vi.spyOn(client, 'graphPost')
      .mockResolvedValueOnce({ id: 'container-1' } as never)
      .mockResolvedValueOnce({ id: 'media-9' } as never)
    const get = vi.spyOn(client, 'graphGet')
      .mockResolvedValue({ permalink: 'https://instagram.com/p/abc' } as never)

    const out = await publishImage({
      igUserId: '123', token: 'T', format: 'feed',
      imageUrl: 'https://x/y.jpg', caption: 'Hi',
    })

    expect(out).toEqual({ mediaId: 'media-9', permalink: 'https://instagram.com/p/abc' })
    expect(post).toHaveBeenNthCalledWith(1, '123/media',
      { image_url: 'https://x/y.jpg', caption: 'Hi' }, 'T')
    expect(post).toHaveBeenNthCalledWith(2, '123/media_publish',
      { creation_id: 'container-1' }, 'T')
    expect(get).toHaveBeenCalledWith('media-9', { fields: 'permalink' }, 'T')
  })

  it('still returns the media id when the permalink lookup fails', async () => {
    vi.spyOn(client, 'graphPost')
      .mockResolvedValueOnce({ id: 'container-1' } as never)
      .mockResolvedValueOnce({ id: 'media-9' } as never)
    vi.spyOn(client, 'graphGet').mockRejectedValue(new Error('nope'))

    const out = await publishImage({
      igUserId: '123', token: 'T', format: 'story', imageUrl: 'https://x/y.jpg',
    })

    expect(out).toEqual({ mediaId: 'media-9', permalink: null })
  })

  it('does not call media_publish when the container fails', async () => {
    const post = vi.spyOn(client, 'graphPost').mockRejectedValue(new Error('boom'))

    await expect(publishImage({
      igUserId: '123', token: 'T', format: 'feed', imageUrl: 'https://x/y.jpg',
    })).rejects.toThrow('boom')

    expect(post).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- publish`
Expected: FAIL — cannot resolve `./publish`.

- [ ] **Step 3: Implement**

```ts
import { PublishFormat } from '@/types/instagram'
import { graphPost, graphGet } from './client'

/** Stories ignore captions, so we do not send one. */
export function containerParams(
  format: PublishFormat,
  imageUrl: string,
  caption?: string,
): Record<string, string> {
  if (format === 'story') {
    return { image_url: imageUrl, media_type: 'STORIES' }
  }
  return caption ? { image_url: imageUrl, caption } : { image_url: imageUrl }
}

export interface PublishInput {
  igUserId: string
  token: string
  format: PublishFormat
  imageUrl: string
  caption?: string
}

export interface PublishResult {
  mediaId: string
  permalink: string | null
}

export async function publishImage(input: PublishInput): Promise<PublishResult> {
  const { igUserId, token, format, imageUrl, caption } = input

  const container = await graphPost<{ id: string }>(
    `${igUserId}/media`, containerParams(format, imageUrl, caption), token,
  )

  const published = await graphPost<{ id: string }>(
    `${igUserId}/media_publish`, { creation_id: container.id }, token,
  )

  // The post is already live at this point. A permalink lookup failure must
  // not turn a successful publish into a reported failure.
  let permalink: string | null = null
  try {
    const meta = await graphGet<{ permalink?: string }>(
      published.id, { fields: 'permalink' }, token,
    )
    permalink = meta.permalink ?? null
  } catch {
    permalink = null
  }

  return { mediaId: published.id, permalink }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- publish`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/instagram/publish.ts src/lib/instagram/publish.test.ts
git commit -m "Add Instagram publish sequence"
```

---

## Task 7: Token handling

**Files:**
- Create: `src/lib/instagram/tokens.ts`
- Test: `src/lib/instagram/tokens.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { needsRefresh, expiryFromNow, exchangeForLongLived, refreshLongLived } from './tokens'
import * as client from './client'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('needsRefresh', () => {
  const now = new Date('2026-08-14T00:00:00Z')

  it('is true inside the 14 day window', () => {
    expect(needsRefresh(new Date('2026-08-20T00:00:00Z'), now)).toBe(true)
  })

  it('is false outside the window', () => {
    expect(needsRefresh(new Date('2026-09-30T00:00:00Z'), now)).toBe(false)
  })

  it('is true for an already expired token', () => {
    expect(needsRefresh(new Date('2026-08-01T00:00:00Z'), now)).toBe(true)
  })
})

describe('expiryFromNow', () => {
  it('converts seconds into an ISO timestamp', () => {
    const now = new Date('2026-08-14T00:00:00Z')
    expect(expiryFromNow(3600, now)).toBe('2026-08-14T01:00:00.000Z')
  })
})

describe('exchangeForLongLived', () => {
  it('calls the exchange endpoint with app credentials', async () => {
    vi.stubEnv('META_APP_ID', 'APPID')
    vi.stubEnv('META_APP_SECRET', 'SECRET')
    const get = vi.spyOn(client, 'graphGet')
      .mockResolvedValue({ access_token: 'LONG', expires_in: 5184000 } as never)

    const out = await exchangeForLongLived('SHORT')

    expect(out).toEqual({ token: 'LONG', expiresIn: 5184000 })
    expect(get).toHaveBeenCalledWith('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: 'APPID',
      client_secret: 'SECRET',
      fb_exchange_token: 'SHORT',
    }, '')
  })
})

describe('refreshLongLived', () => {
  it('re-exchanges an existing long-lived token', async () => {
    vi.stubEnv('META_APP_ID', 'APPID')
    vi.stubEnv('META_APP_SECRET', 'SECRET')
    vi.spyOn(client, 'graphGet')
      .mockResolvedValue({ access_token: 'FRESH', expires_in: 5184000 } as never)

    const out = await refreshLongLived('OLD')
    expect(out.token).toBe('FRESH')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- tokens`
Expected: FAIL — cannot resolve `./tokens`.

- [ ] **Step 3: Implement**

```ts
import { graphGet } from './client'

const REFRESH_WINDOW_DAYS = 14
const MS_PER_DAY = 24 * 60 * 60 * 1000

export function needsRefresh(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() - now.getTime() <= REFRESH_WINDOW_DAYS * MS_PER_DAY
}

export function expiryFromNow(expiresInSeconds: number, now: Date = new Date()): string {
  return new Date(now.getTime() + expiresInSeconds * 1000).toISOString()
}

interface TokenResponse { access_token: string; expires_in: number }

/**
 * Both the initial exchange and the refresh use the same endpoint and
 * grant type — Meta treats refreshing as re-exchanging.
 */
async function exchange(token: string): Promise<{ token: string; expiresIn: number }> {
  const res = await graphGet<TokenResponse>('oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: token,
  }, '')
  return { token: res.access_token, expiresIn: res.expires_in }
}

export function exchangeForLongLived(shortLivedToken: string) {
  return exchange(shortLivedToken)
}

export function refreshLongLived(longLivedToken: string) {
  return exchange(longLivedToken)
}
```

Note: `graphGet` appends `access_token` from its third argument. Passing `''` keeps the signature uniform while the real credentials travel in the params, which is what this endpoint expects.

- [ ] **Step 4: Run tests**

Run: `npm test -- tokens`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/instagram/tokens.ts src/lib/instagram/tokens.test.ts
git commit -m "Add Instagram token exchange and refresh"
```

---

## Task 8: Publish route

**Files:**
- Create: `src/app/api/publish/route.ts`

- [ ] **Step 1: Implement the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { InstagramAccount, PublishFormat } from '@/types/instagram'
import { publishImage } from '@/lib/instagram/publish'
import { translateIgError } from '@/lib/instagram/errors'
import { GraphApiError } from '@/lib/instagram/client'
import { bucketOf } from '@/app/(contributor)/requests/status'

const FORMATS: PublishFormat[] = ['feed', 'story']

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { request_id?: string; format?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const requestId = body.request_id
  const format = body.format as PublishFormat
  if (!requestId || !FORMATS.includes(format)) {
    return NextResponse.json({ error: 'request_id and a valid format are required' }, { status: 400 })
  }

  // Load the request through the user's own client so RLS applies.
  const { data: request } = await supabase
    .from('creative_requests')
    .select('id, context_id, status, photo_url')
    .eq('id', requestId)
    .maybeSingle()

  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!request.context_id) {
    return NextResponse.json({ error: 'This post has no brand attached.' }, { status: 409 })
  }

  // Membership is re-checked server-side: a Creator's session alone never
  // grants authority over a brand's Instagram account.
  const { data: membership } = await supabase
    .from('brand_members')
    .select('id')
    .eq('context_id', request.context_id)
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: ownedBrand } = await supabase
    .from('contexts')
    .select('id')
    .eq('id', request.context_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership && !ownedBrand) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (bucketOf(request.status) !== 'ready') {
    return NextResponse.json({ error: 'Only approved posts can be published.' }, { status: 409 })
  }

  if (!request.photo_url) {
    return NextResponse.json({ error: 'Instagram posts need an image.' }, { status: 409 })
  }

  const service = createServiceSupabaseClient()

  const { data: existing } = await service
    .from('publish_attempts')
    .select('id, permalink')
    .eq('request_id', requestId)
    .eq('format', format)
    .eq('status', 'published')
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'This post was already published.', permalink: existing.permalink },
      { status: 409 },
    )
  }

  const { data: account } = await service
    .from('instagram_accounts')
    .select('*')
    .eq('context_id', request.context_id)
    .maybeSingle<InstagramAccount>()

  if (!account) {
    return NextResponse.json(
      { error: "Instagram isn't connected for this brand yet." }, { status: 409 },
    )
  }
  if (account.needs_reconnect) {
    return NextResponse.json(
      { error: 'Instagram needs reconnecting — ask your director.' }, { status: 409 },
    )
  }

  const caption = format === 'feed' ? await loadCaption(service, requestId) : undefined

  const { data: attempt } = await service
    .from('publish_attempts')
    .insert({
      request_id: requestId,
      context_id: request.context_id,
      published_by: user.id,
      format,
      status: 'pending',
    })
    .select('id')
    .single()

  try {
    const result = await publishImage({
      igUserId: account.ig_user_id,
      token: account.access_token,
      format,
      imageUrl: request.photo_url,
      caption,
    })

    await service.from('publish_attempts').update({
      status: 'published',
      ig_media_id: result.mediaId,
      permalink: result.permalink,
    }).eq('id', attempt!.id)

    return NextResponse.json({ ok: true, permalink: result.permalink })
  } catch (e) {
    const translated = e instanceof GraphApiError
      ? translateIgError(e.meta)
      : { code: 'network', userMessage: "Couldn't reach Instagram. Try again.", needsReconnect: false, retryable: true }

    await service.from('publish_attempts').update({
      status: 'failed',
      error_code: translated.code,
      error_message: translated.userMessage,
    }).eq('id', attempt!.id)

    if (translated.needsReconnect) {
      await service.from('instagram_accounts')
        .update({ needs_reconnect: true })
        .eq('context_id', request.context_id)
    }

    return NextResponse.json({ error: translated.userMessage, retryable: translated.retryable }, { status: 502 })
  }
}

/**
 * Must produce exactly the text CaptionShare copies, or the caption a
 * Creator previews will differ from the one that goes live.
 *
 * review_decisions is keyed by draft_id, not request_id — resolve the
 * latest draft first, then its decision, and fall back to the draft's
 * recommended caption when the director approved without editing.
 * Mirrors src/app/api/draft-caption/route.ts.
 */
async function loadCaption(
  service: ReturnType<typeof createServiceSupabaseClient>,
  requestId: string,
): Promise<string | undefined> {
  const { data: draft } = await service
    .from('request_drafts')
    .select('id, recommended_caption')
    .eq('request_id', requestId)
    .order('created_at', { ascending: false })
    .maybeSingle()

  if (!draft?.id) return undefined

  const { data: decision } = await service
    .from('review_decisions')
    .select('edited_caption')
    .eq('draft_id', draft.id)
    .in('decision', ['approved', 'delivered'])
    .order('created_at', { ascending: false })
    .maybeSingle()

  return decision?.edited_caption ?? draft.recommended_caption ?? undefined
}
```

- [ ] **Step 2: Verify the caption matches what the Creator sees**

Pick an approved request id from the database and compare:

```bash
# What CaptionShare displays
curl -s "http://localhost:3000/api/draft-caption?request_id=<ID>" | python3 -m json.tool
```

The `caption` field must equal what `loadCaption` returns for that id. If they differ, `loadCaption` is wrong — fix it before continuing, because publishing the wrong text is silent and irreversible.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/publish/route.ts
git commit -m "Add publish route with authorization and idempotency"
```

---

## Task 9: OAuth connect and callback

**Files:**
- Create: `src/app/api/instagram/connect/route.ts`
- Create: `src/app/api/instagram/callback/route.ts`

- [ ] **Step 1: Add environment variables**

In Vercel project settings and `.env.local`:

```
META_APP_ID=<from the Meta app dashboard>
META_APP_SECRET=<from the Meta app dashboard>
META_OAUTH_REDIRECT_URI=https://curato-studio-azure.vercel.app/api/instagram/callback
GRAPH_VERSION=<current stable version, e.g. v23.0>
```

Add the same redirect URI to the Meta app under Facebook Login → Valid OAuth Redirect URIs.

- [ ] **Step 2: Implement the connect route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'business_management',
].join(',')

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  // Only the brand's director may connect an account.
  const { data: brand } = await supabase
    .from('contexts').select('id').eq('id', brandId).eq('user_id', user.id).maybeSingle()
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const nonce = randomBytes(16).toString('hex')
  const state = Buffer.from(JSON.stringify({ brandId, nonce })).toString('base64url')

  const auth = new URL(`https://www.facebook.com/${process.env.GRAPH_VERSION ?? 'v23.0'}/dialog/oauth`)
  auth.searchParams.set('client_id', process.env.META_APP_ID!)
  auth.searchParams.set('redirect_uri', process.env.META_OAUTH_REDIRECT_URI!)
  auth.searchParams.set('scope', SCOPES)
  auth.searchParams.set('state', state)
  auth.searchParams.set('response_type', 'code')

  const res = NextResponse.redirect(auth.toString())
  res.cookies.set('ig_oauth_nonce', nonce, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/',
  })
  return res
}
```

- [ ] **Step 3: Implement the callback route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { graphGet } from '@/lib/instagram/client'
import { exchangeForLongLived, expiryFromNow } from '@/lib/instagram/tokens'

interface PageEntry {
  id: string
  access_token: string
  instagram_business_account?: { id: string; username?: string }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const code = url.searchParams.get('code')
  const stateRaw = url.searchParams.get('state')
  if (!code || !stateRaw) return NextResponse.redirect(new URL('/studio', req.url))

  let brandId: string, nonce: string
  try {
    const parsed = JSON.parse(Buffer.from(stateRaw, 'base64url').toString()) as { brandId: string; nonce: string }
    brandId = parsed.brandId
    nonce = parsed.nonce
  } catch {
    return NextResponse.redirect(new URL('/studio?ig=bad_state', req.url))
  }

  if (req.cookies.get('ig_oauth_nonce')?.value !== nonce) {
    return NextResponse.redirect(new URL('/studio?ig=bad_state', req.url))
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const { data: brand } = await supabase
    .from('contexts').select('id').eq('id', brandId).eq('user_id', user.id).maybeSingle()
  if (!brand) return NextResponse.redirect(new URL('/studio?ig=forbidden', req.url))

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/studio/${brandId}/instagram?ig=${reason}`, req.url))

  try {
    // 1. code -> short-lived token
    const short = await graphGet<{ access_token: string }>('oauth/access_token', {
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      redirect_uri: process.env.META_OAUTH_REDIRECT_URI!,
      code,
    }, '')

    // 2. short-lived -> long-lived
    const long = await exchangeForLongLived(short.access_token)

    // 3. find the Page that owns an Instagram Business account
    const pages = await graphGet<{ data: PageEntry[] }>('me/accounts', {
      fields: 'id,access_token,instagram_business_account{id,username}',
    }, long.token)

    const page = pages.data.find(p => p.instagram_business_account?.id)
    if (!page?.instagram_business_account) return fail('no_business_account')

    const service = createServiceSupabaseClient()
    const { error } = await service.from('instagram_accounts').upsert({
      context_id: brandId,
      ig_user_id: page.instagram_business_account.id,
      username: page.instagram_business_account.username ?? null,
      access_token: long.token,
      token_expires_at: expiryFromNow(long.expiresIn),
      needs_reconnect: false,
      connected_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'context_id' })

    if (error) return fail('save_failed')

    return NextResponse.redirect(new URL(`/studio/${brandId}/instagram?ig=connected`, req.url))
  } catch {
    return fail('exchange_failed')
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/instagram/connect/route.ts src/app/api/instagram/callback/route.ts
git commit -m "Add Instagram OAuth connect and callback"
```

---

## Task 10: Token refresh cron

**Files:**
- Create: `src/app/api/instagram/refresh/route.ts`
- Create: `vercel.json`

- [ ] **Step 1: Implement the refresh route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'
import { InstagramAccount } from '@/types/instagram'
import { needsRefresh, refreshLongLived, expiryFromNow } from '@/lib/instagram/tokens'

export async function GET(req: NextRequest) {
  // Vercel cron sends this header; reject anything else so the endpoint
  // is not a public token-churn button.
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceSupabaseClient()
  const { data: accounts } = await service
    .from('instagram_accounts')
    .select('*')
    .returns<InstagramAccount[]>()

  let refreshed = 0
  let flagged = 0

  for (const account of accounts ?? []) {
    if (!needsRefresh(new Date(account.token_expires_at))) continue
    try {
      const next = await refreshLongLived(account.access_token)
      await service.from('instagram_accounts').update({
        access_token: next.token,
        token_expires_at: expiryFromNow(next.expiresIn),
        needs_reconnect: false,
        updated_at: new Date().toISOString(),
      }).eq('context_id', account.context_id)
      refreshed++
    } catch {
      // Keep the stale token so the failure surfaces as a clear reconnect
      // prompt rather than a silent 190 at publish time.
      await service.from('instagram_accounts')
        .update({ needs_reconnect: true, updated_at: new Date().toISOString() })
        .eq('context_id', account.context_id)
      flagged++
    }
  }

  return NextResponse.json({ ok: true, refreshed, flagged })
}
```

- [ ] **Step 2: Create `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/instagram/refresh", "schedule": "0 4 * * 1" }
  ]
}
```

That runs every Monday at 04:00 UTC — well inside the 14-day refresh window for a 60-day token.

- [ ] **Step 3: Set `CRON_SECRET`**

Add a `CRON_SECRET` environment variable in Vercel with any random string. Vercel sends it as `Authorization: Bearer <CRON_SECRET>` on cron invocations.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/instagram/refresh/route.ts vercel.json
git commit -m "Add weekly Instagram token refresh cron"
```

---

## Task 11: Director connect UI

**Files:**
- Create: `src/app/(reviewer)/studio/[brandId]/instagram/page.tsx`
- Create: `src/app/(reviewer)/studio/[brandId]/instagram/InstagramClient.tsx`

- [ ] **Step 1: Implement the server page**

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { InstagramAccount } from '@/types/instagram'
import InstagramClient from './InstagramClient'

export default async function InstagramPage({
  params,
}: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: ctx } = await supabase
    .from('contexts').select('name, user_id').eq('id', brandId).single()
  if (!ctx || ctx.user_id !== user.id) redirect('/studio')

  const service = createServiceSupabaseClient()
  const { data: account } = await service
    .from('instagram_accounts')
    .select('ig_user_id, username, token_expires_at, needs_reconnect')
    .eq('context_id', brandId)
    .maybeSingle<Pick<InstagramAccount,
      'ig_user_id' | 'username' | 'token_expires_at' | 'needs_reconnect'>>()

  return (
    <div style={{ paddingTop: 24, paddingBottom: 100 }}>
      <Link href={`/studio/${brandId}`} style={{
        textDecoration: 'none', fontSize: 'var(--text-base)',
        color: 'var(--ink-faint)', display: 'inline-flex',
        alignItems: 'center', minHeight: 'var(--touch)',
      }}>
        ← {ctx.name}
      </Link>
      <h1 style={{
        fontSize: 'var(--text-xl)', fontWeight: 400, fontFamily: 'var(--display)',
        color: 'var(--ink)', marginBottom: 'var(--space-5)',
      }}>
        Instagram
      </h1>
      <InstagramClient
        brandId={brandId}
        account={account ? {
          username: account.username,
          expiresAt: account.token_expires_at,
          needsReconnect: account.needs_reconnect,
        } : null}
      />
    </div>
  )
}
```

- [ ] **Step 2: Implement the client component**

```tsx
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button, InlineError } from '@/components/ui'

interface AccountView {
  username: string | null
  expiresAt: string
  needsReconnect: boolean
}

const MESSAGES: Record<string, string> = {
  connected: '',
  no_business_account: 'That account has no Instagram Business account attached to a Facebook Page.',
  exchange_failed: 'Instagram sign-in did not complete. Try again.',
  save_failed: 'Could not save the connection. Try again.',
  bad_state: 'That sign-in link expired. Try again.',
  forbidden: 'You do not manage this brand.',
}

export default function InstagramClient({
  brandId, account,
}: { brandId: string; account: AccountView | null }) {
  const router = useRouter()
  const params = useSearchParams()
  const [busy, setBusy] = useState(false)
  const flag = params.get('ig')
  const error = flag && flag !== 'connected' ? (MESSAGES[flag] ?? 'Something went wrong.') : null

  async function disconnect() {
    setBusy(true)
    await fetch(`/api/instagram/account?brandId=${brandId}`, { method: 'DELETE' })
    router.refresh()
    setBusy(false)
  }

  if (!account) {
    return (
      <div>
        {error && <div style={{ marginBottom: 'var(--space-4)' }}><InlineError>{error}</InlineError></div>}
        <p style={{
          fontSize: 'var(--text-md)', color: 'var(--ink-soft)',
          lineHeight: 'var(--leading-relaxed)', marginBottom: 'var(--space-5)',
        }}>
          Connect this brand&apos;s Instagram so approved posts can be published from Curato.
          The account must be an Instagram Business or Creator account linked to a Facebook Page.
        </p>
        <Button variant="cta" fullWidth onClick={() => { window.location.href = `/api/instagram/connect?brandId=${brandId}` }}>
          Connect Instagram
        </Button>
      </div>
    )
  }

  return (
    <div>
      {account.needsReconnect && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--alert)',
          borderRadius: 'var(--r-lg)', padding: 'var(--space-4)',
          marginBottom: 'var(--space-4)',
        }}>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--ink)', lineHeight: 'var(--leading-normal)' }}>
            This connection stopped working. Reconnect to keep publishing.
          </p>
        </div>
      )}

      <p style={{ fontSize: 'var(--text-md)', color: 'var(--ink)', marginBottom: 'var(--space-2)' }}>
        {account.username ? `@${account.username}` : 'Connected'}
      </p>
      <p style={{
        fontSize: 'var(--text-base)', color: 'var(--ink-faint)',
        fontFamily: 'var(--mono)', marginBottom: 'var(--space-6)',
      }}>
        Renews {new Date(account.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </p>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <Button variant="cta" fullWidth onClick={() => { window.location.href = `/api/instagram/connect?brandId=${brandId}` }}>
          Reconnect
        </Button>
      </div>
      <Button variant="ghost" fullWidth onClick={disconnect} disabled={busy}>
        {busy ? 'Disconnecting…' : 'Disconnect'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Add the disconnect route**

Create `src/app/api/instagram/account/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'

export async function DELETE(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: brand } = await supabase
    .from('contexts').select('id').eq('id', brandId).eq('user_id', user.id).maybeSingle()
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const service = createServiceSupabaseClient()
  await service.from('instagram_accounts').delete().eq('context_id', brandId)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Link it from the brand detail page**

Open `src/app/(reviewer)/studio/[brandId]/page.tsx` and add an Instagram tile alongside the existing Rules / Mind / Templates / Assets / Creators tiles, following exactly the markup those tiles use, linking to `/studio/${brandId}/instagram`.

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(reviewer)/studio/[brandId]/instagram" src/app/api/instagram/account/route.ts "src/app/(reviewer)/studio/[brandId]/page.tsx"
git commit -m "Add Instagram connect screen for directors"
```

---

## Task 12: Creator publish button

**Files:**
- Create: `src/app/(contributor)/requests/PublishButton.tsx`
- Modify: `src/app/(contributor)/requests/RequestsClient.tsx`

- [ ] **Step 1: Implement the button**

```tsx
'use client'

import { useState } from 'react'
import { PublishFormat } from '@/types/instagram'

const InstagramIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.9" />
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.9" />
    <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" />
  </svg>
)

export default function PublishButton({
  requestId, hasImage, alreadyPublished,
}: {
  requestId: string
  hasImage: boolean
  alreadyPublished: { format: PublishFormat; permalink: string | null }[]
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<PublishFormat | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(alreadyPublished)

  const publishedFormats = new Set(done.map(d => d.format))
  const permalink = done.find(d => d.permalink)?.permalink ?? null

  async function publish(format: PublishFormat) {
    setBusy(format)
    setError(null)
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, format }),
      })
      const json = await res.json() as { ok?: boolean; permalink?: string | null; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Could not publish.')
      setDone(d => [...d, { format, permalink: json.permalink ?? null }])
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  const btn: React.CSSProperties = {
    flex: 1, minHeight: 'var(--touch)', borderRadius: 'var(--r-sm)',
    fontSize: 'var(--text-sm)', fontFamily: 'var(--mono)', letterSpacing: '0.04em',
    border: '1px solid var(--line-soft)', background: 'var(--surface)',
    color: 'var(--ink)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  }

  if (!hasImage) {
    return (
      <p style={{
        fontSize: 'var(--text-sm)', color: 'var(--ink-faint)',
        marginTop: 'var(--space-3)', lineHeight: 'var(--leading-normal)',
      }}>
        Instagram posts need an image.
      </p>
    )
  }

  return (
    <div style={{ marginTop: 'var(--space-3)' }}>
      {error && (
        <p role="alert" style={{
          fontSize: 'var(--text-sm)', color: 'var(--red)',
          marginBottom: 'var(--space-2)', lineHeight: 'var(--leading-normal)',
        }}>
          {error}
        </p>
      )}

      {publishedFormats.size > 0 && (
        <p style={{
          fontSize: 'var(--text-sm)', fontFamily: 'var(--mono)',
          color: 'var(--green)', marginBottom: 'var(--space-2)',
        }}>
          Posted to Instagram
          {permalink && (
            <> · <a href={permalink} target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--violet)' }}>View</a></>
          )}
        </p>
      )}

      {!open ? (
        <button style={{ ...btn, width: '100%' }} onClick={() => setOpen(true)}>
          <InstagramIcon /> Publish to Instagram
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            style={{ ...btn, opacity: publishedFormats.has('feed') ? 0.4 : 1 }}
            disabled={busy !== null || publishedFormats.has('feed')}
            onClick={() => publish('feed')}
          >
            {busy === 'feed' ? 'Posting…' : 'Feed post'}
          </button>
          <button
            style={{ ...btn, opacity: publishedFormats.has('story') ? 0.4 : 1 }}
            disabled={busy !== null || publishedFormats.has('story')}
            onClick={() => publish('story')}
          >
            {busy === 'story' ? 'Posting…' : 'Story'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Render it on ready cards**

In `src/app/(contributor)/requests/RequestsClient.tsx`, add the import:

```tsx
import PublishButton from './PublishButton'
```

Then inside `RequestCard`, immediately after the existing `{isReady && <CaptionShare requestId={request.id} />}` line, add:

```tsx
{isReady && (
  <PublishButton
    requestId={request.id}
    hasImage={Boolean(request.photo_url)}
    alreadyPublished={[]}
  />
)}
```

`alreadyPublished` starts empty; Task 13 supplies the real data.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: compiles successfully.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(contributor)/requests/PublishButton.tsx" "src/app/(contributor)/requests/RequestsClient.tsx"
git commit -m "Add Publish to Instagram control on ready posts"
```

---

## Task 13: Show prior publishes

Without this, reloading the page hides the fact that a post already went out and the Creator sees a publish button for something already live.

**Files:**
- Modify: `src/app/(contributor)/requests/page.tsx`
- Modify: `src/app/(contributor)/requests/RequestsClient.tsx`

- [ ] **Step 1: Load attempts in the server page**

In `src/app/(contributor)/requests/page.tsx`, after `const requests = await getContributorRequests(supabase, user.id)`, add:

```tsx
const { data: attempts } = await supabase
  .from('publish_attempts')
  .select('request_id, format, permalink')
  .eq('status', 'published')

const publishedByRequest: Record<string, { format: 'feed' | 'story'; permalink: string | null }[]> = {}
for (const a of attempts ?? []) {
  ;(publishedByRequest[a.request_id] ??= []).push({ format: a.format, permalink: a.permalink })
}
```

Then pass it down:

```tsx
<RequestsClient requests={requests} publishedByRequest={publishedByRequest} />
```

The `members read brand attempts` policy from Task 2 scopes this to the Creator's own brands.

- [ ] **Step 2: Thread it through the client**

In `RequestsClient.tsx`, change the component signature to:

```tsx
export default function RequestsClient({
  requests, publishedByRequest = {},
}: {
  requests: CreativeRequest[]
  publishedByRequest?: Record<string, { format: 'feed' | 'story'; permalink: string | null }[]>
}) {
```

Pass it to each card:

```tsx
shown.map(r => (
  <RequestCard key={r.id} request={r} published={publishedByRequest[r.id] ?? []} />
))
```

Update `RequestCard`'s signature and its `PublishButton` usage:

```tsx
function RequestCard({
  request, published = [],
}: {
  request: CreativeRequest
  published?: { format: 'feed' | 'story'; permalink: string | null }[]
}) {
```

```tsx
{isReady && (
  <PublishButton
    requestId={request.id}
    hasImage={Boolean(request.photo_url)}
    alreadyPublished={published}
  />
)}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: compiles successfully.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(contributor)/requests/page.tsx" "src/app/(contributor)/requests/RequestsClient.tsx"
git commit -m "Show already-published state on ready posts"
```

---

## Task 14: End-to-end verification

**Files:** none — this is manual verification against real Instagram.

- [ ] **Step 1: Prepare the Meta app**

In the Meta app dashboard: keep the app in **Development** mode, add the Instagram Business account under Roles → **Instagram Testers**, and accept the invitation from that Instagram account's settings.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Deploy**

```bash
git push origin main
vercel --prod
```

- [ ] **Step 4: Connect the account**

Visit `/studio/<brandId>/instagram`, click Connect Instagram, complete Facebook OAuth. Expected: redirected back showing `@username` and a renewal date.

- [ ] **Step 5: Publish a feed post**

As a Creator on a brand with an approved post that has an image, open Work → Ready, tap Publish to Instagram → Feed post. Expected: "Posted to Instagram · View", and the post is live on the account.

- [ ] **Step 6: Publish a story**

On the same post, tap Publish to Instagram → Story. Expected: succeeds independently; the Feed option is now disabled while Story completes.

- [ ] **Step 7: Verify idempotency**

Reload the page and try to publish the same format again. Expected: the option is disabled. If you force the call with `curl`, expect HTTP 409 and no second post on Instagram.

- [ ] **Step 8: Record real error codes**

In the Supabase SQL editor:

```sql
SELECT error_code, error_message, count(*)
FROM publish_attempts
WHERE status = 'failed'
GROUP BY 1, 2;
```

Add any `2207xxx` codes encountered to the mapping table in the spec's error-handling section.

- [ ] **Step 9: Commit any error mapping updates**

```bash
git add docs/superpowers/specs/2026-08-14-instagram-publishing-design.md
git commit -m "Record observed Instagram error codes"
```

---

## Self-review notes

**Spec coverage:** account connection (Task 9, 11), feed publish (6, 8), story publish (6, 8), token refresh (7, 10), error handling (4, 8), idempotency (2, 8), authorization (8), Creator UI (12, 13), Director UI (11), testing (4–7 unit, 14 manual). No spec section is unimplemented.

**Caption source — corrected during review.** The first draft of this plan queried `review_decisions` by `request_id`, which is not a column on that table; it would have failed at runtime. `review_decisions` is keyed by `draft_id`, so `loadCaption` resolves the latest `request_drafts` row first, then its decision, then falls back to `recommended_caption` when the director approved without editing. This mirrors `src/app/api/draft-caption/route.ts` exactly, and Task 8 Step 2 diffs the two to prove it.

**Deliberately not built:** carousel, Reels, scheduling, the per-brand publish toggle. All are recorded as non-goals in the spec.
