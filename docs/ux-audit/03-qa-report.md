# Phase 3–5 Accessibility & Consistency QA Report

**Date:** 2026-08-12  
**Scope:** Both personas — Creator (contributor) and Art Director (reviewer)  
**Standard:** WCAG 2.1 AA (4.5:1 normal text, 3:1 large text / UI components, 48px touch targets)  
**Contrast formula:** WCAG relative luminance — L = 0.2126·R_lin + 0.7152·G_lin + 0.0722·B_lin

---

## Summary

| Severity | Count | Status |
|---|---|---|
| SEV-1 Critical | 0 | — |
| SEV-2 High | 5 | All Open |
| SEV-3 Medium | 8 | All Open |
| SEV-4 Low | 4 | All Open |

---

## Color Token Contrast Reference

All values computed against the two primary surface tokens.

| Token | Hex | vs `--bg` (#F5EFE3) | vs `--surface` (#EDE6D8) | Notes |
|---|---|---|---|---|
| `--ink` | #1A1714 | **16.0:1** ✅ | **14.3:1** ✅ | — |
| `--ink-soft` | #5E5448 | **6.6:1** ✅ | **5.9:1** ✅ | — |
| `--ink-faint` | #6B6158 | **5.3:1** ✅ | **4.8:1** ✅ | Borderline on surface at small sizes |
| `--violet` | #4A3DB0 | **7.2:1** ✅ | **6.5:1** ✅ | — |
| `--green` | #1F7A50 | **4.7:1** ✅ | **4.2:1** ⚠️ | Passes on `--bg`; marginal on `--surface` at small sizes |
| `--red` | #9E3442 | **6.1:1** ✅ | **5.5:1** ✅ | — |
| `--amber` | #C27A1A | **3.0:1** ❌ | **2.8:1** ❌ | **FAILS AA for all text sizes** |
| `--amber-text` (#7A5208) on `--amber-surface` (#FFF8E7) | — | **6.5:1** ✅ | — | Correct amber text pattern |
| White on `--green` | — | **5.3:1** ✅ | — | Used in success icons |
| White on `--red` | — | **6.9:1** ✅ | — | — |
| White on `--ink` | — | **16.0:1** ✅ | — | Buttons, BottomNav active |
| `rgba(255,255,255,0.38)` on `--ink` | — | **3.6:1** ❌ | — | BottomNav inactive labels |

---

## Issues

### SEV-2 — High

These are directly accessibility-failing (WCAG AA hard failures) or block keyboard / AT users from core tasks.

---

**H-1 · `--amber` used directly as text color in queue detail page**  
**File:** `src/app/(reviewer)/queue/[id]/page.tsx` · Flags section  
**Contrast:** 3.0:1 vs `--bg` — FAILS 4.5:1 for normal text  
**Sizes affected:** 11px label, 13px body — both below large-text threshold (18pt / 24px)  
**Note:** The design system token comment explicitly says: "decorative tint source only — do not use as text."  
**Fix:** Wrap the flags callout in a `--amber-surface` (#FFF8E7) background and use `--amber-text` (#7A5208) for all text. Verified 6.5:1 ✅  
**Status:** Open

---

**H-2 · `--amber` used directly as text color in contributor requests page**  
**File:** `src/app/(contributor)/requests/page.tsx` · `STATUS_META` color values for `interpreting`, `needs_info`, `draft_ready`, `changes_requested`  
**Contrast:** 3.0:1 vs `--bg`; 2.8:1 vs `--surface` — both FAIL  
**Sizes affected:** 12px badge label, 3px decorative rail (decorative rail is exempt; label text is not)  
**Fix:** Replace `color: 'var(--amber)'` in status badge `<span>` with `color: 'var(--amber-text)'` and add `background: 'var(--amber-surface)'` with padding. The decorative rail can keep `var(--amber)`.  
**Status:** Open

---

**H-3 · Inactive BottomNav tab labels fail contrast (both personas)**  
**Files:** `src/app/(reviewer)/BottomNav.tsx`, `src/app/(contributor)/BottomNav.tsx`  
**Color:** `rgba(255,255,255,0.38)` on `--ink` background  
**Computed contrast:** 3.6:1 — FAILS 4.5:1 for 11px text  
**Fix:** Raise opacity to approximately 0.60 (gives ~5.2:1). Exact hex: `rgba(255,255,255,0.60)`.  
**Status:** Open

---

**H-4 · Login email input has no `<label>` — placeholder only**  
**File:** `src/app/login/page.tsx`  
**Issue:** Screen readers announce the field by its `placeholder` ("Email address"), which disappears when the user starts typing. No programmatically associated label. Users with cognitive disabilities or those relying on auto-fill also lose context.  
**Fix:** Add `<label htmlFor="email">Email address</label>` (visually hidden if desired) and `id="email"` on the `<input>`.  
**Status:** Open

---

**H-5 · Button `.text` and `.compact` variants have no minimum touch target**  
**File:** `src/components/ui/Button.module.css`  
**Issue:** `min-height: auto` means these render at ~20px height. Used for "Create another post" (sent page), "Use a different photo" (input page), "← Try again" (confirm page). WCAG 2.5.5 requires 44×44px minimum (AA) / 48×48px (enhanced).  
**Fix:** Add `min-height: 44px; display: inline-flex; align-items: center;` to `.text` and `.compact` variants. For `.text` links that are inline in sentences, apply `padding-block: 12px` as an alternative to expanding the visible hit area.  
**Status:** Open

---

### SEV-3 — Medium

Degrades keyboard, AT, and motor-accessibility experience but does not fully block task completion.

---

**M-1 · Inline `<button>` elements in CaptionPicker lack `:focus-visible` styles**  
**File:** `src/app/(reviewer)/queue/[id]/CaptionPicker.tsx`  
**Elements:** "↑ Improve" button (line 124), "↓ Other options / ↑ Hide" toggle (line 143), caption option tiles (line 155)  
**Issue:** All use inline `style={{...}}` with no `outline` or focus ring. Keyboard users see only the browser default (inconsistent, may not meet 3:1 contrast).  
**Fix:** Wrap in the `Button` component where semantically appropriate, or add `:focus-visible { outline: 2px solid var(--violet); outline-offset: 2px; }` via a shared `focusStyle` CSS class.  
**Status:** Open

---

**M-2 · Mode-switcher tabs, voice button, and photo button on input page lack focus styles**  
**File:** `src/app/(contributor)/submit/input/page.tsx`  
**Elements:**
- Mode tabs (Write / Voice note / Photo) — inline `style` buttons with `outline: 'none'`
- Voice record button (80×80px circle) — inline `style`, no ARIA, no focus style  
- Photo "Add a photo" button — inline `style`, no focus style  
**Fix:** Remove `outline: 'none'` from all three. Add `.mode-tab:focus-visible { outline: 2px solid var(--violet); outline-offset: 2px; }` or equivalent. Voice button needs `aria-label="Hold to record"` (the visible text is a two-line overlay, not a reliable accessible name at all states).  
**Status:** Open

---

**M-3 · Login submit button uses raw `<button>` with `outline: none`**  
**File:** `src/app/login/page.tsx`  
**Issue:** The submit button has `outline: 'none'` in its inline style. No replacement focus indicator.  
**Fix:** Remove `outline: 'none'`; the browser default or a scoped CSS rule provides the ring. Alternatively, replace with the `Button` component (`variant="cta"`, `fullWidth`).  
**Status:** Open

---

**M-4 · BottomNav `<Link>` tabs have no custom focus-visible style**  
**Files:** `src/app/(reviewer)/BottomNav.tsx`, `src/app/(contributor)/BottomNav.tsx`  
**Issue:** The nav links rely entirely on the browser's default focus ring. The ring may not be visible against the `--ink` background or meet 3:1 contrast.  
**Fix:** Add a CSS class on the links: `.nav-link:focus-visible { outline: 2px solid #fff; outline-offset: 3px; border-radius: 8px; }`.  
**Status:** Open

---

**M-5 · Back navigation elements use ← character with no `aria-label`**  
**Files:** `src/app/(reviewer)/queue/[id]/page.tsx` (← Queue link), `src/app/(contributor)/submit/confirm/page.tsx` (← Edit button)  
**Issue:** Screen readers announce "left-pointing small black arrow Queue" — the arrow character's announcement varies by SR and locale.  
**Fix:** Add `aria-label="Back to Queue"` / `aria-label="Back to edit"` on the respective elements, and use `aria-hidden="true"` on the ← character itself.  
**Status:** Open

---

**M-6 · SVG icons in both BottomNavs missing `aria-hidden`**  
**Files:** `src/app/(reviewer)/BottomNav.tsx`, `src/app/(contributor)/BottomNav.tsx`  
**Issue:** Icon SVGs have no `role` or `aria-hidden="true"`. Some screen readers will announce them as unlabeled graphics alongside the visible tab label.  
**Fix:** Add `aria-hidden="true"` to every icon SVG inside the nav links. The text label provides the accessible name.  
**Status:** Open

---

**M-7 · No `aria-live` region for async loading state changes**  
**Files:** `src/app/(contributor)/submit/input/page.tsx`, `src/app/(contributor)/submit/confirm/page.tsx`, `src/app/join/[token]/JoinClient.tsx`, `src/app/(reviewer)/queue/[id]/CaptionPicker.tsx`  
**Issue:** When buttons transition to "Sending…", "Joining…", "Improving…", the button is `disabled` and its text changes — but disabled elements are often skipped by screen readers and label changes may not be announced.  
**Fix:** Add a visually-hidden `<span aria-live="polite" aria-atomic="true">` that mirrors the loading message, or add `aria-busy="true"` on the button container while loading.  
**Status:** Open

---

**M-8 · Hardcoded pixel sizes bypass the type scale in several files**  
**Files:** Multiple (requests/page.tsx `fontSize: 10`, CaptionPicker.tsx `fontSize: 9`, BottomNav.tsx `fontSize: 11`)  
**Issue:** Inconsistency with the design token type scale (`--text-xs: 9px`, `--text-sm: 11px`, `--text-base: 14px`). Some values fall below the defined minimum, and the inconsistency makes systematic scaling changes hard to apply.  
**Fix:** Replace hardcoded pixel values with the closest token: `fontSize: 10` → `fontSize: 'var(--text-xs)'` (9px, acceptable) or `'var(--text-sm)'` (11px). Audit and standardize across both personas.  
**Status:** Open

---

### SEV-4 — Low

Best-practice improvements; low user impact at current scale.

---

**L-1 · CaptionPicker "Improve" and "Other options" use inline style instead of Button component**  
**File:** `src/app/(reviewer)/queue/[id]/CaptionPicker.tsx`  
**Issue:** Inconsistent focus, hover, and active states vs. the design system Button component.  
**Fix:** Replace the custom "↑ Improve" button with `<Button variant="ghost" size="compact">`, and the toggle with `<Button variant="text">`.  
**Status:** Open

---

**L-2 · `--green` on `--surface` is marginally below AA (4.2:1 vs 4.5:1)**  
**Token:** `--green: #1F7A50` on `--surface: #EDE6D8`  
**Issue:** Intent summary text in `requests/page.tsx` uses `color: 'var(--violet)'` (fine), but if green were ever used at small sizes on surface it would fail. Currently no violation exists, but worth noting for future uses.  
**Fix:** Use green text only on `--bg` (4.7:1 ✅) or raise green slightly (e.g. `#1D6E49` → 4.8:1 on surface).  
**Status:** Advisory only

---

**L-3 · Textarea in CaptionPicker uses `outline: 'none'`**  
**File:** `src/app/(reviewer)/queue/[id]/CaptionPicker.tsx` · `inputStyle` object (line 18)  
**Issue:** `outline: 'none'` removes the browser's default focus indicator on the editable textarea. Tab-navigating users cannot tell if the field is focused.  
**Fix:** Replace with `outline: 'none'` only if a custom `border` change on `:focus-visible` is added (e.g., `border-color: var(--violet)`). Add via a CSS class rather than inline style.  
**Status:** Open

---

**L-4 · Back link in studio inner pages has no focus style**  
**File:** `src/app/(reviewer)/studio/[brandId]/rules/page.tsx` (and likely siblings: assets, mind, templates, creators)  
**Issue:** `<Link style={{ textDecoration: 'none', ... }}>← {ctx.name}</Link>` — browser default focus ring applies, but it's inconsistent with the violet outline used elsewhere.  
**Fix:** Add a shared `backLink` CSS class with `:focus-visible` violet outline, applied to all studio inner-page back links.  
**Status:** Open

---

## Phase 3–5 Consistency Check

Screens redesigned in Phases 3–5:
- `globals.css` — motion tokens, keyframes, utility classes ✅
- `Button`, `SelectableCard`, `InlineError`, `SectionLabel`, `DashedCard` components ✅
- Reviewer: `BottomNav`, `queue`, `queue/[id]`, `studio`, `studio/[brandId]`, history ✅
- Contributor: `BottomNav`, `submit` (home), `input`, `confirm`, `sent` ✅
- Join flow (`join/[token]`) ✅

**Consistency gaps found between touched and untouched screens:**

| Pattern | Touched screens | Untouched screens |
|---|---|---|
| `<label>` for form inputs | ✅ Not applicable (no bare inputs) | ❌ Login email input |
| Button component usage | ✅ All CTAs use component | ❌ Login submit is a raw `<button>` |
| Focus ring style | ✅ `2px solid var(--violet)` | ❌ Inconsistent or missing on login, studio back links |
| Amber used as text | ❌ queue/[id] (touched but not fixed) | ❌ requests/page (untouched) |
| Type scale tokens | ✅ Consistent in new screens | ❌ Hardcoded px in requests/page, BottomNav labels |

---

## Phase 1 Screens Never Addressed

The following screens were identified in the original Phase 1 audit but have received no redesign attention through Phase 5. These represent the backlog for a follow-up pass.

| Screen | Route | Known issues |
|---|---|---|
| Login | `/login` | No `<label>`, `outline: none` on email and submit, raw inline button, no focus ring |
| Studio — assets | `/studio/[brandId]/assets` | Untouched; back link focus state, button consistency unverified |
| Studio — mind | `/studio/[brandId]/mind` | Untouched; same back-link gap |
| Studio — rules | `/studio/[brandId]/rules` | Back link no focus style (confirmed); RulesClient internals unaudited |
| Studio — templates | `/studio/[brandId]/templates` | Untouched; unaudited |
| Studio — creators | `/studio/[brandId]/creators` | Untouched; unaudited |
| Contributor requests | `/requests` | Amber text contrast failure (H-2), hardcoded px, no inline focus states audited |

**Recommendation:** Scope a Phase 6 pass targeting login + studio inner pages as a single sprint. The `/requests` amber fix (H-2) should be pulled into the current sprint given it's the same failure pattern as H-1.

---

## Fixes by Priority

**Do this sprint (same root cause as Phases 3–5 work):**
1. **H-1** — Amber text in queue/[id] Flags section → use `--amber-text` on `--amber-surface`
2. **H-2** — Amber text in requests status badge → same fix pattern
3. **H-3** — Raise BottomNav inactive label opacity to 0.60 (both personas)

**Do next sprint (login + studio pass):**
4. **H-4** — Login email `<label>`
5. **H-5** — Button `.text` variant min touch target
6. **M-1** through **M-4** — Focus states on inline buttons and BottomNav links
7. **M-5, M-6** — ARIA labels on back links and BottomNav icons

**Backlog:**
8. **M-7** — `aria-live` loading states
9. **M-8, L-1, L-3, L-4** — Token consistency and component usage
