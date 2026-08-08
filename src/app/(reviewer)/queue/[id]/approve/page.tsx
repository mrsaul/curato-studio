// src/app/(reviewer)/queue/[id]/approve/page.tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getRequest, getRequestDraft } from '@/lib/requests'
import ApproveActions from './ApproveActions'

export default async function ApprovePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { option?: string }
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const request = await getRequest(supabase, params.id)
  if (!request || request.reviewer_id !== user.id) notFound()

  if (request.status !== 'awaiting_review') {
    redirect(`/queue/${params.id}`)
  }

  const draft = await getRequestDraft(supabase, request.id)
  if (!draft) redirect(`/queue/${params.id}`)

  const rawIndex = parseInt(searchParams.option ?? '0', 10)
  const optionIndex =
    isNaN(rawIndex) || rawIndex < 0 || rawIndex >= draft.caption_options.length
      ? 0
      : rawIndex

  const initialCaption =
    draft.caption_options[optionIndex]?.text ?? draft.recommended_caption ?? ''

  const chosenStyle = draft.caption_options[optionIndex]?.style ?? 'caption'

  return (
    <div style={{ paddingTop: 24, paddingBottom: 32 }}>
      {/* Back */}
      <Link href={`/queue/${params.id}`} style={{
        fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
        textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
        gap: 6, marginBottom: 20,
      }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Back to options
      </Link>

      {/* Header */}
      <p style={{
        fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.12em',
        textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4,
      }}>
        {chosenStyle} option
      </p>
      <h1 style={{
        fontFamily: 'var(--display)', fontSize: 26, fontWeight: 400,
        letterSpacing: '-0.02em', color: 'var(--ink)', marginBottom: 28,
      }}>
        Edit &amp; approve
      </h1>

      <ApproveActions requestId={request.id} initialCaption={initialCaption} />
    </div>
  )
}
