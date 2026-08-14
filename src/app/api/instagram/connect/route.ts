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
