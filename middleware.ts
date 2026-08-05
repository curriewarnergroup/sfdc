import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Guard: if Supabase env vars are missing (e.g. during build or preview
  // without integration), skip session refresh to avoid a middleware crash.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next()
  }

  try {
    // Race the Supabase session refresh against a timeout. If the auth
    // network call hangs, fall through with a normal response instead of
    // letting the whole middleware invocation time out (504 GATEWAY_TIMEOUT).
    const timeout = new Promise<NextResponse>((resolve) =>
      setTimeout(() => resolve(NextResponse.next()), 3000),
    )
    return await Promise.race([updateSession(request), timeout])
  } catch {
    return NextResponse.next()
  }
}

export const config = {
  // Only run middleware on routes that use Supabase Auth (admin console).
  // Kiosk and QC use cookie-based auth handled in RSC layouts, not middleware.
  matcher: ['/admin/:path*', '/protected/:path*'],
}
