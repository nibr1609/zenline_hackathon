import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SubstituteIQ',
  description: 'AI-powered product substitute intelligence',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className} style={{ margin: 0, background: '#07090f', display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <main style={{ flex: 1, minHeight: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {children}
        </main>
      </body>
    </html>
  )
}
