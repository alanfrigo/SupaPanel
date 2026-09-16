"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { GitBranch, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Branch = {
  id: string;
  name: string;
  instanceId: string;
  instance: { status: string };
};
type Job = {
  id: string;
  sourceId: string;
  targetId: string;
  mode: string;
  schemas: string[];
  status: string;
  stage: string;
  error?: string;
  pausedServices: string[];
};
const labels: Record<string, string> = {
  queued: "Na fila",
  running: "Criando",
  completed: "Concluída",
  failed: "Falhou",
  active: "Em execução",
  stopped: "Não implantada",
  paused: "Pausada",
  provisioning: "Criando",
};
export default function BranchesPage() {
  const id = String(useParams().id);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [canOperate, setCanOperate] = useState(false);
  const [sourceId, setSourceId] = useState(id);
  const [name, setName] = useState("");
  const [mode, setMode] = useState("schema");
  const [schemas, setSchemas] = useState("public");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [removeId, setRemoveId] = useState("");
  const [removeName, setRemoveName] = useState("");
  const [context, setContext] = useState<{
    name: string;
    company: { id: string; name: string };
  }>();
  const refresh = useCallback(async () => {
    const r = await fetch(`/api/projects/${id}/branches`, {
      cache: "no-store",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    setBranches(data.branches);
    setJobs(data.jobs);
    setCanOperate(data.canOperate);
  }, [id]);
  useEffect(() => {
    let active = true;
    const load = () => {
      if (active)
        void refresh().catch((e) => {
          if (active) setError(e.message);
        });
    };
    load();
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (active) setContext(data.project?.branch?.project);
      })
      .catch(() => {});
    const timer = setInterval(load, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, refresh]);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch(`/api/projects/${sourceId}/branches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mode,
          schemas: schemas
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setName("");
      setConfirmed(false);
      setMessage(
        "Branch na fila. Você pode sair desta página; o progresso fica salvo.",
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar branch.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/projects/${removeId}`, { method: "DELETE" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (removeId === id) {
        const other = branches.find((b) => b.instanceId !== id);
        window.location.assign(
          other
            ? `/dashboard/projects/${other.instanceId}/branches`
            : "/dashboard",
        );
        return;
      }
      setRemoveId("");
      setRemoveName("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao excluir.");
    } finally {
      setBusy(false);
    }
  }
  async function recover(jobId: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/projects/${id}/branches`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao retomar.");
    } finally {
      setBusy(false);
    }
  }
  const selectedRemoval = branches.find((b) => b.instanceId === removeId);
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <nav className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <Link
          className="text-primary"
          href={
            context
              ? `/dashboard?companyId=${context.company.id}`
              : "/dashboard"
          }
        >
          ← Projetos
        </Link>
        <span>
          {context?.company.name} / {context?.name} / Branches
        </span>
      </nav>
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-semibold">
          <GitBranch className="text-primary" />
          Branches
        </h1>
        <p className="mt-2 text-muted-foreground">
          Ambientes independentes para desenvolver e testar. Cada branch executa
          uma stack Supabase e consome CPU, memória e disco adicionais.
        </p>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-primary">
          {message}
        </p>
      )}
      <section className="space-y-3">
        {branches.map((branch) => {
          const job = jobs.find((j) => j.targetId === branch.instanceId);
          const locked = jobs.some(
            (j) =>
              (j.sourceId === branch.instanceId ||
                j.targetId === branch.instanceId) &&
              (["queued", "running"].includes(j.status) ||
                j.pausedServices.length > 0),
          );
          return (
            <article key={branch.id} className="rounded-lg border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-mono text-lg">{branch.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {labels[branch.instance.status] || branch.instance.status}
                    {locked && " · operação em andamento"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  {canOperate &&
                    !locked &&
                    !["provisioning", "failed"].includes(
                      branch.instance.status,
                    ) && (
                      <>
                        <Link
                          className="text-primary"
                          href={`/dashboard/projects/${branch.instanceId}/database`}
                        >
                          Abrir banco
                        </Link>
                        <Link
                          href={`/dashboard/projects/${branch.instanceId}/configure`}
                        >
                          Configurações
                        </Link>
                      </>
                    )}
                  {canOperate && branch.name !== "main" && !locked && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setRemoveId(branch.instanceId);
                        setRemoveName("");
                      }}
                    >
                      Excluir
                    </Button>
                  )}
                </div>
              </div>
              {job && (
                <div className="mt-4 border-t pt-3 text-sm">
                  <p role="status">
                    {labels[job.status]} · {job.stage}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Origem:{" "}
                    {branches.find((b) => b.instanceId === job.sourceId)
                      ?.name || "removida"}{" "}
                    ·{" "}
                    {job.mode === "full"
                      ? "Aplicação + Auth + Storage local"
                      : job.mode === "schema"
                        ? "Somente estrutura"
                        : job.mode === "data"
                          ? "Estrutura e dados da aplicação"
                          : "Ambiente vazio"}
                  </p>
                  {job.error && (
                    <p className="mt-2 text-destructive">{job.error}</p>
                  )}
                  {canOperate &&
                    job.status === "failed" &&
                    job.pausedServices.length > 0 && (
                      <Button
                        className="mt-3"
                        disabled={busy}
                        onClick={() => void recover(job.id)}
                      >
                        Retomar origem
                      </Button>
                    )}
                </div>
              )}
            </article>
          );
        })}
        <Button
          variant="ghost"
          onClick={() => void refresh().catch((e) => setError(e.message))}
        >
          <RefreshCw size={14} className="mr-2" />
          Atualizar
        </Button>
      </section>
      {selectedRemoval && (
        <section className="space-y-3 rounded-lg border border-destructive/40 p-5">
          <h2 className="font-medium">Excluir branch {selectedRemoval.name}</h2>
          <p className="text-sm text-muted-foreground">
            Os containers, volumes, banco e arquivos desta branch serão
            removidos. A origem será preservada. Digite o nome da branch para
            confirmar.
          </p>
          <Input
            aria-label="Nome da branch para excluir"
            value={removeName}
            onChange={(e) => setRemoveName(e.target.value)}
          />
          <Button
            variant="destructive"
            disabled={busy || removeName !== selectedRemoval.name}
            onClick={() => void remove()}
          >
            Excluir permanentemente
          </Button>
          <Button variant="ghost" onClick={() => setRemoveId("")}>
            Cancelar
          </Button>
        </section>
      )}
      {canOperate && (
        <form
          onSubmit={create}
          className="space-y-5 rounded-lg border bg-card p-6"
        >
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <Plus size={18} />
            Nova branch
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span>Branch de origem</span>
              <select
                className="block h-10 w-full rounded border bg-background px-3"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
              >
                {branches.map((b) => (
                  <option key={b.instanceId} value={b.instanceId}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span>Nome da nova branch</span>
              <Input
                required
                pattern="[a-z](?:[a-z0-9]|-){0,39}"
                maxLength={40}
                placeholder="development"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          </div>
          <label className="block space-y-2 text-sm">
            <span>Conteúdo inicial</span>
            <select
              className="h-10 w-full rounded border bg-background px-3"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                setConfirmed(false);
              }}
            >
              <option value="schema">Somente estrutura da aplicação</option>
              <option value="data">Estrutura + dados da aplicação</option>
              <option value="full">
                Aplicação + usuários Auth + arquivos Storage
              </option>
              <option value="empty">Ambiente vazio</option>
            </select>
          </label>
          {mode !== "empty" && (
            <label className="block space-y-2 text-sm">
              <span>Schemas da aplicação, separados por vírgula</span>
              <Input
                required
                value={schemas}
                onChange={(e) => setSchemas(e.target.value)}
              />
            </label>
          )}
          <p className="text-sm text-muted-foreground">
            Credenciais novas, volumes separados e nenhuma porta ou domínio
            público herdado. Configure os acessos depois. Funções de banco,
            índices, triggers e políticas RLS dos schemas selecionados são
            incluídos; Edge Functions, Vault, integrações externas e
            promoção/merge não são copiados.
          </p>
          {mode === "full" ? (
            <div className="space-y-3 rounded border border-amber-500/30 p-4 text-sm">
              <p>
                Inclui usuários, hashes de senha e dados Auth, metadados e
                arquivos do Storage local. S3 externo não é suportado. Tokens
                antigos ficam inválidos na cópia; novos logins serão
                necessários. Os serviços da origem serão pausados durante a
                exportação e cópia dos arquivos. Interrompa também clientes SQL
                e processos externos que gravam nesses dados durante a operação.
              </p>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Entendo a pausa da origem e autorizo copiar os dados de Auth e
                Storage.
              </label>
            </div>
          ) : (
            mode === "data" && (
              <p className="text-sm text-muted-foreground">
                Usuários Auth e Storage não são copiados. Referências
                obrigatórias a esses dados podem impedir a restauração; nesse
                caso, use a clonagem completa.
              </p>
            )
          )}
          <Button
            type="submit"
            disabled={
              busy || !branches.length || (mode === "full" && !confirmed)
            }
          >
            {busy ? "Enviando…" : "Criar branch"}
          </Button>
        </form>
      )}
    </main>
  );
}
