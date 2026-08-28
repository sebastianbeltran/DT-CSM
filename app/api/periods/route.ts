import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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

  // Default color ranges if none exist for this course
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
