import assert from "node:assert/strict";
import test from "node:test";
import { buildTableQrAccessToken, isValidTableQrAccess, type TableQrAccessTable } from "@/lib/customer/table-qr-access";

type TestRestaurantTable = TableQrAccessTable & {
  name: string;
  area: string;
  capacity: number;
  qr_enabled: boolean;
};

function table(input: Partial<TestRestaurantTable> = {}): TestRestaurantTable {
  return {
    id: input.id ?? "11111111-1111-4111-8111-111111111111",
    restaurant_id: input.restaurant_id ?? "22222222-2222-4222-8222-222222222222",
    name: input.name ?? "Bàn 1",
    area: input.area ?? "Khu chính",
    capacity: input.capacity ?? 4,
    qr_enabled: input.qr_enabled ?? true,
    qr_token_enforced: input.qr_token_enforced ?? false,
    qr_token_version: input.qr_token_version ?? 1
  };
}

test("table QR access accepts legacy QR only when legacy mode is allowed", () => {
  const legacyTable = table({ qr_token_enforced: false });

  assert.equal(isValidTableQrAccess(legacyTable, null), false);
  assert.equal(isValidTableQrAccess(legacyTable, null, { allowLegacyQr: true }), true);
  assert.equal(isValidTableQrAccess(legacyTable, null, { allowLegacyQr: false }), false);
});

test("table QR access rejects rotated or wrong table tokens", () => {
  const currentTable = table({ qr_token_enforced: true, qr_token_version: 2 });
  const token = buildTableQrAccessToken(currentTable);
  const oldToken = buildTableQrAccessToken({ ...currentTable, qr_token_version: 1 });
  const wrongTableToken = buildTableQrAccessToken({ ...currentTable, id: "33333333-3333-4333-8333-333333333333" });

  assert.equal(isValidTableQrAccess(currentTable, token), true);
  assert.equal(isValidTableQrAccess(currentTable, oldToken), false);
  assert.equal(isValidTableQrAccess(currentTable, wrongTableToken), false);
});
