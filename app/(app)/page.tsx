import { supabase } from '@/lib/supabase'
import Dashboard from '@/components/Dashboard'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [{ data: years }, { data: courses }] = await Promise.all([
    supabase.from('school_years').select('*').order('name', { ascending: false }),
    supabase.from('courses').select('*, school_years(name)').order('name'),
  ])

  return <Dashboard initialYears={years ?? []} initialCourses={courses ?? []} />
}
