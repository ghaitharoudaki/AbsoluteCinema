import { Auth } from '@auth/core'
import { authConfig } from './_lib/auth.js'

// All /api/auth/* paths are rewritten here (vercel.json); Auth.js routes on the
// original URL: /signin/google, /callback/google, /session, /csrf, /signout.
const handler = (request: Request) => Auth(request, authConfig)

export const GET = handler
export const POST = handler
