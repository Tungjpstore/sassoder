import assert from "node:assert/strict";
import test from "node:test";
import { dashboardApiErrorMessage, readDashboardApiResponse } from "./api-response";

test("readDashboardApiResponse returns enveloped data for successful dashboard APIs", async () => {
  const response = new Response(JSON.stringify({ ok: true, data: { id: "order-1" } }), { status: 200 });

  assert.deepEqual(await readDashboardApiResponse(response, "fallback"), { id: "order-1" });
});

test("readDashboardApiResponse surfaces API error copy instead of raw JSON", async () => {
  const response = new Response(JSON.stringify({ ok: false, error: "Đơn hàng chưa ở trạng thái chờ xác nhận thanh toán" }), { status: 400 });

  await assert.rejects(
    () => readDashboardApiResponse(response, "fallback"),
    /Đơn hàng chưa ở trạng thái chờ xác nhận thanh toán/
  );
});

test("readDashboardApiResponse supports legacy success envelopes", async () => {
  const response = new Response(JSON.stringify({ success: false, message: "Không thể cập nhật đơn" }), { status: 200 });

  await assert.rejects(() => readDashboardApiResponse(response, "fallback"), /Không thể cập nhật đơn/);
});

test("dashboardApiErrorMessage falls back when the payload has no display copy", () => {
  assert.equal(dashboardApiErrorMessage(null, "Thao tác thất bại"), "Thao tác thất bại");
  assert.equal(dashboardApiErrorMessage({}, "Thao tác thất bại"), "Thao tác thất bại");
});
