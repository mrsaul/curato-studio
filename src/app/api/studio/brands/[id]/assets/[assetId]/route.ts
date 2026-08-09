import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: asset, error: fetchError } = await supabase
    .from('brand_assets')
    .select('id, storage_path, reviewer_id')
    .eq('id', assetId)
    .eq('context_id', id)
    .single()

  if (fetchError && fetchError.code !== 'PGRST116') return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  if (!asset || asset.reviewer_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const service = createServiceSupabaseClient()
  const { error: storageError } = await service.storage.from('brand-assets').remove([asset.storage_path])
  if (storageError) {
    console.error('Storage remove failed for', asset.storage_path, storageError.message)
  }

  const { error } = await supabase.from('brand_assets').delete().eq('id', assetId)
  if (error) return NextResponse.json({ error: 'Failed to delete asset record' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
