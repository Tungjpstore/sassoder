import assert from "node:assert/strict";
import test from "node:test";
import { buildOperationInsights } from "./operation-insights";

const now = new Date("2026-05-16T12:00:00.000Z");

test("buildOperationInsights prioritizes payment and delayed service risks", () => {
  const deck = buildOperationInsights(
    {
      summary24h: { orderCount: 4, paidRevenue: 0 },
      payments: { waitingConfirm: 3 },
      recentOrders: [
        {
          id: "order-1",
          shortId: "ORDER001",
          status: "ordering",
          total: 120000,
          paymentStatus: "waiting_confirm",
          createdAt: "2026-05-16T09:00:00.000Z",
          serviceDueAt: "2026-05-16T11:30:00.000Z",
          items: [{ name: "Trà đào", quantity: 2, price: 45000 }]
        }
      ]
    },
    now
  );

  assert.equal(deck.insights[0]?.severity, "critical");
  assert.ok(deck.healthScore < 80);
  assert.ok(deck.insights.some((insight) => insight.kind === "payment"));
  assert.ok(deck.insights.some((insight) => insight.kind === "service"));
});

test("buildOperationInsights detects menu upsell and peak-hour signals", () => {
  const deck = buildOperationInsights(
    {
      summary24h: { orderCount: 5, paidRevenue: 360000 },
      recentOrders: [
        {
          status: "paid",
          createdAt: "2026-05-16T10:05:00.000",
          items: [{ name: "Bạc xỉu", quantity: 2, price: 39000 }]
        },
        {
          status: "paid",
          createdAt: "2026-05-16T10:20:00.000",
          items: [{ name: "Bạc xỉu", quantity: 1, price: 39000 }]
        },
        {
          status: "paid",
          createdAt: "2026-05-16T10:45:00.000",
          items: [{ name: "Trà đào", quantity: 1, price: 45000 }]
        }
      ],
      promotions: [{ active: true }]
    },
    now
  );

  assert.ok(deck.insights.some((insight) => insight.kind === "menu" && /Bạc xỉu/.test(insight.detail)));
  assert.ok(deck.insights.some((insight) => insight.kind === "staffing" && insight.metric?.value === "10:00-11:00"));
});

test("buildOperationInsights can use dashboard top items and table overdue signals", () => {
  const deck = buildOperationInsights(
    {
      summary24h: { orderCount: 3, paidRevenue: 180000 },
      recentOrders: [],
      topItems: [{ name: "Trà đào", quantity: 6, revenue: 270000 }],
      tables: {
        tableCount: 8,
        activeTableCount: 3,
        qrDisabledCount: 1,
        tables: [{ name: "Bàn 5", status: "overdue", overdueCount: 1 }]
      },
      payments: { waitingConfirm: 0, waitingPayment: 2 }
    },
    now
  );

  assert.ok(deck.insights.some((insight) => insight.kind === "service" && insight.metric?.value === "1"));
  assert.ok(deck.insights.some((insight) => insight.kind === "menu" && /Trà đào/.test(insight.detail)));
  assert.ok(deck.insights.some((insight) => insight.kind === "tables" && /QR/.test(insight.title)));
  assert.ok(deck.insights.some((insight) => insight.kind === "payment" && /chờ khách/.test(insight.detail)));
});

test("buildOperationInsights flags empty-day revenue risk", () => {
  const deck = buildOperationInsights(
    {
      summary24h: { orderCount: 0, paidRevenue: 0 },
      recentOrders: []
    },
    now
  );

  assert.equal(deck.primaryInsightId, "revenue-chua-co-don-trong-24-gio");
  assert.match(deck.summary, /cảnh báo|việc cần xử lý/i);
});

test("buildOperationInsights detects inventory risk and recipe gaps", () => {
  const deck = buildOperationInsights(
    {
      summary24h: { orderCount: 8, paidRevenue: 720000 },
      recentOrders: [],
      inventory: {
        schemaReady: true,
        activeIngredientCount: 10,
        lowStockCount: 3,
        recipeCoveragePercent: 40,
        recipeReadyItemCount: 4,
        menuItemCount: 10,
        expiringBatchCount: 1,
        openAlertCount: 2,
        lowStockIngredients: [{ name: "Trân châu đen", unit: "kg", onHandQuantity: 1, minimumQuantity: 3 }]
      }
    },
    now
  );

  assert.ok(deck.insights.some((insight) => insight.kind === "inventory" && /Kho/.test(insight.title)));
  assert.ok(deck.insights.some((insight) => insight.kind === "inventory" && insight.metric?.label === "Recipe coverage"));
  assert.ok(deck.insights.some((insight) => insight.actionHref === "/dashboard/inventory"));
});
