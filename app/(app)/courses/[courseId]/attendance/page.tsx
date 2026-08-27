import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import AttendanceView from '@/components/AttendanceView'

export const dynamic = 'force-dynamic'

export default async function AttendancePage({ params }: { params: { courseId: string } }) {
  const { courseId } = params

  const [{ data: course }, { data: students }, { data: sessions }] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).single(),
    supabase.from('students').select('*').eq('course_id', courseId).eq('is_archived', false).order('sort_order'),
    supabase
      .from('schedule_sessions')
      .select('*, attendance_records(student_id)')
      .eq('course_id', courseId)
      .order('session_date'),
  ])

  if (!course) notFound()

  return <AttendanceView course={course} students={students ?? []} initialSessions={sessions ?? []} />
}
