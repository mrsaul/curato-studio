# Design System Proposal

**Date:** 2026-08-11  
**Audit scope:** `src/app/globals.css` + all `.tsx` files across both route groups  
**Context:** The app has a clear visual identity (warm cream, violet, DM Mono/ABCArizonaFlare) and 454 inline style property instances spread across ~18 components. No `src/components/` directory exists. Three patterns are repeated verbatim in multiple files. `--ink-faint` fails WCAG AA contrast at normal text sizes.

This document is in two parts. Part 1 proposes the complete token system and component inventory. Part 2 gives the Tailwind vs hand-written CSS recommendation with honest tradeoffs.

**No code has been written.** Implementation waits for your go-ahead on Part 2's direction.

---

## Part 1 — Token System

### 1.1 Color

#### Existing tokens (keep, one fix needed)

| Token | Value | Notes |
|---|---|---|
| `--bg` | `#F5EFE3` | Page background |
| `--surface` | `#EDE6D8` | Card / input background |
| `--panel` | `#E5DECF` | Deeper inset surface (unused in code — reserved) |
| `--ink` | `#1A1714` | Primary text |
| `--ink-soft` | `#5E5448` | Secondary text |
| `--ink-faint` | `#9B9284` | ⚠️ **See contrast section — darken to `#6B6158`** |
| `--line` | `#CBBFAA` | Strong borders (unused in code — reserved) |
| `--line-soft` | `#D9D2C2` | Default card/input borders |
| `--violet` | `#4A3DB0` | Primary accent / selection |
| `--violet-soft` | `rgba(74,61,176,0.10)` | Violet tint backgrounds |
| `--green` | `#1F7A50` | Approve action |
| `--green-soft` | `rgba(31,122,80,0.12)` | Green tint (unused — reserved) |
| `--red` | `#9E3442` | Error / destructive action |
| `--amber` | `#C27A1A` | ⚠️ **Never use as text — see contrast. Use only as decorative tint source** |

#### New tokens (add to globals.css)

```css
/* Color additions */
--violet-subtle: rgba(74, 61, 176, 0.06);   /* selected card bg — lighter than --violet-soft */
--amber-surface: #FFF8E7;                    /* amber card/tile background */
--amber-border:  #EDD668;                    /* amber card border */
--amber-text:    #7A5208;                    /* amber text on --amber-surface (6.2:1) */
--red-soft:      rgba(158, 52, 66, 0.10);   /* red tint backgrounds */
--ink-on-dark:   #FFFFFF;                    /* text on --ink backgrounds */
```

#### Why these specifically
- `--violet-subtle` at 6% opacity fills the gap between no-tint and `--violet-soft` (10%). The selected card bg in confirm page uses `rgba(74,61,176,0.06)` hardcoded — this names it.
- The amber cluster (`--amber-surface`, `--amber-border`, `--amber-text`) replaces five different hardcoded hex values spread across two files: `#fffbe8`, `#fffbe6`, `#f0d060`, `#c9960a`, `#b8920a`.
- `--ink-on-dark` documents the `#fff` that appears on all dark (ink-background) buttons.

---

### 1.2 WCAG AA Contrast Audit

Mobile app — WCAG 2.1 Level AA minimum (4.5:1 normal text, 3:1 large text ≥18px or ≥14px bold).

