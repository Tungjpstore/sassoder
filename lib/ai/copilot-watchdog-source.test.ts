import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("Copilot response watchdog observes the same AG-UI messages rendered by CopilotKit", () => {
  const source = readFileSync(join(process.cwd(), "components/ai/use-copilot-response-watchdog.ts"), "utf8");

  assert.match(source, /useCopilotChatInternal/, "watchdog must use CopilotKit internal AG-UI messages");
  assert.doesNotMatch(source, /visibleMessages/, "watchdog must not rely on deprecated visibleMessages");
  assert.match(source, /generativeUI/, "watchdog must treat rendered action cards as a visible response");
  assert.match(source, /toolCalls/, "watchdog must treat completed tool calls as a visible response");
});
