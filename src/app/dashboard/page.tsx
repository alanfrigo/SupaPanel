"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Database,
  Plus,
  Search,
  RefreshCw,
  Layers3,
  Settings2,
  LogOut,
  Server,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
  status: string;
  domain?: string;
  studioDomain?: string;
  createdAt: string;
}
const statuses: Record<string, string> = {
  active: "Em execução",
  stopped: "Não implantado",
  paused: "Pausado",
};

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/projects");
      if (response.status === 401) {
        router.replace("/auth/login");
        return;
      }
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "Não foi possível carregar as instâncias.",
        );
      setProjects(data.projects);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha de conexão.");
    } finally {
      setLoading(false);
    }
  }, [router]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const visible = projects.filter(
    (p) =>
      (filter === "all" || p.status === filter) &&
      `${p.name} ${p.description || ""} ${p.domain || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="min-h-screen bg-background lg:pl-60">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-card lg:flex">
        <Link
          href="/dashboard"
          className="flex h-20 items-center gap-3 px-6 text-lg font-semibold tracking-tight"
        >
          <Layers3 className="text-primary" size={25} />
          SupaPanel
        </Link>
        <div className="px-4 py-5">
          <p className="mb-3 px-3 text-[10px] font-medium uppercase tracking-[.18em] text-muted-foreground">
            Workspace
          </p>
          <Link
            href="/dashboard"
            aria-current="page"
            className="flex items-center gap-3 rounded-md border border-primary/15 bg-primary/10 px-3 py-2.5 text-sm text-primary"
          >
            <Database size={16} />
            Instâncias<span className="ml-auto text-xs">{projects.length}</span>
          </Link>
          <Link
            href="/dashboard/settings"
            className="mt-1 flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent"
          >
            <Settings2 size={16} />
            Configurações
          </Link>
        </div>
        <div className="mt-auto border-t p-5">
          <div className="flex items-center gap-2 text-xs">
            <Server size={15} className="text-primary" />
            Sua infraestrutura. Seus dados.
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Várias instâncias Supabase.
            <br />
            Um lugar para gerenciar.
          </p>
        </div>
      </aside>
      <header className="flex h-16 items-center justify-between border-b px-5 md:px-10">
        <div className="flex items-center gap-2 text-sm">
          <Layers3 size={17} className="text-primary lg:hidden" />
          <span className="text-muted-foreground">Workspace</span>
          <span className="px-2 text-muted-foreground/40">/</span>Visão geral
        </div>
        <div className="flex gap-1">
          <Link href="/dashboard/settings">
            <Button variant="ghost" size="sm" aria-label="Configurações">
              <Settings2 size={16} />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              const r = await fetch("/api/auth/logout", { method: "POST" });
              if (r.ok) router.push("/auth/login");
              else setError("Não foi possível sair.");
            }}
          >
            <LogOut size={15} className="mr-2" />
            Sair
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-10 md:px-10">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-[.2em] text-primary">
              Seu Supabase, no seu servidor
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Suas instâncias
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Crie, configure e acompanhe seus projetos em um só lugar.
            </p>
          </div>
          <Link href="/dashboard/create-project">
            <Button>
              <Plus size={16} className="mr-2" />
              Nova instância
            </Button>
          </Link>
        </div>
        <div className="my-8 grid grid-cols-3 divide-x rounded-lg border bg-card">
          {[
            [projects.length, "Instâncias", Database],
            [
              projects.filter((p) => p.status === "active").length,
              "Implantadas",
              Circle,
            ],
            [
              projects.filter((p) => p.status !== "active").length,
              "A configurar / pausadas",
              Layers3,
            ],
          ].map(([count, label, Icon]) => {
            const I = Icon as typeof Database;
            return (
              <div key={String(label)} className="p-4 md:p-6">
                <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{String(label)}</span>
                  <I size={15} className="hidden text-primary sm:block" />
                </div>
                <p className="text-3xl font-medium tabular-nums">
                  {loading ? "—" : String(count)}
                </p>
              </div>
            );
          })}
        </div>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-48 flex-1 sm:max-w-sm">
            <Search
              size={16}
              className="absolute left-3 top-3 text-muted-foreground"
            />
            <Input
              aria-label="Buscar instâncias"
              className="pl-9"
              placeholder="Buscar por nome ou domínio…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            aria-label="Filtrar por status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-10 rounded-md border bg-card px-3 text-sm"
          >
            <option value="all">Todos os status</option>
            {Object.entries(statuses).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="icon"
            onClick={refresh}
            disabled={loading}
            aria-label="Atualizar instâncias"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
        {error && (
          <div
            role="alert"
            className="mb-5 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          >
            {error}
          </div>
        )}
        {loading ? (
          <div
            aria-label="Carregando instâncias"
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-52 animate-pulse rounded-lg border bg-card"
              />
            ))}
          </div>
        ) : visible.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((p) => (
              <article
                key={p.id}
                className="group flex min-w-0 flex-col rounded-lg border bg-card transition-colors hover:border-primary/40"
              >
                <div className="p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <div className="rounded-lg border bg-background p-2.5 text-primary">
                      <Database size={20} />
                    </div>
                    <span
                      className={`flex items-center gap-1.5 text-xs ${p.status === "active" ? "text-primary" : "text-muted-foreground"}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${p.status === "active" ? "bg-primary" : "bg-muted-foreground"}`}
                      />
                      {statuses[p.status] || p.status}
                    </span>
                  </div>
                  <Link
                    href={`/dashboard/projects/${p.id}/configure`}
                    className="block truncate text-lg font-medium tracking-tight hover:text-primary"
                  >
                    {p.name}
                  </Link>
                  <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                    {p.description || "Instância Supabase independente"}
                  </p>
                  <p className="mt-4 truncate font-mono text-xs text-muted-foreground">
                    {p.domain || "Domínio ainda não configurado"}
                  </p>
                </div>
                <div className="mt-auto flex items-center justify-between border-t px-5 py-3">
                  <span className="text-xs text-muted-foreground">
                    {new Date(p.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                  <Link
                    href={`/dashboard/projects/${p.id}/configure`}
                    className="flex items-center gap-2 text-xs font-medium hover:text-primary"
                  >
                    Gerenciar
                    <ArrowUpRight size={14} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed px-6 py-16 text-center">
            <Database className="mx-auto mb-5 text-primary" size={32} />
            <h2 className="text-xl font-medium">
              {projects.length
                ? "Nenhuma instância encontrada"
                : "Seu próximo projeto começa aqui"}
            </h2>
            <p className="mx-auto mb-6 mt-2 max-w-md text-sm text-muted-foreground">
              {projects.length
                ? "Tente outro nome ou remova o filtro de status."
                : "Cada instância tem seu próprio banco, autenticação, storage e credenciais. Nós cuidamos da configuração inicial."}
            </p>
            {projects.length ? (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Limpar filtros
              </Button>
            ) : (
              <Link href="/dashboard/create-project">
                <Button>
                  <Plus size={16} className="mr-2" />
                  Criar primeira instância
                </Button>
              </Link>
            )}
          </div>
        )}
        <p className="mt-6 text-xs text-muted-foreground">
          O status indica a última operação realizada pelo painel. Cada
          instância mantém seus dados e serviços separados.
        </p>
      </main>
    </div>
  );
}
