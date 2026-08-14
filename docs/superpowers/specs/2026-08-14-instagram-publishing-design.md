# Instagram Publishing — Design

**Date:** 2026-08-14
**Status:** Approved for planning
**Scope:** Publish an approved Curato post to a brand's Instagram account, as a feed post or a story, from inside the app.

---

## Goal

Today a Creator whose post has been approved copies the caption and leaves for Instagram. This closes that gap: from the Creator's **Ready to post** list, one tap publishes the caption and image to the brand's Instagram account.

## Decisions

These were settled during brainstorming and are not open in this spec.

| Decision | Choice | Consequence |
|---|---|---|
| Whose account | Only brands we own/control | Meta app stays in **development mode**; each brand's IG is added as an **Instagram Tester**. **No App Review, no business verification.** |
| Formats | Feed post, Story | Both work against the existing single `photo_url`. No upstream changes. |
| Who publishes | Creator, from Ready to post | Creator acts on the brand's account, so authority is re-checked server-side on every publish. |
| Execution | Synchronous server route | Viable specifically because video is out of scope — image containers are ready effectively immediately. |

## Non-goals

Deliberately excluded. Each is a separate project.

- **Reels / video.** No video exists anywhere in the app; this would mean capture, storage, format validation, and async container polling.
- **Carousel.** Needs `photo_url` to become a collection, multi-capture and reordering in PhotoEditor, and a rework of the single-image vision call in `src/app/api/draft/route.ts`. Its own spec; carousel then becomes a short follow-up to it.
- **Scheduling.** Requires a jobs table, cron, and retry semantics.
- **Per-brand "allow Creators to publish" toggle.** Deferred consciously, not overlooked. Add it when a brand asks.
- **Multiple Instagram accounts per brand.**
- **App Review** for outside clients connecting their own accounts.

## Platform constraints

Verified 2026-08-14 against current Meta documentation and reporting.

- Publishing requires an Instagram **Business or Creator** account with a connected **Facebook Page**. Personal accounts cannot publish via API under any configuration.
- Meta **fetches the media from a public URL**; bytes cannot be uploaded to the endpoint. Supabase Storage already returns public URLs (`src/app/(contributor)/submit/confirm/page.tsx`), so this is satisfied.
- **100 API-published posts per rolling 24 hours** per Instagram account.
- **200 API calls per user per hour** (Business Use Case limit). This was reduced from 5,000 in 2025 without announcement and broke production integrations — treat it as volatile and fail soft.
- Long-lived tokens last approximately **60 days** and must be refreshed.

## Architecture

Four units, each independently testable.

1. **`lib/instagram/client.ts`** — thin Graph API wrapper. Knows HTTP and the pinned API version; knows nothing about Curato.
2. **`lib/instagram/publish.ts`** — builds container payloads per format and runs the container→publish sequence. Pure logic over the client.
3. **`app/api/publish/route.ts`** — authorization, idempotency, persistence, error translation.
4. **`app/api/instagram/callback/route.ts`** + Studio UI — OAuth connect and token storage.

Pin the Graph API version in one exported constant (`GRAPH_VERSION`). Set it to the current stable version at implementation time; Meta deprecates versions on roughly a two-year cycle, so this must be a single point of change.

### Environment

```
META_APP_ID
META_APP_SECRET
META_OAUTH_REDIRECT_URI    # https://<host>/api/instagram/callback
GRAPH_VERSION              # e.g. v23.0 — set to current stable at build time
```

## Data model

```sql
create table instagram_accounts (
  context_id       uuid primary key references contexts(id) on delete cascade,
  ig_user_id       text        not null,
  username         text,
  access_token     text        not null,
  token_expires_at timestamptz not null,
  needs_reconnect  boolean     not null default false,
  connected_by     uuid        references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table instagram_accounts enable row level security;
-- No policies: no client role can read or write. Service role only.

create table publish_attempts (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references creative_requests(id) on delete cascade,
  context_id    uuid not null references contexts(id) on delete cascade,
  published_by  uuid references auth.users(id),
  format        text not null check (format in ('feed','story')),
  status        text not null check (status in ('pending','published','failed')),
  ig_media_id   text,
  permalink     text,
  error_code    text,
  error_message text,
  created_at    timestamptz not null default now()
);

create index publish_attempts_request_idx on publish_attempts (request_id);

-- One successful publish per request per format.
create unique index publish_attempts_one_success
  on publish_attempts (request_id, format)
  where status = 'published';

alter table publish_attempts enable row level security;
create policy "members read own brand attempts" on publish_attempts
  for select using (
    exists (
      select 1 from brand_members m
      where m.context_id = publish_attempts.context_id
        and m.user_id = auth.uid()
    )
  );
```

"Already published" is derived from `publish_attempts`. Nothing is denormalised onto `creative_requests`.

## Connecting an account

Director-only, at `/studio/[brandId]/instagram`.

