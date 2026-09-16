import { prisma } from "./db";
import { provisionProjectFiles, updateProjectEnvVars } from "./project";
import {
  docker,
  exportDatabase,
  restoreDatabase,
  privateBranchCompose,
  copyStorage,
  stackPath,
  prepareStorageCopy,
  stopStorageCopy,
} from "./branch-clone";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { BranchJob } from "@prisma/client";
import { companyAccess } from "./companies";
import { BranchError } from "./branch-policy";
import { supabaseRef } from "./runtime";

async function resumeSource(job: BranchJob) {
  if (!job.pausedServices.length) return;
  const source = await prisma.project.findUniqueOrThrow({
    where: { id: job.sourceId },
  });
  await docker(source.slug, [
    "start",
    "--wait",
    "--wait-timeout",
    "240",
    ...job.pausedServices,
  ]);
  await prisma.branchJob.update({
    where: { id: job.id },
    data: { pausedServices: [] },
  });
}
async function execute(job: BranchJob) {
  const target = await prisma.project.findUniqueOrThrow({
    where: { id: job.targetId },
  });
  const source = await prisma.project.findUniqueOrThrow({
    where: { id: job.sourceId },
  });
  const archive = path.join(stackPath(target.slug), ".branch.dump");
  let stage = "Preparando stack e credenciais independentes";
  const progress = async (value: string) => {
    stage = value;
    const owned = await prisma.branchJob.updateMany({
      where: { id: job.id, status: "running" },
      data: { stage: value },
    });
    if (!owned.count) throw new Error("Job ownership lost");
  };
  try {
    await progress(stage);
    if (
      !(await prisma.managedProject.findFirst({
        where: {
          id: job.projectId,
          company: companyAccess(job.requestedBy, "operate"),
        },
      }))
    )
      throw new BranchError(
        "O solicitante não possui mais permissão para operar este projeto.",
      );
    if (job.mode !== "empty") {
      const version = JSON.parse(
        await fs.readFile(
          path.join(stackPath(source.slug), "..", "supapanel-version.json"),
          "utf8",
        ),
      );
      if (version.ref !== supabaseRef())
        throw new BranchError(
          "A origem usa outra versão de template. Atualize e valide a compatibilidade antes de clonar.",
        );
    }
    await provisionProjectFiles(target);
    await privateBranchCompose(target.slug);
    if (job.mode !== "empty") {
      const sourceConfig = JSON.parse(
        (await docker(source.slug, ["config", "--format", "json"])).stdout,
      );
      const targetConfig = JSON.parse(
        (await docker(target.slug, ["config", "--format", "json"])).stdout,
      );
      if (
        (sourceConfig.services.db?.environment?.POSTGRES_DB || "postgres") !==
        "postgres"
      )
        throw new BranchError("A clonagem exige o banco postgres padrão.");
      for (const service of [
        "db",
        ...(job.mode === "full" ? ["auth", "storage"] : []),
      ]) {
        if (
          sourceConfig.services[service]?.image !==
          targetConfig.services[service]?.image
        )
          throw new BranchError(
            `A imagem do serviço ${service} difere do template atual. Alinhe as versões antes de clonar.`,
          );
      }
    }
    if (job.mode === "full") {
      await progress("Verificando Storage local e pausando serviços da origem");
      await prepareStorageCopy();
      const config = JSON.parse(
        (await docker(source.slug, ["config", "--format", "json"])).stdout,
      );
      if (config.services.storage?.environment?.STORAGE_BACKEND !== "file")
        throw new BranchError(
          "Clonagem completa exige Storage local; S3 externo não é suportado.",
        );
      // Non-default Auth encryption requires a dedicated key migration, not a silent broken clone.
      if (
        Object.keys(config.services.auth?.environment || {}).some(
          (key) =>
            /ENCRYPTION_KEY/.test(key) && config.services.auth.environment[key],
        )
      )
        throw new BranchError(
          "Auth usa uma chave de criptografia personalizada e exige migração específica dessa chave.",
        );
      const storageEnv = config.services.storage.environment;
      if (storageEnv.FILE_STORAGE_BACKEND_PATH !== "/var/lib/storage")
        throw new BranchError(
          "O caminho personalizado do Storage não é suportado pela clonagem.",
        );
      const updated = await updateProjectEnvVars(target.id, {
        STORAGE_TENANT_ID: storageEnv.TENANT_ID,
        GLOBAL_S3_BUCKET: storageEnv.GLOBAL_S3_BUCKET,
      });
      if (!updated.success) throw new Error("storage namespace");
      const running = (
        await docker(source.slug, ["ps", "--status", "running", "--services"])
      ).stdout
        .trim()
        .split(/\s+/)
        .filter((s) => s && s !== "db");
      job = await prisma.branchJob.update({
        where: { id: job.id },
        data: { pausedServices: running },
      });
      if (running.length) await docker(source.slug, ["stop", ...running]);
    }
    if (job.mode !== "empty") {
      await progress("Exportando snapshot do banco de origem");
      await exportDatabase(
        source.slug,
        archive,
        [...job.schemas, ...(job.mode === "full" ? ["auth", "storage"] : [])],
        job.mode === "schema",
      );
      if (job.mode === "full") {
        await progress("Copiando arquivos do Storage local");
        await copyStorage(source.slug, target.slug);
        await resumeSource(job);
        job.pausedServices = [];
      }
    }
    await progress("Inicializando o banco isolado");
    await docker(target.slug, [
      "up",
      "-d",
      "--wait",
      "--wait-timeout",
      "240",
      "db",
    ]);
    if (job.mode !== "empty") {
      await progress("Restaurando estrutura e dados na branch");
      await restoreDatabase(target.slug, archive);
      if (job.mode === "full")
        await docker(target.slug, [
          "exec",
          "-T",
          "-u",
          "postgres",
          "db",
          "psql",
          "-U",
          "supabase_admin",
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          "BEGIN; DELETE FROM auth.refresh_tokens; DELETE FROM auth.sessions; COMMIT;",
        ]);
    }
    await progress("Iniciando e verificando serviços da branch");
    await docker(target.slug, ["up", "-d", "--wait", "--wait-timeout", "240"]);
    await prisma.$transaction(async (tx) => {
      const owned = await tx.branchJob.updateMany({
        where: { id: job.id, status: "running" },
        data: { status: "completed", stage: "Branch pronta", error: null },
      });
      if (!owned.count) throw new Error("Job ownership lost");
      await tx.project.update({
        where: { id: target.id },
        data: { status: "active" },
      });
    });
  } catch (error) {
    if (
      (await prisma.branchJob.findUnique({ where: { id: job.id } }))?.status !==
      "running"
    )
      return;
    // Never surface raw Docker/SQL diagnostics: they may contain passwords or user data.
    let recovery = "";
    try {
      await resumeSource(job);
    } catch {
      recovery =
        " Não foi possível retomar os serviços da origem; use Retomar origem antes de continuar.";
    }
    try {
      await docker(target.slug, ["stop"]);
    } catch {
      /* Files may not exist yet. */
    }
    await prisma.$transaction([
      prisma.project.update({
        where: { id: target.id },
        data: { status: "failed" },
      }),
      prisma.branchJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          stage,
          error: `${error instanceof BranchError ? error.message : `Falha em: ${stage}.`} A cópia não foi liberada. Verifique compatibilidade de versões, extensões, roles e dependências dos schemas. Exclua esta branch e crie outra para repetir.${recovery}`,
        },
      }),
    ]);
  } finally {
    await stopStorageCopy(target.slug);
    await fs.rm(archive, { force: true }).catch(() => {});
  }
}

