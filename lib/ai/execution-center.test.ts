import assert from "node:assert/strict";
import test from "node:test";
import { buildAiExecutionCenter } from "@/lib/ai/execution-center";

test("buildAiExecutionCenter merges recommendations workflows and studio signals", () => {
  const deck = buildAiExecutionCenter({
    recommendations: [
      {
        id: "combo-1",
        type: "combo",
        priority: "high",
        title: "Tạo combo trà đào",
        detail: "Trà đào bán tốt.",
        action: "Mở menu để tạo combo.",
        actionHref: "/dashboard/menu",
        confidence: "high",
        estimatedImpact: { label: "Tăng average ticket" },
        evidence: [],
        lifecycle: {
          databaseId: "11111111-1111-1111-1111-111111111111",
          status: "active",
          schemaReady: true
        }
      }
    ],
    workflows: [
      {
        id: "workflow-low-stock",
        domain: "inventory",
        title: "Nhập hàng tồn thấp",
        trigger: "Sữa tươi dưới ngưỡng.",
        outcome: "Tạo checklist nhập hàng.",
        priority: "critical",
        confidence: "high",
        executionMode: "confirm_first",
        estimatedMinutes: 8,
        evidence: [],
        actions: [{ id: "open-inventory", type: "link", label: "Mở kho", href: "/dashboard/inventory", intent: "inventory" }],
        steps: [],
        lifecycle: {
          databaseId: "22222222-2222-2222-2222-222222222222",
          status: "pending_confirmation",
          schemaReady: true
        }
      }
    ],
    studioSignals: [
      {
        id: "menu-image-refresh",
        kind: "menu_opportunity",
        title: "Bổ sung ảnh món",
        detail: "Có món thiếu ảnh.",
        priority: "medium",
        status: "ready",
        actionHref: "/dashboard/menu",
        nextAction: "Tạo ảnh và duyệt."
      }
    ]
  });

  assert.equal(deck.summary.total, 3);
  assert.equal(deck.summary.pending, 3);
  assert.equal(deck.summary.critical, 1);
  assert.equal(deck.items[0]?.kind, "workflow");
  assert.equal(deck.lanes.find((lane) => lane.id === "pending")?.count, 3);
});

test("buildAiExecutionCenter maps accepted and manual states", () => {
  const deck = buildAiExecutionCenter({
    recommendations: [
      {
        id: "promo-1",
        type: "promotion",
        priority: "medium",
        title: "Chạy ưu đãi",
        detail: "Doanh thu thấp.",
        action: "Mở khuyến mãi.",
        actionHref: "/dashboard/promotions",
        confidence: "medium",
        evidence: [],
        lifecycle: {
          status: "accepted",
          schemaReady: true
        }
      }
    ],
    studioSignals: [
      {
        id: "support-payment",
        kind: "support_scenario",
        title: "Thanh toán cần handoff",
        detail: "Flow nhạy cảm.",
        priority: "critical",
        status: "draft",
        actionHref: "/dashboard/payments",
        nextAction: "Bổ sung policy."
      }
    ]
  });

  assert.equal(deck.summary.approved, 1);
  assert.equal(deck.summary.manual, 1);
  assert.equal(deck.items.some((item) => item.safetyMode === "manual_only"), true);
});

test("buildAiExecutionCenter keeps blocked studio signals visible", () => {
  const deck = buildAiExecutionCenter({
    studioSignals: [
      {
        id: "growth-retention",
        kind: "growth_campaign",
        title: "Kéo khách quay lại",
        detail: "Thiếu memory.",
        priority: "high",
        status: "blocked",
        actionHref: "/dashboard/ai-growth",
        nextAction: "Thêm memory.",
        safetyNote: "Chưa có memory khách hàng."
      }
    ]
  });

  assert.equal(deck.summary.blocked, 1);
  assert.equal(deck.items[0]?.blockers[0], "Chưa có memory khách hàng.");
});
