# UX Prior Art Audit

**Date:** 2026-08-11  
**Scope:** All brainstorm sessions (4751, 9766, 4582, 19719), all specs, all plan files, src/app implementation cross-check.  
**Purpose:** Establish what was already decided before proposing any new UX/UI work.

---

## 1. Decisions Already Made — Respect These

These were deliberate choices, surfaced through visual brainstorm with option comparison and explicit selection. They should not be re-opened unless there is a concrete user complaint or metric. If a proposal conflicts with any of these, flag it explicitly.

### 1.1 Visual Language

| Decision | Source |
|---|---|
| Background: warm off-white `#EDEBE5` throughout the app | All mockups; consistent in all 4 brainstorm sessions |
| Text: near-black `#111` on light backgrounds | All mockups |
| Accent / selection / action color: violet `#4A3DB0` | Brand picker selection, rule verb "always", invite link display |
| Verb colors in brand rules: `always`=violet, `never`=red, `prefer`=green, `avoid`=amber | `design-brand-detail.html` + director-atelier spec |
| Amber highlight for pending/attention state: `#fffbe8` bg, `#f0d060` border, `#c9960a` text | Mind tile (pending count > 0), Creators tile (active members) |
| Monospace font for labels, counts, codes, CTAs | All mockups — not decorative, it is the voice of the system |
| Typography scale: large light-weight numbers (22px / font-weight 300) for counts in tiles | `design-brand-detail.html`, `design-nav-brands.html` |
| Pill-shaped primary buttons (border-radius: 100px) | All mockups (Submit/Continue/Start CTAs) |
| Card components: white bg, 12-14px border-radius, subtle border `rgba(0,0,0,0.07)` | All mockups |

### 1.2 Navigation Structure (Director / Art Director)

| Decision | Why chosen | Rejected alternatives |
|---|---|---|
| Studio = brand list first, then tap brand = everything inside | Mirrors how work is actually structured: "today I'm working on Wekoffee" | Hub page (modules independent of brand) — B; Horizontal tab strip inside Studio — B |
| Brand detail = 2×2 summary tiles with counts, each drills into its section | Numbers tell you what needs attention without expanding | Single scrollable brand page — A; Tabs within brand — B |
| 5 tiles total: Rules · Mind · Templates · Assets · Creators (Creators added after brand-creator-connection) | All modules selected; Creators tile added full-width as 5th | No other scope was considered inferior — all 4 modules were confirmed |
| Amber glow on Mind tile when `pendingMindCount > 0` | Ambient attention signal without red-badge urgency | Not in comparison — this was a design decision in the spec |
| Director bottom nav: QUEUE · DONE · ✦ STUDIO | Studio is 3rd item; the ✦ symbol signals it's a power-user space | Not in a multi-option comparison |

### 1.3 Reviewer Approve Flow

| Decision | Why chosen | Rejected alternatives |
|---|---|---|
| Two-page flow: `/queue/[id]` picks caption, `/queue/[id]/approve` edits/approves | Separation of concerns — pick first, then deliberate | Single-page two-stage (Option B); Bottom sheet (Option C — rejected: keyboard issues on mobile) |
| "Improve with AI" = free-text direction input, not preset chips | More expressive; "we're not building a radio button app" | Quick-action chips (Option B — rejected as less expressive) |
| AI improve returns new caption only, no DB write | Intermediate result — user decides whether to keep it | Not a multi-option decision; this was spec-level |
| `ReviewActions.tsx` is dead code post-migration | Replaced by `CaptionPicker.tsx` + `ApproveActions.tsx` | — |

### 1.4 Photo Editor

| Decision | Why chosen | Rejected alternatives |
|---|---|---|
| Canvas API–based editor (not CSS filters, not Fabric.js) | Full control of export; AI sees the EDITED photo | CSS preview — AI sees unfiltered photo (Option B, rejected); Fabric.js — +300KB overhead (Option C, rejected) |
| All 4 tool panels: Crop & rotate, Preset filters, Light adjustments, Text overlay | All selected; multi-select decision | Any subset was possible; all 4 confirmed |
| Export JPEG at 0.85 quality → sessionStorage as base64 | Ephemeral — not persisted until user confirms | Not a multi-option decision |
| `photo_url` column on `creative_requests` + `post-photos` public bucket | Photo attached to request, not separate table | Not a multi-option decision |
| Switch to `claude-haiku-4-5-20251001` for vision interpretation | Cost efficiency for image captioning | Not a multi-option decision |

