import { NextRequest, NextResponse } from 'next/server'
import { lookupUserByCode } from '@/lib/actions/sessions'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.trim()
  if (!code) {
    return NextResponse.json({ found: false }, { status: 400 })
  }

  const user = await lookupUserByCode(code)
  if (!user) {
    return NextResponse.json({ found: false })
  }

  return NextResponse.json({
    found: true,
    userId: user.id,
    userCode: user.user_code,
    displayName: user.display_name,
  })
}
