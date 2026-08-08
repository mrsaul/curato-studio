import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET() {
  const authed = await createServerSupabaseClient()
  const { data: { user } } = await authed.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // If STUDIO_REVIEWER_ID is set, use that specific user as the reviewer
  const fixedReviewerId = process.env.STUDIO_REVIEWER_ID
  if (fixedReviewerId && fixedReviewerId !== user.id) {
    const { data: ctxData } = await service
      .from('contexts')
      .select('id, user_id')
      .eq('user_id', fixedReviewerId)
      .limit(1)
    return NextResponse.json({
      reviewer: {
        id: fixedReviewerId,
        context_id: ctxData?.[0]?.id ?? null,
      },
    })
  }

  // Fallback: first other user with a context (ordered by creation)
  const { data } = await service
    .from('contexts')
    .select('id, user_id')
    .neq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)

  if (!data?.[0]) return NextResponse.json({ reviewer: null })
  return NextResponse.json({
    reviewer: { id: data[0].user_id as string, context_id: data[0].id as string },
  })
}
