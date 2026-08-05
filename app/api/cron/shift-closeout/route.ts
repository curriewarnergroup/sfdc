import { NextRequest, NextResponse } from 'next/server'
import { runShiftCloseout } from '@/lib/actions/admin'

// Called by Vercel Cron or an external scheduler at shift end
// Secure with a shared CRON_SECRET env var
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runShiftCloseout()
  return NextResponse.json(result)
}

// Also allow GET for Vercel Cron (which uses GET by default)
export async function GET(req: NextRequest) {
  return POST(req)
}
