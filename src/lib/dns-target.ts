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
// With a wildcard record (*.base) pointing at the proxy, new instances get
// api-<slug>.<base> and <slug>.<base> without manual DNS setup.
export function autoProjectDomains(
  slug: string,
  baseDomain = process.env.PANEL_BASE_DOMAIN,
) {
  const base = baseDomain?.trim().toLowerCase();
  if (!base) return null;
  const domain = `api-${slug}.${base}`;
  const studioDomain = `${slug}.${base}`;
  return validDnsTarget(domain) && validDnsTarget(studioDomain)
    ? { domain, studioDomain }
    : null;
}
