import { findInstance } from '@/lib/companies'
import { NextRequest, NextResponse } from 'next/server'
import { validateSession } from '@/lib/auth'
import { pauseProject } from '@/lib/project'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await validateSession(request.cookies.get('session')?.value || '')
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  if (!await findInstance(id, session.user.id)) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  const result = await pauseProject(id)
  return NextResponse.json(result, { status: result.success ? 200 : 500 })
}
