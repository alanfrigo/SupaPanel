import { promises as fs } from "node:fs";
import { editCompose } from "@/lib/compose-file";
import {
  PortConfigurationError,
  validatePortSettings,
  publishDatabasePorts,
  publishedPorts,
  type ResolvedCompose,
} from "@/lib/host-ports";
import { findInstance } from "@/lib/companies";
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { validateSession } from "@/lib/auth";
import { projectsPath } from "@/lib/runtime";
import { getConnections } from "@/lib/connections";
const run = promisify(execFile);
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await validateSession(
    request.cookies.get("session")?.value || "",
  );
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await findInstance(id, session.user.id);
  if (!project)
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  try {
    const { stdout } = await run(
      "docker",
      ["compose", "config", "--format", "json"],
      {
        cwd: path.join(projectsPath(), project.slug, "docker"),
        timeout: 15000,
        maxBuffer: 2 * 1024 * 1024,
      },
    );
    const data = getConnections(JSON.parse(stdout));
    try {
      const listed = await run("docker", ["compose", "ps", "-a", "-q"], {
        cwd: path.join(projectsPath(), project.slug, "docker"),
        timeout: 10000,
      });
      const ids = listed.stdout.trim().split(/\s+/).filter(Boolean);
      const containers = ids.length
        ? JSON.parse(
            (
              await run("docker", ["inspect", ...ids], {
                timeout: 10000,
                maxBuffer: 8 * 1024 * 1024,
              })
            ).stdout,
          )
        : [];
      for (const connection of data.connections) {
        const service = connection.id === "direct" ? "db" : "supavisor";
        const container = containers.find(
          (c: { Config?: { Labels?: Record<string, string> } }) =>
            c.Config?.Labels?.["com.docker.compose.service"] === service,
        );
        const active: { HostPort: string; HostIp: string }[] = container?.State
          ?.Running
          ? container.NetworkSettings?.Ports?.[`${connection.port}/tcp`] || []
          : [];
        connection.publicationState = connection.published
          ? active.some(
              (p) =>
                p.HostPort === connection.published!.port &&
                p.HostIp === connection.published!.bind,
            )
            ? "active"
            : "pending"
          : active.length
            ? "pending"
            : "private";
      }
    } catch {
      for (const connection of data.connections)
        connection.publicationState = "unknown";
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Não foi possível ler as conexões. Verifique a configuração Compose da instância e tente novamente.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await validateSession(
    request.cookies.get("session")?.value || "",
  );
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const project = await findInstance((await params).id, session.user.id);
  if (!project)
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  try {
    const settings = validatePortSettings(await request.json());
    await editCompose(project.slug, async (source, transaction) => {
      const cwd = path.join(projectsPath(), project.slug, "docker");
      for (const file of [
        "docker-compose.override.yml",
        "docker-compose.override.yaml",
        "compose.override.yml",
        "compose.override.yaml",
      ]) {
        if (
          await fs.stat(path.join(cwd, file)).then(
            () => true,
            () => false,
          )
        )
          throw new PortConfigurationError(
            "Esta instância usa um arquivo Compose override. Consolide os mapeamentos no arquivo principal antes de gerenciar portas pelo painel.",
          );
      }
      const requested = Object.values(settings)
        .filter((v) => v.enabled)
        .map((v) => v.port);
      const occupied = new Set<number>();
      const projects = await transaction.project.findMany({
        select: { id: true, slug: true, status: true },
      });
      let resolved: ResolvedCompose | undefined;
      for (const instance of projects) {
        if (['provisioning', 'failed'].includes(instance.status) && !await fs.access(path.join(projectsPath(), instance.slug, 'docker', 'docker-compose.yml')).then(() => true, () => false)) continue;
        const { stdout } = await run(
          "docker",
          ["compose", "config", "--format", "json"],
          {
            cwd: path.join(projectsPath(), instance.slug, "docker"),
            timeout: 15000,
            maxBuffer: 4 * 1024 * 1024,
          },
        );
        const config = JSON.parse(stdout) as ResolvedCompose;
        if (instance.id === project.id) {
          resolved = config;
          for (const [service, value] of Object.entries(config.services)) {
            const dbPort = Number(
              config.services.db?.environment?.PGPORT ||
                config.services.db?.environment?.POSTGRES_PORT ||
                5432,
            );
            for (const port of value.ports || []) {
              if (
                (service === "db" && port.target === dbPort) ||
                (service === "supavisor" && [5432, 6543].includes(port.target))
              )
                continue;
              if (port.published && port.protocol !== "udp")
                occupied.add(Number(port.published));
            }
          }
        } else for (const port of publishedPorts(config)) occupied.add(port);
      }
      // Inspect the actual daemon, not the panel container's network namespace.
      const own = await run(
        "docker",
        ["compose", "ps", "-a", "-q", "db", "supavisor"],
        { cwd, timeout: 15000 },
      );
      const ownIds = new Set(own.stdout.trim().split(/\s+/));
      const running = await run("docker", ["ps", "-q"], { timeout: 15000 });
      const ids = running.stdout.trim().split(/\s+/).filter(Boolean);
      if (ids.length) {
        const inspected = await run("docker", ["inspect", ...ids], {
          timeout: 15000,
          maxBuffer: 16 * 1024 * 1024,
        });
        for (const container of JSON.parse(inspected.stdout)) {
          if (ownIds.has(container.Id)) continue;
          for (const [target, bindings] of Object.entries(
            container.NetworkSettings?.Ports || {},
          )) {
            if (!target.endsWith("/tcp") || !Array.isArray(bindings)) continue;
            for (const binding of bindings)
              occupied.add(Number(binding.HostPort));
          }
        }
      }
      if (requested.some((port) => occupied.has(port)))
        throw new PortConfigurationError(
          "Uma das portas está reservada por outra instância ou em uso por um container. Escolha outra porta.",
        );
      if (!resolved)
        throw new PortConfigurationError("Configuração da instância não encontrada.");
      return publishDatabasePorts(source, resolved, settings);
    });
    return NextResponse.json({
      success: true,
      message:
        "Portas salvas. Implante a instância para aplicar. A alteração pode reiniciar os serviços de banco e pooler.",
    });
  } catch (error) {
    // Never return exec diagnostics: resolved Compose may contain credentials.
    return NextResponse.json(
      {
        error:
          error instanceof PortConfigurationError
            ? error.message
            : "Não foi possível validar as portas no Docker. Verifique a disponibilidade do daemon e a configuração das instâncias.",
      },
      { status: 400 },
    );
  }
}