### 1.5 Brand–Creator Connection

| Decision | Why chosen | Rejected alternatives |
|---|---|---|
| Creator picks brand when submitting (no permanent single-brand link) | Flexible multi-brand workflows, per-request brand selection | AD invites to brand permanently (Option A in `connection-model.html`); Creator joins via code only (Option B) |
| Access mechanism: invite link per brand (AD copies link, shares externally, creator joins via `/join/[token]`) | Controlled access; AD can revoke by regenerating | Creator enters a code (Option B — "less controllable: anyone with code can join") |
| Brand picker is first step of submit flow | Sets AI context early; "feeling like I'm working for Wekoffee today" | Brand tagged at confirm screen (Option B — "brand is an afterthought") |
| 0 brands → empty state; 1 brand → auto-redirect; 2+ brands → picker | Removes decision friction for single-brand creators | Not a multi-option decision |

---

## 2. Implemented Mockups (High Fidelity)

These mockups have been built and are live. Do not re-propose these patterns — design any additions to fit within them.

### Director Atelier — Brand Nav + Studio

**Mockup:** `design-nav-brands.html` (session 4582)  
**Status:** ✅ Implemented — `/studio` and `studio/page.tsx`

Elements matched: bottom nav with QUEUE/DONE/✦STUDIO (Studio on dark pill background), brand cards with name/description, small monospace tags for rule/mind/template/asset counts, amber "N pending" badge on Mind, dashed "New brand" card at bottom.

### Director Atelier — Brand Detail

**Mockup:** `design-brand-detail.html` (session 4582)  
**Status:** ✅ Implemented — `studio/[brandId]/page.tsx`

Elements matched: brand name + description header, 2×2 grid of tiles with large light count numbers and subtitle labels, amber treatment on Mind tile, "Edit brand info" link. Creators tile added as full-width 5th tile (post-connection feature).

### Director Atelier — Mind / Templates / Assets Sections

**Mockup:** `design-mind-templates-assets.html` (session 4582)  
**Status:** ✅ Implemented

Elements matched: Mind = amber pending cards (Confirm/Reject actions); Templates = list with "New template" dashed card at bottom; Assets = 3-column grid with "+" cell as last item.

### Brand–Creator Connection — AD Creators Page

**Mockup:** `full-design.html` AD side (session 19719)  
**Status:** ✅ Implemented — `studio/[brandId]/creators/`

Elements matched: "Creators" header + "People working on this brand" subtitle, member cards (name, "joined N days ago", request count, Remove button in red), invite link card with monospace token display + "Copy link" (dark) + "Regenerate" (ghost) buttons + "Regenerating invalidates the old link" warning.

**One difference from mockup:** The mockup showed the Creators tile as the 4th item in the 2×2 grid (same row as Rules/Mind/Templates). The spec and implementation put it as a 5th full-width tile below the 2×2. This was a deliberate layout decision to preserve the original grid rhythm.

### Brand–Creator Connection — Creator Brand Picker

**Mockup:** `full-design.html` creator side + `submit-flow.html` Option A (session 19719)  
**Status:** ✅ Implemented — `submit/page.tsx` + `BrandPickerClient.tsx`

Elements matched: "Working for" / "Choose the brand this content is for" header, brand cards with radio-style selection (violet 2px border on selected, empty circle on unselected), rule/template/asset count tags, pill CTA "Start with [Brand Name] →".

### Reviewer Approve Flow

**Mockup:** `flow-approaches.html` Option A + `approve-page.html` Option A (session 4751)  
**Status:** ✅ Implemented — `queue/[id]/CaptionPicker.tsx` + `queue/[id]/approve/ApproveActions.tsx`

