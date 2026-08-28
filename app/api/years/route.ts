import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import https from 'node:https'

// Next.js 14 patches the global fetch and its internal headers processing
// breaks on POST requests (headers.append error). Use Node's native https
// module instead, which is completely unpatched.
function httpsPost(url: string, body: string, headers: Record<string, string>): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const { hostname, pathname, search } = new URL(url)
    const req = https.request(
      {
        hostname,
        path: pathname + (search ?? ''),
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let text = ''
        res.on('data', (chunk: Buffer) => { text += chunk.toString() })
        res.on('end', () => resolve({ status: res.statusCode ?? 500, text }))
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

export async function POST(req: Request) {
  try {
    const { name } = await req.json()

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim()
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()

    const body = JSON.stringify({ name })
    const { status, text } = await httpsPost(
      `${supabaseUrl}/rest/v1/school_years`,
      body,
      {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=representation',
      }
    )

    if (status >= 400) {
      let msg = text
      try { msg = JSON.parse(text)?.message ?? text } catch {}
      return NextResponse.json({ error: msg }, { status })
    }

    const rows = JSON.parse(text)
    const data = Array.isArray(rows) ? rows[0] : rows
    return NextResponse.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET() {
  const { data } = await supabase.from('school_years').select('*').order('name', { ascending: false })
  return NextResponse.json(data ?? [])
}
