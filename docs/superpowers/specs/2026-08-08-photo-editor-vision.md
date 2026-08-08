# Photo Editor + Vision Caption Generation

**Goal:** Replace the bare photo picker with a canvas-based editor (crop, filter, brightness, text overlay), upload the edited image to Supabase Storage, and use Claude Haiku 4.5 Vision to analyze the actual edited photo when generating intent and captions.

**Architecture:** Single-screen editor on the Photo input tab. Four tool panels (Crop, Filter, Light, Text) swap below a `<canvas>` preview. On Continue, the canvas exports a JPEG blob stored in `sessionStorage`. The confirm page uploads it to Supabase Storage and passes `photo_url` to the existing request pipeline. `/api/interpret` and `/api/draft` gain vision support — when `photo_url` is present they include the image in the Claude prompt; otherwise behavior is unchanged.

**Tech Stack:** Next.js 14 App Router, React client components, browser Canvas API (no extra libraries), Supabase Storage, Claude Haiku 4.5 Vision (`claude-haiku-4-5-20251001`), existing `callClaude` fetch pattern.

---

## Flow

1. Creator picks Photo tab → taps "Take or choose photo" → photo loads into `<canvas>`
2. Four tool tabs appear: **Crop · Filter · Light · Text** (each swaps the panel below)
3. Creator edits, writes context in textarea, taps "Continue"
4. Canvas exports JPEG blob (quality 0.85) → stored in `sessionStorage` as base64 or object URL reference
5. Confirm page reads blob, shows thumbnail
6. "Send to reviewer" → upload blob to Supabase Storage → get public URL → create request with `photo_url` → interpret (vision) → draft (vision) → redirect to sent

---

## PhotoEditor Component

**File:** `src/app/(contributor)/submit/input/PhotoEditor.tsx`

`'use client'` component using `forwardRef` + `useImperativeHandle`. Props:
```typescript
interface PhotoEditorProps {
  sourceUrl: string         // object URL of the picked file
  onExport: (blob: Blob) => void
}
interface PhotoEditorHandle {
  triggerExport: () => void // called by parent on Continue click
}
```

### State
- `imageEl: HTMLImageElement | null` — loaded from `sourceUrl` via `new Image()` on mount
- `activeTool: 'crop' | 'filter' | 'light' | 'text'` — active tab, default `'crop'`
- `aspectRatio: 'free' | '1:1' | '4:5' | '9:16'` — default `'1:1'`
- `rotation: number` — degrees, multiples of 90, default `0`
- `filter: FilterName` — `'original' | 'warm' | 'cool' | 'vivid' | 'muted' | 'bw'`, default `'original'`
- `brightness: number` — −50 to 50, default `0`
- `contrast: number` — −50 to 50, default `0`
- `overlayText: string` — default `''`

### Filter presets (canvas filter strings)
| Name | CSS filter string |
|---|---|
| Original | `none` |
| Warm | `sepia(0.3) saturate(1.4) brightness(1.05)` |
| Cool | `hue-rotate(20deg) saturate(0.9) brightness(1.02)` |
| Vivid | `saturate(1.8) contrast(1.1)` |
| Muted | `saturate(0.6) brightness(1.05)` |
| B&W | `grayscale(1) contrast(1.1)` |

### Rendering (called on every state change via `useEffect`)
1. Determine output dimensions from `aspectRatio` and source image size (max 1080px on longest side). For `'free'`, preserve the original image's aspect ratio — just scale it down if needed.
2. Set `canvas.width` / `canvas.height`
3. `ctx.save()` → translate to center → rotate by `rotation` degrees → translate back
4. Build filter string: combine filter preset with `brightness(${1 + brightness/100}) contrast(${1 + contrast/100})`
5. Set `ctx.filter = filterString`
6. `ctx.drawImage(imageEl, ...)` — cropped to the aspect ratio window
7. If `overlayText` is non-empty: draw centered text at bottom (white fill, 2px black shadow, font size = canvas width / 18)
8. `ctx.restore()`

### Export
`triggerExport()` (exposed via `useImperativeHandle`) calls:
`canvas.toBlob(blob => onExport(blob!), 'image/jpeg', 0.85)`

The parent (`input/page.tsx`) holds a `ref` to the component and calls `ref.current.triggerExport()` when the Creator taps Continue.

### Tool panels

**Crop panel:**
- Aspect ratio buttons: Free / 1:1 / 4:5 / 9:16 — violet background when active
- Rotate left button (−90°) and Rotate right button (+90°)

**Filter panel:**
- 6 chips in a row: Original, Warm, Cool, Vivid, Muted, B&W
- Each chip shows a tiny canvas preview of the photo with that filter applied
- Active chip has violet border

**Light panel:**
- Brightness label + range input (min=−50 max=50 step=1) + numeric value display
- Contrast label + range input (same range)

**Text panel:**
- Single `<input type="text">` with placeholder "Add text to photo…"
- Text renders centered at bottom of canvas in real time

---

## Input Page Changes

**File:** `src/app/(contributor)/submit/input/page.tsx`

Photo mode renders `PhotoEditor` instead of the current `<img>` / file-picker block.

