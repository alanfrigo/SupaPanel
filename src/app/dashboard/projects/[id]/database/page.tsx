"use client";
import BranchSwitcher from "@/components/dashboard/BranchSwitcher";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Database,
  Play,
  Plus,
  RefreshCw,
  Table2,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Row = Record<string, unknown>;
type Table = {
  id: string;
  schema: string;
  name: string;
  primary_keys: string[];
  rls: boolean;
};
type Column = {
  name: string;
  type: string;
  required: boolean;
  generated: boolean;
  identity: boolean;
};
type Project = {
  name: string;
  branch?: { name: string; project: { company: { id: string; name: string } } };
};
const display = (value: unknown) =>
  value === null
    ? "NULL"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);

export default function DatabasePage() {
  const { id } = useParams<{ id: string }>();
  return <DatabaseEditor key={id} id={id} />;
}
function DatabaseEditor({ id }: { id: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [tableId, setTableId] = useState("");
  const [table, setTable] = useState<(Table & { columns: Column[] }) | null>(
    null,
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState<"tables" | "sql">("tables");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sql, setSql] = useState("select current_database(), version();");
  const [sqlRows, setSqlRows] = useState<Row[]>([]);
  const [confirmSql, setConfirmSql] = useState(false);
  const [editor, setEditor] = useState<{
    action: "insert" | "update" | "delete";
    original: Row;
  } | null>(null);
  const [draft, setDraft] = useState<Record<string, string | null>>({});
  const [newTable, setNewTable] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColumns, setNewColumns] = useState<
    { name: string; type: string }[]
  >([{ name: "name", type: "text" }]);
  const generation = useRef(0);
  const alive = useRef(true);
  async function request(body: unknown) {
    const r = await fetch(`/api/projects/${id}/database`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Falha ao acessar o banco.");
    return data;
  }
  async function loadTables() {
    const data = await request({ action: "tables" });
    if (alive.current) setTables(data.tables);
    return data.tables as Table[];
  }
  async function loadRows(selected = tableId, selectedPage = page) {
    const version = ++generation.current;
    setLoading(true);
    setError("");
    setTable(null);
    setRows([]);
    try {
      const data = await request({
        action: "rows",
        tableId: selected,
        page: selectedPage,
      });
      if (alive.current && version === generation.current) {
        setTable(data.table);
        setRows(data.rows);
        setHasMore(data.hasMore);
      }
    } catch (e) {
      if (alive.current && version === generation.current)
        setError(
          e instanceof Error ? e.message : "Falha ao carregar registros.",
        );
    } finally {
      if (alive.current && version === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    fetch(`/api/projects/${id}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        if (!alive.current) return;
        setProject(data.project);
        const list = await loadTables();
        if (alive.current && list.length)
          setTableId(list.find((t) => t.schema === "public")?.id || list[0].id);
      })
      .catch((e) => {
        if (alive.current) setError(e.message);
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
    return () => {
      alive.current = false;
    };
    // Initial loading is scoped to this keyed instance component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    setEditor(null);
    setMessage("");
    if (tableId) void loadRows(tableId, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, page]);
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "Não foi possível concluir a operação.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function openEditor(
    action: "insert" | "update" | "delete",
    original: Row = {},
  ) {
    setEditor({ action, original });
    setError("");
    setDraft(
      action === "update"
        ? Object.fromEntries(
            (table?.columns || [])
              .filter((c) => !c.generated && !c.identity)
              .map((c) => [
                c.name,
                original[c.name] === null
                  ? null
                  : typeof original[c.name] === "object"
                    ? JSON.stringify(original[c.name])
                    : String(original[c.name]),
              ]),
          )
        : {},
    );
  }
  async function saveRow() {
    if (!editor || !table) return;
    const values = Object.fromEntries(
      Object.entries(draft).map(([key, value]) => {
        const type = table.columns.find((c) => c.name === key)?.type || "";
        return [
          key,
          value !== null && (type.startsWith("json") || type.endsWith("[]"))
            ? JSON.parse(value)
            : value,
        ];
      }),
    );
    await request({
      action: editor.action,
      tableId,
      values,
      key: Object.fromEntries(
        table.primary_keys.map((k) => [k, editor.original[k]]),
      ),
      original: editor.original,
    });
    setEditor(null);
    await loadRows();
    setMessage("Operação concluída.");
  }
  async function runSql(confirmed = false) {
    setSqlRows([]); setConfirmSql(false);
    const result = await request({ action: "sql", sql, confirmed });
    if (result.requiresConfirmation) {
      setConfirmSql(true);
      return;
    }
    setConfirmSql(false);
    setSqlRows(result.rows);
    setMessage(
      result.truncated
        ? "Exibindo os primeiros 200 registros. Refine a consulta para ver outros resultados."
        : `Consulta concluída. ${result.rows.length} registro(s) retornado(s).`,
    );
    await loadTables();
  }
  const context = `${project?.branch?.project.company.name || ""} / ${project?.name || ""} / ${project?.branch?.name || "main"}`;
  return (
    <div className="min-h-screen bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <Link
          href={
            project?.branch
              ? `/dashboard?companyId=${project.branch.project.company.id}`
              : "/dashboard"
          }
          className="text-sm text-primary"
        >
          ← Projetos
        </Link>
        <span className="break-all text-sm text-muted-foreground">
          {context}
        </span>
        <Link
          href={`/dashboard/projects/${id}/configure`}
          className="text-sm hover:text-primary"
        >
          Configurações e credenciais
        </Link>
      </header>
      <main className="mx-auto max-w-[1600px] p-5 md:p-8">
        <div className="mb-6"><BranchSwitcher instanceId={String(id)} page="database" disabled={busy || !!editor} /></div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            <Database className="text-primary" />
            Banco de dados
          </h1>
          <div className="flex gap-2">
            <Button
              variant={tab === "tables" ? "default" : "outline"}
              onClick={() => {
                setMessage("");
                setTab("tables");
                if (tableId) void loadRows();
              }}
              disabled={busy || !!editor}
            >
              <Table2 size={16} className="mr-2" />
              Tabelas
            </Button>
            <Button
              variant={tab === "sql" ? "default" : "outline"}
              onClick={() => { setMessage(""); setTab("sql"); }}
              disabled={busy || !!editor}
            >
              <Terminal size={16} className="mr-2" />
              Editor SQL
            </Button>
          </div>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          Acesso administrativo ao ambiente {project?.branch?.name || "main"}.
          Operações são aplicadas diretamente ao banco, inclusive em tabelas com
          RLS.
        </p>
        {error && (
          <p
            role="alert"
            className="mb-4 whitespace-pre-wrap break-words rounded border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {message && (
          <p
            role="status"
            className="mb-4 rounded border border-primary/30 p-3 text-sm text-primary"
          >
            {message}
          </p>
        )}
        {tab === "sql" ? (
          <section className="space-y-4">
            <Label htmlFor="sql">SQL · {project?.branch?.name || "main"}</Label>
            <textarea
              id="sql"
              spellCheck={false}
              className="min-h-60 w-full rounded-lg border bg-card p-4 font-mono text-sm"
              value={sql}
              onChange={(e) => {
                setSql(e.target.value);
                setConfirmSql(false);
                setSqlRows([]);
              }}
              disabled={busy}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={busy || !project || !sql.trim()}
                onClick={() => void perform(() => runSql())}
              >
                <Play size={15} className="mr-2" />
                {busy ? "Executando…" : "Executar SQL"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Uma instrução por vez · timeout de 10 s · até 200 resultados
              </span>
            </div>
            {confirmSql && (
              <div className="space-y-3 rounded-lg border border-amber-500/40 p-4">
                <p className="text-sm">
                  Esta instrução pode alterar o banco em{" "}
                  <strong>{context}</strong>. Confira o SQL acima antes de
                  executar.
                </p>
                <Button
                  disabled={busy}
                  onClick={() => void perform(() => runSql(true))}
                >
                  Confirmar execução
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmSql(false)}
                  disabled={busy}
                >
                  Cancelar
                </Button>
              </div>
            )}
            <DataGrid rows={sqlRows} />
          </section>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="space-y-3 rounded-lg border bg-card p-3">
              <Input
                aria-label="Buscar tabelas"
                placeholder="Buscar tabelas…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button
                variant="outline"
                className="w-full"
                disabled={busy || !project || !!editor}
                onClick={() => {
                  setNewTable(true);
                  setEditor(null);
                }}
              >
                <Plus size={15} className="mr-2" />
                Nova tabela
              </Button>
              <div className="max-h-[50vh] space-y-1 overflow-auto">
                {tables
                  .filter((t) =>
                    `${t.schema}.${t.name}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((t) => (
                    <button
                      key={t.id}
                      disabled={busy || !!editor}
                      onClick={() => {
                        setTableId(t.id);
                        setPage(0);
                        setNewTable(false);
                      }}
                      className={`w-full truncate rounded px-3 py-2 text-left text-sm ${tableId === t.id ? "bg-primary/10 text-primary" : "hover:bg-accent"}`}
                      title={`${t.schema}.${t.name}`}
                    >
                      {t.schema}.{t.name}
                    </button>
                  ))}
                {!loading && !tables.length && (
                  <p className="p-3 text-sm text-muted-foreground">
                    Crie sua primeira tabela.
                  </p>
                )}
              </div>
            </aside>
            <section className="min-w-0 space-y-4">
              {newTable && (
                <form
                  className="space-y-4 rounded-lg border bg-card p-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void perform(async () => {
                      await request({
                        action: "create-table",
                        name: newName,
                        columns: newColumns,
                      });
                      const list = await loadTables();
                      const created = list.find(
                        (t) => t.schema === "public" && t.name === newName,
                      );
                      setNewTable(false);
                      if (created) {
                        setTableId(created.id);
                        setPage(0);
                      }
                      setNewName("");
                      setMessage("Tabela criada.");
                    });
                  }}
                >
                  <h2 className="font-semibold">Nova tabela em public</h2>
                  <Input
                    aria-label="Nome da tabela"
                    placeholder="Ex.: customers"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    maxLength={63}
                  />
                  <p className="text-xs text-muted-foreground">
                    Inclui id automático, created_at e RLS ativada. Use SQL para
                    criar políticas de acesso, constraints e configurações
                    avançadas.
                  </p>
                  {newColumns.map((c, i) => (
                    <div key={i} className="flex flex-wrap gap-2">
                      <Input
                        aria-label={`Coluna ${i + 1}`}
                        className="min-w-32 flex-1"
                        required
                        value={c.name}
                        onChange={(e) =>
                          setNewColumns((list) =>
                            list.map((v, n) =>
                              n === i ? { ...v, name: e.target.value } : v,
                            ),
                          )
                        }
                        maxLength={63}
                      />
                      <select
                        aria-label={`Tipo ${i + 1}`}
                        className="rounded border bg-background px-2 text-sm"
                        value={c.type}
                        onChange={(e) =>
                          setNewColumns((list) =>
                            list.map((v, n) =>
                              n === i ? { ...v, type: e.target.value } : v,
                            ),
                          )
                        }
                      >
                        {[
                          "text",
                          "bigint",
                          "numeric",
                          "boolean",
                          "timestamptz",
                          "jsonb",
                          "uuid",
                        ].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          setNewColumns((list) =>
                            list.filter((_, n) => n !== i),
                          )
                        }
                      >
                        Remover
                      </Button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={newColumns.length >= 30 || busy}
                      onClick={() =>
                        setNewColumns((list) => [
                          ...list,
                          { name: "", type: "text" },
                        ])
                      }
                    >
                      Adicionar coluna
                    </Button>
                    <Button disabled={busy}>Criar tabela</Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setNewTable(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </form>
              )}
              {!loading && !table && !newTable && !error && (
                <div className="rounded-lg border border-dashed p-12 text-center">
                  <Table2 className="mx-auto mb-4 text-primary" />
                  <h2 className="text-lg font-medium">Seu banco começa aqui</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Crie uma tabela ou abra o editor SQL para preparar sua
                    aplicação.
                  </p>
                </div>
              )}
              {loading ? (
                <p className="p-8 text-muted-foreground">Carregando banco…</p>
              ) : (
                table && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="font-semibold">
                          {table.schema}.{table.name}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          {table.columns.length} colunas · RLS{" "}
                          {table.rls ? "ativada" : "desativada"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          aria-label="Atualizar registros"
                          disabled={busy || !!editor}
                          onClick={() => void loadRows()}
                        >
                          <RefreshCw size={15} />
                        </Button>
                        <Button
                          disabled={busy || !!editor}
                          onClick={() => openEditor("insert")}
                        >
                          Inserir registro
                        </Button>
                      </div>
                    </div>
                    {!table.primary_keys.length && (
                      <p className="text-sm text-muted-foreground">
                        Sem chave primária: edição e exclusão de registros estão
                        desabilitadas.
                      </p>
                    )}
                    {editor && (
                      <form
                        className="space-y-4 rounded-lg border bg-card p-5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void perform(saveRow);
                        }}
                      >
                        <h3 className="font-semibold">
                          {editor.action === "delete"
                            ? "Excluir registro"
                            : editor.action === "insert"
                              ? "Inserir registro"
                              : "Editar registro"}{" "}
                          · {table.name}
                        </h3>
                        {editor.action === "delete" ? (
                          <p className="text-sm">
                            Excluir o registro{" "}
                            {JSON.stringify(
                              Object.fromEntries(
                                table.primary_keys.map((k) => [
                                  k,
                                  editor.original[k],
                                ]),
                              ),
                            )}{" "}
                            em {context}? Esta alteração será aplicada ao banco.
                          </p>
                        ) : (
                          table.columns
                            .filter((c) => !c.generated && !c.identity)
                            .map((c) => (
                              <div key={c.name} className="space-y-2">
                                <Label htmlFor={`field-${c.name}`}>
                                  {c.name}{" "}
                                  <span className="font-normal text-muted-foreground">
                                    {c.type}
                                  </span>
                                </Label>
                                <Input
                                  id={`field-${c.name}`}
                                  value={draft[c.name] ?? ""}
                                  disabled={busy || draft[c.name] === null}
                                  placeholder={
                                    editor.action === "insert" &&
                                    !Object.hasOwn(draft, c.name)
                                      ? "Usar valor padrão"
                                      : ""
                                  }
                                  onChange={(e) =>
                                    setDraft((d) => ({
                                      ...d,
                                      [c.name]: e.target.value,
                                    }))
                                  }
                                />
                                <div className="flex gap-3 text-xs">
                                  {!c.required && (
                                    <label className="flex items-center gap-1">
                                      <input
                                        type="checkbox"
                                        checked={draft[c.name] === null}
                                        onChange={(e) =>
                                          setDraft((d) => ({
                                            ...d,
                                            [c.name]: e.target.checked
                                              ? null
                                              : "",
                                          }))
                                        }
                                      />
                                      NULL
                                    </label>
                                  )}
                                  {editor.action === "insert" && (
                                    <button
                                      type="button"
                                      className="text-primary"
                                      onClick={() =>
                                        setDraft((d) => {
                                          const copy = { ...d };
                                          delete copy[c.name];
                                          return copy;
                                        })
                                      }
                                    >
                                      Usar padrão
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))
                        )}
                        <div className="flex gap-2">
                          <Button disabled={busy}>
                            {editor.action === "delete"
                              ? "Confirmar exclusão"
                              : "Salvar registro"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => setEditor(null)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </form>
                    )}
                    <DataGrid
                      rows={rows}
                      columns={table.columns.map((c) => c.name)}
                      actions={
                        table.primary_keys.length
                          ? (row) => (
                              <div className="flex gap-2">
                                <button
                                  disabled={busy || !!editor}
                                  onClick={() => openEditor("update", row)}
                                  className="text-primary"
                                >
                                  Editar
                                </button>
                                <button
                                  disabled={busy || !!editor}
                                  onClick={() => openEditor("delete", row)}
                                  className="text-muted-foreground"
                                >
                                  Excluir
                                </button>
                              </div>
                            )
                          : undefined
                      }
                    />
                    <div className="flex items-center justify-between gap-3">
                      <Button
                        variant="outline"
                        disabled={busy || !!editor || page === 0}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        Anterior
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Página {page + 1} · {rows.length} registros
                      </span>
                      <Button
                        variant="outline"
                        disabled={busy || !!editor || !hasMore}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Próxima
                      </Button>
                    </div>
                  </>
                )
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
function DataGrid({
  rows,
  columns,
  actions,
}: {
  rows: Row[];
  columns?: string[];
  actions?: (row: Row) => React.ReactNode;
}) {
  const names = columns || [
    ...new Set(rows.flatMap((row) => Object.keys(row))),
  ];
  return (
    <div className="max-h-[60vh] overflow-auto rounded-lg border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-muted">
          <tr>
            {names.map((name) => (
              <th
                key={name}
                className="whitespace-nowrap border-b px-4 py-3 font-medium"
              >
                {name}
              </th>
            ))}
            {actions && <th className="border-b px-4 py-3">Ações</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-accent/30">
              {names.map((name) => (
                <td
                  key={name}
                  className="max-w-80 truncate whitespace-nowrap px-4 py-3 font-mono text-xs"
                  title={display(row[name])}
                >
                  {display(row[name])}
                </td>
              ))}
              {actions && <td className="px-4 py-3 text-xs">{actions(row)}</td>}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td
                colSpan={Math.max(names.length, 1)}
                className="p-8 text-center text-muted-foreground"
              >
                Nenhum registro retornado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
