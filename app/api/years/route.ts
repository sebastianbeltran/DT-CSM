import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: Request) {
  try {
    const { name } = await req.json()

    // Use raw fetch to bypass any Supabase client issues
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    const res = await fetch(`${supabaseUrl}/rest/v1/school_years`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ name }),
      cache: 'no-store',
    })

    const text = await res.text()

    if (!res.ok) {
      let msg = text
      try { msg = JSON.parse(text)?.message ?? text } catch {}
      return NextResponse.json({ error: msg }, { status: res.status })
    }

    const rows = JSON.parse(text)
    const data = Array.isArray(rows) ? rows[0] : rows
    return NextResponse.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET() {
  const { data } = await supabase.from('school_years').select('*').order('name', { ascending: false })
  return NextResponse.json(data ?? [])
}
