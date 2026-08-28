import { createClient } from '@supabase/supabase-js'

// Next.js 14 patches the global fetch and returns Response objects with
// immutable headers. Supabase internally calls headers.set() which throws.
// Fix: wrap every response in a fresh Response with mutable headers.
async function supabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, { ...init, cache: 'no-store' })
  const body = await res.text()
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
