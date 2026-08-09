# Reviewer Select → Edit → Approve Flow

**Goal:** Replace the current single-page review form with a two-page flow where the Art Director explicitly picks one of the three AI-generated caption options, then edits or AI-improves it before approving.

**Architecture:** Two-page flow under the existing `/queue/[id]` route. Page 1 (`/queue/[id]`) becomes a selection screen. Page 2 (`/queue/[id]/approve`) is a focused editing canvas. A new API endpoint handles AI caption improvement without touching the DB until the director hits Approve.

**Tech Stack:** Next.js 14 App Router, React client components, Supabase, Anthropic Claude API (existing `callClaude` pattern from `/api/draft`)

---

## Page 1 — `/queue/[id]` (updated)

### What changes
- Caption option cards become **interactive**: tapping/clicking one highlights it (violet border + checkmark icon).
- A "Use this →" sticky CTA button appears at the bottom once an option is selected. It navigates to `/queue/[id]/approve?option=<index>` where index is 0, 1, or 2.
- `ReviewActions` component is **removed** from this page. Approve/Decline/Request Changes buttons no longer live here.
- Everything else (original input, interpretation, CTA, hashtags, visual brief, flags) is unchanged.

### Selection state
Client component `CaptionPicker` wraps the options list. State: `selectedIndex: number | null`. Renders options with `onClick` that sets `selectedIndex`. Navigates to approve page on CTA click.

---

## Page 2 — `/queue/[id]/approve` (new)

### Route
`src/app/(reviewer)/queue/[id]/approve/page.tsx` — server component. Reads `option` from `searchParams` (0/1/2), loads the request and draft from Supabase, validates the reviewer owns it, passes selected caption text to `ApproveActions`.

### `ApproveActions` client component
`src/app/(reviewer)/queue/[id]/approve/ApproveActions.tsx`

State:
- `caption: string` — initialised from the selected option, updated by manual edits or AI improve results
- `direction: string` — the improvement direction text input
- `notes: string` — optional note for contributor
- `improving: boolean` — loading state for AI improve
- `submitting: boolean` — loading state for approve/decline

UI sections (top to bottom):
1. **Selected caption** — `<textarea>` bound to `caption`. Editable directly.
2. **Improve with AI** — text input for `direction` + dark pill "Improve with AI" button. On click: `POST /api/improve-caption` with `{ request_id, current_caption: caption, direction }`. Response `improved_caption` replaces `caption` state. The direction field clears after a successful call.
3. **Notes** — optional `<textarea>` for `notes`.
4. **Approve** — green pill button. `POST /api/review` with `{ request_id, decision: 'approved', edited_caption: caption, notes }`. On success: `router.push('/queue')`.
5. **Decline** — secondary red-outline button. `POST /api/review` with `{ request_id, decision: 'declined', notes }`. On success: `router.push('/queue')`.

Error state displayed inline above the action buttons.

---

## New API — `/api/improve-caption` (POST)

`src/app/api/improve-caption/route.ts`

**Auth:** Requires authenticated reviewer (`createServerSupabaseClient` + `auth.getUser()`).

**Input:**
```ts
{ request_id: string; current_caption: string; direction: string }
```

**Logic:**
1. Load `creative_request` — verify `reviewer_id === user.id` and `status === 'awaiting_review'`.
2. Load brand context from `context_id` (same pattern as `/api/draft`).
3. Call Claude with:
   - The original brief (transcript / raw_text / intent_summary)
   - Brand voice system prompt
   - The current caption
   - The director's direction instruction
4. Parse response → return `{ improved_caption: string }`.

**No DB write.** The improved caption only reaches the DB when the director hits Approve (via existing `/api/review`).

**Error cases:**
- 401 if not authenticated
- 404 if request not found or reviewer mismatch
- 400 if `direction` is empty
- 500 on Claude failure

---

## No DB schema changes

All required columns already exist:
- `request_drafts.caption_options` — array of `{style, text}` (index 0/1/2)
- `review_decisions.edited_caption` — stores final caption after approve

---

## Files to create / modify

| Action | Path |
|---|---|
| Modify | `src/app/(reviewer)/queue/[id]/page.tsx` |
| Create | `src/app/(reviewer)/queue/[id]/CaptionPicker.tsx` |
| Create | `src/app/(reviewer)/queue/[id]/approve/page.tsx` |
| Create | `src/app/(reviewer)/queue/[id]/approve/ApproveActions.tsx` |
| Create | `src/app/api/improve-caption/route.ts` |
| Delete (effectively) | `src/app/(reviewer)/queue/[id]/ReviewActions.tsx` — no longer used |

---

## Edge cases

- **Option index out of range:** If `?option` is missing or > number of options, default to index 0 (recommended caption).
- **No caption_options:** If draft has no options (legacy drafts), fall back to `draft.recommended_caption`.
- **Director edits then improves:** AI improve always works on the current textarea content, not the original — so manual edits are preserved as the base for improvement.
- **Multiple improve calls:** Each call replaces the textarea. No history or undo — keep it simple.
- **Status check on approve page:** If request is no longer `awaiting_review` (race condition), `/api/review` returns 400; show inline error.
