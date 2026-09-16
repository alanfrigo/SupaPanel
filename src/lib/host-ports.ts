import { parse, stringify } from "yaml";
export class PortConfigurationError extends Error {}

export const connectionKinds = ["direct", "session", "transaction"] as const;
export type ConnectionKind = (typeof connectionKinds)[number];
export type PortSettings = Record<
  ConnectionKind,
  { enabled: boolean; port: number; bind: "127.0.0.1" | "0.0.0.0" }
>;
export function validatePortSettings(input: unknown): PortSettings {
  if (!input || typeof input !== "object")
    throw new PortConfigurationError("Configuração de portas inválida.");
  const result = {} as PortSettings;
  const ports = new Set<number>();
  for (const kind of connectionKinds) {
    const value = (input as Record<string, unknown>)[kind] as
      PortSettings[ConnectionKind] | undefined;
    if (
      !value ||
      typeof value.enabled !== "boolean" ||
      !Number.isInteger(value.port) ||
      value.port < 1024 ||
      value.port > 65535 ||
      !["127.0.0.1", "0.0.0.0"].includes(value.bind)
    )
      throw new PortConfigurationError("Use portas entre 1024 e 65535 e uma interface válida.");
    if (value.enabled && ports.has(value.port))
      throw new PortConfigurationError("Cada conexão precisa de uma porta diferente no host.");
    if (value.enabled) ports.add(value.port);
    result[kind] = {
      enabled: value.enabled,
      port: value.port,
      bind: value.bind,
    };
  }
  return result;
}
export type ResolvedCompose = {
  services: Record<
    string,
    {
      environment?: Record<string, unknown>;
      ports?: {
        target: number;
        published?: string;
        host_ip?: string;
        protocol?: string;
      }[];
    }
  >;
};
export function publishDatabasePorts(
  source: string,
  resolved: ResolvedCompose,
  settings: PortSettings,
) {
  const compose = parse(source);
  const dbPort = Number(
    resolved.services.db?.environment?.PGPORT ||
      resolved.services.db?.environment?.POSTGRES_PORT ||
      5432,
  );
  if (!compose.services?.db)
    throw new PortConfigurationError("Serviço PostgreSQL não encontrado.");
  if (
    !compose.services.supavisor &&
    (settings.session.enabled || settings.transaction.enabled)
  )
    throw new PortConfigurationError("Supavisor não está disponível nesta instância.");
  for (const [service, targets] of [
    ["db", [dbPort]],
    ["supavisor", [5432, 6543]],
  ] as const) {
    if (!compose.services[service]) continue;
    const keep = (resolved.services[service]?.ports || []).filter(
      (p) => !targets.some((t) => t === p.target),
    );
    const kinds: ConnectionKind[] =
      service === "db" ? ["direct"] : ["session", "transaction"];
    const ports = [
      ...keep,
      ...kinds
        .filter((k) => settings[k].enabled)
        .map((k) => ({
          target: k === "direct" ? dbPort : k === "session" ? 5432 : 6543,
          published: String(settings[k].port),
          host_ip: settings[k].bind,
          protocol: "tcp",
        })),
    ];
    if (ports.length) compose.services[service].ports = ports;
    else delete compose.services[service].ports;
  }
  return stringify(compose);
}
export function publishedPorts(compose: ResolvedCompose) {
  return Object.values(compose.services).flatMap((service) =>
    (service.ports || [])
      .filter((p) => p.protocol !== "udp" && p.published)
      .map((p) => Number(p.published)),
  );
}