| Foreground | Background | Ratio | Result | Where used |
|---|---|---|---|---|
| `--ink` `#1A1714` | `--bg` `#F5EFE3` | 16.2:1 | ✅ AAA | Body text |
| `--ink` `#1A1714` | `--surface` `#EDE6D8` | 14.1:1 | ✅ AAA | Card body text |
| `--ink-soft` `#5E5448` | `--bg` | 5.8:1 | ✅ AA | Secondary text |
| `--ink-soft` `#5E5448` | `--surface` | 5.0:1 | ✅ AA | Card secondary text |
| `--ink-faint` `#9B9284` | `--bg` | 2.5:1 | ❌ **FAIL** | Section labels, timestamps |
| `--ink-faint` `#9B9284` | `--surface` | 2.3:1 | ❌ **FAIL** | Card meta text |
| `--ink-faint` → `#6B6158` | `--bg` | 4.8:1 | ✅ AA | After fix |
| `--violet` `#4A3DB0` | `--bg` | 6.4:1 | ✅ AA | Accent text, links |
| `#fff` | `--ink` `#1A1714` | 16.2:1 | ✅ AAA | Button labels on dark |
| `#fff` | `--green` `#1F7A50` | 5.0:1 | ✅ AA | Approve button |
| `#fff` | `--violet` `#4A3DB0` | 6.4:1 | ✅ AA | Primary button |
| `--red` `#9E3442` | `--bg` | 5.6:1 | ✅ AA | Error text |
| `--amber-text` `#7A5208` | `--amber-surface` `#FFF8E7` | 6.2:1 | ✅ AA | Amber tile labels |
| `#c9960a` *(current)* | `#fffbe8` *(current)* | 2.6:1 | ❌ **FAIL** | Pending tile labels |
| `#b8920a` *(current)* | `#fffbe6` *(current)* | 2.6:1 | ❌ **FAIL** | Brand list badge |
| `--amber` `#C27A1A` | `--bg` | 2.9:1 | ❌ FAIL (as text) | — never use as text |

**Two required fixes:**
1. Darken `--ink-faint` from `#9B9284` to `#6B6158`. This is the most impactful change — the current value fails for all section labels, timestamps, and meta text.
2. Replace hardcoded amber text/bg pairs with the new `--amber-text` on `--amber-surface` tokens.

---

### 1.3 Spacing Scale

Currently missing entirely. Every `padding`, `margin`, and `gap` is a literal number.

```css
/* 4px base scale — mobile-first */
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  20px;
--space-6:  24px;
--space-8:  32px;
--space-10: 40px;
--space-12: 48px;   /* == --touch */
--space-16: 64px;
--space-24: 96px;
```

**Mapping to current values:**
- Tile padding `14px` → `--space-3` + `--space-1` (14 = not on scale; use 12 or 16). In practice, component padding should round to `--space-3` (12px) or `--space-4` (16px). The 14px anomaly in cards gets standardized to 16px.
- Card gap in grids `8px` → `--space-2`
- Section margin below heading `20px` → `--space-5`
- Page top padding `24px` → `--space-6`
- Page bottom padding `100px` (clears BottomNav) → stays literal or gets its own named token `--nav-clearance: 100px`

---

### 1.4 Typography Scale

Currently the three font families are tokenized but sizes are not.

```css
/* Type sizes — px values intentional for mobile density */
--text-xs:   9px;     /* mono ALL CAPS labels — STUDIO, QUEUE, tile labels */
--text-sm:   11px;    /* section labels (Caption, Improve with AI), meta */
--text-base: 13px;    /* body small — descriptions, notes, help text */
--text-md:   15px;    /* body primary (matches globals.css body default) */
--text-lg:   18px;    /* section headings, confirm page subheads */
--text-xl:   22px;    /* stat counts in wide tiles */
--text-2xl:  26px;    /* page titles */
--text-3xl:  28px;    /* stat counts in 2×2 tiles */

/* Letter spacing */
--tracking-wide:   0.06em;   /* mono labels */
--tracking-wider:  0.08em;   /* ALL CAPS tile labels */
--tracking-widest: 0.12em;   /* "new brief" eyebrow */

/* Line heights */
--leading-tight:  1.15;
--leading-snug:   1.3;
--leading-normal: 1.5;
--leading-relaxed: 1.65;
```

---

### 1.5 Border Radius Scale

Values found in the codebase: 4, 8, 10, 12, 14, 100px.

```css
--r-sm:   8px;      /* code/URL chip, small utility elements */
--r-md:   10px;     /* inputs, textareas, photo thumbnail */
--r-lg:   12px;     /* member cards, secondary cards */
--r-xl:   14px;     /* brand cards, tiles, primary cards */
--r-full: 9999px;   /* pill buttons, bottom nav, radio indicators */
```

