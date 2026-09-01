import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()

  if (!q || q.length < 2) return NextResponse.json([])

  const { data: students, error } = await supabase
    .from('students')
    .select('id, name, course_id')
    .eq('is_archived', false)
    .ilike('name', `%${q}%`)
    .order('name')
    .limit(20)

  if (error || !students?.length) return NextResponse.json([])

  const courseIds = [...new Set(students.map((s) => s.course_id))]
  const { data: courses } = await supabase
    .from('courses')
    .select('id, name')
    .in('id', courseIds)

  const courseMap = Object.fromEntries((courses ?? []).map((c) => [c.id, c.name]))

  return NextResponse.json(
    students.map((s) => ({ ...s, courses: { id: s.course_id, name: courseMap[s.course_id] ?? '' } }))
  )
}
