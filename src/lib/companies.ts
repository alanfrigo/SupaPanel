import { prisma } from './db'
import { allowedRoles, type CompanyAction } from './company-policy'

// Additive, idempotent adoption: never touches stack files, names or secrets.
export async function adoptLegacyProjects(userId: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`companies:${userId}`}))::text`
    const legacy = await tx.project.findMany({ where: { ownerId: userId, branch: null } })
    const membership = await tx.companyMember.findFirst({ where: { userId } })
    if (!legacy.length && membership) return
    const company = await tx.company.upsert({
      where: { legacyOwnerId: userId }, update: {},
      create: { name: 'Minha Company', legacyOwnerId: userId,
        members: { create: { userId, role: 'owner' } } },
    })
    for (const instance of legacy) {
      await tx.managedProject.create({ data: {
        name: instance.name, description: instance.description, companyId: company.id,
        branches: { create: { name: 'main', instanceId: instance.id } },
      } })
    }
  })
}

export function companyAccess(userId: string, action: CompanyAction = 'read') {
  return { members: { some: { userId, role: { in: allowedRoles(action) } } } }
}

export async function findInstance(id: string, userId: string, action: CompanyAction = 'operate', allowFailed = false) {
  // Also adopts installations reached by old bookmarked URLs before visiting the dashboard.
  await adoptLegacyProjects(userId)
  if (action === 'operate') {
    const busy = await prisma.branchJob.findFirst({ where: { OR: [{ sourceId: id }, { targetId: id }], AND: [{ OR: [{ status: { in: ['queued', 'running'] } }, { pausedServices: { isEmpty: false } }] }] } })
    if (busy) return null
  }
  return prisma.project.findFirst({
    where: { id, ...(action === 'operate' ? { status: { notIn: allowFailed ? ['provisioning'] : ['provisioning', 'failed'] } } : {}), branch: { project: { company: companyAccess(userId, action) } } },
    include: { branch: { include: { project: { include: { company: { select: { id: true, name: true } } } } } } },
  })
}

export async function isInstallationAdmin(userId: string) {
  // Registration already treats the first account as the installation owner.
  const first = await prisma.user.findFirst({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } })
  return first?.id === userId
}
