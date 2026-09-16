import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { parse } from "yaml";
import {
  prepareCompose,
  routeCompose,
  jwt,
  serializeEnv,
} from "../src/lib/runtime";
const fixture = `name: supabase
services:
  kong:
    image: kong:2.8.1
    networks:
      default:
        aliases: [api-gw]
    ports: ["8000:8000"]
  studio:
    image: supabase/studio:test
  db:
    image: supabase/postgres:test
    volumes: ["./volumes/db/data:/var/lib/postgresql/data"]
  realtime:
    image: supabase/realtime:test
  supavisor:
    ports: ["5432:5432"]
  analytics:
    ports: ["4000:4000"]
volumes:
  db-config: {}
`;
test("two instances have isolated names and only the authenticated gateway joins Dokploy", () => {
  const a = parse(prepareCompose(fixture, "project-a", true));
  const b = parse(prepareCompose(fixture, "project-b", true));
  assert.notEqual(a.name, b.name);
  for (const key of Object.keys(a.services)) {
    assert.notEqual(
      a.services[key].container_name,
      b.services[key].container_name,
    );
    assert.equal(a.services[key].ports, undefined);
    assert.deepEqual(
      Object.keys(a.services[key].networks),
      key === "kong" ? ["default", "proxy"] : ["default"],
    );
  }
  assert.equal(
    a.services.realtime.container_name,
    "realtime-dev.project-a-realtime",
  );
  assert.deepEqual(a.volumes, { "db-config": {}, "postgres-data": {} });
});
test("routes use internal gateway port and never expose Studio without Kong auth", () => {
  const result = parse(
    routeCompose(
      prepareCompose(fixture, "one", true),
      "one",
      "api.example.com",
      "studio.example.com",
    ),
  );
  const labels = result.services.kong.labels;
  assert.equal(
    labels["traefik.http.services.one-api.loadbalancer.server.port"],
    "8000",
  );
  assert.equal(
    labels["traefik.http.services.one-studio.loadbalancer.server.port"],
    "8000",
  );
  assert.equal(result.services.studio.labels, undefined);
  const cleared = parse(routeCompose(JSON.stringify(result), "one", "", ""));
  assert.equal(cleared.services.kong.labels["traefik.enable"], "false");
  assert.equal(
    cleared.services.kong.labels["traefik.http.routers.one-api.rule"],
    undefined,
  );
});
test("JWT has a verifiable HMAC signature and distinct roles", () => {
  for (const role of ["anon", "service_role"]) {
    const token = jwt(role, "test-secret");
    const [header, payload, signature] = token.split(".");
    assert.equal(
      signature,
      createHmac("sha256", "test-secret")
        .update(`${header}.${payload}`)
        .digest("base64url"),
    );
    assert.equal(
      JSON.parse(Buffer.from(payload, "base64url").toString()).role,
      role,
    );
  }
});
test("env serialization preserves literal interpolation and rejects line injection", () => {
  assert.equal(
    serializeEnv({ SMTP_PASS: "x$HOME # hi" }),
    "SMTP_PASS='x$HOME # hi'\n",
  );
  assert.throws(() => serializeEnv({ SMTP_PASS: "value\nJWT_SECRET=oops" }));
  assert.throws(() => serializeEnv({ "BAD=KEY": "oops" }));
  assert.throws(() => serializeEnv({ COMPOSE_FILE: "/other/project.yml" }));
  assert.throws(() => serializeEnv({ DOCKER_HOST: "tcp://other-host:2375" }));
});
test("standalone pooler publishes a separate host port from internal postgres port", () => {
  const result = parse(prepareCompose(fixture, "standalone", false));
  assert.equal(result.services.supavisor.ports[0], "${POOLER_HOST_PORT}:5432");
});
