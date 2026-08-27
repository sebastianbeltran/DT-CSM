'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [loggingOut, setLoggingOut] = useState(false)

  function goHome() {
    router.push('/')
    router.refresh()
  }

  async function handleLogout() {
    setLoggingOut(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-blue-900 text-white px-4 py-3 flex items-center justify-between shadow-lg no-print">
        <button onClick={goHome} className="flex items-center gap-2 font-bold text-lg hover:opacity-80 transition-opacity">
          <span className="text-2xl">📐</span>
          <span>DT CSM</span>
        </button>

        <nav className="flex items-center gap-4">
          <button
            onClick={goHome}
            className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
              pathname === '/' ? 'bg-blue-700' : 'hover:bg-blue-800'
            }`}
          >
            Inicio
          </button>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="text-sm px-3 py-1.5 rounded-md hover:bg-blue-800 transition-colors disabled:opacity-50"
          >
            {loggingOut ? 'Saliendo...' : 'Cerrar sesión'}
          </button>
        </nav>
      </header>

      <main className="flex-1 p-4">{children}</main>
    </div>
  )
}
