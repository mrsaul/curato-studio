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