1. Director clicks **Connect Instagram** → redirect to Facebook OAuth with scopes `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `business_management`. State parameter carries `brandId` and a CSRF nonce.
2. Callback exchanges the code for a short-lived token, then exchanges that for a long-lived token.
3. `GET /me/accounts` lists Pages; for the chosen Page, read `instagram_business_account` to obtain `ig_user_id`.
4. Store the row. Display `@username` and expiry in Studio.

Because the app is in development mode, only accounts holding an **Instagram Tester** role on the Meta app can complete this. That is the intended limit, not a defect.

**Disconnect** deletes the row. Existing `publish_attempts` are retained as history.

## Token refresh

A weekly Vercel cron calls a refresh route. For every account whose `token_expires_at` is within 14 days, exchange for a fresh long-lived token and update the row. On failure, set `needs_reconnect = true` and leave the stale token in place so the failure surfaces as a clear message rather than a silent 190.

## Publishing

`POST /api/publish` with `{ request_id, format }`.

**Authorization sequence** — every step server-side:

1. Resolve the session user; 401 if absent.
2. Load the request; 404 if missing.
3. Confirm the user is in `brand_members` for that request's `context_id`; 403 otherwise. The Creator's session alone never grants publish authority.
4. Confirm the request's status is in the `ready` bucket (`approved` or `delivered`); 409 otherwise.
5. Reject if a `published` attempt already exists for this `(request_id, format)`; the unique index is the backstop against a double tap.
6. Load `instagram_accounts` for the context; 409 with a connect prompt if absent or `needs_reconnect`.

**Feed**

```
POST /{ig_user_id}/media         { image_url, caption }   -> { id: creation_id }
POST /{ig_user_id}/media_publish { creation_id }          -> { id: ig_media_id }
GET  /{ig_media_id}?fields=permalink
```

**Story** — identical, with `media_type=STORIES` and no caption (Instagram ignores captions on stories).

Caption comes from the approved draft, the same text `CaptionShare` currently copies. Image comes from `request.photo_url`. A text-only request has no image; Instagram requires media, so the Publish button is unavailable for those — stated in the UI, not discovered on failure.

Write a `pending` attempt before the first Graph call and update it to `published` or `failed`. An interrupted request therefore leaves a visible `pending` row rather than nothing.

## Error handling

Translate Meta errors into something a non-technical Creator can act on. Always store raw `error_code` and `error_message` on the attempt.

| Condition | Handling | Message |
|---|---|---|
| `190` invalid/expired token | Set `needs_reconnect = true` | "Instagram needs reconnecting — ask your director." |
| `4`, `32`, `613` rate limiting | Attempt marked failed; retry allowed | "Instagram's limit was reached. Try again shortly." |
| `2207xxx` publishing errors (media fetch, unsupported format, aspect ratio) | Map on the code's message where recognised; otherwise pass Meta's own text through | "Instagram couldn't use this image: <reason>" |
| Network/timeout | Attempt left `pending`, retry allowed | "Couldn't reach Instagram. Try again." |
| Container created but publish failed | Attempt failed; container is discarded by Meta | "Instagram didn't accept the post." |

The `2207xxx` family is broad and Meta adds codes without notice. Do not enumerate it exhaustively — recognise the codes encountered in testing, and fall back to surfacing Meta's message rather than a generic failure.

## UI

**Creator — Ready to post** (`RequestsClient`, `CreatorHome`)

- Adds **Publish to Instagram** beside Copy caption / Share.
- Tapping it asks which: **Feed post** or **Story**. Both are always offered when the request has an image, since both accept the same media.
- Publishing to one does not consume the other: a post can go to Feed and Story as two separate attempts.
- No connected account → button disabled with "Instagram isn't connected for this brand yet."
- No image on the request → button disabled with "Instagram posts need an image."
- After success → "Posted to Instagram · View" linking to the stored permalink.

**Director — Studio → brand → Instagram**

- Not connected: explanation plus **Connect Instagram**.
- Connected: `@username`, token expiry, **Disconnect**.
- `needs_reconnect`: a warning with **Reconnect**.

Reuse existing tokens and components throughout: `Button`, `InlineError`, the pastel-fill status pill pattern, and `--alert` for the reconnect warning.

## Security

- `access_token` is never returned by any route and never reaches the browser. RLS denies all client access to `instagram_accounts`; only the service-role client touches it.
- Membership is re-checked on the server for every publish. A Creator cannot publish to a brand they have left, regardless of client state.
- OAuth `state` carries a CSRF nonce, verified in the callback.
- The callback verifies the returned Page actually belongs to the authenticated user before storing.

## Testing

**Unit**
- Container payload builders: feed with caption, story without, correct `media_type`.
- Error translation: each row of the table above maps to the intended user message.
- Token expiry: refresh triggers inside the window, not outside.

**Integration** — mocked Graph API
- Happy path: container → publish → permalink stored, attempt `published`.
- `190` sets `needs_reconnect` and returns the reconnect message.
- Rate limit returns retryable failure and leaves no `published` row.
- Double publish: second call rejected by the idempotency check.
- Non-member publish attempt returns 403.

**Manual**
- One real Instagram Business test account, added as Instagram Tester, publishing a feed post and a story end to end in development mode.

## Open items

- `GRAPH_VERSION` must be set to the current stable version at implementation time rather than assumed from this document.
- Exact `2207xxx` codes to be recorded during manual testing and folded into the mapping table.
