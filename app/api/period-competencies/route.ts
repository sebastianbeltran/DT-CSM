import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const periodId = searchParams.get('periodId')
  const { data } = await supabase
    .from('period_competencies')
    .select('*')
    .eq('period_id', periodId!)
    .order('sort_order')
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const { period_id, competencies } = await req.json()
  const rows = competencies.map((c: {
    competency_key: string
    learning_objective: string
    contents?: string
  }, i: number) => ({
    period_id,
    competency_key: c.competency_key,
    learning_objective: c.learning_objective,
    contents: c.contents ?? null,
    sort_order: i,
  }))
  const { data, error } = await supabase
    .from('period_competencies')
    .insert(rows)
    .select()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
