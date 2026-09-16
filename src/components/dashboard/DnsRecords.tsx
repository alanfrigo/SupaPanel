"use client";
import { useState } from "react";
import Link from "next/link";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function DnsRecords({
  target,
  domain,
  studioDomain,
}: {
  target: string | null;
  domain: string;
  studioDomain: string;
}) {
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const domains = [
    ...new Set(
      [domain.trim().toLowerCase(), studioDomain.trim().toLowerCase()].filter(
        Boolean,
      ),
    ),
  ];
  return (
    <div className="space-y-3 rounded-md border bg-background p-4">
      <h3 className="text-sm font-medium">Configure o DNS com CNAME</h3>
      {target ? (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">
            No provedor DNS do seu domínio, crie os registros abaixo. Depois,
            salve e implante a instância para configurar o acesso HTTPS.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="pr-3">Nome</th>
                  <th>Destino</th>
                  <th>
                    <span className="sr-only">Copiar destino</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {domains.map((host) => (
                  <tr key={host} className="border-t">
                    <td className="pr-3">CNAME</td>
                    <td className="py-3 pr-3 font-mono break-all">{host}</td>
                    <td className="font-mono break-all">
                      {host === target
                        ? "O próprio destino: use A/AAAA"
                        : target}
                    </td>
                    <td>
                      {host !== target && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Copiar destino CNAME de ${host}`}
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(target);
                              setCopied(host);
                              setError("");
                            } catch {
                              setError(
                                "Selecione o destino e copie manualmente; não foi possível acessar a área de transferência.",
                              );
                            }
                          }}
                        >
                          {copied === host ? (
                            <Check size={14} />
                          ) : (
                            <Copy size={14} />
                          )}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!domains.length && (
            <p className="text-xs text-muted-foreground">
              Preencha o domínio da API ou do Studio para ver os registros.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Use subdomínios (api e studio). No domínio raiz, suporte a
            ALIAS/ANAME depende do provedor. Não mantenha registros A/AAAA
            conflitantes no mesmo nome. Trocar o hostname central exige
            atualizar os CNAMEs existentes; trocar apenas seu IP exige alterar
            somente o registro A/AAAA central.
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          <Link href="/dashboard/settings" className="text-primary underline">
            Configure o hostname central nas configurações
          </Link>{" "}
          para exibir os registros CNAME prontos para copiar. Você também pode
          usar registros A apontando para o IP do servidor.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {copied && (
        <p role="status" className="text-xs text-primary">
          Destino copiado.
        </p>
      )}
    </div>
  );
}
