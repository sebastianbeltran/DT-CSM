import { createClient } from '@supabase/supabase-js'

// Next.js 14 patches the global fetch and returns Response objects with
// immutable headers. Supabase internally calls headers.set() which throws.
// Fix: wrap every response in a fresh Response with mutable headers.
async function supabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, { ...init, cache: 'no-store' })
  // 204/205/304 no pueden llevar cuerpo: new Response('', { status: 204 }) lanza error y
  // Supabase lo reportaba como fallo aunque el delete/update sí se aplicó.
  const nullBody = res.status === 204 || res.status === 205 || res.status === 304
  const body = nullBody ? null : await res.text()
  return new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers: new Headers(res.headers),
  })
}

function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    throw new Error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: supabaseFetch },
  })
}

export const supabase = createSupabaseClient()
