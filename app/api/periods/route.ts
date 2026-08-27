import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { DEFAULT_PHASES } from '@/lib/types'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get('courseId')
  const { data } = await supabase.from('periods').select('*').eq('course_id', courseId!).order('sort_order')
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const { course_id, name, sort_order } = await req.json()
  const { data: period, error } = await supabase
    .from('periods')
    .insert({ course_id, name, sort_order: sort_order ?? 0 })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Auto-create default DT phases with default columns
  for (let i = 0; i < DEFAULT_PHASES.length; i++) {
    const { data: phase } = await supabase
      .from('phases')
      .insert({ period_id: period.id, name: DEFAULT_PHASES[i], sort_order: i })
      .select()
      .single()

    if (phase) {
      // Default: 1 formativa + 1 sumativa per phase
      await supabase.from('grade_columns').insert([
        { phase_id: phase.id, period_id: period.id, name: 'Formativa 1', type: 'formativa', sort_order: 0 },
        { phase_id: phase.id, period_id: period.id, name: 'Sumativa 1', type: 'sumativa', sort_order: 1 },
      ])
    }
  }

  // Default color ranges for this period's course
  const { data: existingRanges } = await supabase
    .from('color_ranges')
    .select('id')
    .eq('course_id', course_id)
    .is('period_id', null)
    .limit(1)

  if (!existingRanges?.length) {
    await supabase.from('color_ranges').insert([
      { course_id, label: 'En riesgo', min_score: 0, max_score: 6.4, color: '#fca5a5', sort_order: 0 },
      { course_id, label: 'En proceso', min_score: 6.5, max_score: 8.0, color: '#fde68a', sort_order: 1 },
      { course_id, label: 'Aprobado', min_score: 8.01, max_score: 10.0, color: '#bbf7d0', sort_order: 2 },
    ])
  }

  return NextResponse.json(period)
}
