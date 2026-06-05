import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const eventBusSource = read("services/operational-event-bus.ts");
const gatewaySource = read("infra/vps/services/gateway/server.js");
const queuesSource = read("infra/vps/services/shared/queues.js");
const platformBotTypesSource = read("infra/vps/services/platform-telegram-bot/types.mts");
const platformBotServerSource = read("infra/vps/services/platform-telegram-bot/server.mts");
const tenantBotServerSource = read("infra/vps/services/telegram-bot/server.mts");
const tenantBotRepositorySource = read("infra/vps/services/telegram-bot/repository.mts");
const platformEventsSource = read("services/platform-telegram-events.ts");
const tenantSingleConnectionMigrationSource = read("supabase/migrations/20260605093000_telegram_single_tenant_connection_lock.sql");

const platformEventTypes = [
  "platform.tenant.created",
  "platform.subscription.approval_requested",
  "platform.subscription.confirmed",
  "platform.subscription.rejected",
  "platform.tenant.status_changed",
  "platform.subscription.status_changed"
];

test("LogiDev realtime platform events are routed through the platform Telegram queue", () => {
  for (const eventType of platformEventTypes) {
    assert.match(eventBusSource, new RegExp(escapeRegExp(`type: "${eventType}"`)), `${eventType} must be typed in OperationalEvent`);
    assert.match(gatewaySource, new RegExp(escapeRegExp(`"${eventType}"`)), `${eventType} must pass gateway validation`);
    assert.match(queuesSource, new RegExp(`${escapeRegExp(`"${eventType}"`)}[\\s\\S]*platform\\.telegram\\.notifications`), `${eventType} must route to platform.telegram.notifications`);
    assert.match(platformBotTypesSource, new RegExp(escapeRegExp(`z.literal("${eventType}")`)), `${eventType} must be accepted by platform bot schema`);
    assert.match(platformBotServerSource, new RegExp(escapeRegExp(`parsed.type === "${eventType}"`)), `${eventType} must have platform bot worker handling`);
  }
});

test("LogiDev producers publish real onboarding, billing, and tenant-status events", () => {
  assert.match(read("services/restaurant-service.ts"), /notifyPlatformTenantCreated\(\{[\s\S]*restaurant: onboardedRestaurant/, "restaurant onboarding must notify LogiDev");
  assert.match(read("services/billing/payment-request.ts"), /notifyPlatformSubscriptionApprovalRequested\(\{[\s\S]*payment: data as PaymentRow/, "new subscription payment request must notify LogiDev");
  assert.match(read("services/billing/payment-admin.ts"), /notifyPlatformSubscriptionResolved\(\{[\s\S]*status: "confirmed"/, "payment confirmation must notify LogiDev");
  assert.match(read("services/billing/payment-admin.ts"), /notifyPlatformSubscriptionResolved\(\{[\s\S]*status: "rejected"/, "payment rejection must notify LogiDev");
  assert.match(read("services/billing/subscription-cron.ts"), /notifyPlatformSubscriptionStatusChanged\(\{[\s\S]*previousStatus: "trialing"/, "subscription cron lifecycle changes must notify LogiDev");
  assert.match(read("services/platform-admin-service.ts"), /notifyPlatformTenantStatusChanged\(\{[\s\S]*previousStatus: previousRestaurant\?\.platform_status/, "tenant status changes must notify LogiDev");
});

test("LogiDev event publisher never sends Telegram directly from app services", () => {
  assert.match(platformEventsSource, /publishOperationalEvent\(event\)/, "platform event producer must use operational event bus");
  assert.doesNotMatch(platformEventsSource, /sendMessage|bot\.api|grammy|telegraf/i, "app-side producers must not call Telegram APIs directly");
});

test("LogiDev bot list screens use detail selectors instead of action-button floods", () => {
  assert.match(platformBotServerSource, /"payment\.detail"/, "payment list must route through a detail screen");
  assert.match(platformBotServerSource, /"tenant\.detail"/, "tenant list must route through a detail screen");
  assert.match(platformBotServerSource, /appendPaymentSelectors/, "payment list must render compact selectors");
  assert.match(platformBotServerSource, /appendTenantSelectors/, "tenant list must render compact selectors");
  assert.doesNotMatch(platformBotServerSource, /Duyệt #|Từ chối #|Mở #|Tạm dừng #|Xóa mềm #|Mở lại #/, "list screens must not create repeated per-row action buttons");
});

test("Tenant bot uses a unified action inbox with detail sheets", () => {
  assert.match(tenantBotServerSource, /bot\.command\("inbox"/, "tenant bot must expose /inbox");
  assert.match(tenantBotServerSource, /replyWithUnifiedInbox/, "tenant bot must render unified inbox");
  assert.match(tenantBotServerSource, /ops_item_detail/, "tenant bot must route item selectors through signed sessions");
  assert.match(tenantBotServerSource, /appendInboxSelectors/, "tenant bot slice screens must render compact selectors");
  assert.match(tenantBotRepositorySource, /TelegramOpsInboxSlice = "all"/, "repository must support unified inbox slice");
  assert.match(tenantBotRepositorySource, /getUnifiedOpsInbox/, "repository must aggregate operational work across slices");
  assert.doesNotMatch(tenantBotServerSource, /labelForAction\(actionType\)} \$\{shortId/, "slice screens must not render repeated per-row action buttons");
});

test("Tenant bot repository builds Supabase filters after select", () => {
  assert.doesNotMatch(tenantBotRepositorySource, /\.from\("[^"]+"\)\s*\.eq\(/, "Supabase queries must call select/insert/update/delete before filters");
});

test("Tenant Telegram accounts are locked to one active restaurant connection", () => {
  assert.match(tenantSingleConnectionMigrationSource, /telegram_connections_active_telegram_user_unique_idx/, "migration must create the active telegram_user_id unique index");
  assert.match(tenantSingleConnectionMigrationSource, /where status = 'active'/, "unique index must only lock active connections");
  assert.match(tenantSingleConnectionMigrationSource, /telegram\.connection\.revoked_duplicate/, "migration must audit duplicate revocations");
  assert.match(tenantBotRepositorySource, /enforceSingleActiveTelegramConnection/, "runtime reads must guard legacy duplicate active connections");
  assert.match(tenantBotRepositorySource, /telegram_user_already_linked_to_restaurant/, "connect flow must reject Telegram accounts already linked to another restaurant");
  assert.match(tenantBotServerSource, /already_linked_to_restaurant/, "connect rejection must have owner-facing copy");
});

test("Tenant bot read-only callbacks stay reusable while AI sessions remain one-time", () => {
  assert.match(tenantBotServerSource, /claimTelegramSession\(token, ctx\.from\.id, \{ consume: false \}\)/, "menu/detail callbacks should not be consumed on read");
  assert.match(tenantBotServerSource, /consumeTelegramSession\(claimed\.session\.id\)/, "AI Ops session callbacks must still be consumed before execution");
  assert.match(tenantBotServerSource, /TELEGRAM_MENU_SESSION_TTL_SECONDS", 3600/, "menu sessions should stay usable long enough for real operators");
});

test("staff incident operational events are accepted by VPS gateway and queue router", () => {
  assert.match(eventBusSource, /type: "staff\.incident_reported"/, "app-side staff incident event type exists");
  assert.match(gatewaySource, /"staff\.incident_reported"/, "gateway must accept staff incident events");
  assert.match(queuesSource, /"staff\.incident_reported"[\s\S]*telegram\.notifications/, "queue router must deliver staff incidents to tenant Telegram notifications");
});

function read(path: string) {
  return readFileSync(path, "utf8");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
