import { createServerSupabaseClient } from '@/lib/supabase-server'

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
        padding: '16px 20px',
        borderBottom: '1px solid var(--line-soft)',
        background: 'var(--bg)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{
          fontFamily: 'var(--display)', fontSize: 18, fontWeight: 400,
          letterSpacing: '-0.01em', color: 'var(--ink)',
        }}>
          Curato Studio
        </span>
        {count > 0 && (
          <span style={{
            background: 'var(--violet)', color: '#fff',
            borderRadius: '50%', width: 20, height: 20,
            fontSize: 11, fontFamily: 'var(--mono)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {count}
          </span>
        )}
      </header>
      <main style={{ flex: 1, padding: '0 20px' }}>
        {children}
      </main>
    </div>
  )
}
