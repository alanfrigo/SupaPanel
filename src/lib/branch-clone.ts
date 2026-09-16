import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { projectsPath } from "./runtime";
const exec = promisify(execFile);
const STORAGE_COPY_IMAGE = "debian:bookworm-slim";
export async function prepareStorageCopy() {
  await exec(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "none",
      STORAGE_COPY_IMAGE,
      "tar",
      "--version",
    ],
    { timeout: 300000 },
  );
}
export async function stopStorageCopy(slug: string) {
  await exec("docker", ["rm", "-f", `supapanel-copy-${slug}`], {
    timeout: 15000,
  }).catch(() => {});
}
export const stackPath = (slug: string) =>
  path.join(projectsPath(), slug, "docker");
export async function docker(slug: string, args: string[], timeout = 600000) {
  return exec("docker", ["compose", ...args], {
    cwd: stackPath(slug),
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
}
export async function privateBranchCompose(slug: string) {
  const file = path.join(stackPath(slug), "docker-compose.yml");
  const config = parse(await fs.readFile(file, "utf8"));
  for (const service of Object.values(config.services) as Record<
    string,
    unknown
  >[]) {
    delete service.ports;
    service.labels = { "traefik.enable": "false" };
  }
  // Keep the gateway network for future domain configuration, without active routes.
  await fs.writeFile(file, stringify(config), { mode: 0o600 });
}
const dbArgs = ["exec", "-T", "-u", "postgres", "db"];
export async function exportDatabase(
  slug: string,
  file: string,
  schemas: string[],
  schemaOnly: boolean,
) {
  const handle = await fs.open(file, "wx", 0o600);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "docker",
        [
          "compose",
          ...dbArgs,
          "pg_dump",
          "-U",
          "supabase_admin",
          "-d",
          "postgres",
          "-Fc",
          "--no-owner",
          "--no-publications",
          "--no-subscriptions",
          "--strict-names",
          "--lock-wait-timeout=15s",
          ...(schemaOnly ? ["--schema-only"] : []),
          ...schemas.map((s) => `--schema=${s}`),
        ],
        { cwd: stackPath(slug), stdio: ["ignore", handle.fd, "ignore"] },
      );
      const timer = setTimeout(() => child.kill("SIGKILL"), 1800000);
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error("dump"));
      });
    });
  } finally {
    await handle.close();
  }
}
export async function restoreDatabase(slug: string, file: string) {
  const handle = await fs.open(file, "r");
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "docker",
        [
          "compose",
          ...dbArgs,
          "pg_restore",
          "-U",
          "supabase_admin",
          "-d",
          "postgres",
          "--clean",
          "--if-exists",
          "--exit-on-error",
          "--single-transaction",
        ],
        { cwd: stackPath(slug), stdio: [handle.fd, "ignore", "ignore"] },
      );
      const timer = setTimeout(() => child.kill("SIGKILL"), 1800000);
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error("restore"));
      });
    });
  } finally {
    await handle.close();
  }
}
export async function copyStorage(sourceSlug: string, targetSlug: string) {
  const container = (
    await docker(sourceSlug, ["ps", "-a", "-q", "storage"])
  ).stdout.trim();
  if (!container || /\s/.test(container)) throw new Error("storage container");
  // Create the target mounts without starting services; copy xattrs used by Storage.
  await docker(targetSlug, ["create", "storage"]);
  const targetId = (
    await docker(targetSlug, ["ps", "-a", "-q", "storage"])
  ).stdout.trim();
  const inspected = JSON.parse(
    (await exec("docker", ["inspect", targetId])).stdout,
  )[0];
  const mount = inspected.Mounts.find(
    (m: { Destination: string }) => m.Destination === "/var/lib/storage",
  );
  if (mount?.Type !== "volume" || !mount.Name)
    throw new Error("target Storage volume");
  await exec(
    "docker",
    [
      "run",
      "--rm",
      "--name",
      `supapanel-copy-${targetSlug}`,
      "--network",
      "none",
      "--user",
      "0",
      "--volumes-from",
      `${container}:ro`,
      "--mount",
      `type=volume,src=${mount.Name},dst=/branch-storage`,
      "--entrypoint",
      "/bin/bash",
      STORAGE_COPY_IMAGE,
      "-o",
      "pipefail",
      "-c",
      "tar --xattrs --xattrs-include='*' -C /var/lib/storage -cpf - . | tar --xattrs --xattrs-include='*' -C /branch-storage -xpf -",
    ],
    { timeout: 1800000, maxBuffer: 1024 * 1024 },
  );
}
