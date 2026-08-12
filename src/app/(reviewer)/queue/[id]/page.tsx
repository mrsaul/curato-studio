// src/app/(reviewer)/queue/[id]/page.tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getRequest, getRequestDraft } from '@/lib/requests'
import CaptionPicker from './CaptionPicker'
import { QueueExitProvider } from './exit-context'
import { SectionLabel } from '@/components/ui'

export default async function RequestDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const request = await getRequest(supabase, params.id)
  if (!request || request.reviewer_id !== user.id) notFound()

  const draft = await getRequestDraft(supabase, request.id)

  return (
    <QueueExitProvider>
    <div style={{ paddingTop: 24, paddingBottom: 32 }}>
      {/* Back */}
      <Link href="/queue" style={{
        fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
        textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
        gap: 6, marginBottom: 20,
      }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Queue
      </Link>

      {/* Photo (if present) */}
      {request.photo_url && (
        <section style={{ marginBottom: 24 }}>
          <SectionLabel marginBottom={8}>Photo</SectionLabel>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={request.photo_url}
            alt="Creator photo"
            style={{ width: '100%', borderRadius: 10, maxHeight: 400, objectFit: 'cover', display: 'block' }}
          />
        </section>
      )}

      {/* Original input */}
      <section style={{ marginBottom: 24 }}>
        <SectionLabel marginBottom={8}>Original — {request.source_type}</SectionLabel>
        <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.6, margin: 0 }}>
            {request.transcript ?? request.raw_text ?? '(media upload)'}
          </p>
        </div>
      </section>

      {/* Interpretation */}
      {request.intent_summary && (
        <section style={{ marginBottom: 24 }}>
          <SectionLabel marginBottom={8}>Interpretation</SectionLabel>
          <p style={{ fontSize: 14, color: 'var(--violet)', lineHeight: 1.5, margin: 0 }}>
            {request.intent_summary}
          </p>
        </section>
      )}

      {/* Caption picker / draft state */}
      {draft ? (
        <>
          <section style={{ marginBottom: 16 }}>
            <SectionLabel marginBottom={8}>Caption — edit &amp; approve</SectionLabel>
            {request.status === 'awaiting_review' ? (
              <CaptionPicker
                requestId={request.id}
                options={draft.caption_options}
                recommendedCaption={draft.recommended_caption}
              />
            ) : (
              <>
                {draft.caption_options.map((opt, i) => (
                  <div key={i} style={{
                    background: draft.recommended_caption === opt.text ? 'var(--bg)' : 'var(--surface)',
                    borderRadius: 10, padding: '12px 14px', marginBottom: 8,
                    border: draft.recommended_caption === opt.text
                      ? '2px solid var(--violet)' : '1px solid var(--line-soft)',
                  }}>
                    <p style={{
                      fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-faint)',
                      textTransform: 'uppercase', marginBottom: 4, margin: '0 0 4px',
                    }}>
                      {opt.style}{draft.recommended_caption === opt.text ? ' · recommended' : ''}
                    </p>
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink)', margin: 0 }}>
                      {opt.text}
                    </p>
                  </div>
                ))}
                <p style={{
                  fontSize: 14, color: 'var(--ink-faint)', textAlign: 'center', marginTop: 16,
                }}>
                  This request is {request.status}.
                </p>
              </>
            )}
          </section>

          {/* CTA */}
          {draft.cta && (
            <section style={{ marginBottom: 16 }}>
              <SectionLabel marginBottom={6}>CTA</SectionLabel>
              <p style={{ fontSize: 14, color: 'var(--ink)', margin: 0 }}>{draft.cta}</p>
            </section>
          )}

          {/* Hashtags */}
          {draft.hashtags.length > 0 && (
            <section style={{ marginBottom: 16 }}>
              <SectionLabel marginBottom={6}>Hashtags</SectionLabel>
              <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>
                {draft.hashtags.map(h => `#${h}`).join(' ')}
              </p>
            </section>
          )}

          {/* Visual brief */}
          {draft.visual_brief && (
            <section style={{ marginBottom: 16 }}>
              <SectionLabel marginBottom={6}>Visual brief</SectionLabel>
              <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.5, margin: 0 }}>
                {draft.visual_brief}
              </p>
            </section>
          )}

          {/* Flags */}
          {draft.flags.length > 0 && (
            <section style={{ marginBottom: 16 }}>
              <p style={{
                fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--amber)',
                textTransform: 'uppercase', marginBottom: 6,
              }}>Flags</p>
              {draft.flags.map((f, i) => (
                <p key={i} style={{ fontSize: 13, color: 'var(--amber)', marginBottom: 4 }}>
                  {f.type}: {f.note}
                </p>
              ))}
            </section>
          )}
        </>
      ) : (
        <p style={{ color: 'var(--ink-faint)', fontSize: 14 }}>Draft is being generated…</p>
      )}
    </div>
    </QueueExitProvider>
  )
}
