import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'

async function verifyOwnership(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, contextId: string, userId: string) {
  const { data, error } = await supabase.from('contexts').select('reviewer_id').eq('id', contextId).single()
  if (error && error.code !== 'PGRST116') throw new Error(`DB error: ${error.message}`)
  return data?.reviewer_id === userId
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const owned = await verifyOwnership(supabase, id, user.id)
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  const { data: assets, error } = await supabase
    .from('brand_assets')
    .select('id, context_id, name, url, created_at')
    .eq('context_id', id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 })
  return NextResponse.json({ assets: assets ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const owned = await verifyOwnership(supabase, id, user.id)
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const fileName = `${crypto.randomUUID()}.${ext}`
  const storagePath = `${user.id}/${fileName}`

  const service = createServiceSupabaseClient()
  const { error: uploadError } = await service.storage
    .from('brand-assets')
    .upload(storagePath, file, { contentType: file.type, upsert: false })

  if (uploadError) return NextResponse.json({ error: 'Upload failed' }, { status: 500 })

  const { data: signedData } = await service.storage
    .from('brand-assets')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365)

  const url = signedData?.signedUrl ?? ''

  const { data: asset, error: dbError } = await supabase
    .from('brand_assets')
    .insert({ context_id: id, reviewer_id: user.id, name: file.name, storage_path: storagePath, url })
    .select('id, context_id, name, url, created_at')
    .single()

  if (dbError) {
    // Clean up orphaned storage file
    await service.storage.from('brand-assets').remove([storagePath])
    return NextResponse.json({ error: 'Failed to save asset' }, { status: 500 })
  }

  return NextResponse.json({ asset })
}
