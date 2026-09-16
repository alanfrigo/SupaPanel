import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDnsTarget, validDnsTarget } from "@/lib/dns-target";
export async function GET(request: NextRequest) {
  if (!(await validateSession(request.cookies.get("session")?.value || "")))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ target: await getDnsTarget() });
}
export async function PUT(request: NextRequest) {
  if (!(await validateSession(request.cookies.get("session")?.value || "")))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const target =
    typeof body.target === "string"
      ? body.target.trim().toLowerCase().replace(/\.$/, "")
      : "";
  if (!validDnsTarget(target))
    return NextResponse.json(
      {
        error:
          "Informe um hostname, como infra.seudominio.com, sem protocolo, porta ou IP.",
      },
      { status: 400 },
    );
  await prisma.panelSettings.upsert({
    where: { key: "instance_dns_target" },
    create: { key: "instance_dns_target", value: target },
    update: { value: target },
  });
  return NextResponse.json({ target });
}