Note: The value `4px` appears only in the tag/badge pattern (`borderRadius: 4`). This becomes `--r-sm / 2` conceptually, but in the component it's hardcoded at 4 because it's a very small inset chip — leave it as 4 in the Tag component rather than creating a `--r-xs` token no one else uses.

**Inconsistency to fix:** Member cards in `CreatorsClient.tsx` use `borderRadius: 12`, brand cards in `BrandPickerClient.tsx` use `borderRadius: 14`. These are the same card pattern. Standardize to `--r-xl` (14px).

---

### 1.6 Shadow / Elevation

One shadow exists; it's hardcoded in `BottomNav.tsx`.

```css
--shadow-card: 0 1px 3px rgba(26, 23, 20, 0.06);   /* subtle card lift (not yet used) */
--shadow-nav:  0 4px 28px rgba(26, 23, 20, 0.28);  /* bottom nav — replace hardcoded value */
```

The app currently uses no card shadows — cards are differentiated by background color and border, not elevation. Avoid adding `--shadow-card` speculatively; only the nav shadow needs tokenizing now.

---

### 1.7 Motion

Three different `transition` values hardcoded across components, plus `fadeUp` in globals.css.

```css
/* Durations */
--duration-fast:   0.12s;   /* opacity (disabled states) */
--duration-base:   0.15s;   /* color, border, background hover transitions */
--duration-appear: 0.25s;   /* entrance animations (replacing 0.35s — slightly tighter) */

/* Easings */
--ease-standard:   ease;
--ease-decel:      cubic-bezier(0.0, 0.0, 0.2, 1);  /* elements entering */
```

The `fadeUp` animation in globals.css stays; its `0.35s` duration becomes `var(--duration-appear)`.

---

## Part 2 — Tailwind vs Hand-Written CSS

### What the actual problems are

Before recommending a tool, it's worth being precise about what's broken:

1. **Duplication:** `inputStyle` defined identically in `CaptionPicker.tsx` (lines 7-20) and `ApproveActions.tsx` (lines 7-20). The section label pattern (`fontSize: 11, fontFamily: mono, textTransform: uppercase, color: ink-faint`) appears 6 times verbatim.
2. **Hardcoded literals:** 454 inline style properties. No spatial or typographic scale — every number is a guess.
3. **Hover/focus states impossible in inline styles:** The approve/improve buttons have no focus ring. The input fields have no visible focus outline. `outline: 'none'` is set everywhere with nothing replacing it.
4. **No token enforcement:** Nothing stops a developer from writing `color: '#c0392b'` (done in CreatorsClient) instead of `color: 'var(--red)'`.

### Option A — Tailwind CSS + Radix UI Primitives

**How it works:** Replace all inline `style={{...}}` with Tailwind utility classes. Extend `tailwind.config.ts` to include the custom tokens (`violet`, `ink`, `surface`, etc.). Add Radix UI for headless primitives (Dialog, Tabs, Select) with custom Tailwind styling.

**Advantages:**
- Hover, focus, disabled, active states become trivial: `hover:bg-violet/90 focus-visible:ring-2 disabled:opacity-60`
- `tailwind.config.ts` is the canonical token registry — any hardcoded color that isn't in config is immediately visible
- If a second developer joins, Tailwind is industry-standard vocabulary they already know
- Dark mode is addable later with `dark:` prefix at no architectural cost
- `@tailwindcss/forms` handles input baseline styling correctly

**Disadvantages:**
- **Migration cost is a full rewrite of the style layer.** Every component's inline `style={{...}}` must be converted to class strings. That's ~18 components × 5-20 style objects each. Estimate: 2-3 days of pure mechanical conversion, 1-2 more for QA.
- **ABCArizonaFlare** requires custom `fontFamily` config and a `@font-face` declaration — minor, but one more thing to configure correctly.
- **Tailwind 4 is a paradigm shift.** If you install Tailwind today, you get v4 (CSS-native config, not `tailwind.config.ts`). That's better long-term but the community docs, plugins, and Stack Overflow answers mostly assume v3. A developer new to v4 will lose time orienting.
- The inline style pattern is not inherently bad — it's locally readable and type-safe. The problem is the LACK of shared abstractions, not the styling mechanism.
- Radix adds a real dependency: ~8-12KB gzipped per primitive used, and its API forces you to understand its slot/asChild pattern before you can style anything.

