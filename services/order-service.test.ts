import assert from "node:assert/strict";
import { test } from "node:test";
import { pickSeatedReservationBillIdFromLocks } from "../lib/orders/reservation-bill-routing";

test("pickSeatedReservationBillIdFromLocks ignores future locks until it finds a seated reservation bill", () => {
  const billId = "11111111-1111-4111-8111-111111111111";

  assert.equal(
    pickSeatedReservationBillIdFromLocks([
      { reservation: { status: "confirmed", seated_table_bill_id: null } },
      { reservation: [{ status: "checked_in", seated_table_bill_id: null }] },
      { reservation: { status: "seated", seated_table_bill_id: billId } }
    ]),
    billId
  );
});

test("pickSeatedReservationBillIdFromLocks returns null when no active seated bill exists", () => {
  assert.equal(
    pickSeatedReservationBillIdFromLocks([
      { reservation: { status: "confirmed", seated_table_bill_id: null } },
      { reservation: { status: "seated", seated_table_bill_id: null } },
      { reservation: null }
    ]),
    null
  );
});
