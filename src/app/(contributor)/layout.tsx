export default function ContributorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--line-soft)',
        background: 'var(--bg)',
      }}>
        <span style={{
          fontFamily: 'var(--display)', fontSize: 18, fontWeight: 400,
          letterSpacing: '-0.01em', color: 'var(--ink)',
        }}>
          Curato Studio
        </span>
      </header>
      <main style={{ flex: 1, padding: '0 20px' }}>
        {children}
      </main>
    </div>
  )
}
