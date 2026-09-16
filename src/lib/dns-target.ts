import { isIP } from "node:net";
import { prisma } from "./db";
export function validDnsTarget(value: string) {
  return (
    !isIP(value) &&
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
      value,
    )
  );
}
export async function getDnsTarget() {
  const saved = await prisma.panelSettings.findUnique({
    where: { key: "instance_dns_target" },
  });
  let fallback = process.env.INSTANCE_DNS_TARGET || "";
  if (!fallback) {
    try {
      fallback = new URL(process.env.NEXTAUTH_URL || "").hostname;
    } catch {}
  }
  const value = (saved?.value || fallback).toLowerCase();
  return validDnsTarget(value) ? value : null;
}