```typescript
const [editedBlob, setEditedBlob] = useState<Blob | null>(null)
const photoEditorRef = useRef<PhotoEditorHandle>(null)

// photo mode UI
{mode === 'photo' && (
  <>
    <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
      onChange={handlePhoto} style={{ display: 'none' }} />
    {photoUrl ? (
      <PhotoEditor ref={photoEditorRef} sourceUrl={photoUrl} onExport={setEditedBlob} />
    ) : (
      <button onClick={() => fileInputRef.current?.click()} ...>
        Tap to take or choose a photo
      </button>
    )}
  </>
)}
```

`canContinue()` for photo mode: `photoFile !== null` (same as before — export happens on Continue click).

`handleContinue()` for photo mode:
1. Call `photoEditorRef.current?.triggerExport()` — this sets `editedBlob` via the `onExport` callback
2. Wait for `editedBlob` to be set (or handle synchronously inside a wrapped Promise), then convert blob to base64 string
3. Save to `sessionStorage` under key `photo_blob_b64`
4. `router.push('/submit/confirm?mode=photo')`

`PhotoEditor` also needs to accept `sourceUrl: string` prop so it can load the image via `new Image()`.

---

## Confirm Page Changes

**File:** `src/app/(contributor)/submit/confirm/page.tsx`

```typescript
// On mount (in useEffect, alongside reviewer fetch):
const b64 = sessionStorage.getItem('photo_blob_b64')
if (b64 && mode === 'photo') {
  const byteString = atob(b64.split(',')[1])
  const mimeString = b64.split(',')[0].split(':')[1].split(';')[0]
  const ab = new ArrayBuffer(byteString.length)
  const ia = new Uint8Array(ab)
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i)
  setPhotoBlob(new Blob([ab], { type: mimeString }))
  setPhotoPreviewUrl(URL.createObjectURL(new Blob([ab], { type: mimeString })))
}
```

Display thumbnail:
```typescript
{photoPreviewUrl && mode === 'photo' && (
  <img src={photoPreviewUrl} style={{ width:'100%', borderRadius:10, maxHeight:200, objectFit:'cover', marginBottom:16 }} />
)}
```

On submit, before calling `/api/requests`, if `photoBlob`:
```typescript
const supabase = createBrowserSupabaseClient()
const { data: { user } } = await supabase.auth.getUser()
const filename = `${user!.id}/${crypto.randomUUID()}.jpg`
const { error: uploadError } = await supabase.storage
  .from('post-photos')
  .upload(filename, photoBlob, { contentType: 'image/jpeg', upsert: false })
if (uploadError) throw new Error('Photo upload failed')
const { data: { publicUrl } } = supabase.storage
  .from('post-photos')
  .getPublicUrl(filename)
photoUrl = publicUrl
```

Pass `photo_url: photoUrl` in the `/api/requests` body.

Clean up sessionStorage on success: `sessionStorage.removeItem('photo_blob_b64')`

---

## API Changes

### `/api/requests` route
**File:** `src/app/api/requests/route.ts`

Accept `photo_url?: string` in request body. Store in DB:
```typescript
photo_url: body.photo_url ?? null,
```

### `/api/interpret` route
**File:** `src/app/api/interpret/route.ts`

When `request.photo_url` is present, send a vision message to Claude:

```typescript
const messages = request.photo_url
  ? [{
      role: 'user' as const,
      content: [
        { type: 'image', source: { type: 'url', url: request.photo_url } },
        { type: 'text', text: `The creator wants to post this photo to Instagram. Their description: "${request.raw_text ?? '(no description)'}"\n\nDescribe the scene and mood of the photo, then write a one-sentence intent summary for a social media caption writer.` }
      ]
    }]
  : [{ role: 'user' as const, content: existingPrompt }]

// Use Haiku for vision calls (cheap + fast)
const model = request.photo_url ? 'claude-haiku-4-5-20251001' : existingModel
```

### `/api/draft` route
**File:** `src/app/api/draft/route.ts`

When `request.photo_url` is present, include image in the caption generation prompt:

```typescript
const userContent = request.photo_url
  ? [
      { type: 'image', source: { type: 'url', url: request.photo_url } },
      { type: 'text', text: existingPromptText }
    ]
  : existingPromptText
```

Model stays `claude-sonnet-4-6` for draft generation (higher quality captions) — only interpret uses Haiku for the initial vision analysis.

---

## Database Migration

**File:** `supabase/migrations/20260808_add_photo_url.sql`

```sql
ALTER TABLE creative_requests ADD COLUMN photo_url TEXT;
```

---

## TypeScript Types

**File:** `src/types/request.ts`

Add to `CreativeRequest`:
```typescript
photo_url: string | null
```

---

## Supabase Storage

- Bucket name: `post-photos`
- Public: yes (photos need a public URL for Claude Vision)
- RLS policy: authenticated users can insert into `{user_id}/` prefix; public SELECT

---

## Edge Cases

- **Large photos:** Canvas resizes to max 1080px on the longest side before export — keeps upload size reasonable (<500KB typical).
- **No text entered:** `overlayText === ''` → skip text rendering step entirely.
- **sessionStorage missing on confirm page:** If `photo_blob_b64` is absent and mode is photo, show "Photo not found — go back and try again" with a back link.
- **Upload failure:** Show inline error on confirm page; do not call `/api/requests`.
- **Non-photo requests:** `/api/interpret` and `/api/draft` check `request.photo_url` — if null, existing behavior unchanged.
- **Rotation + crop:** Apply rotation transform before cropping so the crop window always aligns to the rotated image.
