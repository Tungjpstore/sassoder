import assert from "node:assert/strict";
import test from "node:test";
import { buildAiSalesForecast } from "./sales-forecast";

test("buildAiSalesForecast projects end-of-day revenue from observed slots", () => {
  const forecast = buildAiSalesForecast({
    now: new Date("2026-05-17T10:15:00"),
    targetRevenue: 1_000_000,
    hourlyRevenueToday: [
      { label: "08:00", revenue: 100_000, orderCount: 2 },
      { label: "09:00", revenue: 120_000, orderCount: 3 },
      { label: "10:00", revenue: 80_000, orderCount: 2 },
      { label: "11:00", revenue: 0, orderCount: 0 },
      { label: "12:00", revenue: 0, orderCount: 0 }
    ]
  });

  assert.equal(forecast.observedRevenue, 300_000);
  assert.equal(forecast.projectedRevenue, 500_000);
  assert.equal(forecast.trend, "behind");
  assert.ok(forecast.actions.some((action) => action.includes("combo")));
});

test("buildAiSalesForecast marks strong days ahead of target", () => {
  const forecast = buildAiSalesForecast({
    now: new Date("2026-05-17T12:00:00"),
    targetRevenue: 500_000,
    hourlyRevenueToday: [
      { label: "10:00", revenue: 260_000, orderCount: 8 },
      { label: "11:00", revenue: 280_000, orderCount: 9 },
      { label: "12:00", revenue: 260_000, orderCount: 8 }
    ]
  });

  assert.equal(forecast.trend, "ahead");
  assert.equal(forecast.confidence, "high");
});
