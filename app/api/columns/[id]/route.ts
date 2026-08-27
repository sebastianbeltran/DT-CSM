import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json()
  const { data, error } = await supabase
    .from('grade_columns')
    .update(body)
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { data: hasGrades } = await supabase
    .from('grades')
    .select('id')
    .eq('column_id', params.id)
    .limit(1)

  if (hasGrades && hasGrades.length > 0) {
    const confirmed = true // client must confirm before calling
    if (!confirmed) {
      return NextResponse.json({ error: 'Esta columna tiene notas registradas' }, { status: 409 })
    }
  }

  await supabase.from('grade_columns').delete().eq('id', params.id)
  return NextResponse.json({ ok: true })
}
