import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { adoptLegacyProjects, findInstance } from '../src/lib/companies'
import { prisma } from '../src/lib/db'
import { GET as listCompanies, POST as createCompany } from '../src/app/api/companies/route'
import { GET as listProjects, POST as createProject } from '../src/app/api/projects/route'
import { GET as readEnv, POST as saveEnv } from '../src/app/api/projects/[id]/env/route'
import { PUT as member, DELETE as removeMember } from '../src/app/api/companies/[id]/members/route'
import { PUT as dns } from '../src/app/api/settings/dns-target/route'
import { POST as deploy } from '../src/app/api/projects/[id]/deploy/route'
import { POST as pause } from '../src/app/api/projects/[id]/status/route'
import { GET as connections, PUT as publishPorts } from '../src/app/api/projects/[id]/connections/route'
import { DELETE as deleteInstance } from '../src/app/api/projects/[id]/route'
import { POST as database } from '../src/app/api/projects/[id]/database/route'
import { POST as createBranch, GET as listBranches, PATCH as recoverBranch } from '../src/app/api/projects/[id]/branches/route'
import { PUT as domain } from '../src/app/api/projects/[id]/domain/route'

// Opt-in: DATABASE_URL must point to an isolated test database.
test('Companies: legacy adoption, isolation, roles, revocation and last owner', { skip: process.env.COMPANY_INTEGRATION !== '1' }, async () => {
  const db = new PrismaClient()
  const prefix = `company-test-${randomUUID()}`
  const users: string[] = []
  const companyIds: string[] = []
  const instanceIds: string[] = []
  const request = (token: string, method = 'GET', body?: unknown, query = '') => new NextRequest(`http://localhost/api/test${query}`, { method, headers: { cookie: `session=${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const context = (id: string) => ({ params: Promise.resolve({ id }) })
  try {
    for (const name of ['alice', 'bob', 'viewer']) {
      const user = await db.user.create({ data: { email: `${prefix}-${name}@test.local`, password: 'unused' } })
      users.push(user.id)
      await db.session.create({ data: { userId: user.id, token: `${prefix}-${name}`, expiresAt: new Date(Date.now() + 60000) } })
    }
    const [alice, bob, viewer] = users
    const at = `${prefix}-alice`, bt = `${prefix}-bob`, vt = `${prefix}-viewer`
    const old = await db.project.create({ data: { name: 'Existing', slug: prefix, ownerId: alice, domain: 'existing.test.local', status: 'paused', envVars: { create: { key: 'POSTGRES_PASSWORD', value: 'preserved-test-secret' } } } })
    instanceIds.push(old.id)
    await Promise.all([adoptLegacyProjects(alice), adoptLegacyProjects(alice)])
    const original = await db.project.findUniqueOrThrow({ where: { id: old.id }, include: { branch: { include: { project: true } }, envVars: true } })
    assert.equal(original.slug, old.slug); assert.equal(original.domain, old.domain); assert.equal(original.status, 'paused')
    assert.equal(original.envVars[0].value, 'preserved-test-secret'); assert.equal(original.branch?.name, 'main')
    const companyId = original.branch!.project.companyId
    companyIds.push(companyId)
    assert.equal(await db.branch.count({ where: { instanceId: old.id } }), 1)
    const created = await createCompany(request(at, 'POST', { name: 'Second Company' }))
    assert.equal(created.status, 201)
    const second = (await created.json()).company.id; companyIds.push(second)
    const listings = await listCompanies(request(at))
    assert.equal((await listings.json()).companies.length, 2)
    const mine = await listProjects(request(at, 'GET', undefined, `?companyId=${companyId}`))
    assert.equal((await mine.json()).projects.length, 1)
    const empty = await listProjects(request(at, 'GET', undefined, `?companyId=${second}`))
    assert.equal((await empty.json()).projects.length, 0)
    assert.equal(await findInstance(old.id, bob), null)
    const bobCompany = await db.company.findUniqueOrThrow({ where: { legacyOwnerId: bob } }); companyIds.push(bobCompany.id)
    for (const [handler, method] of [[readEnv, 'GET'], [saveEnv, 'POST'], [deploy, 'POST'], [pause, 'POST'], [connections, 'GET'], [publishPorts, 'PUT'], [deleteInstance, 'DELETE'], [domain, 'PUT'], [database, 'POST'], [createBranch, 'POST'], [listBranches, 'GET'], [recoverBranch, 'PATCH']] as const) {
      assert.equal((await handler(request(bt, method, method === 'GET' ? undefined : {}), context(old.id))).status, 404)
    }
    assert.equal((await createProject(request(bt, 'POST', { name: 'Unauthorized', companyId }))).status, 404)
    const viewerEmail = `${prefix}-viewer@test.local`
    assert.equal((await member(request(at, 'PUT', { email: viewerEmail, role: 'viewer' }), context(companyId))).status, 200)
    assert.equal((await listProjects(request(vt, 'GET', undefined, `?companyId=${companyId}`))).status, 200)
    assert.equal((await readEnv(request(vt), context(old.id))).status, 404)
    assert.equal((await publishPorts(request(vt, 'PUT', {}), context(old.id))).status, 404)
    assert.equal((await database(request(vt, 'POST', { action: 'sql', sql: 'select 1' }), context(old.id))).status, 404)
    assert.equal((await createProject(request(vt, 'POST', { name: 'Blocked', companyId }))).status, 404)
    assert.equal((await createBranch(request(vt, 'POST', { name: 'preview', mode: 'empty' }), context(old.id))).status, 404)
    assert.equal((await member(request(vt, 'PUT', { email: viewerEmail, role: 'owner' }), context(companyId))).status, 404)
    assert.equal((await member(request(at, 'PUT', { email: viewerEmail, role: 'developer' }), context(companyId))).status, 200)
    assert.equal((await readEnv(request(vt), context(old.id))).status, 200)
    assert.equal((await dns(request(vt, 'PUT', { target: 'infra.test.local' }))).status, 403)
    assert.equal((await removeMember(request(at, 'DELETE', { email: viewerEmail }), context(companyId))).status, 200)
    assert.equal(await findInstance(old.id, viewer), null)
    const viewerCompany = await db.company.findUnique({ where: { legacyOwnerId: viewer } }); if (viewerCompany) companyIds.push(viewerCompany.id)
    assert.equal((await removeMember(request(at, 'DELETE', { email: `${prefix}-alice@test.local` }), context(companyId))).status, 409)
    assert.equal((await member(request(at, 'PUT', { email: viewerEmail, role: 'admin' }), context(companyId))).status, 200)
    assert.equal((await member(request(vt, 'PUT', { email: viewerEmail, role: 'owner' }), context(companyId))).status, 403)
    const branchResult = await createBranch(request(at, 'POST', {name:'preview', mode:'empty'}), context(old.id))
    assert.equal(branchResult.status, 202)
    const branchData = await branchResult.json(); instanceIds.push(branchData.targetId)
    const createdBranch = await db.branch.findUniqueOrThrow({where:{instanceId:branchData.targetId}})
    assert.equal(createdBranch.projectId, original.branch!.projectId)
    assert.equal(createdBranch.name, 'preview')
    assert.equal((await createBranch(request(at, 'POST', {name:'preview', mode:'empty'}), context(old.id))).status, 409)
    assert.equal(await findInstance(old.id, alice), null, 'origin operations are locked while queued')
    assert.equal(await findInstance(branchData.targetId, alice), null, 'target operations are locked while queued')
    assert.equal((await listBranches(request(at), context(old.id))).status, 200)

  } finally {
    await db.branchJob.deleteMany({ where: { targetId: { in: instanceIds } } })
    await db.project.deleteMany({ where: { id: { in: instanceIds } } })
    await db.managedProject.deleteMany({ where: { companyId: { in: companyIds } } })
    await db.company.deleteMany({ where: { id: { in: companyIds } } })
    await db.user.deleteMany({ where: { id: { in: users } } })
    await db.$disconnect(); await prisma.$disconnect()
  }
})
