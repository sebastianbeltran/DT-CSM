import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

async function findOrCreatePeriod(courseId: string, name: string, sortOrder: number, weights: unknown, bonusCap: unknown) {
  const { data: existing } = await supabase
    .from('periods')
    .select('id')
    .eq('course_id', courseId)
    .eq('name', name)
    .single()
  if (existing) return existing.id

  const { data } = await supabase
    .from('periods')
    .insert({ course_id: courseId, name, sort_order: sortOrder, grade_weights: weights, bonus_cap: bonusCap })
    .select('id')
    .single()
  return data?.id ?? null
}

async function findOrCreatePeriodCompetency(
  periodId: string,
  competencyKey: string,
  learningObjective: string,
  contents: string | null,
  sortOrder: number
) {
  const { data: existing } = await supabase
    .from('period_competencies')
    .select('id')
    .eq('period_id', periodId)
    .eq('competency_key', competencyKey)
    .single()
  if (existing) return existing.id

  const { data } = await supabase
    .from('period_competencies')
    .insert({ period_id: periodId, competency_key: competencyKey, learning_objective: learningObjective, contents, sort_order: sortOrder })
    .select('id')
    .single()
  return data?.id ?? null
}

async function copyColumn(sourceCol: Record<string, unknown>, targetPeriodId: string, competencyKey: string | null) {
  // Check if column with same name already exists
  const query = supabase
    .from('grade_columns')
    .select('id, has_grades')
    .eq('period_id', targetPeriodId)
    .eq('name', sourceCol.name as string)

  const { data: existing } = competencyKey
    ? await query.eq('competency_key', competencyKey).single()
    : await query.is('competency_key', null).single()

  if (existing) {
    // Update description if no grades yet
    if (!existing.has_grades) {
      await supabase.from('grade_columns').update({ description: sourceCol.description }).eq('id', existing.id)
      // Replace criteria
      const { data: srcCriteria } = await supabase.from('criteria').select('*').eq('column_id', sourceCol.id as string).order('sort_order')
      if (srcCriteria?.length) {
        await supabase.from('criteria').delete().eq('column_id', existing.id)
        await supabase.from('criteria').insert(
          srcCriteria.map((c) => ({ column_id: existing.id, name: c.name, max_score: c.max_score, sort_order: c.sort_order }))
        )
      }
    }
    return 0
  }

  const { data: newCol } = await supabase
    .from('grade_columns')
    .insert({
      competency_key: competencyKey,
      period_id: targetPeriodId,
      name: sourceCol.name,
      description: sourceCol.description,
      type: sourceCol.type,
      sort_order: sourceCol.sort_order,
      has_grades: false,
    })
    .select('id')
    .single()

  if (newCol) {
    const { data: srcCriteria } = await supabase.from('criteria').select('*').eq('column_id', sourceCol.id as string).order('sort_order')
    if (srcCriteria?.length) {
      await supabase.from('criteria').insert(
        srcCriteria.map((c) => ({ column_id: newCol.id, name: c.name, max_score: c.max_score, sort_order: c.sort_order }))
      )
    }
  }
  return 1
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const targetCourseId = params.id
  const { sourceCourseId, sourcePeriodId, competencyKey } = await req.json()

  // ── Single competency copy (from GradeTable "copy to another course") ──
  if (sourcePeriodId && competencyKey) {
    const { data: sourcePeriod } = await supabase.from('periods').select('*').eq('id', sourcePeriodId).single()
    if (!sourcePeriod) return NextResponse.json({ error: 'Periodo no encontrado' }, { status: 404 })

    const { data: sourcePC } = await supabase
      .from('period_competencies').select('*').eq('period_id', sourcePeriodId).eq('competency_key', competencyKey).single()

    const targetPeriodId = await findOrCreatePeriod(targetCourseId, sourcePeriod.name, sourcePeriod.sort_order, sourcePeriod.grade_weights, sourcePeriod.bonus_cap)
    if (!targetPeriodId) return NextResponse.json({ error: 'No se pudo crear el periodo' }, { status: 500 })

    if (sourcePC) {
      await findOrCreatePeriodCompetency(targetPeriodId, competencyKey, sourcePC.learning_objective, sourcePC.contents, sourcePC.sort_order)
    }

    const { data: sourceCols } = await supabase
      .from('grade_columns').select('*').eq('period_id', sourcePeriodId).eq('competency_key', competencyKey).order('sort_order')

    let copied = 0
    for (const col of sourceCols ?? []) {
      copied += await copyColumn(col, targetPeriodId, competencyKey)
    }

    return NextResponse.json({ ok: true, columnsAdded: copied })
  }

  // ── Full course copy ──
  if (sourceCourseId) {
    const { data: sourcePeriods } = await supabase.from('periods').select('*').eq('course_id', sourceCourseId).order('sort_order')
    if (!sourcePeriods?.length) return NextResponse.json({ error: 'El curso origen no tiene periodos' }, { status: 400 })

    let totalColumns = 0

    for (const period of sourcePeriods) {
      const targetPeriodId = await findOrCreatePeriod(targetCourseId, period.name, period.sort_order, period.grade_weights, period.bonus_cap)
      if (!targetPeriodId) continue

      // Copy period_competencies
      const { data: sourceCompetencies } = await supabase
        .from('period_competencies').select('*').eq('period_id', period.id).order('sort_order')

      for (const pc of sourceCompetencies ?? []) {
        await findOrCreatePeriodCompetency(targetPeriodId, pc.competency_key, pc.learning_objective, pc.contents, pc.sort_order)

        // Copy columns for this competency
        const { data: sourceCols } = await supabase
          .from('grade_columns').select('*').eq('period_id', period.id).eq('competency_key', pc.competency_key).order('sort_order')
        for (const col of sourceCols ?? []) {
          totalColumns += await copyColumn(col, targetPeriodId, pc.competency_key)
        }
      }

      // Copy bonus columns (no competency)
      const { data: bonusCols } = await supabase
        .from('grade_columns').select('*').eq('period_id', period.id).is('competency_key', null).eq('type', 'bonus')
      for (const col of bonusCols ?? []) {
        totalColumns += await copyColumn(col, targetPeriodId, null)
      }
    }

    return NextResponse.json({ ok: true, columnsAdded: totalColumns })
  }

  return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
}
