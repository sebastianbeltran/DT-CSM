import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: Request) {
  const { course_id, name } = await req.json()

  const { data: existing } = await supabase
    .from('students')
    .select('sort_order')
    .eq('course_id', course_id)
    .eq('is_archived', false)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('students')
    .insert({ course_id, name, sort_order: nextOrder })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
