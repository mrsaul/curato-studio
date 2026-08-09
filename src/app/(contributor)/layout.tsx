import ContributorBottomNav from './BottomNav'

export default function ContributorLayout({ children }: { children: React.ReactNode }) {
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
      <ContributorBottomNav />
    </div>
  )
}
