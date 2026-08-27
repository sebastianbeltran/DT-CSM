import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import CourseView from '@/components/CourseView'

export const dynamic = 'force-dynamic'

export default async function CoursePage({ params }: { params: { courseId: string } }) {
  const { courseId } = params

  const [
    { data: course },
    { data: students },
    { data: periods },
    { data: groups },
  ] = await Promise.all([
    supabase.from('courses').select('*, school_years(name)').eq('id', courseId).single(),
    supabase.from('students').select('*').eq('course_id', courseId).eq('is_archived', false).order('sort_order'),
    supabase.from('periods').select('*').eq('course_id', courseId).order('sort_order'),
    supabase.from('work_groups').select('*, work_group_members(student_id)').eq('course_id', courseId),
  ])

  if (!course) notFound()

  return (
    <CourseView
      course={course}
      initialStudents={students ?? []}
      initialPeriods={periods ?? []}
      initialGroups={groups ?? []}
    />
  )
}