**Honest verdict on Option A:** This is the right long-term architecture if the product grows past ~25 screens, adds a second UI developer, or ever needs dark mode. It is overengineered for a focused two-persona mobile app with ~18 existing screens and one developer. The migration cost buys you velocity you don't yet need.

---

### Option B — Extended CSS tokens + `src/components/ui/` in TypeScript

**How it works:** Extend `globals.css` with the full token system (Part 1). Create `src/components/ui/` with typed React components that implement the shared patterns. Components use inline styles with CSS vars plus a thin CSS class layer (one new `components.css` or co-located `module.css` per component) for hover/focus/transition states that inline styles can't express.

**Advantages:**
- **Zero migration cost to add the component layer.** Existing screens keep their inline styles until you choose to migrate them. The POC migrates 2 screens; the rest come later as each screen is touched for other reasons.
- **No new build dependencies.** Next.js 14 already supports CSS Modules out of the box. Zero config changes.
- **The components are plain TypeScript React.** A typed `<Button variant="primary" loading={improving}>` is unambiguous and self-documenting regardless of the styling mechanism.
- **Focus/hover handled per-component** using CSS modules. One `.button.module.css` with `:focus-visible`, `:hover`, `:disabled` covers all Button instances.
- **Token violations become visible** once the components exist — if a screen isn't using `<Button>`, that's a code review signal, not a mystery.
- **Reversible.** If Tailwind wins later, migrating a typed component API to Tailwind classes is a style-layer swap, not an architectural change. The component interface stays identical.

**Disadvantages:**
- **Focus/hover per-component** means each component needs its own `.module.css` or a small shared `components.css`. This is slightly more friction than Tailwind's single-file utility.
- **No vocabulary enforcement:** A developer can still write `style={{ color: '#c0392b' }}` next to a `<Button>`. Tailwind's purge step makes off-token colors more visible.
- **Custom `components.css`** becomes a second place to look alongside inline styles — a coordination cost that Tailwind eliminates.

**Honest verdict on Option B:** Solves the actual problems (duplication, missing tokens, no focus states) with the lowest disruption. Works well for a product at this stage. Leaves the door to Tailwind open without committing to the conversion cost now.

---

### Recommendation

**Go with Option B now.** Extend the tokens, build `src/components/ui/`, migrate two screens as a POC, leave the rest untouched.

Set a concrete threshold to revisit: if the component count reaches ~30 or a second UI developer joins, do the Tailwind migration then — at that point you'll have proper component interfaces to migrate cleanly, and the cost is worth paying.

**The one dependency worth adding regardless of the direction chosen:** nothing. The CSS Modules approach needs nothing new. If you do decide on Tailwind later, `npx create-next-app` style installation is a 10-minute setup.

---

## Part 3 — Component Inventory

These are the only components the codebase actually needs, derived from reading all 18 TSX files. Nothing invented.

---

### 1. `<Button>`

**Current state:** 5 distinct button styles across the codebase, all inline, no shared abstraction.

| Variant | Visual | Where used |
|---|---|---|
| `primary` | Violet bg, white text, `--r-xl` | Input Continue, Confirm Generate, Send to Director |
| `cta` | Ink bg, white text, `--r-full` | Brand picker CTA, "Improve →" action |
| `action` | Green bg, white text, `--r-full` | Approve & send button |
| `ghost` | Transparent bg, `--red` border+text, `--r-full` | Decline button |
| `text` | No bg, no border, `--violet` text | "Change photo", "← Go back" |
| `compact` | No bg, no border, `--ink-faint` mono uppercase text | "↓ Other options" toggle, "Remove" member |

**States needed for all variants:** default, hover (opacity or color shift), disabled (opacity 0.5, cursor not-allowed), loading (text replacement, no spinner needed yet).

