import { RequestStatus } from '@/types/request'

/* Four buckets, named the way a Creator would say them.
   Every backend status maps to exactly one. Shared by the Work list
   and the Creator home so they can never drift apart. */
export type Bucket = 'needs_you' | 'working' | 'ready' | 'closed'

export const BUCKETS: { key: Bucket; label: string; empty: string }[] = [
  { key: 'needs_you', label: 'Needs you',   empty: 'Nothing needs your attention right now.' },
  { key: 'working',   label: 'In progress', empty: 'Nothing in progress. Head to Create to start a post.' },
  { key: 'ready',     label: 'Ready',       empty: 'Nothing approved yet. Approved posts show up here to copy and share.' },
  { key: 'closed',    label: 'Declined',    empty: 'No declined posts.' },
]

/* step: position on the Sent → Draft → Review → Ready track. -1 = off-track. */
export const STATUS_META: Record<RequestStatus, {
  label: string
  bucket: Bucket
  step: number
  fill: string
  hint: string
}> = {
  new:               { label: 'Sent',              bucket: 'working',   step: 0,  fill: 'var(--lilac)',   hint: 'We got it. Starting on it shortly.' },
  interpreting:      { label: 'Reading it',        bucket: 'working',   step: 0,  fill: 'var(--lilac)',   hint: 'Working out what you want to say.' },
  needs_info:        { label: 'Needs your answer', bucket: 'needs_you', step: 0,  fill: 'var(--gold)',    hint: 'One quick question before we carry on.' },
  draft_ready:       { label: 'Writing a draft',   bucket: 'working',   step: 1,  fill: 'var(--lilac)',   hint: 'Drafting your caption.' },
  awaiting_review:   { label: 'With your director',bucket: 'working',   step: 2,  fill: 'var(--lilac)',   hint: 'Waiting on approval.' },
  changes_requested: { label: 'Changes needed',    bucket: 'needs_you', step: 2,  fill: 'var(--gold)',    hint: 'Your director asked for a change.' },
  approved:          { label: 'Approved',          bucket: 'ready',     step: 3,  fill: 'var(--leaf)',    hint: 'Ready to copy and post.' },
  delivered:         { label: 'Posted',            bucket: 'ready',     step: 3,  fill: 'var(--leaf)',    hint: 'This one is out in the world.' },
  declined:          { label: 'Declined',          bucket: 'closed',    step: -1, fill: 'var(--surface)', hint: 'Your director passed on this one.' },
}

export const STEPS = ['Sent', 'Draft', 'Review', 'Ready']

export const SOURCE_LABEL: Record<string, string> = {
  text: 'Written', voice: 'Voice', photo: 'Photo',
}

export function bucketOf(status: RequestStatus): Bucket {
  return STATUS_META[status].bucket
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'Just now'
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
