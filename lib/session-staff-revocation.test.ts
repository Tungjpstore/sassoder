import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sessionSource = readFileSync("lib/session.ts", "utf8");
const profileSource = sessionSource.slice(
  sessionSource.indexOf("export const getSessionProfile"),
  sessionSource.indexOf("export async function requireSession")
);
const revocationHelperSource = sessionSource.slice(
  sessionSource.indexOf("async function readStaffRevocationWithAdmin"),
  sessionSource.indexOf("export const getSessionProfile")
);

test("staff revocation lookup uses an admin client while retaining tenant and user binding", () => {
  assert.match(revocationHelperSource, /createAdminSupabaseClient\(\)/);
  assert.match(revocationHelperSource, /\.from\("staff_members"\)/);
  assert.match(revocationHelperSource, /\.eq\("restaurant_id", restaurantId\)/);
  assert.match(revocationHelperSource, /\.eq\("user_id", userId\)/);
  assert.match(revocationHelperSource, /\.maybeSingle\(\)/);
  assert.match(profileSource, /readStaffRevocationWithAdmin\(profileRow\.restaurant_id, user\.id\)/);
  assert.doesNotMatch(profileSource, /const staffRevocation = await supabase\s*\.from\("staff_members"\)/);
  assert.match(profileSource, /if \(staffRevocation\.data\.auth_revoked_at\) return null;/);
  assert.match(profileSource, /else if \(profileRow\.role === "STAFF"\)/);
});
