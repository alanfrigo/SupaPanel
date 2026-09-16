import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { validateSession } from '@/lib/auth'
import { deployProject } from '@/lib/project'

interface RouteContext {
  params: Promise<{
    id: string
  }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const sessionToken = request.cookies.get('session')?.value
    
    if (!sessionToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const session = await validateSession(sessionToken)
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      )
    }

    if (!await prisma.project.findFirst({ where: { id, ownerId: session.user.id } })) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const result = await deployProject(id)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Deploy project error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}