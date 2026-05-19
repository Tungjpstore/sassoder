import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function readSource(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function actionBlock(source: string, actionName: string) {
  const nameIndex = source.indexOf(`name: "${actionName}"`);
  assert.notEqual(nameIndex, -1, `Missing Copilot action ${actionName}`);

  const start = source.lastIndexOf("useCopilotAction(", nameIndex);
  assert.notEqual(start, -1, `Missing useCopilotAction wrapper for ${actionName}`);

  const nextAction = source.indexOf("useCopilotAction(", nameIndex + actionName.length);
  const end = nextAction === -1 ? source.length : nextAction;
  return source.slice(start, end);
}

function assertFollowUp(relativePath: string, actionName: string, expected: boolean) {
  const block = actionBlock(readSource(relativePath), actionName);
  assert.match(block, new RegExp(`followUp:\\s*${expected}`), `${actionName} should use followUp: ${expected}`);
}

test("card-rendered Copilot actions do not auto-run a duplicate assistant prose follow-up", () => {
  const cardRenderedActions = [
    ["components/customer/customer-ai-assistant.tsx", "continue_customer_ordering"],
    ["components/customer/customer-ai-assistant.tsx", "answer_customer_request"],
    ["components/customer/customer-ai-assistant.tsx", "ask_customer_waiter"],
    ["components/ai/onboarding-copilot-layer.tsx", "generateSampleMenu"],
    ["components/ai/onboarding-copilot-layer.tsx", "suggestTableCount"],
    ["components/ai/onboarding-copilot-layer.tsx", "explainPlans"],
    ["components/ai/onboarding-copilot-layer.tsx", "suggestBusinessType"],
    ["components/ai/onboarding-copilot-layer.tsx", "answer_onboarding_request"],
    ["components/ai/onboarding-copilot-layer.tsx", "continue_onboarding_setup"],
    ["components/ai/dashboard-copilot-layer.tsx", "answer_owner_request"],
    ["components/ai/dashboard-copilot-layer.tsx", "analyze_dashboard_area"],
    ["components/ai/dashboard-copilot-layer.tsx", "continue_owner_workflow"],
    ["components/ai/dashboard-copilot-layer.tsx", "get_owner_operational_shortcuts"],
    ["components/ai/dashboard-copilot-layer.tsx", "generate_store_setup_plan"],
    ["components/ai/dashboard-copilot-layer.tsx", "generate_branding_draft"],
    ["components/ai/platform-copilot-layer.tsx", "answer_platform_admin_request"],
    ["components/ai/platform-copilot-layer.tsx", "summarize_platform_risk"]
  ] as const;

  for (const [relativePath, actionName] of cardRenderedActions) {
    assertFollowUp(relativePath, actionName, false);
  }
});

test("side-effect-only Copilot actions do not auto-run a follow-up", () => {
  const sideEffectActions = [
    ["components/customer/customer-ai-assistant.tsx", "open_customer_cart"],
    ["components/customer/customer-ai-assistant.tsx", "call_staff_from_table"],
    ["components/customer/customer-ai-assistant.tsx", "mark_customer_paid"],
    ["components/ai/dashboard-copilot-layer.tsx", "navigate_dashboard"],
    ["components/ai/dashboard-copilot-layer.tsx", "run_owner_action"],
    ["components/ai/platform-copilot-layer.tsx", "navigate_platform_admin"]
  ] as const;

  for (const [relativePath, actionName] of sideEffectActions) {
    assertFollowUp(relativePath, actionName, false);
  }
});

test("chat UI hides legacy duplicate prose that appears immediately after an action card", () => {
  const css = readSource("app/globals.css");

  assert.match(css, /copilotKitAssistantMessage:has\(\.logibot-agent-card\)/);
  assert.match(css, /copilotKitAssistantMessage:has\(\.logibot-command-deck\)/);
  assert.match(css, /display:\s*none\s*!important/);
});

test("action card copy is clamped while keeping the direct answer visible first", () => {
  const css = readSource("app/globals.css");
  const deck = readSource("components/ai/ai-command-deck-panel.tsx");
  const dashboard = readSource("components/ai/dashboard-copilot-layer.tsx");
  const customer = readSource("components/customer/customer-ai-assistant.tsx");
  const onboarding = readSource("components/ai/onboarding-copilot-layer.tsx");
  const platform = readSource("components/ai/platform-copilot-layer.tsx");

  assert.match(css, /logibot-answer-brief/);
  assert.match(dashboard, /Trả lời chính/);
  assert.match(customer, /Trả lời chính/);
  assert.match(onboarding, /Trả lời chính/);
  assert.match(platform, /Trả lời chính/);
  assert.match(css, /logibot-card-brief/);
  assert.match(css, /-webkit-line-clamp:\s*4/);
  assert.match(css, /logibot-command-headline/);
  assert.match(css, /-webkit-line-clamp:\s*2/);
  assert.match(deck, /logibot-command-headline/);
  assert.match(dashboard, /shouldShowAnswerBrief/);
  assert.match(customer, /shouldShowAnswerBrief/);
  assert.match(onboarding, /shouldShowAnswerBrief/);
});