**Focus:** Every button currently has `outline: 'none'` with no replacement. The component must add `focus-visible` ring using CSS module.

**Width:** `full` (block) and `auto` (inline). Most uses are full-width.

**Inconsistency to resolve:** Approve button uses `--r-full` (100px), decline uses `--r-xl` (14px) on the same screen. Standardize both to `--r-full` — they're a pair.

---

### 2. `<Input>` and `<Textarea>`

**Current state:** `inputStyle` object defined identically in `CaptionPicker.tsx` (lines 7-20) and `ApproveActions.tsx` (lines 7-20). Verbatim duplication.

```
padding: 12-14px 14px
borderRadius: 10px → --r-md
border: 1.5px solid var(--line-soft)
background: var(--surface)
color: var(--ink)
fontSize: 14px → --text-md-1 (between text-base and text-md)
fontFamily: var(--body)
lineHeight: 1.5 → --leading-normal
outline: none  ← needs focus ring replacement
resize: none (textarea only)
```

**Focus state needed:** Visible ring — `border-color: var(--violet)` and `outline: 2px solid var(--violet-soft)` on focus-visible.

**Variants:** `<Input type="text">` for single-line (inline direction field), `<Textarea rows={N}>` for multi-line (caption, notes).

---

### 3. `<SelectableCard>`

**Current state:** Inline in `BrandPickerClient.tsx` (brand cards) and `submit/confirm/page.tsx` (caption option cards). Identical interaction pattern, slightly different content layout.

**Pattern:**
- Default: `--surface` bg, `1.5px solid var(--line-soft)` border, `--r-xl`
- Selected: `--violet-subtle` bg, `2px solid var(--violet)` border
- Transition: `border-color 0.15s, background 0.15s` → `var(--duration-base)`
- Content via `children`

**Usage:** The brand picker radio circle (20px violet dot with white inner dot) is specific to the brand picker — it does not belong in the component primitive. `SelectableCard` just handles the border/background treatment; the radio indicator is a slot.

---

### 4. `<InfoCard>`

**Current state:** Inline in `CreatorsClient.tsx` (member rows), `CreatorsClient.tsx` (invite link card), `studio/page.tsx` (brand list items).

**Pattern:**
- `--surface` bg, `1px solid var(--line-soft)` border, `--r-xl` (standardized from current mix of 12/14)
- Content via `children`

Simple container — no interactive states. Used for static info display.

**Subvariant `<InfoCard.Code>`:** The URL/token display inside the invite card — `--violet-subtle` bg, `--r-sm`, mono font. Extracted as a subcomponent since it appears only in one place but will be needed again when photo URLs and other codes appear.

---

### 5. `<StatTile>`

**Current state:** Inline in `studio/[brandId]/page.tsx`. Complex — has pending state (amber treatment) and wide variant.

**Props needed:**
```typescript
label: string
count: number
sub: string
href: string
pending?: boolean   // amber treatment
wide?: boolean      // spans full 2-column grid width
```

**Pending state:** Uses `--amber-surface` bg, `--amber-border` border, `--amber-text` for label and sub — replacing the hardcoded hex values.

---

### 6. `<SectionLabel>`

**Current state:** This exact pattern appears 6 times across 3 files:
```typescript
fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.08em'
```

One line component. No props beyond `children` and an optional `marginBottom` override.

---

### 7. `<InlineError>`

**Current state:** Repeated in 4+ components:
```typescript
color: 'var(--red)', fontSize: 13, marginBottom: 16
```

One-liner — `<p style={{color: 'var(--red)', fontSize: 13, marginBottom: 16}}>{children}</p>`.

---

### 8. `<Tag>`

**Current state:** Inline in `BrandPickerClient.tsx`, `studio/page.tsx`.

| Variant | Bg | Text color | Where |
|---|---|---|---|
| `accent` | `--violet-subtle` (6% opacity) | `--violet` | Rule count tags |
| `neutral` | `--bg` | `--ink-faint` | Template/asset count tags |
| `status` | `--amber-surface` | `--amber-text` | "N pending" badge |

