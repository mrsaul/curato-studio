import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getContributorRequests } from '@/lib/requests'
import { bucketOf } from './requests/status'
import ContributorBottomNav from './BottomNav'

export default async function ContributorLayout({ children }: { children: React.ReactNode }) {
  // Badge count for the nav — how many posts are actually waiting on the Creator.
  let needsAttention = 0
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const requests = await getContributorRequests(supabase, user.id)
      needsAttention = requests.filter(r => bucketOf(r.status) === 'needs_you').length
    }
  } catch {
    // A badge is not worth failing the whole shell over.
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        padding: '18px 20px 14px',
        borderBottom: '1px solid var(--line-soft)',
        background: 'var(--bg)',
      }}>
        <span style={{
          fontFamily: 'var(--display)', fontSize: 17, fontWeight: 400,
          letterSpacing: '-0.01em', color: 'var(--ink)',
        }}>
          Curato Studio
        </span>
      </header>
      <main style={{ flex: 1, padding: '0 20px', paddingBottom: 96 }}>
        {children}
      </main>
      <ContributorBottomNav needsAttention={needsAttention} />
    </div>
  )
}
