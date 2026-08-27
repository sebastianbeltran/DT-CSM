import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get('courseId')
  const { data } = await supabase
    .from('schedule_sessions')
    .select('*, attendance_records(student_id)')
    .eq('course_id', courseId!)
    .order('session_date')
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const { course_id, session_date, status, cancellation_reason } = await req.json()
  const { data, error } = await supabase
    .from('schedule_sessions')
    .upsert(
      { course_id, session_date, status: status ?? 'normal', cancellation_reason },
      { onConflict: 'course_id,session_date' }
    )
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function PATCH(req: Request) {
  const { id, ...body } = await req.json()
  const { data, error } = await supabase.from('schedule_sessions').update(body).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
