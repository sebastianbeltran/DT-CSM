import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const SESSION_COOKIE = 'dt_session'
const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? 'fallback-dev-secret-change-in-prod-32chars'
)

export async function createSession(): Promise<string> {
  const token = await new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret)
  return token
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secret)
    return true
  } catch {
    return false
  }
}

export async function getSession(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return false
  return verifySession(token)
}

export async function requireAuth(): Promise<void> {
  const valid = await getSession()
  if (!valid) redirect('/login')
}

export function checkPassword(input: string): boolean {
  const stored = process.env.ADMIN_PASSWORD ?? ''
  if (!stored) return false
  return input === stored
}

export { SESSION_COOKIE }
