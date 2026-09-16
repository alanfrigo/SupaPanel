export interface ComposeService {
  container_name?: string;
  environment?: Record<string, string | number>;
  ports?: { target: number; published?: string; host_ip?: string }[];
}
export interface Connection {
  id: string;
  title: string;
  description: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  published?: { port: string; bind: string };
}
export interface ConnectionInfo {
  network: string;
  connections: Connection[];
}

// Input is Docker Compose's resolved JSON, so published ports and legacy names
// come from the instance's own configuration, not from guessed defaults.
export function getConnections(compose: {
  name: string;
  services: Record<string, ComposeService>;
  networks?: Record<string, { name?: string }>;
}): ConnectionInfo {
  const db = compose.services.db;
  const pooler = compose.services.supavisor;
  if (!db) throw new Error("Postgres service missing");
  const environment = db.environment || {};
  const database = String(environment.POSTGRES_DB || "postgres");
  const password = String(environment.POSTGRES_PASSWORD || "");
  const connection = (
    id: string,
    title: string,
    description: string,
    service: ComposeService,
    serviceName: string,
    port: number,
    username: string,
  ): Connection => {
    const published = service.ports?.find(
      (p) => p.target === port && p.published && p.published !== "0",
    );
    return {
      id,
      title,
      description,
      host: service.container_name || serviceName,
      port,
      database,
      username,
      password,
      ...(published
        ? {
            published: {
              port: published.published!,
              bind: published.host_ip || "0.0.0.0",
            },
          }
        : {}),
    };
  };
  const connections = [
    connection(
      "direct",
      "Conexão direta",
      "Para migrações, backups e conexões persistentes ao PostgreSQL.",
      db,
      "db",
      Number(environment.PGPORT || environment.POSTGRES_PORT || 5432),
      "postgres",
    ),
  ];
  const tenant = pooler?.environment?.POOLER_TENANT_ID;
  if (pooler && tenant) {
    connections.push(
      connection(
        "session",
        "Session Pooler",
        "Mantém a sessão da conexão. Compatível com prepared statements.",
        pooler,
        "supavisor",
        5432,
        `postgres.${tenant}`,
      ),
    );
    connections.push(
      connection(
        "transaction",
        "Transaction Pooler",
        "Compartilha conexões por transação. Ideal para conexões curtas; desative prepared statements no cliente.",
        pooler,
        "supavisor",
        6543,
        `postgres.${tenant}`,
      ),
    );
  }
  return {
    network: compose.networks?.default?.name || `${compose.name}_default`,
    connections,
  };
}

export function connectionUri(
  connection: Connection,
  password = connection.password,
  host = connection.host,
  port: string | number = connection.port,
) {
  const hostname =
    host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `postgresql://${encodeURIComponent(connection.username)}:${encodeURIComponent(password)}@${hostname}:${port}/${encodeURIComponent(connection.database)}`;
}
