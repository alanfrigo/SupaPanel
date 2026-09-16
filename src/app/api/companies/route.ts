import { NextRequest, NextResponse } from 'next/server'
import { validateSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { adoptLegacyProjects, companyAccess, isInstallationAdmin } from '@/lib/companies'

export async function GET(request: NextRequest) {
  const session = await validateSession(request.cookies.get('session')?.value || '')
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await adoptLegacyProjects(session.user.id)
  const companies = await prisma.company.findMany({
    where: companyAccess(session.user.id), orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, members: { where: { userId: session.user.id }, select: { role: true } },
      _count: { select: { projects: true } } },
  })
  return NextResponse.json({ companies: companies.map(c => ({ id: c.id, name: c.name, role: c.members[0].role, projectCount: c._count.projects })), installationAdmin: await isInstallationAdmin(session.user.id) })
}
export async function POST(request: NextRequest) {
  const session = await validateSession(request.cookies.get('session')?.value || '')
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const input = await request.json().catch(() => null)
  if (typeof input?.name !== 'string' || !input.name.trim() || input.name.trim().length > 80)
    return NextResponse.json({ error: 'Informe um nome de até 80 caracteres.' }, { status: 400 })
  await adoptLegacyProjects(session.user.id)
  const company = await prisma.company.create({ data: { name: input.name.trim(), members: { create: { userId: session.user.id, role: 'owner' } } }, select: { id: true, name: true } })
  return NextResponse.json({ company }, { status: 201 })
}