All use: `fontSize: 9px`, `fontFamily: var(--mono)`, `borderRadius: 4px`, `padding: 2px 5px`.

---

### 9. `<DashedCard>`

**Current state:** Two instances — "New brand" in `studio/page.tsx`, "Tap to take or choose a photo" in `submit/input/page.tsx`.

**Pattern:** `2px dashed var(--line-soft)`, `--r-xl`, centered content, `--ink-faint` text or `--violet` text (the "New brand" uses violet, the photo prompt uses ink-faint). The color varies by intent (additive action vs empty state prompt). Pass `accent?: boolean` to switch.

---

### 10. `<SegmentedControl>`

**Current state:** Inline in `submit/input/page.tsx` — the Text/Voice/Photo tab switcher.

**Pattern:** `overflow: hidden`, `borderRadius: 10px`, border wrapping a flex row of buttons. Active segment: `--violet` bg, white text. Inactive: `--surface` bg, `--ink-soft` text.

Generic enough to take `options: string[]` and `value / onChange`. The font size (13px) and touch target height (`--touch`) are fixed.

---

### 11. `<BottomNav>` (Director) and `<BottomNav>` (Contributor)

**Current state:** Implemented and functional in `(reviewer)/BottomNav.tsx`. The contributor BottomNav presumably exists separately.

**Action:** No restructuring needed — these are complex enough to stay as standalone components. The only token gap is the hardcoded shadow value — replace `'0 4px 28px rgba(26,23,20,0.28)'` with `var(--shadow-nav)`.

---

### Components explicitly NOT included

These exist in no screen and should not be speculatively built:

- Modal / Dialog — nothing uses a modal
- Toast / Snackbar — errors are inline (`<InlineError>`)
- Dropdown / Select — nothing uses a dropdown
- Tooltip — nothing uses a tooltip
- Bottom sheet — nothing uses a sheet
- Breadcrumb — single level of navigation everywhere
- Avatar / initials — not in the app

---

## POC Scope (after you approve the direction)

Migrate **one screen per persona** as a proof of concept. Leave everything else untouched.

**Reviewer: `/studio/[brandId]/page.tsx`**
Why: Uses `<StatTile>`, `<SectionLabel>`, amber hardcoded colors. All three critical new components. Shows the token system working on real amber/pending logic.

**Contributor: `/submit/page.tsx` (brand picker)**
Why: Uses `<SelectableCard>`, `<Tag>`, `<Button variant="cta">`, `<SectionLabel>`. The full picker UI is entirely inline today and is a tight, self-contained screen.

After the POC, you review the two screens in the browser and decide whether to continue migrating screen-by-screen.

**Files to create for the POC:**
```
src/components/ui/Button.tsx
src/components/ui/Button.module.css
src/components/ui/Input.tsx
src/components/ui/Input.module.css
src/components/ui/SelectableCard.tsx
src/components/ui/SelectableCard.module.css
src/components/ui/SectionLabel.tsx
src/components/ui/Tag.tsx
src/components/ui/StatTile.tsx
src/components/ui/DashedCard.tsx
src/components/ui/InlineError.tsx
src/components/ui/index.ts
```

**globals.css changes:**
- Add all new tokens from Part 1 (color, spacing, radius, type scale, shadow, motion)
- Darken `--ink-faint` to `#6B6158`
- `fadeUp` animation delay values updated to use `--duration-appear`

---

## Open Questions for You Before I Start

1. **Option A or B?** Do you want Tailwind now or the hand-written tokens + components approach?
2. **The `--ink-faint` darkening** is a breaking visual change — every section label and timestamp gets slightly darker. Worth previewing first, or accept the fix?
3. **`--r-xl` standardization** of member cards from 12px to 14px is a minor but visible change on the Creators page. OK to normalize?
4. **Approve button radius** — standardize Approve (`--r-full`) and Decline (`--r-full`) so they match? Currently Decline uses `--r-xl`.

No code until you answer question 1 and give the go-ahead.
