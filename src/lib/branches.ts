import { prisma } from "./db";
import { companyAccess } from "./companies";
import { branchInput, BranchError } from "./branch-policy";
import { secret } from "./runtime";

export async function enqueueBranch(
  sourceId: string,
  userId: string,
  input: unknown,
) {
  const options = branchInput(input);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('supapanel-branch-queue'))::text`;
    const source = await tx.project.findFirst({
      where: {
        id: sourceId,
        branch: { project: { company: companyAccess(userId, "operate") } },
      },
      include: { branch: { include: { project: true } } },
    });
    if (!source?.branch) throw new BranchError("Projeto não encontrado.", 404);
    if (source.status === "provisioning" || source.status === "failed")
      throw new BranchError("Aguarde a conclusão da origem.", 409);
    if (options.mode !== "empty" && source.status !== "active")
      throw new BranchError(
        "Implante a branch de origem antes de cloná-la.",
        409,
      );
    if (
      await tx.branchJob.findFirst({
        where: {
          sourceId,
          OR: [
            { status: { in: ["queued", "running"] } },
            { pausedServices: { isEmpty: false } },
          ],
        },
      })
    )
      throw new BranchError(
        "Já existe uma clonagem em andamento para esta origem.",
        409,
      );
    if (
      await tx.branch.findUnique({
        where: {
          projectId_name: {
            projectId: source.branch.projectId,
            name: options.name,
          },
        },
      })
    )
      throw new BranchError(
        "Já existe uma branch com esse nome neste projeto.",
        409,
      );
    const target = await tx.project.create({
      data: {
        name: source.branch.project.name,
        slug: `branch-${options.name}-${secret(12)}`,
        ownerId: userId,
        description: `Branch ${options.name}`,
        status: "provisioning",
        branch: {
          create: { name: options.name, projectId: source.branch.projectId },
        },
      },
    });
    const job = await tx.branchJob.create({
      data: {
        projectId: source.branch.projectId,
        sourceId,
        targetId: target.id,
        requestedBy: userId,
        mode: options.mode,
        schemas: options.schemas,
      },
    });
    return { targetId: target.id, jobId: job.id };
  });
}
