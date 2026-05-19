import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("customer router supports everyday guest FAQ before transactional ordering", () => {
  const source = readFileSync("services/ai-prompt-router.ts", "utf8");

  assert.match(source, /\|\s+"guest_faq"/);
  assert.match(source, /label:\s+"Hỏi đáp quán"/);
  assert.match(source, /gio mo cua/);
  assert.match(source, /dia chi quan/);
  assert.match(source, /mat khau wifi/);
  assert.match(source, /co cho gui xe khong/);
  assert.match(source, /inferIntent\(message, customerKeywordMap, "guest_faq", customerRouteRules\)/);
  assert.match(source, /Không ép CTA/);
  assert.match(source, /mình chưa thấy thông tin này trên hệ thống/);
});

test("customer action planner keeps guest FAQ actions contextual", () => {
  const source = readFileSync("services/ai-agent-actions.ts", "utf8");

  assert.match(source, /guest_faq:\s+\{/);
  assert.match(source, /buildGuestFaqActions/);
  assert.match(source, /customer-faq-menu/);
  assert.match(source, /customer-faq-staff/);
  assert.match(source, /customer-faq-followup/);
  assert.doesNotMatch(source, /intent === "guest_faq" \|\| intent === "menu_discovery"/);
});
