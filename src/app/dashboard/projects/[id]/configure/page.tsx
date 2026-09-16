"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Loader2,
  Pause,
  Play,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Project = {
  name: string;
  description?: string;
  status: string;
  domain?: string;
  studioDomain?: string;
};
const secretKey = (key: string) =>
  /PASSWORD|SECRET|TOKEN|KEY|SMTP_PASS/.test(key);
export default function ConfigureProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [env, setEnv] = useState<Record<string, string>>({});
  const [domain, setDomain] = useState("");
  const [studioDomain, setStudioDomain] = useState("");
  const [mode, setMode] = useState("");
  const [tab, setTab] = useState("general");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [confirmation, setConfirmation] = useState("");
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState(false);
  async function request(url: string, method = "GET", body?: unknown) {
    const r = await fetch(url, {
      method,
      ...(body
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    const data = await r.json();
    if (r.status === 401) router.replace("/auth/login");
    if (!r.ok)
      throw new Error(data.error || "Não foi possível concluir a operação.");
    return data;
  }
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      request(`/api/projects/${id}`),
      request(`/api/projects/${id}/env`),
    ])
      .then(([data, values]) => {
        if (cancelled) return;
        setProject(data.project);
        setMode(data.proxyMode);
        setEnv(values.envVars);
        setDomain(data.project.domain || "");
        setStudioDomain(data.project.studioDomain || "");
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  async function action(name: string, run: () => Promise<void>) {
    setBusy(name);
    setError("");
    setMessage("");
    try {
      await run();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha de conexão.");
    } finally {
      setBusy("");
    }
  }
  async function save() {
    const values = { ...env };
    if (domain.trim()) {
      values.API_EXTERNAL_URL = `https://${domain.trim()}/auth/v1`;
      values.SUPABASE_PUBLIC_URL = `https://${domain.trim()}`;
    }
    await request(`/api/projects/${id}/env`, "POST", values);
    if (domain.trim() || studioDomain.trim()) {
      await request(`/api/projects/${id}/domain`, "PUT", {
        domain: domain.trim().toLowerCase(),
        studioDomain: studioDomain.trim().toLowerCase(),
      });
    } else if (project?.domain || project?.studioDomain)
      await request(`/api/projects/${id}/domain`, "DELETE");
    const saved = await request(`/api/projects/${id}/env`);
    setEnv(saved.envVars);
    setProject((p) =>
      p
        ? { ...p, domain: domain.trim(), studioDomain: studioDomain.trim() }
        : p,
    );
    setDirty(false);
  }
  function field(key: string, label: string, hint?: string) {
    return (
      <div key={key} className="space-y-2">
        <Label htmlFor={key}>{label}</Label>
        <div className="flex gap-2">
          <Input
            id={key}
            className="font-mono text-xs"
            value={env[key] || ""}
            type={secretKey(key) && !revealed[key] ? "password" : "text"}
            autoComplete="off"
            onChange={(e) => {
              setEnv({ ...env, [key]: e.target.value });
              setDirty(true);
            }}
            disabled={!!busy}
          />
          {secretKey(key) && (
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label={`${revealed[key] ? "Ocultar" : "Mostrar"} ${label}`}
              onClick={() =>
                setRevealed({ ...revealed, [key]: !revealed[key] })
              }
            >
              {revealed[key] ? <EyeOff size={16} /> : <Eye size={16} />}
            </Button>
          )}
        </div>
        {hint && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={16} />
            Instâncias
          </Link>
          <span className="text-sm font-semibold">SupaPanel</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10">
        {error && (
          <div
            role="alert"
            className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          >
            {error}
          </div>
        )}
        {!project ? (
          <p className="py-20 text-center text-muted-foreground">
            {error
              ? "Não foi possível carregar esta instância."
              : "Carregando instância…"}
          </p>
        ) : (
          <>
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <div className="rounded-xl border bg-card p-3 text-primary">
                  <Database size={26} />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-2xl font-semibold tracking-tight">
                    {project.name}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {project.description ||
                      "Sua instância Supabase independente"}
                  </p>
                </div>
              </div>
              <span className="rounded-full border px-3 py-1 text-xs">
                {project.status === "active"
                  ? "Implantada"
                  : project.status === "paused"
                    ? "Pausada"
                    : "Pronta para configurar"}
              </span>
            </div>
            <div className="mb-8 flex gap-1 overflow-x-auto border-b">
              {[
                ["general", "Visão geral", Globe],
                ["credentials", "Credenciais", KeyRound],
                ["advanced", "Configuração avançada", Settings2],
              ].map(([key, label, Icon]) => {
                const I = Icon as typeof Globe;
                return (
                  <button
                    key={String(key)}
                    onClick={() => setTab(String(key))}
                    className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm ${tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                  >
                    <I size={15} />
                    {String(label)}
                  </button>
                );
              })}
            </div>
            {message && (
              <div
                role="status"
                className="mb-6 rounded-md border border-primary/25 bg-primary/10 p-4 text-sm text-primary"
              >
                {message}
              </div>
            )}
            <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
              <div className="space-y-6">
                {tab === "general" && (
                  <>
                    <section className="rounded-lg border bg-card p-6">
                      <h2 className="font-medium">Conecte sua instância</h2>
                      <p className="mb-6 mt-1 text-sm text-muted-foreground">
                        Aponte os registros DNS para seu servidor e informe os
                        domínios abaixo.
                      </p>
                      <div className="space-y-5">
                        <div className="space-y-2">
                          <Label htmlFor="domain">Domínio da API</Label>
                          <Input
                            id="domain"
                            placeholder="api.seuprojeto.com"
                            value={domain}
                            disabled={!!busy}
                            onChange={(e) => {
                              setDomain(e.target.value);
                              setDirty(true);
                            }}
                          />
                          <p className="text-xs text-muted-foreground">
                            Sem https:// ou caminhos. Usado por Auth, REST,
                            Storage e Realtime.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="studio-domain">
                            Domínio do Studio{" "}
                            <span className="text-muted-foreground">
                              (opcional)
                            </span>
                          </Label>
                          <Input
                            id="studio-domain"
                            placeholder="studio.seuprojeto.com"
                            value={studioDomain}
                            disabled={!!busy}
                            onChange={(e) => {
                              setStudioDomain(e.target.value);
                              setDirty(true);
                            }}
                          />
                          <p className="text-xs text-muted-foreground">
                            Protegido pelas credenciais do dashboard, através do
                            gateway.
                          </p>
                        </div>
                        {field(
                          "SITE_URL",
                          "URL da sua aplicação",
                          "Destino dos redirecionamentos de autenticação. Ex.: https://meuapp.com",
                        )}
                      </div>
                    </section>
                    <section className="rounded-lg border bg-card p-6">
                      <h2 className="mb-4 font-medium">Acessos</h2>
                      {project.status === "active" &&
                      (project.domain || project.studioDomain) ? (
                        <div className="space-y-3">
                          {[
                            ["API", project.domain],
                            ["Studio", project.studioDomain || project.domain],
                          ].map(
                            ([label, host]) =>
                              host && (
                                <a
                                  key={label}
                                  href={`https://${host}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm hover:border-primary/40"
                                >
                                  <span className="text-muted-foreground">
                                    {label}
                                  </span>
                                  <span className="truncate">{host}</span>
                                  <ExternalLink size={14} />
                                </a>
                              ),
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Configure um domínio e implante a instância para
                          acessá-la.
                        </p>
                      )}
                    </section>
                  </>
                )}
                {tab === "credentials" && (
                  <section className="space-y-6 rounded-lg border bg-card p-6">
                    <div>
                      <h2 className="font-medium">Credenciais da instância</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Geradas automaticamente com aleatoriedade criptográfica.
                        As chaves secretas são exclusivas deste projeto.
                      </p>
                    </div>
                    {field("DASHBOARD_USERNAME", "Usuário do Studio")}
                    {field("DASHBOARD_PASSWORD", "Senha do Studio")}
                    {field(
                      "POSTGRES_PASSWORD",
                      "Senha do banco",
                      "Após a primeira implantação, a senha do banco precisa ser alterada também no PostgreSQL. Alterar somente este campo não migra uma senha existente.",
                    )}
                    {field("ANON_KEY", "Chave pública · anon")}
                    {field(
                      "SERVICE_ROLE_KEY",
                      "Chave de serviço · service_role",
                      "Uso exclusivo no backend. Não exponha esta chave no navegador.",
                    )}
                  </section>
                )}
                {tab === "advanced" && (
                  <section className="rounded-lg border bg-card p-6">
                    <h2 className="font-medium">Variáveis de ambiente</h2>
                    <p className="mb-5 mt-1 text-sm text-muted-foreground">
                      Valores internos já configurados. Mantenha POSTGRES_PORT
                      em 5432. Alterações exigem uma nova implantação.
                    </p>
                    <Input
                      aria-label="Buscar variável"
                      placeholder="Buscar variável…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <div className="mt-6 space-y-5">
                      {Object.keys(env)
                        .filter((k) =>
                          k.toLowerCase().includes(search.toLowerCase()),
                        )
                        .sort()
                        .map((k) => field(k, k))}
                    </div>
                  </section>
                )}
              </div>
              <aside className="space-y-5">
                <section className="rounded-lg border bg-card p-5">
                  <h2 className="font-medium">Implantação</h2>
                  <p className="mb-5 mt-2 text-xs leading-relaxed text-muted-foreground">
                    {mode === "dokploy"
                      ? "Usa o proxy e os certificados do Dokploy. Nenhuma porta pública adicional é necessária."
                      : "Os serviços são executados em containers Docker no seu servidor."}
                  </p>
                  <div className="space-y-3">
                    <Button
                      className="w-full"
                      disabled={!!busy}
                      onClick={() =>
                        action("deploy", async () => {
                          await save();
                          await request(`/api/projects/${id}/deploy`, "POST");
                          setProject((p) => p && { ...p, status: "active" });
                          setMessage(
                            "Instância implantada. Os serviços passaram pela verificação de inicialização.",
                          );
                        })
                      }
                    >
                      {busy === "deploy" ? (
                        <Loader2 className="mr-2 animate-spin" size={16} />
                      ) : (
                        <Play className="mr-2" size={16} />
                      )}
                      {busy === "deploy"
                        ? "Implantando…"
                        : "Salvar e implantar"}
                    </Button>
                    <Button
                      className="w-full"
                      variant="outline"
                      disabled={!!busy}
                      onClick={() =>
                        action("save", async () => {
                          await save();
                          setMessage(
                            "Configuração salva. Implante a instância para aplicar as alterações.",
                          );
                        })
                      }
                    >
                      <Save size={16} className="mr-2" />
                      {busy === "save" ? "Salvando…" : "Salvar configuração"}
                    </Button>
                    {project.status === "active" && (
                      <Button
                        className="w-full"
                        variant="ghost"
                        disabled={!!busy}
                        onClick={() =>
                          action("pause", async () => {
                            await request(`/api/projects/${id}/status`, "POST");
                            setProject((p) => p && { ...p, status: "paused" });
                            setMessage(
                              "Instância pausada. Os dados foram preservados.",
                            );
                          })
                        }
                      >
                        <Pause size={16} className="mr-2" />
                        Pausar instância
                      </Button>
                    )}
                  </div>
                  {dirty && (
                    <p className="mt-4 text-xs text-amber-400">
                      Você tem alterações não salvas.
                    </p>
                  )}
                  {busy === "deploy" && (
                    <p
                      role="status"
                      className="mt-4 text-xs leading-relaxed text-muted-foreground"
                    >
                      O primeiro download pode levar alguns minutos. Mantenha
                      esta página aberta.
                    </p>
                  )}
                </section>
                <details className="rounded-lg border border-destructive/20 p-5">
                  <summary className="cursor-pointer text-sm text-destructive">
                    Excluir instância
                  </summary>
                  <p className="my-4 text-xs leading-relaxed text-muted-foreground">
                    Remove containers, volumes e todos os dados permanentemente.
                    Para confirmar, digite <strong>{project.name}</strong>.
                  </p>
                  <Input
                    aria-label="Nome da instância para confirmar exclusão"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                  <Button
                    className="mt-3 w-full"
                    variant="destructive"
                    disabled={!!busy || confirmation !== project.name}
                    onClick={() =>
                      action("delete", async () => {
                        await request(`/api/projects/${id}`, "DELETE");
                        router.push("/dashboard");
                      })
                    }
                  >
                    <Trash2 size={15} className="mr-2" />
                    Excluir permanentemente
                  </Button>
                </details>
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
