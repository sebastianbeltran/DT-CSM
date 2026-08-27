import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  await supabase.from('school_years').update({ is_active: false }).neq('id', params.id)
  await supabase.from('school_years').update({ is_active: true }).eq('id', params.id)
  return NextResponse.json({ ok: true })
}
