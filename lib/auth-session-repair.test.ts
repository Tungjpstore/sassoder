import assert from "node:assert/strict";
import test from "node:test";
import { isInvalidRefreshTokenError } from "@/lib/supabase/auth-errors";
import { isExpectedAuthSessionRepairError } from "../proxy";

test("expected stale Supabase refresh tokens are repaired without error logging", () => {
  assert.equal(isExpectedAuthSessionRepairError(new Error("Invalid Refresh Token: Refresh Token Not Found")), true);
  assert.equal(isInvalidRefreshTokenError({ code: "refresh_token_not_found" }), true);
  assert.equal(isExpectedAuthSessionRepairError(new Error("database connection failed")), false);
});
