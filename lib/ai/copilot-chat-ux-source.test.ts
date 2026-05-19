import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

test("LogiBot chat suggestions are styled as high-signal operational quick actions", () => {
  const css = read("app/globals.css");
  const dashboard = read("components/ai/dashboard-copilot-layer.tsx");
  const customer = read("components/customer/customer-ai-assistant.tsx");
  const onboarding = read("components/ai/onboarding-copilot-layer.tsx");

  assert.match(css, /copilotKitMessages footer \.suggestions/);
  assert.match(css, /logibot-suggestion-rise/);
  assert.match(css, /logibot-chip-sheen/);
  assert.match(css, /logibot-action-tile/);
  assert.match(css, /LogiBot Command Center refresh/);
  assert.match(dashboard, /01 Ca bán/);
  assert.match(dashboard, /02 Đơn gấp/);
  assert.match(customer, /01 Tiếp tục/);
  assert.match(onboarding, /01 Tạo menu/);
});

test("LogiBot cards and assistant text have dynamic but reduced-motion-safe effects", () => {
  const css = read("app/globals.css");

  assert.match(css, /logibot-card-pop/);
  assert.match(css, /logibot-card-aurora/);
  assert.match(css, /logibot-command-hover/);
  assert.match(css, /logibot-radar-sweep/);
  assert.match(css, /logibot-type-reveal/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /copilotKitAssistantMessage:last-of-type/);
});

test("LogiBot UI copy stays answer-first instead of model/platform-first", () => {
  const dashboard = read("components/ai/dashboard-copilot-layer.tsx");
  const platform = read("components/ai/platform-copilot-layer.tsx");
  const ownerTools = read("lib/ai/tools/owner-tools.ts");
  const thinkingIndicator = read("components/ai/copilot-thinking-indicator.tsx");

  assert.match(dashboard, /Trả lời trước/);
  assert.match(platform, /Trả lời rủi ro trước, thao tác sau/);
  assert.match(ownerTools, /trả tóm tắt tình hình trước/);
  assert.doesNotMatch(`${dashboard}\n${platform}\n${ownerTools}\n${thinkingIndicator}`, /Action-first|action-first|action queue|provider phản hồi|Provider hơi chậm/);
});

test("Command Deck renders as an operational runway instead of raw tool output", () => {
  const deck = read("components/ai/ai-command-deck-panel.tsx");
  const css = read("app/globals.css");

  assert.match(deck, /logibot-command-radar/);
  assert.match(deck, /logibot-command-impact/);
  assert.match(deck, /Chọn action bên dưới để áp dụng/);
  assert.match(css, /logibot-command-runway/);
  assert.match(css, /logibot-command-strip/);
});
