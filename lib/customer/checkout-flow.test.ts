import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeliveryQuoteFingerprint,
  dineInCheckoutReducer,
  remoteCheckoutReducer,
  validateRemoteCheckoutBasics,
  type DineInCheckoutScreen,
  type RemoteCheckoutScreen
} from "./checkout-flow";

const remoteState = (screen: RemoteCheckoutScreen = "cart") => ({ error: null, screen });
const dineInState = (screen: DineInCheckoutScreen = "tracking") => ({ error: null, screen });

test("remote checkout sends pickup orders directly to payment", () => {
  const next = remoteCheckoutReducer(remoteState(), {
    type: "CONTINUE_FROM_CART",
    mode: "PICKUP"
  });

  assert.deepEqual(next, { error: null, screen: "payment" });
});

test("remote checkout requires an accepted delivery quote before payment", () => {
  const blocked = remoteCheckoutReducer(remoteState("delivery"), {
    type: "CONTINUE_FROM_DELIVERY",
    mode: "DELIVERY",
    quoteAccepted: false,
    quoteError: "Ngoài vùng giao hàng."
  });
  const allowed = remoteCheckoutReducer(remoteState("delivery"), {
    type: "CONTINUE_FROM_DELIVERY",
    mode: "DELIVERY",
    quoteAccepted: true
  });

  assert.deepEqual(blocked, { error: "Ngoài vùng giao hàng.", screen: "delivery" });
  assert.deepEqual(allowed, { error: null, screen: "payment" });
});

test("remote checkout routes prepaid QR submissions to VietQR", () => {
  const next = remoteCheckoutReducer(remoteState("payment"), {
    type: "ORDER_SUBMITTED",
    paymentMethod: "QR",
    requiresPrepaidQr: true
  });

  assert.deepEqual(next, { error: null, screen: "vietqr" });
});

test("remote checkout validates cart and customer identity before checkout", () => {
  assert.deepEqual(validateRemoteCheckoutBasics({ cartLineCount: 0, customerName: "Lan", customerPhone: "090" }), {
    ok: false,
    error: "Vui lòng chọn ít nhất một món.",
    screen: "cart"
  });
  assert.deepEqual(validateRemoteCheckoutBasics({ cartLineCount: 1, customerName: "", customerPhone: "090" }), {
    ok: false,
    error: "Vui lòng nhập tên và số điện thoại để quán xác nhận đơn.",
    screen: "cart"
  });
  assert.deepEqual(validateRemoteCheckoutBasics({ cartLineCount: 1, customerName: "L", customerPhone: "0901234567" }), {
    ok: false,
    error: "Vui lòng nhập tên và số điện thoại để quán xác nhận đơn.",
    screen: "cart"
  });
  assert.deepEqual(validateRemoteCheckoutBasics({ cartLineCount: 1, customerName: "Lan", customerPhone: "abc" }), {
    ok: false,
    error: "Số điện thoại chưa đúng. Bạn kiểm tra lại để quán liên hệ khi cần.",
    screen: "cart"
  });
  assert.deepEqual(validateRemoteCheckoutBasics({ cartLineCount: 1, customerName: "Lan", customerPhone: "0901234567" }), {
    ok: true
  });
});

test("remote checkout fingerprints delivery quotes by payable inputs", () => {
  assert.equal(
    buildDeliveryQuoteFingerprint({
      subtotal: 100000.4,
      deliveryAddress: "  12 Nguyen Trai   Quan 1 ",
      deliveryLat: 10.1234567,
      deliveryLng: 106.7654321
    }),
    buildDeliveryQuoteFingerprint({
      subtotal: 100000,
      deliveryAddress: "12 Nguyen Trai Quan 1",
      deliveryLat: 10.123457,
      deliveryLng: 106.765432
    })
  );
});

test("dine-in checkout restores existing order screens from payment state", () => {
  const qrWaiting = dineInCheckoutReducer(dineInState(), {
    type: "OPEN_EXISTING_ORDER",
    isPaid: false,
    orderStatus: "waiting_payment",
    paymentMethod: "QR"
  });
  const cashWaiting = dineInCheckoutReducer(dineInState(), {
    type: "OPEN_EXISTING_ORDER",
    isPaid: false,
    orderStatus: "waiting_confirm",
    paymentMethod: "CASH"
  });
  const paid = dineInCheckoutReducer(dineInState(), {
    type: "OPEN_EXISTING_ORDER",
    isPaid: true,
    orderStatus: "paid"
  });

  assert.deepEqual(qrWaiting, { error: null, screen: "vietqr-payment" });
  assert.deepEqual(cashWaiting, { error: null, screen: "payment-pending" });
  assert.deepEqual(paid, { error: null, screen: "payment-success" });
});

test("dine-in checkout maps payment actions to the correct screen", () => {
  const qr = dineInCheckoutReducer(dineInState("payment-choice"), {
    type: "START_PAYMENT",
    method: "QR"
  });
  const markedPending = dineInCheckoutReducer(dineInState("vietqr-payment"), {
    type: "PAYMENT_MARKED",
    isPaid: false
  });
  const entry = dineInCheckoutReducer(dineInState("tracking"), {
    type: "OPEN_PAYMENT_ENTRY",
    canStartPayment: true,
    hasCreatedOrder: true
  });

  assert.deepEqual(qr, { error: null, screen: "vietqr-payment" });
  assert.deepEqual(markedPending, { error: null, screen: "payment-pending" });
  assert.deepEqual(entry, { error: null, screen: "payment-choice" });
});