// A PostgreSQL advisory lock elects one worker across processes. Queue/status updates
// use separate committed transactions so progress remains visible throughout a job.
export async function runBranchQueue() {
  await prisma.$transaction(
    async (lock) => {
      const acquired = await lock.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(hashtext('supapanel-branch-worker')) AS locked`;
      if (!acquired[0]?.locked) return;
      // A previous worker lost its lock (restart/crash). Never silently repeat a restore.
      const interrupted = await prisma.branchJob.findMany({
        where: { status: "running" },
      });
      for (const job of interrupted) {
        const target = await prisma.project.findUnique({
          where: { id: job.targetId },
        });
        let recovery = "";
        try {
          await resumeSource(job);
        } catch {
          recovery = " Retome a origem pelo painel.";
        }
        if (target) {
          await stopStorageCopy(target.slug);
          try {
            await docker(target.slug, ["stop"]);
          } catch {}
          await fs
            .rm(path.join(stackPath(target.slug), ".branch.dump"), {
              force: true,
            })
            .catch(() => {});
          await prisma.project.update({
            where: { id: target.id },
            data: { status: "failed" },
          });
        }
        await prisma.branchJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            error: `Operação interrompida pelo reinício do worker. Exclua a cópia incompleta e crie outra.${recovery}`,
          },
        });
      }
      const job = await prisma.branchJob.findFirst({
        where: { status: "queued" },
        orderBy: { createdAt: "asc" },
      });
      if (!job) return;
      await prisma.branchJob.update({
        where: { id: job.id },
        data: { status: "running" },
      });
      await execute(job);
    },
    { timeout: 7200000, maxWait: 5000 },
  );
}
const globalWorker = globalThis as unknown as {
  branchWorkerTimer?: ReturnType<typeof setInterval>;
  branchWorkerBusy?: boolean;
};
export function startBranchWorker() {
  if (
    globalWorker.branchWorkerTimer ||
    process.env.BRANCH_WORKER_DISABLED === "1"
  )
    return;
  const tick = async () => {
    if (globalWorker.branchWorkerBusy) return;
    globalWorker.branchWorkerBusy = true;
    try {
      await runBranchQueue();
    } catch {
      console.error("Branch worker unavailable; retrying on next tick.");
    } finally {
      globalWorker.branchWorkerBusy = false;
    }
  };
  globalWorker.branchWorkerTimer = setInterval(() => {
    void tick();
  }, 5000);
  globalWorker.branchWorkerTimer.unref();
  void tick();
}
export async function recoverBranchSource(jobId: string) {
  const job = await prisma.branchJob.findUniqueOrThrow({
    where: { id: jobId },
  });
  if (job.status !== "failed") throw new Error("Job ainda está em andamento.");
  await resumeSource(job);
}
