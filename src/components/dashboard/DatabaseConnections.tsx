"use client";
import { useEffect, useState } from "react";
import { Copy, Eye, EyeOff, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { connectionUri, type ConnectionInfo } from "@/lib/connections";

export default function DatabaseConnections({
  projectId,
  dirty,
}: {
  projectId: string;
  dirty: boolean;
}) {
  const [data, setData] = useState<ConnectionInfo | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState("direct");
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState("");
  const [scope, setScope] = useState("docker");
  const [serverHost, setServerHost] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    fetch(`/api/projects/${projectId}/connections`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        return body;
      })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [projectId, attempt, dirty]);
  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(""), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);
  const current =
    data?.connections.find((c) => c.id === selected) || data?.connections[0];
  const published = scope === "host" && current?.published;
  const wildcard = published && ["0.0.0.0", "::"].includes(published.bind);
  const host = published
    ? wildcard
      ? serverHost.trim()
      : published.bind
    : current?.host || "";
  const validHost = /^[a-zA-Z0-9._:[\]-]+$/.test(host);
  const port = published ? published.port : current?.port || 5432;
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setError("");
    } catch {
      setError(
        "Não foi possível copiar. Selecione o texto e copie manualmente; a área de transferência exige HTTPS ou localhost.",
      );
    }
  }
  function copyButton(value: string, label: string, disabled = false) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Copiar ${label}`}
        disabled={disabled}
        onClick={() => copy(value, label)}
      >
        {copied === label ? (
          <Check size={15} className="text-primary" />
        ) : (
          <Copy size={15} />
        )}
      </Button>
    );
  }
  return (
    <section className="space-y-5 rounded-lg border bg-card p-5 sm:p-6">
      <div>
        <h2 className="font-medium">Conectar ao banco</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Copie a URI ou use os parâmetros no seu cliente PostgreSQL.
        </p>
      </div>
      {error && (
        <div role="alert" className="text-sm text-destructive">
          {error}
          {!data && (
            <Button
              variant="outline"
              className="ml-2"
              onClick={() => setAttempt(attempt + 1)}
            >
              Tentar novamente
            </Button>
          )}
        </div>
      )}
      {!data && !error && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 size={16} className="animate-spin" />
          Carregando conexões…
        </p>
      )}
      {current && data && (
        <>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Tipo de conexão"
          >
            {data.connections.map((c) => (
              <Button
                key={c.id}
                variant={current.id === c.id ? "default" : "outline"}
                size="sm"
                aria-pressed={current.id === c.id}
                onClick={() => {
                  setSelected(c.id);
                  setReveal(false);
                  setCopied("");
                  setScope("docker");
                }}
              >
                {c.title}
              </Button>
            ))}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {current.description}
          </p>
          <div className="space-y-3 rounded-md border bg-background p-4">
            <label className="flex flex-wrap items-center justify-between gap-2 text-sm">
              Origem da conexão
              <select
                className="rounded-md border bg-card px-3 py-2 text-sm"
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value);
                  setCopied("");
                }}
              >
                <option value="docker">Rede Docker da instância</option>
                {current.published && (
                  <option value="host">Porta publicada no servidor</option>
                )}
              </select>
            </label>
            {scope === "docker" ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Disponível para containers conectados à rede{" "}
                <code className="break-all text-foreground">
                  {data.network}
                </code>
                . O domínio HTTPS da API não fornece acesso SQL.
                {!current.published &&
                  " Esta conexão não tem uma porta publicada no servidor."}
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Use o endereço do servidor onde esta porta está publicada.
                  Firewall e conectividade precisam permitir acesso.
                  {published &&
                    ["127.0.0.1", "::1"].includes(published.bind) &&
                    " Esta porta está limitada ao próprio servidor; para acesso remoto, utilize um túnel SSH."}
                </p>
                {wildcard && (
                  <Input
                    aria-label="IP ou hostname do servidor"
                    placeholder="IP ou hostname do servidor, sem https://"
                    value={serverHost}
                    onChange={(e) => setServerHost(e.target.value)}
                  />
                )}
              </>
            )}
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Connection string</span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={
                    reveal
                      ? "Ocultar senha da conexão"
                      : "Mostrar senha da conexão"
                  }
                  onClick={() => setReveal(!reveal)}
                >
                  {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
                </Button>
                {copyButton(
                  connectionUri(current, current.password, host, port),
                  "URI com senha",
                  !validHost || !current.password,
                )}
              </div>
            </div>
            <code className="block break-all rounded-md border bg-background p-3 text-xs leading-relaxed select-all">
              {connectionUri(
                current,
                reveal ? current.password : "SUA_SENHA",
                host || "HOST_DO_SERVIDOR",
                port,
              )}
            </code>
            <p className="mt-2 text-xs text-muted-foreground">
              O botão copia a URI completa, incluindo a senha. Caracteres
              especiais são codificados automaticamente.
            </p>
          </div>
          <dl className="divide-y rounded-md border">
            {[
              ["Host", host || "Informe o host do servidor"],
              ["Porta", String(port)],
              ["Banco", current.database],
              ["Usuário", current.username],
              ["Senha", reveal ? current.password : "••••••••••••"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center gap-3 px-3 py-1.5">
                <dt className="w-16 shrink-0 text-xs text-muted-foreground">
                  {label}
                </dt>
                <dd className="min-w-0 flex-1 break-all font-mono text-xs">
                  {value}
                </dd>
                {copyButton(
                  label === "Senha" ? current.password : value,
                  label,
                  label === "Host" && !validHost,
                )}
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            Dados da configuração salva. Implante a instância para aplicar
            alterações. O HTTPS do painel não habilita TLS para PostgreSQL;
            configure SSL no cliente conforme o seu servidor.
          </p>
          {dirty && (
            <p role="status" className="text-xs text-amber-400">
              Há alterações não salvas; estas conexões ainda mostram os valores
              salvos.
            </p>
          )}
          {copied && (
            <p role="status" className="text-xs text-primary">
              {copied} copiado.
            </p>
          )}
        </>
      )}
    </section>
  );
}
