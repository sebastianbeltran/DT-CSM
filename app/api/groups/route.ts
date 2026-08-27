import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get('courseId')
  const { data } = await supabase
    .from('work_groups')
    .select('*, work_group_members(student_id)')
    .eq('course_id', courseId!)
    .order('name')
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const { course_id, name, member_ids } = await req.json()
  const { data: group, error } = await supabase
    .from('work_groups')
    .insert({ course_id, name })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (member_ids?.length) {
    await supabase.from('work_group_members').insert(
      member_ids.map((sid: string) => ({ group_id: group.id, student_id: sid }))
    )
  }

  return NextResponse.json(group)
}
