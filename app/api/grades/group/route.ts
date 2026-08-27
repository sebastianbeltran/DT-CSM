import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: Request) {
  const { group_id, column_id, score, criterion_grades } = await req.json()

  // Get group members
  const { data: members } = await supabase
    .from('work_group_members')
    .select('student_id')
    .eq('group_id', group_id)

  if (!members?.length) {
    return NextResponse.json({ error: 'El grupo no tiene integrantes' }, { status: 400 })
  }

  const results = []

  for (const { student_id } of members) {
    // Check if this student has a manually adjusted grade — skip them
    const { data: existing } = await supabase
      .from('grades')
      .select('id, is_manually_adjusted')
      .eq('student_id', student_id)
      .eq('column_id', column_id)
      .single()

    if (existing?.is_manually_adjusted) continue

    // Upsert grade
    const { data: grade } = await supabase
      .from('grades')
      .upsert(
        { student_id, column_id, score, group_id, is_manually_adjusted: false, updated_at: new Date().toISOString() },
        { onConflict: 'student_id,column_id' }
      )
      .select()
      .single()

    if (grade && criterion_grades?.length) {
      const cgs = criterion_grades.map((cg: { criterion_id: string; score: number }) => ({
        grade_id: grade.id,
        criterion_id: cg.criterion_id,
        score: cg.score,
      }))
      await supabase.from('criterion_grades').upsert(cgs, { onConflict: 'grade_id,criterion_id' })
    }

    if (grade) results.push(grade)
  }

  await supabase.from('grade_columns').update({ has_grades: true }).eq('id', column_id)

  return NextResponse.json({ ok: true, updated: results.length, results })
}

// Override: apply group grade ignoring individual adjustments
export async function PUT(req: Request) {
  const { group_id, column_id, score, criterion_grades } = await req.json()

  const { data: members } = await supabase
    .from('work_group_members')
    .select('student_id')
    .eq('group_id', group_id)

  if (!members?.length) {
    return NextResponse.json({ error: 'El grupo no tiene integrantes' }, { status: 400 })
  }

  const results = []

  for (const { student_id } of members) {
    const { data: grade } = await supabase
      .from('grades')
      .upsert(
        { student_id, column_id, score, group_id, is_manually_adjusted: false, updated_at: new Date().toISOString() },
        { onConflict: 'student_id,column_id' }
      )
      .select()
      .single()

    if (grade && criterion_grades?.length) {
      const cgs = criterion_grades.map((cg: { criterion_id: string; score: number }) => ({
        grade_id: grade.id,
        criterion_id: cg.criterion_id,
        score: cg.score,
      }))
      await supabase.from('criterion_grades').upsert(cgs, { onConflict: 'grade_id,criterion_id' })
    }

    if (grade) results.push(grade)
  }

  return NextResponse.json({ ok: true, updated: results.length, results })
}
