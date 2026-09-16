import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getConnections, connectionUri } from '../src/lib/connections'
const compose = { name: 'demo', services: {
  db: { container_name: 'demo-db', environment: { POSTGRES_PASSWORD: 'p@ss:/?#%', POSTGRES_DB: 'app db', POSTGRES_PORT: '5432' } },
  supavisor: { container_name: 'demo-supavisor', environment: { POOLER_TENANT_ID: 'tenant-one' }, ports: [{ target: 5432, published: '15432' }, { target: 6543, published: '16543', host_ip: '127.0.0.1' }] },
}, networks: { default: { name: 'demo_private' } } }
test('direct and both poolers use correct users and actual published ports', () => {
  const data = getConnections(compose)
  assert.equal(data.network, 'demo_private')
  assert.equal(data.connections[0].username, 'postgres')
  assert.equal(data.connections[0].published, undefined)
  assert.equal(data.connections[1].username, 'postgres.tenant-one')
  assert.equal(data.connections[1].published?.port, '15432')
  assert.equal(data.connections[2].port, 6543)
  assert.equal(data.connections[2].published?.bind, '127.0.0.1')
})
test('Dokploy does not advertise nonexistent public SQL connections', () => {
  const data = getConnections({ ...compose, services: { ...compose.services, supavisor: { ...compose.services.supavisor, ports: [] } } })
  assert.ok(data.connections.every(c => !c.published))
})
test('URI safely encodes credentials and database, including IPv6 endpoints', () => {
  const connection = getConnections(compose).connections[0]
  const uri = new URL(connectionUri(connection))
  assert.equal(decodeURIComponent(uri.password), 'p@ss:/?#%')
  assert.equal(decodeURIComponent(uri.pathname.slice(1)), 'app db')
  assert.equal(new URL(connectionUri(connection, 'secret', '::1', 15432)).hostname, '[::1]')
})
