import { spawn } from "node:child_process";
import path from "node:path";
import { projectsPath } from "./runtime";

// Runs a fixed HTTP client INSIDE this instance's private meta container.
// Input travels over stdin, never through shell interpolation or Docker arguments.
const client = `const http=require('node:http');process.stdin.setEncoding('utf8');let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{const p=JSON.parse(input);const body=JSON.stringify(p.body||{});const r=http.request({hostname:'127.0.0.1',port:process.env.PG_META_PORT||8080,path:p.endpoint,method:'POST',headers:{'content-type':'application/json','content-length':Buffer.byteLength(body)}},res=>{res.setEncoding('utf8');let out='';res.on('data',c=>{out+=c;if(Buffer.byteLength(out)>2097152){res.destroy();process.exit(3)}});res.on('end',()=>process.stdout.write(JSON.stringify({status:res.statusCode,data:(()=>{try{return JSON.parse(out)}catch{return out}})()})))});r.on('error',()=>process.exit(2));r.setTimeout(15000,()=>{r.destroy();process.exit(2)});r.end(body)});`;
export class DatabaseError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function metaRequest(
  slug: string,
  endpoint: "/query" | "/query/parse" | "/query/deparse",
  body: unknown,
): Promise<unknown> {
  const target =
    endpoint === "/query"
      ? "/query?statementTimeoutSecs=10&queryTimeoutSecs=12"
      : endpoint;
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["compose", "exec", "-T", "meta", "node", "-e", client],
      {
        cwd: path.join(projectsPath(), slug, "docker"),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let output = "",
      settled = false;
    const finish = (error?: Error, value?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(
        new DatabaseError(
          "O banco não respondeu a tempo. Verifique o resultado antes de repetir uma alteração.",
          504,
        ),
      );
    }, 18000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (Buffer.byteLength(output) > 2200000) {
        child.kill("SIGKILL");
        finish(
          new DatabaseError(
            "Resultado muito grande. Use LIMIT e consulte o estado antes de repetir alterações.",
            413,
          ),
        );
      }
    });
    // Docker diagnostics can contain configuration; never forward them to the browser.
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.on("error", () =>
      finish(
        new DatabaseError(
          "Não foi possível acessar o serviço de banco da instância.",
          503,
        ),
      ),
    );
    child.on("close", (code) => {
      if (code !== 0)
        return finish(
          new DatabaseError(
            code === 3
              ? "Resultado excedeu 2 MB. Reduza a consulta; verifique alterações antes de repetir."
              : "Serviço de banco indisponível. Implante ou retome a instância e tente novamente.",
            code === 3 ? 413 : 503,
          ),
        );
      try {
        const result = JSON.parse(output);
        if (result.status >= 400)
          finish(
            new DatabaseError(
              typeof result.data?.error === "string"
                ? result.data.error.slice(0, 2000)
                : "O PostgreSQL recusou a operação.",
            ),
          );
        else finish(undefined, result.data);
      } catch {
        finish(
          new DatabaseError("Resposta inválida do serviço de banco.", 502),
        );
      }
    });
    child.stdin.end(JSON.stringify({ endpoint: target, body }));
  });
}
export async function databaseQuery(
  slug: string,
  query: string,
  parameters: unknown[] = [],
) {
  // pg-meta prepends timeout statements, so extended-protocol bind parameters
  // cannot be used here. PREPARE keeps binding in PostgreSQL's type system.
  const literal = (value: unknown) => {
    if (value === null) return "NULL";
    const text = String(value);
    if (text.includes("\0"))
      throw new DatabaseError("Valor contém caractere nulo.");
    return "E'" + text.replaceAll("\\", "\\\\").replaceAll("'", "\\'") + "'";
  };
  const bound = parameters.length
    ? `PREPARE supapanel_statement AS ${query}; EXECUTE supapanel_statement(${parameters.map(literal).join(",")})`
    : query;
  const result = await metaRequest(slug, "/query", { query: bound });
  if (!Array.isArray(result))
    throw new DatabaseError("Formato inesperado de resultado.", 502);
  return result as Record<string, unknown>[];
}
