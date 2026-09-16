import { NextRequest, NextResponse } from 'next/server'
import { runShiftCloseout } from '@/lib/actions/admin'

// Called by Vercel Cron or an external scheduler at shift end
// Secure with a shared CRON_SECRET env var
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET

  // Fail closed: with no configured secret there is nothing to check the
  // caller against, so refuse rather than silently running unauthenticated.
  if (!cronSecret) {
    console.error('[v0] CRON_SECRET is not set — refusing to run shift closeout.')
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runShiftCloseout()
  return NextResponse.json(result)
}

// Also allow GET for Vercel Cron (which uses GET by default)
export async function GET(req: NextRequest) {
  return POST(req)
}
