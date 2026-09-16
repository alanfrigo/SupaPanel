"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
export default function BranchSwitcher({
  instanceId,
  page = "database",
  disabled = false,
}: {
  instanceId: string;
  page?: "database" | "configure" | "branches";
  disabled?: boolean;
}) {
  const [branches, setBranches] = useState<
    { instanceId: string; name: string; instance: { status: string } }[]
  >([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/projects/${instanceId}/branches`, { signal: controller.signal })
      .then(async (r) => {
        if (r.ok) setBranches((await r.json()).branches);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [instanceId]);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2">
        Branch
        <select
          aria-label="Branch atual"
          className="rounded-md border bg-card px-3 py-2 font-mono"
          value={instanceId}
          disabled={disabled || !branches.length}
          onChange={(e) => {
            const target = branches.find(
              (b) => b.instanceId === e.target.value,
            );
            // A full navigation discards SQL, row editors and credentials of the previous branch.
            window.location.assign(
              `/dashboard/projects/${e.target.value}/${target && ["provisioning", "failed"].includes(target.instance.status) ? "branches" : page}`,
            );
          }}
        >
          {branches.map((b) => (
            <option key={b.instanceId} value={b.instanceId}>
              {b.name} · {b.instance.status}
            </option>
          ))}
        </select>
      </label>
      <Link
        className="text-primary hover:underline"
        href={`/dashboard/projects/${instanceId}/branches`}
      >
        Gerenciar branches
      </Link>
    </div>
  );
}
