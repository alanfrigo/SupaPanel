"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ConnectionInfo } from "@/lib/connections";
import type { PortSettings } from "@/lib/host-ports";
const connectionKinds = ["direct", "session", "transaction"] as const;
export default function HostPorts({
  data,
  projectId,
  dirty,
  onSaved,
}: {
  data: ConnectionInfo;
  projectId: string;
  dirty: boolean;
  onSaved: (message: string) => void;
}) {
  const [settings, setSettings] = useState<PortSettings>(
    () =>
      Object.fromEntries(
        connectionKinds.map((kind, index) => {
          const published = data.connections.find(
            (c) => c.id === kind,
          )?.published;
          return [
            kind,
            {
              enabled: !!published,
              port: Number(published?.port || 15432 + index),
              bind: published?.bind === "0.0.0.0" ? "0.0.0.0" : "127.0.0.1",
            },
          ];
        }),
      ) as PortSettings,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function save(apply = false) {
    let persisted = false;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch(`/api/projects/${projectId}/connections`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      persisted = true;
      let text = body.message;
      if (apply) {
        setMessage("Portas salvas. Implantando a instância…");
        const deployed = await fetch(`/api/projects/${projectId}/deploy`, {
          method: "POST",
        });
        const result = await deployed.json();
        if (!deployed.ok)
          throw new Error(
            "Portas salvas, mas a implantação falhou: " + result.error,
          );
        text =
          "Portas aplicadas. As conexões abaixo mostram a configuração implantada.";
      }
      setMessage("");
      onSaved(text);
    } catch (e) {
      if (persisted)
        onSaved("Portas salvas, aguardando uma implantação bem-sucedida.");
      setError(e instanceof Error ? e.message : "Falha ao salvar portas.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-md border bg-background p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Expor conexões no host
      </summary>
      <p className="my-3 text-xs text-muted-foreground">
        Escolha quais conexões publicar. “Acesso remoto” disponibiliza a porta
        nas interfaces do servidor; restrinja os IPs de origem no firewall. O
        domínio da API e seu HTTPS não fornecem TLS ao PostgreSQL.
      </p>
      <div className="space-y-3">
        {connectionKinds.map((kind) => {
          const connection = data.connections.find((c) => c.id === kind);
          if (!connection) return null;
          const value = settings[kind];
          return (
            <div
              key={kind}
              className="flex flex-wrap items-center gap-3 rounded border p-3"
            >
              <label className="flex min-w-40 flex-1 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={value.enabled}
                  disabled={busy}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      [kind]: { ...value, enabled: e.target.checked },
                    }))
                  }
                />
                {connection.title}
              </label>
              <Input
                aria-label={`Porta do host — ${connection.title}`}
                type="number"
                min={1024}
                max={65535}
                className="w-28"
                value={value.port}
                disabled={busy || !value.enabled}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    [kind]: { ...value, port: Number(e.target.value) },
                  }))
                }
              />
              <select
                aria-label={`Acesso — ${connection.title}`}
                className="h-10 rounded-md border bg-card px-2 text-sm"
                disabled={busy || !value.enabled}
                value={value.bind}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    [kind]: {
                      ...value,
                      bind: e.target.value as "0.0.0.0" | "127.0.0.1",
                    },
                  }))
                }
              >
                <option value="127.0.0.1">Somente servidor / túnel SSH</option>
                <option value="0.0.0.0">Acesso remoto</option>
              </select>
            </div>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-primary">
          {message}
        </p>
      )}
      {dirty && (
        <p className="mt-3 text-xs text-amber-400">
          Salve as alterações de configuração antes de editar as portas.
        </p>
      )}
      <Button
        type="button"
        className="mt-4"
        disabled={busy || dirty}
        onClick={() => void save(false)}
      >
        {busy ? "Processando…" : "Salvar portas"}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="ml-2 mt-4"
        disabled={busy || dirty}
        onClick={() => void save(true)}
      >
        Salvar e implantar
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        Use “Salvar e implantar” para aplicar agora; isso pode reiniciar o banco
        e o pooler. Desmarcar uma conexão remove sua publicação na próxima
        implantação. Serviços fora do Docker também podem ocupar portas; a
        implantação detectará esses conflitos.
      </p>
    </details>
  );
}
