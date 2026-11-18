import { Auth, type AuthConfig } from '@auth/core'
import Google from '@auth/core/providers/google'
import { db } from './db.js'

declare module '@auth/core/types' {
  interface Session {
    user: { id: string; email?: string | null; name?: string | null; image?: string | null }
  }
}

function usernameBase(name: string | null | undefined, email: string) {
  const base = (name || email.split('@')[0])
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return base || 'member'
}

/**
 * Finds the profile for a Google account by email, creating one on first sign-in.
 * Matching by email is what keeps users migrated from Supabase on their old UUID.
 */
async function profileIdForSignIn(email: string, name?: string | null, image?: string | null): Promise<string> {
  const sql = db()
  const existing = await sql`SELECT id FROM profiles WHERE lower(email) = lower(${email}) LIMIT 1`
  if (existing[0]) return existing[0].id as string

  const base = usernameBase(name, email)
  for (let attempt = 0; attempt < 6; attempt++) {
    const username = attempt === 0 ? base : `${base}_${Math.floor(1000 + Math.random() * 9000)}`
    const inserted = await sql`
      INSERT INTO profiles (email, username, display_name, avatar_url)
      VALUES (${email}, ${username}, ${name || username}, ${image || null})
      ON CONFLICT DO NOTHING
      RETURNING id`
    if (inserted[0]) return inserted[0].id as string
    // Conflict could be the email (a concurrent first sign-in) — check before retrying.
    const raced = await sql`SELECT id FROM profiles WHERE lower(email) = lower(${email}) LIMIT 1`
    if (raced[0]) return raced[0].id as string
  }
  throw new Error('Could not create a profile with a unique username')
}

export const authConfig: AuthConfig = {
  basePath: '/api/auth',
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    async signIn({ user }) {
      return Boolean(user.email) // Google always provides one; refuse anything that doesn't.
    },
    async jwt({ token, user }) {
      // `user` is only present on the sign-in request.
      if (user?.email) {
        token.uid = await profileIdForSignIn(user.email, user.name, user.image)
      }
      return token
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string
      return session
    },
  },
}

export interface SessionUser {
  id: string
  email: string | null
}

/** Reads the Auth.js session from the request cookies. Returns null when signed out. */
export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const url = new URL('/api/auth/session', request.url)
  const response = await Auth(new Request(url, { headers: request.headers }), authConfig)
  if (!response.ok) return null
  const session = (await response.json()) as { user?: { id?: string; email?: string | null } } | null
  return session?.user?.id ? { id: session.user.id, email: session.user.email ?? null } : null
}
