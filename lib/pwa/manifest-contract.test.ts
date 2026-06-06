import assert from "node:assert/strict";
import { test } from "node:test";
import manifest from "@/app/manifest";

test("PWA manifest launches into the auth area instead of the landing page", () => {
  const appManifest = manifest();

  assert.equal(appManifest.start_url, "/dashboard/login?source=pwa_launch");
  assert.equal(appManifest.scope, "/");
  assert.equal(appManifest.display, "standalone");
  assert.notEqual(appManifest.start_url, "/");
});

