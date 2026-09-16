import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { validateSession } from '@/lib/auth'
import { deleteProject } from '@/lib/project'

interface RouteContext {
  params: Promise<{
    id: string
  }>
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
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

    const result = await deleteProject(id)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete project error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await validateSession(request.cookies.get('session')?.value || '')
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const project = await prisma.project.findFirst({ where: { id, ownerId: session.user.id } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  return NextResponse.json({ project, proxyMode: process.env.PROXY_MODE || 'standalone' })
}
