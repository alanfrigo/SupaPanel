import path from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import { parse, stringify } from "yaml";

export const DEFAULT_SUPABASE_REF = "9e225a279b33e4e6e1452e573a40a6a25aa2cb2f";
export const supabaseRef = () =>
  process.env.SUPABASE_CORE_REF || DEFAULT_SUPABASE_REF;
export const isDokploy = () => process.env.PROXY_MODE === "dokploy";
export const proxyNetwork = () =>
  process.env.PROXY_NETWORK ||
  (isDokploy() ? "dokploy-network" : "supapanel-network");
export const projectsPath = () =>
  process.env.SUPAPANEL_MODE === "production"
    ? path.join(process.env.DATA_PATH || "/etc/supapanel", "projects")
    : path.join(process.cwd(), "supabase-projects");
export const corePath = () =>
  process.env.SUPAPANEL_MODE === "production"
    ? path.join(process.env.DATA_PATH || "/etc/supapanel", "core")
    : path.join(process.cwd(), "supabase-core");
export const secret = (length: number) =>
  randomBytes(length).toString("hex").slice(0, length);
export function jwt(role: string, key: string, timestamp = Date.now()) {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      role,
      iss: "supabase",
      iat: Math.floor(timestamp / 1000),
      exp: Math.floor(timestamp / 1000) + 10 * 365 * 86400,
    }),
  ).toString("base64url");
  return `${header}.${payload}.${createHmac("sha256", key).update(`${header}.${payload}`).digest("base64url")}`;
}
export function serializeEnv(env: Record<string, string>) {
  return (
    Object.entries(env)
      .map(([key, value]) => {
        if (
          !/^[A-Z][A-Z0-9_]*$/.test(key) ||
      key.startsWith("COMPOSE_") ||
      (key.startsWith("DOCKER_") && key !== "DOCKER_SOCKET_LOCATION") ||
          typeof value !== "string" ||
          /[\r\n\0]/.test(value)
        )
          throw new Error(`Invalid environment variable: ${key}`);
        return `${key}='${value.replace(/'/g, "\\'")}'`;
      })
      .join("\n") + "\n"
  );
}

// Keep the upstream service graph intact. Only the gateway joins the proxy network;
// Studio is accessed through Kong's authenticated dashboard route.
export function prepareCompose(
  source: string,
  slug: string,
  dokploy = isDokploy(),
) {
  const compose = parse(source);
  compose.name = slug;
  for (const [name, service] of Object.entries(compose.services) as [
    string,
    Record<string, unknown>,
  ][]) {
    service.container_name =
      name === "realtime" ? `realtime-dev.${slug}-realtime` : `${slug}-${name}`;
    const networkConfig = service.networks as
      Record<string, unknown> | undefined;
    service.networks = { default: networkConfig?.default || {} };
    if (dokploy) delete service.ports;
  }
  // Docker-managed, per-project data volume avoids host UID/permission mismatches.
  compose.volumes = { ...compose.volumes, "postgres-data": {} };
  compose.services.db.volumes = (compose.services.db.volumes || []).map(
    (volume: string) =>
      typeof volume === "string" && volume.startsWith("./volumes/db/data:")
        ? "postgres-data:/var/lib/postgresql/data"
        : volume,
  );
  const useProxy = dokploy || process.env.SUPAPANEL_MODE === "production";
  compose.networks = {
    default: {},
    ...(useProxy ? { proxy: { external: true, name: proxyNetwork() } } : {}),
  };
  if (useProxy) compose.services.kong.networks.proxy = {};
  if (dokploy) {
    compose.services.kong.networks.proxy = {};
    compose.services.kong.labels = { "traefik.enable": "false" };
  } else {
    // POSTGRES_PORT is an internal port used by all services, never a host port.
    compose.services.supavisor.ports = [
      "${POOLER_HOST_PORT}:5432",
      "${POOLER_PROXY_PORT_TRANSACTION}:6543",
    ];
    if (compose.services.analytics)
      compose.services.analytics.ports = ["127.0.0.1:${ANALYTICS_PORT}:4000"];
  }
  return stringify(compose);
}

export function routeCompose(
  source: string,
  slug: string,
  domain: string,
  studioDomain: string,
) {
  const compose = parse(source);
  const labels: Record<string, string> = {
    "traefik.enable": domain || studioDomain ? "true" : "false",
    "traefik.docker.network": proxyNetwork(),
  };
  for (const [kind, host] of Object.entries({
    api: domain,
    studio: studioDomain,
  })) {
    if (!host) continue;
    const router = `${slug}-${kind}`;
    labels[`traefik.http.routers.${router}.rule`] = `Host(\`${host}\`)`;
    labels[`traefik.http.routers.${router}.entrypoints`] =
      process.env.PROXY_ENTRYPOINT || "websecure";
    labels[`traefik.http.routers.${router}.tls.certresolver`] =
      process.env.PROXY_CERT_RESOLVER || "letsencrypt";
    labels[`traefik.http.routers.${router}.service`] = router;
    labels[`traefik.http.services.${router}.loadbalancer.server.port`] = "8000";
    labels[`traefik.http.routers.${router}-http.rule`] = `Host(\`${host}\`)`;
    labels[`traefik.http.routers.${router}-http.entrypoints`] = "web";
    labels[`traefik.http.routers.${router}-http.middlewares`] = `${slug}-https`;
    labels[`traefik.http.routers.${router}-http.service`] = router;
  }
  labels[`traefik.http.middlewares.${slug}-https.redirectscheme.scheme`] =
    "https";
  compose.services.kong.labels = labels;
  return stringify(compose);
}
