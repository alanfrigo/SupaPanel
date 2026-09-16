import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { createProject, deleteProject } from "../src/lib/project";
import { privateBranchCompose, docker } from "../src/lib/branch-clone";
import { enqueueBranch } from "../src/lib/branches";
import { runBranchQueue } from "../src/lib/branch-worker";
async function request(
  slug: string,
  url: string,
  method: string,
  body?: unknown,
  token?: string,
) {
  const js = `fetch(${JSON.stringify(url)}, {method:${JSON.stringify(method)},headers:{'Content-Type':'application/json','x-upsert':'true',apikey:${JSON.stringify(token || "")},Authorization:'Bearer '+${JSON.stringify(token || "")}},${body === undefined ? "" : `body:JSON.stringify(${JSON.stringify(body)}),`}}).then(async r=>{console.log(JSON.stringify({status:r.status,body:await r.text()}))}).catch(()=>process.exit(1))`;
  return JSON.parse(
    (await docker(slug, ["exec", "-T", "studio", "node", "-e", js])).stdout,
  );
}
// Opt-in only, with an isolated metadata database. Creates real Supabase stacks.
test(
  "Branches: full Auth/Storage clone, schema-only, isolation and restart recovery",
  { skip: process.env.BRANCH_INTEGRATION !== "1", timeout: 1200000 },
  async () => {
    const user = await prisma.user.create({
      data: {
        email: `branches-${randomUUID()}@test.local`,
        password: "unused",
      },
    });
    const company = await prisma.company.create({
      data: {
        name: "Branches integration",
        members: { create: { userId: user.id, role: "owner" } },
      },
    });
    try {
      const result = await createProject(
        "Branch integration",
        user.id,
        "",
        company.id,
      );
      assert.ok(result.success && result.project);
      const source = result.project;
      const state = {
        sourceId: source.id,
        sourceSlug: source.slug,
        userId: user.id,
      };
      await privateBranchCompose(source.slug);
      await docker(source.slug, [
        "up",
        "-d",
        "--wait",
        "--wait-timeout",
        "240",
      ]);
      await prisma.project.update({
        where: { id: source.id },
        data: { status: "active" },
      });
      const email = `clone-${Date.now()}@example.test`;
      const sourceEnv = Object.fromEntries(
        (
          await prisma.projectEnvVar.findMany({
            where: { projectId: state.sourceId },
          })
        ).map((v) => [v.key, v.value]),
      );
      const created = await request(
        state.sourceSlug,
        "http://auth:9999/admin/users",
        "POST",
        { email, password: "Branch-login-test123", email_confirm: true },
        sourceEnv.SERVICE_ROLE_KEY,
      );
      assert.equal(created.status, 200, created.body);
      const authUser = JSON.parse(created.body);
      await docker(state.sourceSlug, [
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
        `DROP TABLE IF EXISTS public.orders; CREATE TABLE public.orders (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, owner_id uuid REFERENCES auth.users(id), note text NOT NULL); ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY; CREATE POLICY own_orders ON public.orders FOR ALL TO authenticated USING (auth.uid()=owner_id); INSERT INTO public.orders(owner_id,note) VALUES ('${authUser.id}', 'original');`,
      ]);
      const bucket = await request(
        state.sourceSlug,
        "http://storage:5000/bucket",
        "POST",
        { id: "branch-test", name: "branch-test", public: true },
        sourceEnv.SERVICE_ROLE_KEY,
      );
      assert.ok([200, 400, 409].includes(bucket.status), bucket.body);
      const upload = await request(
        state.sourceSlug,
        "http://storage:5000/object/branch-test/hello.json",
        "POST",
        { test: "storage clone" },
        sourceEnv.SERVICE_ROLE_KEY,
      );
      assert.equal(upload.status, 200, upload.body);
      const full = await enqueueBranch(state.sourceId, state.userId, {
        name: "complete",
        mode: "full",
        schemas: ["public"],
      });
      console.log("Queued", full.targetId);
      await runBranchQueue();
      const job = await prisma.branchJob.findUniqueOrThrow({
        where: { id: full.jobId },
      });
      console.log("Job:", job.status, job.stage, job.error);
      assert.equal(job.status, "completed");
      const target = await prisma.project.findUniqueOrThrow({
        where: { id: full.targetId },
      });
      const env = Object.fromEntries(
        (
          await prisma.projectEnvVar.findMany({
            where: { projectId: target.id },
          })
        ).map((v) => [v.key, v.value]),
      );
      assert.notEqual(env.POSTGRES_PASSWORD, sourceEnv.POSTGRES_PASSWORD);
      assert.notEqual(env.JWT_SECRET, sourceEnv.JWT_SECRET);
      const login = await request(
        target.slug,
        "http://auth:9999/token?grant_type=password",
        "POST",
        { email, password: "Branch-login-test123" },
        env.ANON_KEY,
      );
      assert.equal(login.status, 200, login.body);
      const object = await request(
        target.slug,
        "http://storage:5000/object/branch-test/hello.json",
        "GET",
        undefined,
        env.SERVICE_ROLE_KEY,
      );
      assert.equal(object.status, 200, object.body);
      assert.deepEqual(JSON.parse(object.body), { test: "storage clone" });
      const query = await docker(target.slug, [
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
        "-Atc",
        "SELECT note FROM public.orders; UPDATE public.orders SET note='changed in branch';",
      ]);
      assert.match(query.stdout, /original/);
      const original = await docker(state.sourceSlug, [
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
        "-Atc",
        "SELECT note FROM public.orders",
      ]);
      assert.equal(original.stdout.trim(), "original");
      console.log(
        "Auth login, Storage object, foreign keys, independent credentials and write isolation passed",
      );
      assert.equal((await deleteProject(target.id)).success, true);
      const schemaCreated = await enqueueBranch(state.sourceId, state.userId, {
        name: "schema-only",
        mode: "schema",
        schemas: ["public"],
      });
      await runBranchQueue();
      const schemaJob = await prisma.branchJob.findUniqueOrThrow({
        where: { id: schemaCreated.jobId },
      });
      console.log("Schema job", schemaJob.status, schemaJob.error);
      assert.equal(schemaJob.status, "completed");
      const schemaTarget = await prisma.project.findUniqueOrThrow({
        where: { id: schemaCreated.targetId },
      });
      const output = await docker(schemaTarget.slug, [
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
        "-Atc",
        "select count(*) from public.orders; select count(*) from pg_policies where tablename='orders'; select count(*) from auth.users;",
      ]);
      assert.equal(output.stdout.trim(), "0\n1\n0");
      console.log(
        "Empty application rows, preserved RLS policy, empty Auth passed",
      );
      const recovery = await enqueueBranch(state.sourceId, state.userId, {
        name: "interrupted",
        mode: "empty",
      });
      await prisma.branchJob.update({
        where: { id: recovery.jobId },
        data: { status: "running", pausedServices: ["storage"] },
      });
      await docker(state.sourceSlug, ["stop", "storage"]);
      await runBranchQueue();
      const interrupted = await prisma.branchJob.findUniqueOrThrow({
        where: { id: recovery.jobId },
      });
      assert.equal(interrupted.status, "failed");
      assert.deepEqual(interrupted.pausedServices, []);
      assert.equal((await deleteProject(recovery.targetId)).success, true);
      assert.equal(
        (await deleteProject(state.sourceId)).success,
        false,
        "main cannot be removed with child branches",
      );
      console.log(
        "Interrupted worker recovery, source resumed and partial branch cleanup passed",
      );
    } finally {
      const instances = await prisma.project.findMany({
        where: { ownerId: user.id },
        include: { branch: true },
      });
      instances.sort(
        (a, b) =>
          Number(a.branch?.name === "main") - Number(b.branch?.name === "main"),
      );
      for (const instance of instances) {
        const result = await deleteProject(instance.id);
        if (!result.success)
          throw new Error(`Test cleanup failed for ${instance.slug}`);
      }
      await prisma.company.delete({ where: { id: company.id } });
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.$disconnect();
    }
  },
);
