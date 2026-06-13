import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

test("customer assistant only receives public customer AI tools", () => {
  const executor = read("lib/ai/tools/executor.ts");
  const surfacePolicy = read("lib/ai/tools/surface-policy.ts");
  const runtime = read("services/ai/runtime.ts");
  const customerAllowlist = surfacePolicy.match(/export const customerAiToolNames = \[([\s\S]*?)\] as const/)?.[1] ?? "";

  assert.match(customerAllowlist, /search_menu/);
  assert.match(customerAllowlist, /create_combo/);
  assert.doesNotMatch(customerAllowlist, /summarize_sales|detect_payment_issue|generate_campaign|analyze_peak_hour/);
  assert.match(
    executor,
    /export const customerAiTools = allAiTools\.filter\(\(tool\) => (?:customerToolNames\.has\(tool\.function\.name\) && )?isAiToolNameAllowedForSurface\("customer", tool\.function\.name, allAiToolNames\)\)/
  );
  assert.match(executor, /isAiToolAllowedForSurface\(context\.surface, name\)/);
  assert.match(runtime, /const tools = getAiToolsForSurface\(input\.surface\)/);
  assert.doesNotMatch(runtime, /tools:\s*allAiTools/);
});

test("owner agent execution requires a scoped one-time server-signed approval token", () => {
  const executor = read("services/ai-owner-agent-executor.ts");
  const route = read("app/api/admin/ai/agent/execute/route.ts");
  const migration = read("supabase/migrations/20260519114500_ai_owner_agent_approval_tokens.sql");

  assert.match(executor, /createHmac/);
  assert.match(executor, /randomUUID/);
  assert.match(executor, /timingSafeEqual/);
  assert.match(executor, /messageHash: hashApprovalMessage\(input\.message\)/);
  assert.match(executor, /nonce: randomUUID\(\)/);
  assert.match(executor, /expiresAt: now \+ OWNER_AGENT_APPROVAL_TTL_MS/);
  assert.match(executor, /await issueOwnerAgentApprovalToken/);
  assert.match(executor, /await consumeOwnerAgentApprovalToken\(input\.approvalToken/);
  assert.match(executor, /\.eq\("status", "pending"\)/);
  assert.match(executor, /status: "consumed"/);
  assert.match(executor, /throw new AppError\("Lệnh AI agent cần mã xác nhận an toàn từ server\.", 403\)/);
  assert.doesNotMatch(executor, /confirm:\s*true/);
  assert.match(route, /approvalToken: z\.string\(\)\.trim\(\)\.max\(3000\)\.optional\(\)/);
  assert.match(route, /approvalToken: body\.approvalToken/);
  assert.match(migration, /create table if not exists public\.ai_owner_agent_approval_tokens/);
  assert.match(migration, /constraint ai_owner_agent_approval_tokens_nonce_unique unique \(token_nonce\)/);
  assert.match(migration, /constraint ai_owner_agent_approval_tokens_hash_unique unique \(token_hash\)/);
  assert.match(migration, /revoke all on public\.ai_owner_agent_approval_tokens from authenticated/);
  assert.match(migration, /grant select, insert, update, delete on public\.ai_owner_agent_approval_tokens to service_role/);
});

test("legacy AI fetches are bounded by timeout and retry helper", () => {
  const runtime = read("services/ai/runtime.ts");
  const fetchCalls = runtime.match(/fetch\(/g) ?? [];

  assert.equal(fetchCalls.length, 1);
  assert.match(runtime, /const LEGACY_AI_CHAT_TIMEOUT_MS = 14_000/);
  assert.match(runtime, /const LEGACY_AI_OCR_TIMEOUT_MS = 25_000/);
  assert.match(runtime, /const LEGACY_AI_IMAGE_TIMEOUT_MS = 30_000/);
  assert.match(runtime, /function isRetryableAiResponse\(response: Response\)/);
  assert.match(runtime, /timeoutMessage: "MiMo OCR phản hồi quá lâu/);
});

test("conversation memory reuse requires an actor scope in addition to thread context", () => {
  const memory = read("lib/ai/memory/restaurant-memory.ts");
  const migration = read("supabase/migrations/20260519115500_ai_conversation_actor_scope.sql");
  const actorGuardIndex = memory.indexOf("if (!hasConversationActorScope(input)) return null;");
  const threadMatchIndex = memory.indexOf('.contains("metadata", { threadId: input.threadId })');
  const persistGuardIndex = memory.indexOf("if (!input.conversationId && !hasConversationActorScope(input)) return null;");

  assert.ok(actorGuardIndex > -1);
  assert.ok(threadMatchIndex > actorGuardIndex);
  assert.ok(persistGuardIndex > -1);
  assert.match(memory, /eq\("restaurant_id", input\.restaurantId\)/);
  assert.match(memory, /eq\("surface", input\.surface\)/);
  assert.match(memory, /if \(input\.userId\) query = query\.eq\("user_id", input\.userId\)/);
  assert.match(memory, /if \(input\.customerSessionId\) query = query\.eq\("customer_session_id", input\.customerSessionId\)/);
  assert.match(migration, /constraint ai_conversations_actor_scope_check/);
  assert.match(migration, /surface = 'customer'[\s\S]*customer_session_id is not null/);
  assert.match(migration, /surface in \('dashboard', 'admin'\)[\s\S]*user_id is not null/);
  assert.match(migration, /not valid/);
});

test("AI security events capture blocked tools and approval replay attempts", () => {
  const audit = read("lib/ai/security-audit.ts");
  const executor = read("lib/ai/tools/executor.ts");
  const runtime = read("services/ai/runtime.ts");
  const ownerAgent = read("services/ai-owner-agent-executor.ts");
  const migration = read("supabase/migrations/20260519115000_ai_security_events.sql");

  assert.match(audit, /from\("ai_security_events"\)\.insert/);
  assert.match(executor, /eventType: "ai_tool_call_blocked"/);
  assert.match(runtime, /eventType: "ai_tool_call_dropped"/);
  assert.match(ownerAgent, /eventType: "owner_agent_approval_missing"/);
  assert.match(ownerAgent, /eventType: "owner_agent_approval_denied"/);
  assert.match(migration, /create table if not exists public\.ai_security_events/);
  assert.match(migration, /revoke all on public\.ai_security_events from authenticated/);
  assert.match(migration, /grant select, insert, update, delete on public\.ai_security_events to service_role/);
});

test("AI security event feed is tenant-scoped and visible to admin surfaces only", () => {
  const service = read("services/ai-security-event-service.ts");
  const route = read("app/api/admin/ai/security-events/route.ts");

  assert.match(service, /from\("ai_security_events"\)/);
  assert.match(service, /\.eq\("restaurant_id", input\.restaurantId\)/);
  assert.match(service, /sensitiveKeyPattern/);
  assert.match(service, /sensitiveValuePattern/);
  assert.match(service, /return \{ schemaReady: false, events: \[\], highRiskCount: 0 \}/);
  assert.match(route, /assertSameOriginRequest\(request\)/);
  assert.match(route, /requireOperationalDashboardApiSession\(\{ adminOnly: true, feature: "ai_owner_assistant" \}\)/);
});

test("AI schema snapshot includes production indexes, triggers and service-role-only audit tables", () => {
  const schema = read("supabase/schema.sql");

  for (const indexName of [
    "ai_conversations_restaurant_surface_idx",
    "ai_conversations_customer_session_idx",
    "ai_conversations_user_surface_thread_idx",
    "ai_conversations_customer_surface_thread_idx",
    "ai_messages_conversation_idx",
    "ai_messages_restaurant_created_idx",
    "ai_logs_restaurant_task_idx",
    "ai_feedback_restaurant_created_idx",
    "ai_owner_agent_approval_tokens_scope_idx",
    "ai_security_events_restaurant_created_idx",
    "ai_security_events_type_severity_idx"
  ]) {
    assert.match(schema, new RegExp(`create index ${indexName}`));
  }

  assert.match(schema, /create trigger ai_conversations_set_updated_at/);
  assert.match(schema, /create trigger ai_owner_agent_approval_tokens_set_updated_at/);
  assert.match(schema, /revoke all on public\.ai_owner_agent_approval_tokens from authenticated/);
  assert.match(schema, /revoke all on public\.ai_security_events from authenticated/);
  assert.match(schema, /grant select, insert, update, delete on public\.ai_owner_agent_approval_tokens to service_role/);
  assert.match(schema, /grant select, insert, update, delete on public\.ai_security_events to service_role/);
});
