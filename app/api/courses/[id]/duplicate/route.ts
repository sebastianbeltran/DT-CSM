import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

async function findOrCreatePeriod(courseId: string, name: string, sortOrder: number, weights: any, bonusCap: any) {
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

async function findOrCreatePhase(periodId: string, name: string, sortOrder: number) {
  const { data: existing } = await supabase
    .from('phases')
    .select('id')
    .eq('period_id', periodId)
    .eq('name', name)
    .single()

  if (existing) return existing.id

  const { data } = await supabase
    .from('phases')
    .insert({ period_id: periodId, name, sort_order: sortOrder })
    .select('id')
    .single()

  return data?.id ?? null
}

async function copyColumnsToPhase(sourcePhaseId: string, targetPhaseId: string, targetPeriodId: string) {
  const { data: sourceCols } = await supabase
    .from('grade_columns')
    .select('*')
    .eq('phase_id', sourcePhaseId)
    .order('sort_order')

  let copied = 0

  for (const col of sourceCols ?? []) {
    // Check if column with same name already exists in target phase
    const { data: existing } = await supabase
      .from('grade_columns')
      .select('id')
      .eq('phase_id', targetPhaseId)
      .eq('name', col.name)
      .single()

    if (existing) continue // already exists, skip

    const { data: newCol } = await supabase
      .from('grade_columns')
      .insert({
        phase_id: targetPhaseId,
        period_id: targetPeriodId,
        name: col.name,
        description: col.description,
        type: col.type,
        sort_order: col.sort_order,
        has_grades: false,
      })
      .select('id')
      .single()

    copied++

    // Copy criteria for sumativas
    if (col.type === 'sumativa' && newCol) {
      const { data: criteria } = await supabase
        .from('criteria')
        .select('*')
        .eq('column_id', col.id)
        .order('sort_order')

      if (criteria?.length) {
        await supabase.from('criteria').insert(
          criteria.map((c) => ({
            column_id: newCol.id,
            name: c.name,
            max_score: c.max_score,
            sort_order: c.sort_order,
          }))
        )
      }
    }
  }

  return copied
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const targetCourseId = params.id
  const { sourceCourseId, phaseId, columnId } = await req.json()

  // SINGLE COLUMN copy
  if (columnId) {
    const { data: sourceCol } = await supabase
      .from('grade_columns')
      .select('*, phases(*, periods(*))')
      .eq('id', columnId)
      .single()

    if (!sourceCol) return NextResponse.json({ error: 'Columna no encontrada' }, { status: 404 })

    const sourcePhase = (sourceCol as any).phases
    const sourcePeriod = sourcePhase?.periods

    if (!sourcePhase || !sourcePeriod) {
      return NextResponse.json({ error: 'No se pudo obtener la fase/periodo de la columna' }, { status: 500 })
    }

    const targetPeriodId = await findOrCreatePeriod(
      targetCourseId, sourcePeriod.name, sourcePeriod.sort_order,
      sourcePeriod.grade_weights, sourcePeriod.bonus_cap
    )
    if (!targetPeriodId) return NextResponse.json({ error: 'No se pudo crear el periodo' }, { status: 500 })

    const targetPhaseId = await findOrCreatePhase(targetPeriodId, sourcePhase.name, sourcePhase.sort_order)
    if (!targetPhaseId) return NextResponse.json({ error: 'No se pudo crear la fase' }, { status: 500 })

    // Check if column already exists
    const { data: existingCol } = await supabase
      .from('grade_columns')
      .select('id, has_grades')
      .eq('phase_id', targetPhaseId)
      .eq('name', sourceCol.name)
      .single()

    if (existingCol) {
      // Update description only if no grades yet
      if (!existingCol.has_grades) {
        await supabase.from('grade_columns').update({
          description: sourceCol.description,
        }).eq('id', existingCol.id)

        // Replace criteria
        if (sourceCol.type === 'sumativa') {
          const { data: sourceCriteria } = await supabase
            .from('criteria').select('*').eq('column_id', columnId).order('sort_order')
          await supabase.from('criteria').delete().eq('column_id', existingCol.id)
          if (sourceCriteria?.length) {
            await supabase.from('criteria').insert(
              sourceCriteria.map((c) => ({ column_id: existingCol.id, name: c.name, max_score: c.max_score, sort_order: c.sort_order }))
            )
          }
        }
        return NextResponse.json({ ok: true, action: 'updated', columnName: sourceCol.name })
      } else {
        return NextResponse.json({ ok: true, action: 'skipped_has_grades', columnName: sourceCol.name })
      }
    }

    // Create new column
    const { data: newCol } = await supabase
      .from('grade_columns')
      .insert({
        phase_id: targetPhaseId, period_id: targetPeriodId,
        name: sourceCol.name, description: sourceCol.description,
        type: sourceCol.type, sort_order: sourceCol.sort_order, has_grades: false,
      })
      .select('id').single()

    if (newCol && sourceCol.type === 'sumativa') {
      const { data: sourceCriteria } = await supabase
        .from('criteria').select('*').eq('column_id', columnId).order('sort_order')
      if (sourceCriteria?.length) {
        await supabase.from('criteria').insert(
          sourceCriteria.map((c) => ({ column_id: newCol.id, name: c.name, max_score: c.max_score, sort_order: c.sort_order }))
        )
      }
    }

    return NextResponse.json({ ok: true, action: 'created', columnName: sourceCol.name })
  }

  // SINGLE PHASE copy
  if (phaseId) {
    const { data: sourcePhase } = await supabase
      .from('phases')
      .select('*, periods(*)')
      .eq('id', phaseId)
      .single()

    if (!sourcePhase) return NextResponse.json({ error: 'Fase no encontrada' }, { status: 404 })

    const sourcePeriod = (sourcePhase as any).periods

    // Find or create matching period in target
    const targetPeriodId = await findOrCreatePeriod(
      targetCourseId,
      sourcePeriod.name,
      sourcePeriod.sort_order,
      sourcePeriod.grade_weights,
      sourcePeriod.bonus_cap
    )

    if (!targetPeriodId) return NextResponse.json({ error: 'No se pudo crear el periodo destino' }, { status: 500 })

    // Find or create matching phase in target period
    const targetPhaseId = await findOrCreatePhase(targetPeriodId, sourcePhase.name, sourcePhase.sort_order)

    if (!targetPhaseId) return NextResponse.json({ error: 'No se pudo crear la fase destino' }, { status: 500 })

    const copied = await copyColumnsToPhase(phaseId, targetPhaseId, targetPeriodId)

    return NextResponse.json({ ok: true, columnsAdded: copied, phaseName: sourcePhase.name })
  }

  // FULL COURSE copy (merge mode — never overwrites existing)
  const { data: sourcePeriods } = await supabase
    .from('periods')
    .select('*')
    .eq('course_id', sourceCourseId)
    .order('sort_order')

  if (!sourcePeriods?.length) {
    return NextResponse.json({ error: 'El curso origen no tiene periodos' }, { status: 400 })
  }

  let totalColumns = 0

  for (const period of sourcePeriods) {
    const targetPeriodId = await findOrCreatePeriod(
      targetCourseId,
      period.name,
      period.sort_order,
      period.grade_weights,
      period.bonus_cap
    )
    if (!targetPeriodId) continue

    const { data: phases } = await supabase
      .from('phases')
      .select('*')
      .eq('period_id', period.id)
      .order('sort_order')

    for (const phase of phases ?? []) {
      const targetPhaseId = await findOrCreatePhase(targetPeriodId, phase.name, phase.sort_order)
      if (!targetPhaseId) continue
      totalColumns += await copyColumnsToPhase(phase.id, targetPhaseId, targetPeriodId)
    }

    // Bonus columns
    const { data: bonusCols } = await supabase
      .from('grade_columns')
      .select('*')
      .eq('period_id', period.id)
      .is('phase_id', null)
      .eq('type', 'bonus')

    for (const col of bonusCols ?? []) {
      const { data: existing } = await supabase
        .from('grade_columns')
        .select('id')
        .eq('period_id', targetPeriodId)
        .eq('name', col.name)
        .is('phase_id', null)
        .single()

      if (existing) continue

      await supabase.from('grade_columns').insert({
        period_id: targetPeriodId,
        name: col.name,
        description: col.description,
        type: 'bonus',
        sort_order: col.sort_order,
        has_grades: false,
      })
      totalColumns++
    }
  }

  return NextResponse.json({ ok: true, columnsAdded: totalColumns })
}