Elements matched: Two-page separation (pick → approve), free-text direction input for AI improve, editable caption textarea on approve page.

---

## 3. Explored and Abandoned Options

Record of what was considered and why it was rejected. Do not revive these without a new reason.

| Abandoned option | Feature | Why rejected |
|---|---|---|
| Single-page two-stage (caption → inline edit) | Reviewer flow (Option B) | Mixing pick+edit on same screen felt like too much happening at once |
| Bottom sheet for edit/approve | Reviewer flow (Option C) | Keyboard push issues on mobile — bottom sheet + keyboard = layout chaos |
| Preset quick-action chips for AI improvement direction | Reviewer flow (Option B on approve page) | Less expressive than free text; "we're not building a radio button app" |
| CSS filter preview + upload original | Photo editor (Option B) | AI would see the unfiltered photo, defeating the purpose of letting creators set the visual mood |
| Fabric.js canvas library | Photo editor (Option C) | +300KB bundle weight, "overkill for 4 tools" |
| Hub page (modules independent of brand) | Director Atelier (Option A) | Modules without brand context are meaningless; rules apply per-brand |
| Horizontal tab strip inside Studio | Director Atelier (Option B) | Tab strip implied all content was at the same level; brand-first hierarchy is more accurate |
| Single scrollable brand page | Director Atelier (brand interior Option A) | No visual signal about what needs attention; counts in tiles give ambient awareness |
| Tabs within brand detail | Director Atelier (brand interior Option B) | Tab strip doesn't communicate relative status the way count-tiles do |
| AD invites creator to a brand permanently (single-brand creators) | Brand-Creator Connection (Option A in connection-model) | Doesn't fit multi-brand workflows; creators working across multiple brands need per-request brand selection |
| Creator enters a join code | Brand-Creator Connection (Option B in access-model) | "Less controllable — anyone with code can join"; invite link can be revoked by regenerating |
| Brand tagged at confirm screen (create first, tag brand at end) | Brand-Creator Connection submit flow (Option B) | "Brand is an afterthought" — AI can't use brand rules/tone from the start |

---

## 4. Gaps — In Mockups or Specs, Not in the Implementation

These are design decisions that were either partially specified or exist in mockups but are not yet reflected in the live code. They are candidates for the next UX/UI sprint.

### 4.1 Photo Editor Context Textarea (CRITICAL GAP)

**What the mockup shows:** `editor-mockup.html` (session 9766) shows a "What's this photo about?" textarea directly below the tool panels, on the same screen as the photo editor. The spec also references "Creator edits, writes context in textarea, taps Continue" as step 3 of the photo flow.

**What the plan specifies:** Task 29 (currently in-progress) wires up the PhotoEditor component to the input page but does NOT include a description/context textarea for photo mode. The `handleContinue` for photo mode exports the blob and navigates to `/submit/confirm?mode=photo` with no text context captured.

**Impact:** The AI gets the photo but no creator-supplied context about what the photo is for ("new seasonal menu", "product launch", "behind the scenes morning ritual"). This reduces the quality of the interpret + draft steps significantly.

**Recommended resolution:** Before completing Task 29, add a `description` field below the PhotoEditor on the input page (same screen, not a separate step — Option A was selected for photo-flow). Store it in sessionStorage alongside the photo blob and pass it through to `/api/interpret` and `/api/draft`.

### 4.2 Creators Tile Amber Behavior Needs Clarification

**What the mockup shows:** `full-design.html` (session 19719) shows the Creators tile with amber treatment when there are 2 active members. The spec says "No pending highlight (always neutral styling)."

**What is implemented:** The spec overrides the mockup — the Creators tile is always neutral (no amber). This is correct.

**Residual question:** The mockup showed amber on Creators as a signal of "there are people here." The spec explicitly removed this. If future iteration re-adds an attention signal to Creators (e.g., "N new requests from creators"), the amber pattern should be used consistently with Mind tile rather than red badges.

### 4.3 Filter Thumbnails — VSCO-Style Circular Previews

