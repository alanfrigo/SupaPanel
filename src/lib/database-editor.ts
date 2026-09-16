import { databaseQuery, DatabaseError, metaRequest } from "./database-gateway";
export function identifier(value: string) {
  if (!value || value.includes("\0") || Buffer.byteLength(value) > 63)
    throw new DatabaseError("Identificador inválido.");
  return '"' + value.replaceAll('"', '""') + '"';
}
export function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new DatabaseError("Informe um objeto JSON.");
  return value as Record<string, unknown>;
}
export const catalogQuery = `SELECT c.oid::text AS id, n.nspname AS schema, c.relname AS name,
  c.relrowsecurity AS rls,
  COALESCE((SELECT json_agg(a.attname ORDER BY k.ordinality) FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum, ordinality) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum WHERE i.indrelid=c.oid AND i.indisprimary), '[]'::json) AS primary_keys
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
  ORDER BY n.nspname,c.relname`;
export async function tableInfo(slug: string, id: string) {
  if (!/^\d+$/.test(id)) throw new DatabaseError("Tabela inválida.");
  const rows = await databaseQuery(
    slug,
    `SELECT * FROM (${catalogQuery}) tables WHERE id=$1`,
    [id],
  );
  if (!rows.length) throw new DatabaseError("Tabela não encontrada.", 404);
  const table = rows[0] as {
    id: string;
    schema: string;
    name: string;
    primary_keys: string[];
    rls: boolean;
  };
  const columns = await databaseQuery(
    slug,
    `SELECT attname AS name, format_type(atttypid,atttypmod) AS type, attnotnull AS required, attgenerated <> '' AS generated, attidentity <> '' AS identity FROM pg_attribute WHERE attrelid=$1::oid AND attnum>0 AND NOT attisdropped ORDER BY attnum`,
    [id],
  );
  return { ...table, columns };
}
export async function mutateRow(
  slug: string,
  tableId: string,
  action: "insert" | "update" | "delete",
  values: unknown,
  key: unknown,
  original: unknown,
) {
  const table = await tableInfo(slug, tableId);
  const target = `${identifier(table.schema)}.${identifier(table.name)}`;
  const data = action === "delete" ? {} : objectInput(values);
  const names = Object.keys(data);
  for (const name of names) {
    const column = table.columns.find((c) => c.name === name);
    if (!column || column.generated || column.identity)
      throw new DatabaseError(`Coluna não editável: ${name}`);
  }
  const parameters: unknown[] = [];
  const param = (value: unknown) => {
    parameters.push(value);
    return `$${parameters.length}`;
  };
  // jsonb_populate_record lets PostgreSQL cast JSON values to the table's actual types.
  const record = names.length
    ? `jsonb_populate_record(NULL::${target}, ${param(JSON.stringify(data))}::jsonb)`
    : "";
  let sql: string;
  if (action === "insert") {
    sql = names.length
      ? `INSERT INTO ${target} (${names.map(identifier).join(",")}) SELECT ${names.map(identifier).join(",")} FROM ${record}`
      : `INSERT INTO ${target} DEFAULT VALUES`;
  } else {
    if (!table.primary_keys.length)
      throw new DatabaseError("Edição e exclusão exigem uma chave primária.");
    const keys = objectInput(key);
    if (
      Object.keys(keys).length !== table.primary_keys.length ||
      table.primary_keys.some(
        (k) => !Object.hasOwn(keys, k) || keys[k] === null,
      )
    )
      throw new DatabaseError("Chave primária incompleta.");
    const keyRecord = `jsonb_populate_record(NULL::${target}, ${param(JSON.stringify(keys))}::jsonb)`;
    const where = table.primary_keys
      .map(
        (k) =>
          `t.${identifier(k)} IS NOT DISTINCT FROM (SELECT ${identifier(k)} FROM ${keyRecord})`,
      )
      .join(" AND ");
    const previous = objectInput(original);
    // Optimistic locking prevents silently overwriting a row changed since it was loaded.
    const condition = `${where} AND to_jsonb(t) = to_jsonb(jsonb_populate_record(NULL::${target}, ${param(JSON.stringify(previous))}::jsonb))`;
    if (action === "delete") sql = `DELETE FROM ${target} t WHERE ${condition}`;
    else {
      if (!names.length)
        throw new DatabaseError("Informe ao menos uma coluna.");
      sql = `UPDATE ${target} t SET (${names.map(identifier).join(",")}) = (SELECT ${names.map(identifier).join(",")} FROM ${record}) WHERE ${condition}`;
    }
  }
  const result = await databaseQuery(slug, `${sql} RETURNING *`, parameters);
  if (action !== "insert" && result.length !== 1)
    throw new DatabaseError(
      "O registro mudou ou foi removido. Atualize a tabela antes de tentar novamente.",
      409,
    );
  return result;
}
export async function executeSql(slug: string, sql: string, confirmed = false) {
  if (!sql.trim() || sql.length > 50000)
    throw new DatabaseError(
      "Informe uma instrução SQL de até 50.000 caracteres.",
    );
  const ast = (await metaRequest(slug, "/query/parse", { query: sql })) as {
    stmts?: { stmt: Record<string, unknown> }[];
  };
  if (ast.stmts?.length !== 1)
    throw new DatabaseError("Execute uma instrução SQL por vez.");
  const type = Object.keys(ast.stmts[0].stmt)[0];
  // Transaction/session controls cannot outlive this short-lived connection.
  if (
    [
      "TransactionStmt",
      "VariableSetStmt",
      "CopyStmt",
      "DoStmt",
      "CallStmt",
    ].includes(type)
  )
    throw new DatabaseError(
      "Esta instrução exige um cliente PostgreSQL externo.",
    );
  if (type !== "SelectStmt" && !confirmed)
    return { requiresConfirmation: true, rows: [], truncated: false };
  const canonical = await metaRequest(slug, "/query/deparse", { ast });
  if (typeof canonical !== "string")
    throw new DatabaseError("Não foi possível preparar a consulta.");
  const query =
    type === "SelectStmt"
      ? `SELECT * FROM (${canonical.trim().replace(/;$/, "")}) supapanel_result LIMIT 201`
      : canonical;
  const rows = await databaseQuery(slug, query);
  return { rows: rows.slice(0, 200), truncated: rows.length > 200 };
}
