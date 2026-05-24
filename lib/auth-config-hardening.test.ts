import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const supabaseConfig = readFileSync("supabase/config.toml", "utf8");
const configureScript = readFileSync("scripts/configure-supabase-auth.mjs", "utf8");

test("Supabase local auth config keeps password policy aligned with application validators", () => {
  assert.match(supabaseConfig, /minimum_password_length = 10/);
  assert.match(supabaseConfig, /password_requirements = "lower_upper_letters_digits"/);
  assert.match(supabaseConfig, /secure_password_change = true/);
});

test("Supabase email OTP config is hardened against spam and long-lived OTP exposure", () => {
  assert.match(supabaseConfig, /enable_confirmations = true/);
  assert.match(supabaseConfig, /max_frequency = "60s"/);
  assert.match(supabaseConfig, /otp_expiry = 900/);
  assert.match(configureScript, /mailer_otp_exp: 900/);
});
