import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getStudentScore } from '@/lib/calculations'
import type { GradeColumn } from '@/lib/types'

const round1 = (n: number) => Math.round(Math.round(n * 100) / 10) / 10

// Aplica las notas que el usuario eligió, una por una, desde Phidias.
// Nunca toca la rúbrica (criterion_grades): solo guarda phidias_score en la nota.
export async function POST(req: Request) {
  const { courseId, changes } = (await req.json()) as {
    courseId: string
    changes: { studentId: string; columnId: string; phidiasScore: number }[]
  }
  if (!courseId || !Array.isArray(changes) || changes.length === 0) {
    return NextResponse.json({ error: 'No hay cambios para aplicar.' }, { status: 400 })
  }
  for (const c of changes) {
    if (typeof c.phidiasScore !== 'number' || !Number.isFinite(c.phidiasScore) || c.phidiasScore < 1 || c.phidiasScore > 10) {
      return NextResponse.json({ error: `Nota inválida (${c.phidiasScore}). Debe estar entre 1 y 10.` }, { status: 400 })
    }
  }

  // Validar que estudiantes y evaluaciones pertenecen al curso
  const studentIds = Array.from(new Set(changes.map((c) => c.studentId)))
  const columnIds = Array.from(new Set(changes.map((c) => c.columnId)))
  const [{ data: students }, { data: periods }, { data: columns }] = await Promise.all([
    supabase.from('students').select('id').eq('course_id', courseId).in('id', studentIds),
    supabase.from('periods').select('id').eq('course_id', courseId),
    supabase.from('grade_columns').select('*').in('id', columnIds),
  ])
  const periodIds = new Set((periods ?? []).map((p) => p.id))
  if ((students ?? []).length !== studentIds.length || (columns ?? []).some((c) => !periodIds.has(c.period_id)) || (columns ?? []).length !== columnIds.length) {
    return NextResponse.json({ error: 'Algún estudiante o evaluación no pertenece a este curso.' }, { status: 400 })
  }

  const { data: grades } = await supabase.from('grades').select('*').in('column_id', columnIds).in('student_id', studentIds)
  const gradeIds = (grades ?? []).map((g) => g.id)
  const { data: criterionGrades } = gradeIds.length
    ? await supabase.from('criterion_grades').select('*').in('grade_id', gradeIds)
    : { data: [] }

  const now = new Date().toISOString()
  let applied = 0
  for (const c of changes) {
    const col = (columns ?? []).find((x) => x.id === c.columnId) as GradeColumn
    const grade = (grades ?? []).find((g) => g.student_id === c.studentId && g.column_id === c.columnId)
    const value = round1(c.phidiasScore)

    if (grade) {
      // Si la rúbrica ya da esa nota, no hace falta ajuste
      const rubric = getStudentScore(c.studentId, col, [{ ...grade, phidias_score: null }], criterionGrades ?? [])
      const needsAdjustment = rubric === null || round1(rubric) !== value
      const { error } = await supabase
        .from('grades')
        .update(needsAdjustment ? { phidias_score: value, phidias_adjusted_at: now } : { phidias_score: null, phidias_adjusted_at: null })
        .eq('id', grade.id)
        // .select() evita la respuesta 204 sin cuerpo, que el wrapper de lib/supabase.ts no soporta
        .select('id')
      if (error) return NextResponse.json({ error: error.message, applied }, { status: 500 })
    } else {
      const { error } = await supabase.from('grades').insert({
        student_id: c.studentId,
        column_id: c.columnId,
        score: value,
        phidias_score: value,
        phidias_adjusted_at: now,
        is_manually_adjusted: false,
      })
      if (error) return NextResponse.json({ error: error.message, applied }, { status: 500 })
      await supabase.from('grade_columns').update({ has_grades: true }).eq('id', c.columnId).select('id')
    }
    applied++
  }
  return NextResponse.json({ applied })
}

// Quita el ajuste con Phidias de una nota: vuelve a valer la rúbrica.
export async function DELETE(req: Request) {
  const { grade_id } = await req.json()
  if (!grade_id) return NextResponse.json({ error: 'Falta la nota.' }, { status: 400 })
  const { data, error } = await supabase
    .from('grades')
    .update({ phidias_score: null, phidias_adjusted_at: null })
    .eq('id', grade_id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
