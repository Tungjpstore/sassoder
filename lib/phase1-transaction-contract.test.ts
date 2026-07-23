import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260722110000_phase1_transactional_order_payment.sql";
const migrationSql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

function functionBody(name: string) {
  const match = migrationSql.match(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\b([\\s\\S]*?)\\$\\$;`,
      "i",
    ),
  );

  assert.ok(match, `missing ${name} RPC`);
  return match[0];
}

test("migration is forward-only and aborts before changes on invalid bill tenancy", () => {
  assert.doesNotMatch(migrationSql, /drop\s+(table|column)\b/i);
  assert.doesNotMatch(migrationSql, /^\s*set\s+local\b/im);
  assert.match(migrationSql, /^\s*set\s+lock_timeout\s*=\s*'5s'/im);
  assert.match(migrationSql, /^\s*reset\s+lock_timeout/im);
  assert.match(migrationSql, /cross-tenant order-to-bill links/i);

  const preflight = migrationSql.search(/cross-tenant order-to-bill links/i);
  const firstMutation = migrationSql.search(/(?:alter|create|revoke|grant)\s+/i);
  assert.ok(preflight >= 0 && firstMutation > preflight, "preflight must run before schema or grant changes");
});

test("authenticated roles cannot bypass the transactional financial boundary", () => {
  assert.match(
    migrationSql,
    /revoke\s+insert,\s*update,\s*delete\s+on\s+table[\s\S]*public\.orders[\s\S]*public\.order_items[\s\S]*public\.table_bills[\s\S]*public\.payment_logs[\s\S]*from\s+public,\s*anon,\s*authenticated/i,
  );
  assert.match(migrationSql, /grant\s+select,\s*insert,\s*update,\s*delete[\s\S]*to\s+service_role/i);
});

test("idempotency is tenant-scoped and rejects key reuse with a new fingerprint", () => {
  assert.match(migrationSql, /create table if not exists public\.financial_transaction_requests/i);
  assert.match(migrationSql, /unique\s*\(restaurant_id,\s*operation,\s*idempotency_key\)/i);
  assert.match(migrationSql, /request_fingerprint\s+text\s+not\s+null/i);
  assert.match(migrationSql, /request_fingerprint\s+is\s+distinct\s+from\s+p_request_fingerprint/i);
  assert.match(migrationSql, /IDEMPOTENCY_FINGERPRINT_MISMATCH/i);
  assert.match(migrationSql, /for update/i);
});

test("all Phase 1 financial RPCs are service-role-only with a fixed search path", () => {
  for (const name of [
    "create_online_order_atomic",
    "checkout_bill_atomic",
    "transition_payment_atomic",
  ]) {
    const body = functionBody(name);
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = pg_catalog, public/i);
    assert.match(
      migrationSql,
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\([\\s\\S]*?from\\s+public,\\s*anon,\\s*authenticated`, "i"),
    );
    assert.match(
      migrationSql,
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\([\\s\\S]*?to\\s+service_role`, "i"),
    );
  }
});

test("order creation locks tenant resources and commits order, items, audit and outbox together", () => {
  const body = functionBody("create_online_order_atomic");

  assert.match(body, /from public\.restaurants\s+restaurants[\s\S]*?for key share/i);
  assert.match(body, /from public\.table_bills[\s\S]*restaurant_id\s*=\s*p_restaurant_id[\s\S]*for update/i);
  assert.match(body, /insert into public\.orders/i);
  assert.match(body, /insert into public\.order_items/i);
  assert.match(body, /insert into public\.payment_logs/i);
  assert.match(body, /insert into public\.audit_logs/i);
  assert.match(body, /insert into public\.operational_event_outbox/i);
  assert.match(body, /ORDER_TOTAL_MISMATCH/i);
  assert.match(body, /same-tenant bill attachment/i);
  assert.match(body, /jsonb_set\(v_request\.response_payload, '\{idempotentReplay\}', 'true'::jsonb/i);
  assert.doesNotMatch(body, /entity_type,\s*entity_type/i);
});

test("checkout uses CAS and only advances bill and order states while holding row locks", () => {
  const body = functionBody("checkout_bill_atomic");

  assert.match(body, /p_expected_state_version/i);
  assert.match(body, /state_version\s*<>\s*p_expected_state_version/i);
  assert.match(body, /for update/i);
  assert.match(body, /STATE_VERSION_CONFLICT/i);
  assert.match(body, /INVALID_BILL_TRANSITION/i);
  assert.match(body, /INVALID_ORDER_PAYMENT_STATE/i);
  assert.match(body, /state_version\s*=\s*bills\.state_version\s*\+\s*1/i);
  assert.match(body, /insert into public\.payment_logs/i);
  assert.match(
    body,
    /case\s+when\s+p_payment_method\s*=\s*'QR'\s+then\s+'pending'\s+else\s+'waiting_confirm'\s+end::public\.payment_log_status/i,
  );
  assert.match(body, /insert into public\.audit_logs/i);
  assert.match(body, /insert into public\.operational_event_outbox/i);
});

test("payment transition is deduplicated, monotonic and atomically records every side effect", () => {
  const body = functionBody("transition_payment_atomic");

  assert.match(body, /from public\.table_bills[\s\S]*for update/i);
  assert.match(body, /from public\.orders[\s\S]*for update/i);
  assert.match(body, /p_expected_order_state_version/i);
  assert.match(body, /INVALID_PAYMENT_TRANSITION/i);
  assert.match(body, /insert into public\.payment_logs/i);
  assert.match(body, /transition_key/i);
  assert.match(body, /insert into public\.audit_logs/i);
  assert.match(body, /insert into public\.operational_event_outbox/i);
  assert.match(body, /state_version\s*=\s*orders\.state_version\s*\+\s*1/i);
});

test("payment transition cannot rewrite fulfillment into cancellation or an invalid terminal state", () => {
  const body = functionBody("transition_payment_atomic");
  assert.match(body, /INVALID_PAYMENT_ORDER_STATUS_COMBINATION/i);
  assert.match(body, /p_next_order_status\s*=\s*'cancelled'/i);
  assert.match(body, /p_to_status\s*=\s*'failed'[\s\S]*'waiting_confirm'/i);
  assert.match(body, /p_to_status\s*=\s*'refunded'[\s\S]*'completed'/i);
});

test("legacy payment-log callers are compatibility-filled before the tenant column becomes required", () => {
  assert.match(migrationSql, /create or replace function public\.populate_payment_log_restaurant_id\b/i);
  assert.match(migrationSql, /before insert or update on public\.payment_logs/i);
  assert.match(migrationSql, /new\.restaurant_id\s+is\s+null[\s\S]*select[\s\S]*restaurant_id/i);
  assert.match(migrationSql, /alter table public\.payment_logs[\s\S]*alter column restaurant_id set not null/i);
  assert.match(migrationSql, /PAYMENT_LOG_TENANT_MISMATCH/i);
});

test("legacy service updates advance state versions unless the caller already performed an explicit CAS increment", () => {
  assert.match(migrationSql, /create or replace function public\.bump_order_state_version\b/i);
  assert.match(migrationSql, /create or replace function public\.bump_table_bill_state_version\b/i);
  assert.match(migrationSql, /before update on public\.orders/i);
  assert.match(migrationSql, /before update on public\.table_bills/i);
  assert.match(migrationSql, /new\.state_version\s*:=\s*old\.state_version\s*\+\s*1/i);
});

test("order creation uses canonical menu availability and rejects caller-controlled prices", () => {
  const body = functionBody("create_online_order_atomic");
  assert.match(body, /from public\.menu_items[\s\S]*for key share/i);
  assert.match(body, /coalesce\(v_item\.base_price,\s*v_item\.price\)\s*<>\s*v_menu_price/i);
  assert.match(body, /menu_items\.is_available/i);
  assert.match(body, /v_item\.price\s*<>\s*coalesce\(v_item\.base_price,\s*v_item\.price\)\s*\+/i);
  assert.match(body, /from public\.menu_modifier_options/i);
  assert.match(body, /MODIFIER_PRICE_MISMATCH/i);
  assert.match(body, /total_usage_limit/i);
  assert.match(body, /per_customer_usage_limit/i);
  assert.match(body, /PROMOTION_USAGE_LIMIT_REACHED/i);
  assert.match(body, /CANONICAL_MENU_PRICE_MISMATCH/i);
});

test("null JSON payloads are persisted as SQL NULL", () => {
  const body = functionBody("create_online_order_atomic");
  assert.match(body, /nullif\(p_order->'delivery_route_geometry',[\s\S]*'null'::jsonb\)/i);
  assert.match(body, /nullif\(p_order->'delivery_quote_snapshot',[\s\S]*'null'::jsonb\)/i);
});

test("prepaid orders stay out of the kitchen until payment is captured", () => {
  const createBody = functionBody("create_online_order_atomic");
  const checkoutBody = functionBody("checkout_bill_atomic");
  assert.match(createBody, /status,[\s\S]*case\s+when\s+v_initial_payment_status\s*=\s*'waiting_payment'\s+then\s+'waiting_payment'/i);
  assert.match(checkoutBody, /ORDER_NOT_ACCEPTED/i);
  assert.match(checkoutBody, /orders\.status\s*<>\s*'cancelled'/i);
});

test("payment transition locks and settles the complete bill atomically", () => {
  const body = functionBody("transition_payment_atomic");
  assert.match(body, /select orders\.\*[\s\S]*orders\.bill_id\s*=\s*p_bill_id[\s\S]*for update/i);
  assert.match(body, /v_bill_total[\s\S]*p_amount/i);
  assert.match(body, /for v_bill_order in[\s\S]*insert into public\.payment_logs/i);
  assert.match(body, /when\s+p_to_status\s*=\s*'refunded'\s+then\s+'completed'/i);
  assert.match(body, /p_to_status\s*=\s*'refunded'[\s\S]*'cancelled'::public\.table_bill_status/i);
  assert.match(body, /paid_at\s*=\s*case[\s\S]*p_to_status\s*=\s*'refunded'/i);
});

test("transactional outbox rows use supported operational event contracts", () => {
  const createBody = functionBody("create_online_order_atomic");
  const checkoutBody = functionBody("checkout_bill_atomic");
  const transitionBody = functionBody("transition_payment_atomic");

  assert.match(createBody, /'type',\s*'order\.created'/i);
  assert.match(createBody, /'eventId',\s*'order\.created:'\s*\|\|\s*v_order\.id/i);
  assert.match(createBody, /'order',\s*jsonb_build_object[\s\S]*'itemCount'/i);
  assert.match(checkoutBody, /if\s+p_payment_method\s*=\s*'CASH'[\s\S]*'payment\.waiting_confirm'/i);
  assert.match(checkoutBody, /order by\s+notification_order\.id[\s\S]*limit\s+1/i);
  assert.match(checkoutBody, /'orderId',\s*v_notification_order_id/i);
  assert.match(checkoutBody, /'orderIds',\s*v_checkout_order_ids/i);
  assert.doesNotMatch(checkoutBody, /'orderId',\s*v_order\.id/i);
  assert.match(transitionBody, /p_to_status\s+in\s*\('waiting_confirm',\s*'paid'\)/i);
  assert.match(transitionBody, /'payment\.waiting_confirm'/i);
  assert.match(transitionBody, /'payment\.received'/i);
  assert.doesNotMatch(migrationSql, /bill\.checkout_requested|order\.payment_transitioned/i);
});

test("bill-level payment audit includes every affected order and payment log", () => {
  const body = functionBody("transition_payment_atomic");

  assert.match(body, /v_affected_order_ids/i);
  assert.match(body, /v_payment_log_ids/i);
  assert.match(body, /'affectedOrderIds',\s*v_affected_order_ids/i);
  assert.match(body, /'paymentLogIds',\s*v_payment_log_ids/i);
});
