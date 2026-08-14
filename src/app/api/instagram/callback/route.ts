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
