import { requireAuth } from '@/lib/auth'
import AppShell from '@/components/AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth()
  return <AppShell>{children}</AppShell>
}
