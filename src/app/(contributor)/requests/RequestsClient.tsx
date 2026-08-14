'use client'

import { useState } from 'react'
import { CreativeRequest, RequestStatus } from '@/types/request'
import RequestReplyForm from './RequestReplyForm'
import DraftRetryButton from './DraftRetryButton'
import CaptionShare from './CaptionShare'

/* ─────────────────────────────────────────────────────────────
   Four buckets, named the way a Creator would say them.
   Every backend status maps to exactly one.
   ───────────────────────────────────────────────────────────── */
type Bucket = 'needs_you' | 'working' | 'ready' | 'closed'

const BUCKETS: { key: Bucket; label: string; empty: string }[] = [
  { key: 'needs_you', label: 'Needs you',   empty: 'Nothing needs your attention right now.' },
  { key: 'working',   label: 'In progress', empty: 'Nothing in progress. Head to Create to start a post.' },
  { key: 'ready',     label: 'Ready',       empty: 'Nothing approved yet. Approved posts show up here to copy and share.' },
  { key: 'closed',    label: 'Declined',    empty: 'No declined posts.' },
]

/* step: position on the Sent → Draft → Review → Ready track. -1 = off-track. */
const STATUS_META: Record<RequestStatus, {
  label: string
  bucket: Bucket
  step: number
  fill: string
  hint: string
}> = {
  new:               { label: 'Sent',             bucket: 'working',   step: 0, fill: 'var(--lilac)', hint: 'We got it. Starting on it shortly.' },
  interpreting:      { label: 'Reading it',       bucket: 'working',   step: 0, fill: 'var(--lilac)', hint: 'Working out what you want to say.' },
  needs_info:        { label: 'Needs your answer',bucket: 'needs_you', step: 0, fill: 'var(--gold)',  hint: 'One quick question before we carry on.' },
  draft_ready:       { label: 'Writing a draft',  bucket: 'working',   step: 1, fill: 'var(--lilac)', hint: 'Drafting your caption.' },
  awaiting_review:   { label: 'With your director',bucket: 'working',  step: 2, fill: 'var(--lilac)', hint: 'Waiting on approval.' },
  changes_requested: { label: 'Changes needed',   bucket: 'needs_you', step: 2, fill: 'var(--gold)',  hint: 'Your director asked for a change.' },
  approved:          { label: 'Approved',         bucket: 'ready',     step: 3, fill: 'var(--leaf)',  hint: 'Ready to copy and post.' },
  delivered:         { label: 'Posted',           bucket: 'ready',     step: 3, fill: 'var(--leaf)',  hint: 'This one is out in the world.' },
  declined:          { label: 'Declined',         bucket: 'closed',    step: -1, fill: 'var(--surface)', hint: 'Your director passed on this one.' },
}

const SOURCE_LABEL: Record<string, string> = { text: 'Written', voice: 'Voice', photo: 'Photo' }

