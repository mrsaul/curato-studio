import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Curato Studio',
  description: 'Turn your idea into an on-brand post',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
