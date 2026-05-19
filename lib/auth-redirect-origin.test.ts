import assert from "node:assert/strict";
import test from "node:test";
import { getOAuthCallbackOrigin } from "@/lib/auth-redirect-origin";

test("OAuth callback stays on the tenant subdomain that started the flow", () => {
  const request = new Request("https://tung.logivn.com/auth/google");

  assert.equal(getOAuthCallbackOrigin(request), "https://tung.logivn.com");
});

test("OAuth callback keeps the root production domain on root login", () => {
  const request = new Request("https://logivn.com/auth/google");

  assert.equal(getOAuthCallbackOrigin(request), "https://logivn.com");
});
