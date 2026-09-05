import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260905090000_phase_a_legacy_qr_default_off.sql";
const migrationSql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const schemaSql = readFileSync("supabase/schema.sql", "utf8");
const restaurantServiceSource = readFileSync("services/restaurant-service.ts", "utf8");
const reserveViewSource = readFileSync("components/customer-v2/reserve/reserve-view.tsx", "utf8");

test("new tenants default to signed table QR tokens", () => {
  assert.match(migrationSql, /alter table public\.restaurants[\s\S]*alter column allow_legacy_qr set default false/i);
  assert.match(schemaSql, /allow_legacy_qr boolean not null default false/i);
});

test("the legacy QR default change is forward-only and does not rewrite existing tenants", () => {
  assert.doesNotMatch(migrationSql, /update\s+public\.restaurants/i);
  assert.doesNotMatch(migrationSql, /set\s+allow_legacy_qr\s*=/i);
});

test("omitting allowLegacyQr preserves the stored tenant value", () => {
  assert.match(
    restaurantServiceSource,
    /const legacyQrUpdate = input\.allowLegacyQr === undefined \? \{\} : \{ allow_legacy_qr: input\.allowLegacyQr \}/
  );
  assert.doesNotMatch(restaurantServiceSource, /allow_legacy_qr: input\.allowLegacyQr \?\? true/);
});

test("party size offers presets plus an explicit custom toggle", () => {
  assert.match(reserveViewSource, /const partySizeChoices = \[2, 4, 6, 8\]/);
  assert.match(reserveViewSource, /const isPresetPartySize = partySizeChoices\.includes\(partySize\)/);
  // The custom number input must stay hidden while a preset is active, otherwise
  // the row renders the selected size twice ("2 4 6 8 2").
  assert.match(reserveViewSource, /\{!isPresetPartySize \? \([\s\S]*aria-label="Số khách khác"/);
});
