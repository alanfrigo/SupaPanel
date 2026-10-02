import test from "node:test";
import assert from "node:assert/strict";
import { autoProjectDomains } from "../src/lib/dns-target";

test("PANEL_BASE_DOMAIN gives a new project api-<slug> and <slug> subdomains", () => {
  assert.deepEqual(autoProjectDomains("shop-0a1b2c3d4e5f", "Supa.Example.com "), {
    domain: "api-shop-0a1b2c3d4e5f.supa.example.com",
    studioDomain: "shop-0a1b2c3d4e5f.supa.example.com",
  });
});

test("without PANEL_BASE_DOMAIN nothing is assigned (manual domains stay the only path)", () => {
  assert.equal(autoProjectDomains("shop-0a1b2c3d4e5f", undefined), null);
  assert.equal(autoProjectDomains("shop-0a1b2c3d4e5f", ""), null);
});

test("a slug that is not a valid hostname label is skipped instead of producing a bad domain", () => {
  // createProject slugifies "!shop" to "-shop-<hex>"; a label cannot start with "-".
  assert.equal(autoProjectDomains("-shop-0a1b2c3d4e5f", "supa.example.com"), null);
});
