import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  await supabase.from('school_years').delete().eq('id', params.id)
  return NextResponse.json({ ok: true })
}
