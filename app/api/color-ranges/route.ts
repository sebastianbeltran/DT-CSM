import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get('courseId')
  const { data } = await supabase
    .from('color_ranges')
    .select('*')
    .eq('course_id', courseId!)
    .order('sort_order')
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const { course_id, ranges } = await req.json()
  // Replace all ranges for this course
  await supabase.from('color_ranges').delete().eq('course_id', course_id)
  if (ranges && ranges.length > 0) {
    await supabase.from('color_ranges').insert(
      ranges.map((r: { label: string; min_score: number; max_score: number; color: string }, i: number) => ({
        ...r, course_id, sort_order: i,
      }))
    )
  }
  const { data } = await supabase.from('color_ranges').select('*').eq('course_id', course_id).order('sort_order')
  return NextResponse.json(data ?? [])
}
