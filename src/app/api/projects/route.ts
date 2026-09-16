import { adoptLegacyProjects, companyAccess } from '@/lib/companies'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { validateSession } from '@/lib/auth'
import { createProject } from '@/lib/project'

export async function GET(request: NextRequest) {
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

    await adoptLegacyProjects(session.user.id)
    const companyId = request.nextUrl.searchParams.get('companyId')
    const projects = await prisma.project.findMany({
      where: { branch: { project: { ...(companyId ? { companyId } : {}), company: companyAccess(session.user.id) } } },
      include: { branch: { include: { project: { include: { company: { select: { id: true, name: true } } } } } } },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ projects })
  } catch (error) {
    console.error('Get projects error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
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

    const { name, description = '', companyId } = await request.json()

    if (typeof name !== 'string' || !name.trim() || name.length > 80 || typeof description !== 'string' || description.length > 500) {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 }
      )
    }

    if (typeof companyId !== 'string') return NextResponse.json({ error: 'Escolha uma Company.' }, { status: 400 })
    const company = await prisma.company.findFirst({ where: { id: companyId, ...companyAccess(session.user.id, 'operate') } })
    if (!company) return NextResponse.json({ error: 'Company não encontrada ou sem permissão.' }, { status: 404 })
    const result = await createProject(name.trim(), session.user.id, description, companyId)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({ project: result.project })
  } catch (error) {
    console.error('Create project error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}