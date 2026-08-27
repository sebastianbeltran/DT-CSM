import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const periodId = searchParams.get('periodId')

  if (!periodId) {
    return NextResponse.json([])
  }

  // Get all grades for this period's columns, then get criterion grades
  const { data: periodColumns } = await supabase
    .from('grade_columns')
    .select('id')
    .eq('period_id', periodId)

  if (!periodColumns?.length) return NextResponse.json([])

  const columnIds = periodColumns.map((c) => c.id)

  const { data: periodGrades } = await supabase
    .from('grades')
    .select('id')
    .in('column_id', columnIds)

  if (!periodGrades?.length) return NextResponse.json([])

  const gradeIds = periodGrades.map((g) => g.id)

  const { data } = await supabase
    .from('criterion_grades')
    .select('*')
    .in('grade_id', gradeIds)

  return NextResponse.json(data ?? [])
}
