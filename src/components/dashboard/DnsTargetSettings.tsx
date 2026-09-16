"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export default function DnsTargetSettings() {
  const [target, setTarget] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    fetch("/api/settings/dns-target")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setTarget(d.target || "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <section className="mt-6 space-y-4 rounded-lg border bg-card p-6">
      <div>
        <h2 className="font-medium">
          Hostname para os domínios das instâncias
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Crie um registro A para <code>infra.seudominio.com</code> apontando
          para o IP do servidor. Seus clientes poderão apontar os subdomínios de
          API e Studio para esse hostname usando CNAME.
        </p>
      </div>
      <Label htmlFor="dns-target">Destino dos registros CNAME</Label>
      <Input
        id="dns-target"
        placeholder="infra.seudominio.com"
        value={target}
        disabled={loading}
        onChange={(e) => {
          setTarget(e.target.value);
          setSaved(false);
        }}
      />
      <p className="text-xs text-muted-foreground">
        Por padrão, usamos o hostname da URL do painel, quando disponível. O
        hostname escolhido precisa resolver para o servidor do proxy. Salvar
        aqui não cria nem altera registros no seu provedor DNS.
      </p>
      <Button
        disabled={loading || !target.trim()}
        onClick={async () => {
          setLoading(true);
          setError("");
          setSaved(false);
          try {
            const r = await fetch("/api/settings/dns-target", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ target }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setTarget(d.target);
            setSaved(true);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao salvar.");
          } finally {
            setLoading(false);
          }
        }}
      >
        Salvar hostname
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-primary">
          Hostname salvo. Ele aparecerá nas instruções DNS das instâncias.
        </p>
      )}
    </section>
  );
}
