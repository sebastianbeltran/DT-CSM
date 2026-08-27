import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const periodId = searchParams.get('periodId')
  const columnId = searchParams.get('columnId')
  const studentId = searchParams.get('studentId')

  let query = supabase.from('grades').select('*')

  if (periodId) {
    // Get all column IDs for this period first
    const { data: cols } = await supabase.from('grade_columns').select('id').eq('period_id', periodId)
    if (!cols?.length) return NextResponse.json([])
    query = query.in('column_id', cols.map((c) => c.id))
  }

  if (columnId) query = query.eq('column_id', columnId)
  if (studentId) query = query.eq('student_id', studentId)

  const { data } = await query
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const { student_id, column_id, score, group_id, is_manually_adjusted } = await req.json()

  const { data, error } = await supabase
    .from('grades')
    .upsert(
      {
        student_id,
        column_id,
        score,
        group_id,
        is_manually_adjusted: is_manually_adjusted ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,column_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Mark column as having grades
  await supabase.from('grade_columns').update({ has_grades: true }).eq('id', column_id)

  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const { student_id, column_id } = await req.json()
  await supabase.from('grades').delete().eq('student_id', student_id).eq('column_id', column_id)
  return NextResponse.json({ ok: true })
}
