import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { findInstance, companyAccess } from "@/lib/companies";
import { prisma } from "@/lib/db";
import { enqueueBranch } from "@/lib/branches";
import { BranchError } from "@/lib/branch-policy";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  const session = await validateSession(
    request.cookies.get("session")?.value || "",
  );
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const source = await findInstance((await params).id, session.user.id, "read");
  if (!source?.branch)
    return NextResponse.json(
      { error: "Projeto não encontrado." },
      { status: 404 },
    );
  const projectId = source.branch.projectId;
  const branches = await prisma.branch.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      instanceId: true,
      instance: { select: { status: true } },
    },
  });
  const jobs = await prisma.branchJob.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      targetId: true,
      sourceId: true,
      mode: true,
      schemas: true,
      status: true,
      stage: true,
      error: true,
      createdAt: true,
      pausedServices: true,
    },
  });
  const canOperate = !!(await prisma.managedProject.findFirst({
    where: {
      id: projectId,
      company: companyAccess(session.user.id, "operate"),
    },
    select: { id: true },
  }));
  return NextResponse.json(
    { branches, jobs, canOperate },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: NextRequest, { params }: Context) {
  const session = await validateSession(
    request.cookies.get("session")?.value || "",
  );
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    // Authorize before validating user input, including provisioning branches.
    const source = await findInstance(
      (await params).id,
      session.user.id,
      "read",
    );
    if (
      !source?.branch ||
      !(await prisma.managedProject.findFirst({
        where: {
          id: source.branch.projectId,
          company: companyAccess(session.user.id, "operate"),
        },
      }))
    )
      return NextResponse.json(
        { error: "Projeto não encontrado." },
        { status: 404 },
      );
    return NextResponse.json(
      await enqueueBranch(source.id, session.user.id, await request.json()),
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof BranchError
            ? error.message
            : "Não foi possível criar a branch.",
      },
      { status: error instanceof BranchError ? error.status : 500 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const session = await validateSession(
    request.cookies.get("session")?.value || "",
  );
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const source = await findInstance((await params).id, session.user.id, "read");
  if (
    !source?.branch ||
    !(await prisma.managedProject.findFirst({
      where: {
        id: source.branch.projectId,
        company: companyAccess(session.user.id, "operate"),
      },
    }))
  )
    return NextResponse.json(
      { error: "Projeto não encontrado." },
      { status: 404 },
    );
  try {
    const { jobId } = await request.json();
    const job = await prisma.branchJob.findFirst({
      where: {
        id: jobId,
        projectId: source.branch.projectId,
        status: "failed",
      },
    });
    if (!job)
      return NextResponse.json(
        { error: "Operação não encontrada." },
        { status: 404 },
      );
    const { recoverBranchSource } = await import("@/lib/branch-worker");
    await recoverBranchSource(job.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      {
        error:
          "Não foi possível retomar a origem. Verifique o Docker e tente novamente.",
      },
      { status: 503 },
    );
  }
}
