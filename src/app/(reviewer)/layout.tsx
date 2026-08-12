import { createServerSupabaseClient } from '@/lib/supabase-server'
import ReviewerBottomNav from './BottomNav'

export default async function ReviewerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: queue } = user
    ? await supabase
        .from('creative_requests')
        .select('id', { count: 'exact' })
        .eq('reviewer_id', user.id)
        .eq('status', 'awaiting_review')
    : { data: null }

  const count = queue?.length ?? 0

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        padding: '18px 20px 14px',
        borderBottom: '1px solid var(--line-soft)',
        background: 'var(--bg)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{
          fontFamily: 'var(--display)', fontSize: 17, fontWeight: 400,
          letterSpacing: '-0.01em', color: 'var(--ink)',
        }}>
          Curato Studio
        </span>
        {count > 0 && (
          <span style={{
            background: 'var(--amber)', color: 'var(--amber-text)',
            borderRadius: 100, padding: '1px 7px',
            fontSize: 11, fontFamily: 'var(--mono)',
            letterSpacing: '0.02em',
          }}>
            {count}
          </span>
        )}
      </header>
      <main style={{ flex: 1, padding: '0 20px', paddingBottom: 96 }}>
        {children}
      </main>
      <ReviewerBottomNav pendingCount={count} />
    </div>
  )
}
