import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getContributorRequests } from '@/lib/requests'
import { CreativeRequest, RequestStatus } from '@/types/request'
import RequestReplyForm from './RequestReplyForm'
import DraftRetryButton from './DraftRetryButton'

const STATUS_LABEL: Record<RequestStatus, string> = {
  new: 'Received',
  interpreting: 'Processing',
  needs_info: 'Needs your answer',
  draft_ready: 'Creating draft',
  awaiting_review: 'In review',
  approved: 'Approved',
  changes_requested: 'Changes needed',
  declined: 'Declined',
  delivered: 'Delivered',
}

const STATUS_COLOR: Record<RequestStatus, string> = {
  new: 'var(--ink-faint)',
  interpreting: 'var(--amber)',
  needs_info: 'var(--amber)',
  draft_ready: 'var(--amber)',
  awaiting_review: 'var(--violet)',
  approved: 'var(--green)',
  changes_requested: 'var(--amber)',
  declined: 'var(--red)',
  delivered: 'var(--green)',
}

function RequestCard({ request }: { request: CreativeRequest }) {
  const input = request.transcript ?? request.raw_text ?? `${request.source_type} post`
  const preview = input.length > 80 ? input.slice(0, 80) + '…' : input

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 12, padding: '14px 16px',
      border: '1px solid var(--line-soft)', marginBottom: 12,
    }}>
      <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.5, marginBottom: 8 }}>
        {preview}
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: 12, fontFamily: 'var(--mono)',
          color: STATUS_COLOR[request.status],
        }}>
          {STATUS_LABEL[request.status]}
        </span>
        <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
          {new Date(request.created_at).toLocaleDateString()}
        </span>
      </div>
      {request.status === 'needs_info' && request.clarification_question && (
        <RequestReplyForm requestId={request.id} question={request.clarification_question} />
      )}
      {request.status === 'draft_ready' && (
        <DraftRetryButton requestId={request.id} />
      )}
    </div>
  )
}

export default async function RequestsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const requests = await getContributorRequests(supabase, user.id)

  return (
    <div style={{ paddingTop: 24, paddingBottom: 32 }}>
      <p style={{ fontSize: 18, fontFamily: 'var(--display)', marginBottom: 20 }}>
        Your requests
      </p>
      {requests.length === 0 ? (
        <p style={{ color: 'var(--ink-faint)', fontSize: 14 }}>
          No requests yet. Go back and create your first post.
        </p>
      ) : (
        requests.map(r => <RequestCard key={r.id} request={r} />)
      )}
    </div>
  )
}
