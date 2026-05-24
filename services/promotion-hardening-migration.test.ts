import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSql = readFileSync("supabase/migrations/20260519101000_promotion_identity_timezone.sql", "utf8");
const freeItemMigrationSql = readFileSync("supabase/migrations/20260519103500_promotion_free_item_rewards.sql", "utf8");
const staleStockMigrationSql = readFileSync("supabase/migrations/20260519102000_inventory_stale_stock_alert.sql", "utf8");
const orderServiceSource = readFileSync("services/order-service.ts", "utf8");
const promotionServiceSource = readFileSync("services/promotion-service.ts", "utf8");
const promotionsWorkspaceSource = readFileSync("components/dashboard/promotions-workspace.tsx", "utf8");

function literalPattern(text: string, flags = "i") {
  const escapedParts = text
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escapedParts.join("\\s+"), flags);
}

test("promotion usage limits are enforced by server generated customer hashes", () => {
  assert.match(migrationSql, /add column if not exists promotion_customer_key_hash text/i);
  assert.match(migrationSql, /promotion_customer_key_hash = new\.promotion_customer_key_hash/i);
  assert.match(migrationSql, /Mã khuyến mãi cần định danh khách an toàn/i);
  assert.match(orderServiceSource, /buildPromotionCustomerKeyHash/);
  assert.match(orderServiceSource, literalPattern("promotion_customer_key_hash: promotion ? promotionCustomerKeyHash : null"));
  assert.match(promotionServiceSource, literalPattern("perCustomerUsageLimit: customerKeyHash ? promotion.per_customer_usage_limit : null"));
  assert.doesNotMatch(promotionServiceSource, /customerSessionId\s*\?\s*promotion\.per_customer_usage_limit/);
});

test("promotion date ranges use restaurant timezone before UTC persistence", () => {
  assert.match(migrationSql, /add column if not exists timezone text not null default 'Asia\/Ho_Chi_Minh'/i);
  assert.match(promotionServiceSource, /promotionDateTimeToUtcIso/);
  assert.doesNotMatch(promotionServiceSource, /new Date\(input\.startsAt\)\.toISOString\(\)/);
  assert.doesNotMatch(promotionServiceSource, /new Date\(input\.endsAt\)\.toISOString\(\)/);
});

test("promotion free item rewards are persisted and configurable", () => {
  assert.match(freeItemMigrationSql, /add column if not exists reward_type text not null default 'DISCOUNT'/i);
  assert.match(freeItemMigrationSql, /free_item_menu_item_id uuid references public\.menu_items/i);
  assert.match(freeItemMigrationSql, /promotions_free_item_config_check/i);
  assert.match(promotionServiceSource, /reward_type: input\.rewardType \?\? "DISCOUNT"/);
  assert.match(promotionServiceSource, /free_item_menu_item_id: input\.freeItemMenuItemId \?\? null/);
  assert.match(orderServiceSource, /items: pricedItems\.map/);
  assert.match(promotionsWorkspaceSource, /name="rewardType"/);
  assert.match(promotionsWorkspaceSource, /name="freeItemMenuItemId"/);
});

test("inventory stale stock alert type is migration-backed", () => {
  assert.match(staleStockMigrationSql, /'stale_stock'/);
  assert.match(staleStockMigrationSql, /stock_balances_restaurant_stale_stock_idx/);
});
