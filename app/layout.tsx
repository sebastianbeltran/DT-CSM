import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DT CSM – Gestión de Notas',
  description: 'Aplicación de gestión de notas para Design & Technology',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className="bg-gray-50 text-gray-900">{children}</body>
    </html>
  )
}