**What the spec shows:** `docs/superpowers/plans/2026-08-08-photo-editor-vision.md` specifies filter chips as VSCO-pattern circular thumbnails showing the actual photo with the filter applied, not text labels. The PhotoEditor component plan includes this pattern.

**Current status:** `PhotoEditor.tsx` exists (Task 28 done) but Tasks 29-34 are pending. Unknown whether the circular thumbnail implementation was included in Task 28 or is part of a later task. Before adding any new UI to the filter panel, verify the thumbnail implementation against the spec.

### 4.4 Rule-of-Thirds Grid in Crop Mode

**What the spec shows:** The photo editor spec calls for a rule-of-thirds grid overlay in the canvas when Crop tool is active.

**Current status:** Unknown — Task 28 completed the PhotoEditor component but this is a detail-level feature that may or may not have been implemented. Verify before designing any crop UI enhancements.

### 4.5 Text Overlay Tool — No Design Mockup Exists

**What was decided:** The Text overlay tool was selected as one of the 4 tools in `editing-tools.html`. But no mockup shows how the text overlay UI actually works — what the input looks like, how text is positioned on the canvas, font selection, color selection.

**Impact:** When implementing Task 29+ (integrating PhotoEditor into the input page), the text tool UI will need to be designed from scratch. The spec has implementation details (text input rendering to canvas) but no visual design for the tool panel itself. Design this before implementing or it will default to whatever the developer imagines.

### 4.6 Join Page — Post-Join State Design

**What exists:** `full-design.html` shows the join confirmation with a "Join [brand name]" button. The spec says "On success: router.push('/submit') with a brief 'Connected!' flash."

**What is not specified:** What "Connected!" flash looks like. The current implementation likely just navigates without any celebratory moment. This is a microinteraction gap — the join event is significant (creator just connected to a brand for the first time) and the current silent redirect undersells it.

### 4.7 Empty State for Creator with No Brands

**What the spec says:** "0 brands → Show message: 'You haven't joined any brands yet. Ask your Art Director for an invite link.'"

**Visual design:** Not mocked up in any brainstorm file. Only the text content was specified. The empty state for this screen has no visual reference.

### 4.8 `ReviewActions.tsx` is Dead Code

**Status:** This component was the original approve/reject UI before the two-page flow was implemented. It was replaced by `CaptionPicker.tsx` + `ApproveActions.tsx`. The file still exists at `src/app/(reviewer)/queue/[id]/ReviewActions.tsx` but is no longer rendered.

**Action:** Delete it. It's confusing to future contributors who might try to understand the queue flow.

---

## Appendix: Feature Implementation Status Matrix

| Feature | Spec | Plan | Implementation | Deploy |
|---|---|---|---|---|
| Reviewer select-edit-approve | ✅ | ✅ | ✅ Complete | ✅ Live |
| Photo editor (component) | ✅ | ✅ Tasks 27-28 | ✅ `PhotoEditor.tsx` exists | ❌ Not wired |
| Photo editor (full flow + vision) | ✅ | ✅ Tasks 29-34 pending | ❌ Input/Confirm/API not updated | ❌ Not live |
| Director Atelier (studio) | ✅ | ✅ | ✅ Complete | ✅ Live |
| Brand–Creator Connection | ✅ | ✅ | ✅ Complete | ✅ Live |

---

## Appendix: Brainstorm Session Index

| Session ID | Feature | Files |
|---|---|---|
| 4751 | Reviewer select-edit-approve | `flow-approaches.html`, `approve-page.html`, `waiting.html` |
| 9766 | Photo editor + vision | `approaches.html`, `editing-tools.html`, `editor-mockup.html`, `photo-flow.html`, `waiting-1/2/3.html` |
| 4582 | Director Atelier | `atelier-nav.html`, `atelier-scope.html`, `brand-interior.html`, `design-brand-detail.html`, `design-mind-templates-assets.html`, `design-nav-brands.html`, `waiting-1.html` |
| 19719 | Brand–Creator Connection | `access-model.html`, `connection-model.html`, `full-design.html`, `submit-flow.html` |
