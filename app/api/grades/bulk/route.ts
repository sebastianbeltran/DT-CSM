import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Save criterion grades for a student in a sumativa column
export async function POST(req: Request) {
  const { grade_id, criterion_grades } = await req.json()

  if (!grade_id || !criterion_grades) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  }

  const upserts = criterion_grades.map((cg: { criterion_id: string; score: number }) => ({
    grade_id,
    criterion_id: cg.criterion_id,
    score: cg.score,
  }))

  const { data, error } = await supabase
    .from('criterion_grades')
    .upsert(upserts, { onConflict: 'grade_id,criterion_id' })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Compute total and update grade.score
  const total = criterion_grades.reduce((sum: number, cg: { score: number }) => sum + Number(cg.score), 0)
  await supabase.from('grades').update({ score: total, updated_at: new Date().toISOString() }).eq('id', grade_id)

  return NextResponse.json(data)
}
