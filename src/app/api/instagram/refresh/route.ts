import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'
import { InstagramAccount } from '@/types/instagram'
import { needsRefresh, refreshLongLived, expiryFromNow } from '@/lib/instagram/tokens'

/**
 * Reading req.headers does not opt a Route Handler out of static
 * evaluation, so without this the route is prerendered at build time and
 * the weekly cron would hit a cached response instead of refreshing
 * anything.
 */
export const dynamic = 'force-dynamic'

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
