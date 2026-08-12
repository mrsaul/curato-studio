import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import JoinClient from './JoinClient'

function CheckCircle() {
  return (
    <div
      className="success-circle"
      style={{
        width: 56, height: 56, borderRadius: '50%',
        background: 'var(--green)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 'var(--space-5)',
      }}
    >
      <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <polyline
          className="success-check"
          points="7,16 13,22 25,10"
          stroke="white" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceSupabaseClient()

  const { data: invite } = await service
    .from('brand_invites').select('context_id').eq('token', token).single()

  if (!invite) {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-6)', background: 'var(--bg)', textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 'var(--r-xl)',
          background: 'var(--red-soft)', border: '1px solid var(--red)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 'var(--space-5)', fontSize: 22,
        }}>
          ✕
        </div>
        <h1 style={{
          fontSize: 'var(--text-xl)', fontWeight: 400,
          fontFamily: 'var(--display)', color: 'var(--ink)',
          marginBottom: 'var(--space-3)',
        }}>
          This link has expired
        </h1>
        <p style={{
          fontSize: 'var(--text-base)', color: 'var(--ink-soft)',
          lineHeight: 'var(--leading-relaxed)', maxWidth: 260,
          marginBottom: 'var(--space-8)',
        }}>
          Ask whoever invited you to send a new link.
        </p>
        <Link href="/submit" style={{
          color: 'var(--violet)', fontSize: 'var(--text-base)',
          textDecoration: 'none', minHeight: 'var(--touch)',
          display: 'inline-flex', alignItems: 'center',
        }}>
          Go to home
        </Link>
      </div>
    )
  }

  const { data: ctx } = await service
    .from('contexts').select('name').eq('id', invite.context_id).single()

  const { data: existing } = await service
    .from('brand_members')
    .select('id')
    .eq('context_id', invite.context_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-6)', background: 'var(--bg)', textAlign: 'center',
      }}>
        <CheckCircle />
        <h1 style={{
          fontSize: 'var(--text-xl)', fontWeight: 400,
          fontFamily: 'var(--display)', color: 'var(--ink)',
          marginBottom: 'var(--space-3)',
        }}>
          You&apos;re already in {ctx?.name ?? 'this brand'}
        </h1>
        <p style={{
          fontSize: 'var(--text-base)', color: 'var(--ink-soft)',
          lineHeight: 'var(--leading-relaxed)', maxWidth: 260,
          marginBottom: 'var(--space-8)',
        }}>
          Ready to go — head over and create a post.
        </p>
        <Link href="/submit" style={{
          background: 'var(--ink)', color: '#fff',
          borderRadius: 'var(--r-full)', fontSize: 'var(--text-base)',
          fontFamily: 'var(--mono)', letterSpacing: 'var(--tracking-wide)',
          textTransform: 'uppercase', textDecoration: 'none',
          minHeight: 'var(--touch)', padding: '0 var(--space-6)',
          display: 'inline-flex', alignItems: 'center',
        }}>
          Create a post
        </Link>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 'var(--space-6)', background: 'var(--bg)',
    }}>
      <div style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
        <JoinClient token={token} brandName={ctx?.name ?? 'this brand'} />
      </div>
    </div>
  )
}
