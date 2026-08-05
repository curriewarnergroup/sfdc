import { NextRequest, NextResponse } from 'next/server'
import { runShiftCloseout } from '@/lib/actions/shift-closeout'

// Runs hourly (see vercel.json). The job is now idempotent and shift-aware:
// it closes a session only once that session's own shift has ended plus a
// grace period, so running it more often is harmless and running it at a
// fixed clock time is no longer required.
//
// Secure with a shared CRON_SECRET env var. Note that if CRON_SECRET is
// unset the endpoint is open — set it in every environment.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.warn('[shift-closeout] CRON_SECRET is not set — endpoint is unauthenticated')
  } else if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runShiftCloseout()
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}

// Vercel Cron issues GET.
export async function GET(req: NextRequest) {
  return POST(req)
}
