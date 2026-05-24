import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("owner assistant has a deterministic small-talk path before operational snapshots", () => {
  const source = readFileSync("services/ai/runtime.ts", "utf8");

  assert.match(source, /function isCasualGreeting/);
  assert.match(source, /buildOwnerGreetingResult/);
  assert.match(source, /owner_ai_greeting/);
  assert.match(source, /deterministic-greeting-router/);
  assert.match(source, /if \(isCasualGreeting\(input\.message\)\)/);
  assert.match(source, /const \[snapshot, memory\] = await Promise\.all/);
  assert.ok(source.indexOf("if (isCasualGreeting(input.message))") < source.indexOf("const [snapshot, memory] = await Promise.all"));
});

test("dashboard copilot prompt keeps greetings out of shift analysis", () => {
  const source = readFileSync("lib/ai/prompts/copilot-system.ts", "utf8");

  assert.match(source, /chỉ chào hỏi, cảm ơn, test bot/);
  assert.match(source, /không tóm tắt ca bán/);
  assert.match(source, /không gọi analyze_dashboard_area/);
});