const STEPS = ['Sent', 'Draft', 'Review', 'Ready']

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'Just now'
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/* Where a post sits in the pipeline, at a glance. */
function Track({ step }: { step: number }) {
  return (
    <div
      role="img"
      aria-label={`Step ${step + 1} of 4: ${STEPS[step]}`}
      style={{ position: 'relative', marginBottom: 'var(--space-3)' }}
    >
      <div aria-hidden="true" style={{
        position: 'absolute', top: 5, left: '12.5%', right: '12.5%',
        height: 2, background: 'var(--line-ui)', opacity: 0.45, borderRadius: 2,
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', top: 5, left: '12.5%',
        width: `${(step / 3) * 75}%`,
        height: 2, background: 'var(--ink)', borderRadius: 2,
        transition: 'width var(--duration-slow) var(--ease-decel)',
      }} />
      <div style={{ display: 'flex' }}>
        {STEPS.map((s, i) => {
          const done = i <= step
          return (
            <div key={s} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 5,
            }}>
              <div aria-hidden="true" style={{
                width: 12, height: 12, borderRadius: '50%', boxSizing: 'border-box',
                background: done ? 'var(--ink)' : 'var(--field)',
                border: `2px solid ${done ? 'var(--ink)' : 'var(--line-ui)'}`,
                position: 'relative', zIndex: 1,
              }} />
              <span aria-hidden="true" style={{
                fontSize: 9, fontFamily: 'var(--mono)', letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: done ? 'var(--ink-soft)' : 'var(--ink-faint)',
              }}>
                {s}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RequestCard({ request }: { request: CreativeRequest }) {
  const meta = STATUS_META[request.status]
  const input = request.transcript ?? request.raw_text ?? ''
  const preview = input ? (input.length > 130 ? input.slice(0, 130) + '…' : input) : null
  const isReady = meta.bucket === 'ready'

  return (
    <article style={{
      background: 'var(--surface)',
      borderRadius: 'var(--r-xl)',
      marginBottom: 'var(--space-3)',
      border: '1px solid var(--line-soft)',
      padding: 'var(--space-4)',
      opacity: meta.bucket === 'closed' ? 0.72 : 1,
    }}>
      {/* Meta row */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 'var(--space-3)', gap: 8,
      }}>
        <span style={{
          fontSize: 'var(--text-xs)', fontFamily: 'var(--mono)',
          letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase',
          color: 'var(--ink-faint)',
        }}>
          {SOURCE_LABEL[request.source_type] ?? request.source_type}
        </span>
        <span style={{
          fontSize: 'var(--text-sm)', color: 'var(--ink-faint)',
          fontFamily: 'var(--mono)', whiteSpace: 'nowrap',
        }}>
          {timeAgo(request.created_at)}
        </span>
      </div>

      {meta.step >= 0 && <Track step={meta.step} />}

      {/* What they said */}
      {preview ? (
        <p style={{
          fontSize: 'var(--text-md)', color: 'var(--ink)',
          lineHeight: 'var(--leading-relaxed)', marginBottom: 'var(--space-3)',
        }}>
          {preview}
        </p>
      ) : (
        <p style={{
          fontSize: 'var(--text-base)', color: 'var(--ink-faint)',
          fontStyle: 'italic', marginBottom: 'var(--space-3)',
        }}>
          {request.source_type === 'photo' ? 'Photo post' : 'Media post'}
        </p>
      )}

      {/* Status — pastel fill carrying ink, never coloured text */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 'var(--text-sm)', fontFamily: 'var(--mono)',
          letterSpacing: '0.04em', color: 'var(--ink)',
          background: meta.fill, borderRadius: 'var(--r-full)',
          padding: '4px 10px', whiteSpace: 'nowrap',
        }}>
          {meta.label}
        </span>
        <span style={{
          fontSize: 'var(--text-base)', color: 'var(--ink-faint)',
          lineHeight: 'var(--leading-normal)',
        }}>
          {meta.hint}
        </span>
      </div>

      {request.status === 'needs_info' && request.clarification_question && (
        <RequestReplyForm requestId={request.id} question={request.clarification_question} />
      )}
      {request.status === 'draft_ready' && <DraftRetryButton requestId={request.id} />}
      {isReady && <CaptionShare requestId={request.id} />}
    </article>
  )
}

export default function RequestsClient({ requests }: { requests: CreativeRequest[] }) {
  const counts = BUCKETS.reduce((acc, b) => {
    acc[b.key] = requests.filter(r => STATUS_META[r.status].bucket === b.key).length
    return acc
  }, {} as Record<Bucket, number>)

  // Open on whatever actually wants the Creator's attention.
  const initial: Bucket =
    counts.needs_you > 0 ? 'needs_you'
    : counts.working > 0 ? 'working'
    : counts.ready > 0 ? 'ready'
    : 'needs_you'

  const [active, setActive] = useState<Bucket>(initial)
  const shown = requests.filter(r => STATUS_META[r.status].bucket === active)
  const activeMeta = BUCKETS.find(b => b.key === active)!

  return (
    <div>
      {/* Filter row — scrolls sideways rather than wrapping or squashing */}
      <div
        role="tablist"
        aria-label="Filter posts by status"
        style={{
          /* Wraps rather than scrolls: at 375px a scrolling row pushed
             Ready and Declined off-screen with no hint they existed. */
          display: 'flex', flexWrap: 'wrap',
          columnGap: 'var(--space-2)', rowGap: 'var(--space-2)',
          marginBottom: 'var(--space-5)',
        }}
      >
        {BUCKETS.map(b => {
          const isActive = b.key === active
          const n = counts[b.key]
          return (
            <button
              key={b.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(b.key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                minHeight: 'var(--touch)', padding: '0 14px',
                borderRadius: 'var(--r-full)', cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
                fontSize: 'var(--text-base)', fontFamily: 'var(--body)',
                background: isActive ? 'var(--ink)' : 'var(--surface)',
                color: isActive ? '#fff' : 'var(--ink-soft)',
                border: `1px solid ${isActive ? 'var(--ink)' : 'var(--line-soft)'}`,
                transition: 'background var(--duration-base), color var(--duration-base)',
              }}
            >
              {b.label}
              {n > 0 && (
                <span style={{
                  fontSize: 'var(--text-sm)', fontFamily: 'var(--mono)',
                  background: isActive ? 'rgba(255,255,255,0.22)' : 'var(--panel)',
                  color: isActive ? '#fff' : 'var(--ink-soft)',
                  borderRadius: 'var(--r-full)', padding: '2px 7px', lineHeight: 1.4,
                }}>
                  {n}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {shown.length === 0 ? (
        <p style={{
          fontSize: 'var(--text-md)', color: 'var(--ink-faint)',
          lineHeight: 'var(--leading-relaxed)', paddingTop: 'var(--space-6)',
          textAlign: 'center',
        }}>
          {activeMeta.empty}
        </p>
      ) : (
        shown.map(r => <RequestCard key={r.id} request={r} />)
      )}
    </div>
  )
}
