import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')
  const periodId = searchParams.get('periodId')

  let query = supabase.from('reports').select('*')
  if (studentId) query = query.eq('student_id', studentId)
  if (periodId) query = query.eq('period_id', periodId)

  const { data } = await query
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const { student_id, period_id, content } = await req.json()
  const { data, error } = await supabase
    .from('reports')
    .upsert(
      { student_id, period_id, content, updated_at: new Date().toISOString() },
      { onConflict: 'student_id,period_id' }
    )
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
