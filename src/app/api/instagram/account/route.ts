import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'

export async function DELETE(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: brand } = await supabase
    .from('contexts').select('id').eq('id', brandId).eq('user_id', user.id).maybeSingle()
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const service = createServiceSupabaseClient()
  await service.from('instagram_accounts').delete().eq('context_id', brandId)
  return NextResponse.json({ ok: true })
}
