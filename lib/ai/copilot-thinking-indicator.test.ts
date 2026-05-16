import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = process.cwd();

function read(path: string) {
  return readFileSync(`${root}/${path}`, "utf8");
}

test("LogiBot surfaces a visible thinking indicator while CopilotKit is running", () => {
  const indicator = read("components/ai/copilot-thinking-indicator.tsx");

  assert.match(indicator, /useCopilotChatInternal/);
  assert.match(indicator, /LogiBot đang nghiên cứu/);
  assert.match(indicator, /role="status"/);
  assert.match(indicator, /aria-live="polite"/);
  assert.match(indicator, /hasAssistantResponseAfter/);
  assert.match(indicator, /generativeUI/);
  assert.match(indicator, /toolCalls/);
});

test("all commercial AI chat surfaces mount the thinking indicator", () => {
  const dashboard = read("components/ai/dashboard-copilot-layer.tsx");
  const onboarding = read("components/ai/onboarding-copilot-layer.tsx");
  const platform = read("components/ai/platform-copilot-layer.tsx");
  const customer = read("components/customer/customer-ai-assistant.tsx");

  assert.match(dashboard, /CopilotThinkingIndicator enabled=\{hasEverOpened\} surface="dashboard"/);
  assert.match(onboarding, /CopilotThinkingIndicator enabled=\{isOpen\} surface="onboarding"/);
  assert.match(platform, /CopilotThinkingIndicator surface="platform"/);
  assert.match(customer, /CopilotThinkingIndicator surface="customer"/);
});
