import test from "node:test";
import assert from "node:assert/strict";
import { parse } from "yaml";
import {
  validatePortSettings,
  publishDatabasePorts,
  publishedPorts,
  type PortSettings,
} from "../src/lib/host-ports";
import { routeCompose } from "../src/lib/runtime";
const settings: PortSettings = {
  direct: { enabled: true, port: 15432, bind: "127.0.0.1" },
  session: { enabled: true, port: 15433, bind: "0.0.0.0" },
  transaction: { enabled: true, port: 15434, bind: "0.0.0.0" },
};
test("host ports validate ranges, duplicate ports and binding scope", () => {
  assert.deepEqual(validatePortSettings(settings), settings);
  assert.throws(() =>
    validatePortSettings({
      ...settings,
      direct: { ...settings.direct, port: 80 },
    }),
  );
  assert.throws(() =>
    validatePortSettings({
      ...settings,
      session: { ...settings.session, port: 15432 },
    }),
  );
  assert.throws(() =>
    validatePortSettings({
      ...settings,
      direct: { ...settings.direct, bind: "example.com" },
    }),
  );
});
test("publishing keeps internal database ports and routing; disabling removes only SQL bindings", () => {
  const source =
    "services:\n  db:\n    environment:\n      PGPORT: 5432\n  supavisor: {}\n  kong: {}\n";
  const resolved = {
    services: {
      db: { environment: { PGPORT: 5432 } },
      supavisor: { ports: [{ target: 4000, published: "14000" }] },
      kong: {},
    },
  };
  const updated = publishDatabasePorts(source, resolved, settings);
  const parsed = parse(updated);
  assert.equal(parsed.services.db.environment.PGPORT, 5432);
  assert.deepEqual(parsed.services.db.ports[0], {
    target: 5432,
    published: "15432",
    host_ip: "127.0.0.1",
    protocol: "tcp",
  });
  assert.deepEqual(
    parsed.services.supavisor.ports.map((p: { target: number }) => p.target),
    [4000, 5432, 6543],
  );
  assert.deepEqual(
    parse(routeCompose(updated, "test", "api.example.com", "")).services.db
      .ports,
    parsed.services.db.ports,
  );
  const off = Object.fromEntries(
    Object.entries(settings).map(([k, v]) => [k, { ...v, enabled: false }]),
  ) as PortSettings;
  const disabled = parse(publishDatabasePorts(updated, parsed, off));
  assert.equal(disabled.services.db.ports, undefined);
  assert.deepEqual(disabled.services.supavisor.ports, [
    { target: 4000, published: "14000" },
  ]);
  assert.deepEqual(publishedPorts(disabled), [14000]);
});
