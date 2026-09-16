import { NextRequest, NextResponse } from 'next/server'
import { hashPassword, validateSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { companyAccess, isInstallationAdmin } from '@/lib/companies'
import { companyRoles, can } from '@/lib/company-policy'

type Context = { params: Promise<{ id: string }> }
export async function GET(request: NextRequest, { params }: Context) {
  const session = await validateSession(request.cookies.get('session')?.value || '')
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  if (!await prisma.company.findFirst({ where: { id, ...companyAccess(session.user.id, 'manage') } }))
    return NextResponse.json({ error: 'Company não encontrada ou sem permissão.' }, { status: 404 })
  const members = await prisma.companyMember.findMany({ where: { companyId: id }, select: { role: true, user: { select: { id: true, email: true, name: true } } }, orderBy: { userId: 'asc' } })
  return NextResponse.json({ members, installationAdmin: await isInstallationAdmin(session.user.id) })
}

// Adds an already registered user or changes their role. No email is sent.
export async function PUT(request: NextRequest, { params }: Context) {
  return mutate(request, await params, false)
}
export async function DELETE(request: NextRequest, { params }: Context) {
  return mutate(request, await params, true)
}
async function mutate(request: NextRequest, { id }: { id: string }, remove: boolean) {
  const session = await validateSession(request.cookies.get('session')?.value || '')
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const input = await request.json().catch(() => null)
  if (typeof input?.email !== 'string' || (!remove && !companyRoles.includes(input.role)))
    return NextResponse.json({ error: 'Informe email e papel válidos.' }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) || input.email.length > 254)
    return NextResponse.json({ error: 'Email inválido.' }, { status: 400 })
  const createAccount = !remove && typeof input.password === 'string' && input.password.length > 0
  if (createAccount && (input.password.length < 12 || input.password.length > 128)) return NextResponse.json({ error: 'Use uma senha entre 12 e 128 caracteres.' }, { status: 400 })
  if (createAccount && !await isInstallationAdmin(session.user.id)) return NextResponse.json({ error: 'Apenas o administrador da instalação pode cadastrar contas.' }, { status: 403 })
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`members:${id}`}))::text`
    const actor = await tx.companyMember.findUnique({ where: { companyId_userId: { companyId: id, userId: session.user.id } } })
    if (!actor || !can(actor.role, 'manage')) return { status: 404, error: 'Company não encontrada ou sem permissão.' }
    if (actor.role !== 'owner' && input.role === 'owner') return { status: 403, error: 'Somente um owner pode gerenciar proprietários.' }
    let user = await tx.user.findUnique({ where: { email: input.email.trim().toLowerCase() } })
    if (!user && createAccount) user = await tx.user.upsert({ where: { email: input.email.trim().toLowerCase() }, update: {}, create: { email: input.email.trim().toLowerCase(), password: await hashPassword(input.password) } })
    if (!user) return { status: 404, error: 'Este usuário precisa ter uma conta no SupaPanel.' }
    const target = await tx.companyMember.findUnique({ where: { companyId_userId: { companyId: id, userId: user.id } } })
    if (actor.role !== 'owner' && (target?.role === 'owner' || input.role === 'owner'))
      return { status: 403, error: 'Somente um owner pode gerenciar proprietários.' }
    if (target?.role === 'owner' && (remove || input.role !== 'owner') && await tx.companyMember.count({ where: { companyId: id, role: 'owner' } }) <= 1)
      return { status: 409, error: 'A Company precisa manter pelo menos um owner.' }
    if (remove) await tx.companyMember.deleteMany({ where: { companyId: id, userId: user.id } })
    else await tx.companyMember.upsert({ where: { companyId_userId: { companyId: id, userId: user.id } }, create: { companyId: id, userId: user.id, role: input.role }, update: { role: input.role } })
    return { status: 200 }
  })
  return NextResponse.json(result.error ? { error: result.error } : { success: true }, { status: result.status })
}
