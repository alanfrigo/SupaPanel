import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { projectsPath } from "./runtime";
// Shared by routing and port changes so one edit cannot overwrite the other.
export async function editCompose(
  slug: string,
  edit: (
    source: string,
    transaction: Prisma.TransactionClient,
  ) => string | Promise<string>,
) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('supapanel-compose-edits'))::text`;
      const file = path.join(
        projectsPath(),
        slug,
        "docker",
        "docker-compose.yml",
      );
      const source = await fs.readFile(file, "utf8");
      const updated = await edit(source, tx);
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, updated, { mode: 0o600 });
        await fs.rename(temporary, file);
      } finally {
        await fs.rm(temporary, { force: true });
      }
    },
    { timeout: 120000, maxWait: 120000 },
  );
}
