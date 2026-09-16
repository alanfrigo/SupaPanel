import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { prisma } from "@/lib/db";
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
  const project = await prisma.project.findFirst({
    where: { id, ownerId: session.user.id },
  });
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
    return NextResponse.json(getConnections(JSON.parse(stdout)), {
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
