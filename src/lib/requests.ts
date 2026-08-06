import { SupabaseClient } from '@supabase/supabase-js'
import { CreativeRequest, RequestDraft, Template } from '@/types/request'

export async function createRequest(
  supabase: SupabaseClient,
  params: {
    contributor_id: string
    reviewer_id: string
    context_id: string | null
    source_type: 'text' | 'voice' | 'photo'
    raw_text?: string
    media_url?: string
    transcript?: string
  }
): Promise<CreativeRequest> {
  const { data, error } = await supabase
    .from('creative_requests')
    .insert({
      contributor_id: params.contributor_id,
      reviewer_id: params.reviewer_id,
      context_id: params.context_id,
      source_type: params.source_type,
      status: 'new',
      raw_text: params.raw_text ?? null,
      media_url: params.media_url ?? null,
      transcript: params.transcript ?? null,
    })
    .select()
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Failed to create request')
  return data as CreativeRequest
}

export async function updateRequest(
  supabase: SupabaseClient,
  id: string,
  updates: Partial<Pick<CreativeRequest,
    'status' | 'intent_summary' | 'clarification_question' | 'contributor_reply' | 'transcript'
  >>
): Promise<void> {
  const { error } = await supabase
    .from('creative_requests')
    .update(updates)
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export async function getRequest(
  supabase: SupabaseClient,
  id: string
): Promise<CreativeRequest | null> {
  const { data, error } = await supabase
    .from('creative_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as CreativeRequest | null
}

export async function getContributorRequests(
  supabase: SupabaseClient,
  contributorId: string
): Promise<CreativeRequest[]> {
  const { data, error } = await supabase
    .from('creative_requests')
    .select('*')
    .eq('contributor_id', contributorId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as CreativeRequest[]
}

export async function getReviewerQueue(
  supabase: SupabaseClient,
  reviewerId: string
): Promise<CreativeRequest[]> {
  const { data, error } = await supabase
    .from('creative_requests')
    .select('*')
    .eq('reviewer_id', reviewerId)
    .eq('status', 'awaiting_review')
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as CreativeRequest[]
}

export async function getRequestDraft(
  supabase: SupabaseClient,
  requestId: string
): Promise<RequestDraft | null> {
  const { data, error } = await supabase
    .from('request_drafts')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: false })
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as RequestDraft | null
}

export async function getReviewerTemplates(
  supabase: SupabaseClient,
  reviewerId: string
): Promise<Template[]> {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .eq('reviewer_id', reviewerId)
    .eq('active', true)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as Template[]
}
