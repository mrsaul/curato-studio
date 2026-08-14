'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CreativeRequest } from '@/types/request'
import { STATUS_META, timeAgo } from '../requests/status'

export interface HomeBrand {
  id: string
  name: string
  reviewerId: string
}

const PenIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20Z" stroke="currentColor"
      strokeWidth="1.75" strokeLinejoin="round" />
  </svg>
)
const MicIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="9" y="2" width="6" height="11.5" rx="3" stroke="currentColor" strokeWidth="1.75" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18.5V22" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
)
const ImageIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
    <circle cx="8.75" cy="10" r="1.4" fill="currentColor" />
    <path d="m3.5 17 4.4-4.4a2 2 0 0 1 2.83 0L15 17m1.9-3.2 1.2-1.2a2 2 0 0 1 2.83 0l.57.57"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function SectionHeader({ label, count, urgent }: { label: string; count: number; urgent?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
      marginBottom: 'var(--space-3)', marginTop: 'var(--space-8)',
    }}>
      {urgent && (
        <span aria-hidden="true" style={{
          width: 8, height: 8, borderRadius: '50%', background: 'var(--alert)', flexShrink: 0,
        }} />
      )}
      <span style={{
        fontSize: 'var(--text-xs)', fontFamily: 'var(--mono)',
        letterSpacing: 'var(--tracking-widest)', textTransform: 'uppercase',
        color: 'var(--ink-faint)',
      }}>
        {label} · {count}
      </span>
    </div>
  )
}

function MiniCard({ request }: { request: CreativeRequest }) {
  const meta = STATUS_META[request.status]
  const text = request.transcript ?? request.raw_text ?? ''
  const preview = text ? (text.length > 90 ? text.slice(0, 90) + '…' : text) : 'Photo post'

  return (
    <Link
      href="/requests"
      style={{
        display: 'block', textDecoration: 'none',
        background: 'var(--surface)', border: '1px solid var(--line-soft)',
        borderRadius: 'var(--r-lg)', padding: 'var(--space-4)',
        marginBottom: 'var(--space-2)',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        marginBottom: 'var(--space-2)', flexWrap: 'wrap',
      }}>
        <span style={{
          fontSize: 'var(--text-sm)', fontFamily: 'var(--mono)', letterSpacing: '0.04em',
          color: 'var(--ink)', background: meta.fill,
          borderRadius: 'var(--r-full)', padding: '3px 9px',
        }}>
          {meta.label}
        </span>
        <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--mono)', color: 'var(--ink-faint)' }}>
          {timeAgo(request.created_at)}
        </span>
      </div>
      <p style={{
        fontSize: 'var(--text-base)', color: 'var(--ink)',
        lineHeight: 'var(--leading-normal)', margin: 0,
      }}>
        {preview}
      </p>
    </Link>
  )
}

export default function CreatorHome({
  brands, needsYou, ready,
}: {
  brands: HomeBrand[]
  needsYou: CreativeRequest[]
  ready: CreativeRequest[]
}) {
  const single = brands.length === 1 ? brands[0] : null
  const [picking, setPicking] = useState(false)
  const [chosen, setChosen] = useState<HomeBrand | null>(single)

  const target = chosen ?? single
  const href = (mode: string) =>
    target ? `/submit/input?brandId=${target.id}&reviewerId=${target.reviewerId}&start=${mode}` : '#'

  const needsPick = !target

  const chip: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    background: 'var(--surface)', border: '1px solid var(--line-soft)',
    borderRadius: 'var(--r-full)', padding: '0 16px', minHeight: 'var(--touch)',
    fontSize: 'var(--text-base)', fontFamily: 'var(--body)',
    color: 'var(--ink-soft)', textDecoration: 'none',
    whiteSpace: 'nowrap', cursor: 'pointer',
  }

  return (
    <div style={{ paddingTop: 24, paddingBottom: 8 }}>
      {target && brands.length > 1 && (
        <button
          onClick={() => setPicking(v => !v)}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontSize: 'var(--text-xs)', fontFamily: 'var(--mono)',
            letterSpacing: 'var(--tracking-widest)', textTransform: 'uppercase',
            color: 'var(--ink-faint)', marginBottom: 6, minHeight: 32,
          }}
        >
          {target.name} · change
        </button>
      )}
      {target && brands.length === 1 && (
        <p style={{
          fontSize: 'var(--text-xs)', fontFamily: 'var(--mono)',
          letterSpacing: 'var(--tracking-widest)', textTransform: 'uppercase',
          color: 'var(--ink-faint)', marginBottom: 6,
        }}>
          {target.name}
        </p>
      )}

      <h1 style={{
        fontSize: 'var(--text-2xl)', fontWeight: 400, fontFamily: 'var(--display)',
        color: 'var(--ink)', lineHeight: 'var(--leading-tight)',
        letterSpacing: '-0.02em', marginBottom: 'var(--space-5)',
      }}>
        What&apos;s new?
      </h1>

      {/* Brand chooser — only when there is a real choice to make */}
      {(needsPick || picking) && (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <p style={{
            fontSize: 'var(--text-base)', color: 'var(--ink-soft)',
            marginBottom: 'var(--space-3)',
          }}>
            Which brand is this for?
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {brands.map(b => (
              <button
                key={b.id}
                onClick={() => { setChosen(b); setPicking(false) }}
                style={{
                  ...chip,
                  background: target?.id === b.id ? 'var(--ink)' : 'var(--surface)',
                  color: target?.id === b.id ? '#fff' : 'var(--ink-soft)',
                  borderColor: target?.id === b.id ? 'var(--ink)' : 'var(--line-soft)',
                }}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Primary action */}
      {target && (
        <>
          <Link
            href={href('text')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 'var(--space-3)', textDecoration: 'none',
              background: 'var(--ink)', color: '#fff',
              borderRadius: 'var(--r-xl)', padding: '18px var(--space-5)',
              minHeight: 64, marginBottom: 'var(--space-3)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <PenIcon />
              <span style={{ fontSize: 'var(--text-md)', fontFamily: 'var(--body)' }}>
                Write a post
              </span>
            </span>
            <span aria-hidden="true" style={{ fontSize: 18, opacity: 0.7 }}>→</span>
          </Link>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            <Link href={href('voice')} style={chip}><MicIcon /> Voice note</Link>
            <Link href={href('photo')} style={chip}><ImageIcon /> Photo</Link>
          </div>
        </>
      )}

      {/* Anything waiting on them comes before anything else */}
      {needsYou.length > 0 && (
        <>
          <SectionHeader label="Needs you" count={needsYou.length} urgent />
          {needsYou.map(r => <MiniCard key={r.id} request={r} />)}
        </>
      )}

      {/* The thing they actually came back for */}
      {ready.length > 0 && (
        <>
          <SectionHeader label="Ready to post" count={ready.length} />
          {ready.slice(0, 3).map(r => <MiniCard key={r.id} request={r} />)}
        </>
      )}

      <Link
        href="/requests"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          minHeight: 'var(--touch)', marginTop: 'var(--space-4)',
          fontSize: 'var(--text-base)', color: 'var(--violet)',
          textDecoration: 'none',
        }}
      >
        See all posts <span aria-hidden="true">→</span>
      </Link>
    </div>
  )
}
