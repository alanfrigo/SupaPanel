import test from "node:test";
import assert from "node:assert/strict";
import { branchInput } from "../src/lib/branch-policy";
test("branch requests validate names, clone modes and application schema boundaries", () => {
  assert.deepEqual(
    branchInput({
      name: "feature-checkout",
      mode: "full",
      schemas: ["public", "app", "public"],
    }),
    { name: "feature-checkout", mode: "full", schemas: ["public", "app"] },
  );
  assert.deepEqual(branchInput({ name: "blank", mode: "empty" }).schemas, []);
  for (const name of ["main", "../escape", "UPPER", "bad name", "x".repeat(41)])
    assert.throws(() =>
      branchInput({ name, mode: "schema", schemas: ["public"] }),
    );
  for (const schema of [
    "auth",
    "storage",
    "pg_catalog",
    "vault",
    "supabase_functions",
    "*",
    "public;drop",
  ])
    assert.throws(() =>
      branchInput({ name: "test", mode: "full", schemas: [schema] }),
    );
  assert.throws(() =>
    branchInput({ name: "test", mode: "unknown", schemas: ["public"] }),
  );
});
