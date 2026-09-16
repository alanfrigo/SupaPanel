export class BranchError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function branchInput(input: unknown) {
  const body = input as { name?: unknown; mode?: unknown; schemas?: unknown };
  if (
    !body ||
    typeof body.name !== "string" ||
    !/^[a-z][a-z0-9-]{0,39}$/.test(body.name) ||
    body.name === "main"
  )
    throw new BranchError(
      "Use um nome de 1 a 40 caracteres: letras minúsculas, números e hífen. main é reservado.",
    );
  if (!["empty", "schema", "data", "full"].includes(String(body.mode)))
    throw new BranchError("Modo de clonagem inválido.");
  const schemas = body.mode === "empty" ? [] : body.schemas;
  if (
    !Array.isArray(schemas) ||
    (body.mode !== "empty" && !schemas.length) ||
    schemas.length > 20 ||
    schemas.some(
      (s) =>
        typeof s !== "string" ||
        !/^[a-z_][a-z0-9_]{0,62}$/.test(s) ||
        /^(pg_|information_schema$|auth$|storage$|realtime$|_realtime$|extensions$|vault$|supabase_|graphql|net$|cron$|pgsodium)/.test(
          s,
        ),
    )
  )
    throw new BranchError(
      "Informe até 20 schemas da aplicação (por exemplo public). Schemas internos não podem ser clonados.",
    );
  return {
    name: body.name,
    mode: body.mode as "empty" | "schema" | "data" | "full",
    schemas: [...new Set(schemas)] as string[],
  };
}
