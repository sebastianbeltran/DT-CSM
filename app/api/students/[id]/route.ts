import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json()

  if (body.course_id) {
    const { data: existing } = await supabase
      .from('students')
      .select('sort_order')
      .eq('course_id', body.course_id)
      .eq('is_archived', false)
      .order('sort_order', { ascending: false })
      .limit(1)
    body.sort_order = (existing?.[0]?.sort_order ?? -1) + 1
  }

  const { data, error } = await supabase.from('students').update(body).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

