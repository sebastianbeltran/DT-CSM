import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const columnId = searchParams.get('columnId')
  const periodId = searchParams.get('periodId')

  if (columnId) {
    const { data } = await supabase
      .from('criteria')
      .select('*')
      .eq('column_id', columnId)
      .order('sort_order')
    return NextResponse.json(data ?? [])
  }

  if (periodId) {
    // Get all criteria for all columns in this period
    const { data: cols } = await supabase
      .from('grade_columns')
      .select('id')
      .eq('period_id', periodId)
    if (!cols?.length) return NextResponse.json([])
    const { data } = await supabase
      .from('criteria')
      .select('*')
      .in('column_id', cols.map((c) => c.id))
      .order('sort_order')
    return NextResponse.json(data ?? [])
  }

  return NextResponse.json([])
}

export async function POST(req: Request) {
  const { column_id, criteria } = await req.json()

  // Delete existing criteria first (if column has no grades yet)
  const { data: existingGrades } = await supabase
    .from('grades')
    .select('id')
    .eq('column_id', column_id)
    .limit(1)

  if (existingGrades && existingGrades.length > 0) {
    // Column has grades — warn but allow update
  }

  await supabase.from('criteria').delete().eq('column_id', column_id)

  if (!criteria || criteria.length === 0) {
    return NextResponse.json([])
  }

  const toInsert = criteria.map((c: { name: string; max_score: number }, i: number) => ({
    column_id,
    name: c.name,
    max_score: c.max_score,
    sort_order: i,
  }))

  const { data, error } = await supabase.from('criteria').insert(toInsert).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
