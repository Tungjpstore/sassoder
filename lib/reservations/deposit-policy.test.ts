import assert from "node:assert/strict";
import { test } from "node:test";
import { hasCapturedReservationDeposit, resolveReservationClosureDepositDisposition } from "./deposit-policy";

test("hasCapturedReservationDeposit treats paid/refundable/forfeited states as captured", () => {
  assert.equal(hasCapturedReservationDeposit({ depositRequiredAmount: 100_000, depositPaidAmount: 0, depositStatus: "waiting_confirm" }), false);
  assert.equal(hasCapturedReservationDeposit({ depositRequiredAmount: 100_000, depositPaidAmount: 100_000, depositStatus: "paid" }), true);
  assert.equal(hasCapturedReservationDeposit({ depositRequiredAmount: 100_000, depositPaidAmount: 0, depositStatus: "forfeited" }), true);
});

test("resolveReservationClosureDepositDisposition forfeits captured deposits on no-show", () => {
  assert.deepEqual(
    resolveReservationClosureDepositDisposition({ depositRequiredAmount: 100_000, depositPaidAmount: 100_000, depositStatus: "paid" }, "no_show"),
    {
      nextDepositStatus: "forfeited",
      logStatus: "cancelled",
      riskEventType: "deposit_forfeited",
      label: "Giữ cọc do khách không đến"
    }
  );
});

test("resolveReservationClosureDepositDisposition marks captured deposits refundable on merchant cancel", () => {
  assert.equal(
    resolveReservationClosureDepositDisposition({ depositRequiredAmount: 100_000, depositPaidAmount: 100_000, depositStatus: "paid" }, "merchant_cancel")?.nextDepositStatus,
    "refundable"
  );
});
