import { NextResponse } from 'next/server'
import { createSession, checkPassword, SESSION_COOKIE } from '@/lib/auth'

export async function POST(req: Request) {
  const { password } = await req.json()

  if (!checkPassword(password)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = await createSession()

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })

  return res
}
