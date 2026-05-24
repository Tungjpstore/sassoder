import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chunkedCookieNames,
  cookieNamesFromHeader,
  isCookieChunkForBase,
  isCookieHeaderOverRepairBudget,
  isSupabaseAuthFlowCookieName,
  isSupabaseAuthSessionCookieName,
  isSupabaseCookieName,
  shouldRepairOversizedSupabaseCookieHeader,
  SUPABASE_COOKIE_REPAIR_THRESHOLD_BYTES
} from "@/lib/supabase/cookie-guards";

describe("Supabase cookie guards", () => {
  it("classifies auth, oauth, and unrelated cookies safely", () => {
    assert.equal(isSupabaseAuthSessionCookieName("sb-project-auth-token"), true);
    assert.equal(isSupabaseAuthSessionCookieName("sb-project-auth-token.0"), true);
    assert.equal(isSupabaseAuthSessionCookieName("sb-project-oauth-abcd1234"), false);
    assert.equal(isSupabaseAuthFlowCookieName("sb-project-oauth-abcd1234"), true);
    assert.equal(isSupabaseAuthFlowCookieName("sb-project-oauth-abcd1234-code-verifier"), true);
    assert.equal(isSupabaseCookieName("next-auth.session-token"), false);
  });

  it("deduplicates Supabase cookie names from request headers without exposing values", () => {
    assert.deepEqual(
      cookieNamesFromHeader("foo=1; sb-project-auth-token.0=secret; sb-project-auth-token.0=secret2", isSupabaseCookieName),
      ["sb-project-auth-token.0"]
    );
  });

  it("expands and matches chunked cookie names", () => {
    assert.deepEqual(chunkedCookieNames("sb-project-oauth-flow", 3), [
      "sb-project-oauth-flow",
      "sb-project-oauth-flow.0",
      "sb-project-oauth-flow.1",
      "sb-project-oauth-flow.2"
    ]);
    assert.equal(isCookieChunkForBase("sb-project-oauth-flow.7", "sb-project-oauth-flow"), true);
    assert.equal(isCookieChunkForBase("sb-project-oauth-flow-code-verifier", "sb-project-oauth-flow"), false);
  });

  it("detects cookie headers before they reach Vercel's hard failure zone", () => {
    assert.equal(isCookieHeaderOverRepairBudget("a".repeat(SUPABASE_COOKIE_REPAIR_THRESHOLD_BYTES + 1)), true);
    assert.equal(isCookieHeaderOverRepairBudget("a".repeat(SUPABASE_COOKIE_REPAIR_THRESHOLD_BYTES)), false);
  });

  it("repairs oversized headers only when Supabase cookies are present", () => {
    const largeNonSupabaseCookie = `tracking=${"x".repeat(SUPABASE_COOKIE_REPAIR_THRESHOLD_BYTES + 1)}`;

    assert.equal(shouldRepairOversizedSupabaseCookieHeader(largeNonSupabaseCookie), false);
    assert.equal(
      shouldRepairOversizedSupabaseCookieHeader(`${largeNonSupabaseCookie}; sb-project-auth-token=stale`),
      true
    );
  });
});
