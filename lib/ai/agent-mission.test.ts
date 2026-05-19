import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentMission } from "./agent-mission";

test("buildAgentMission turns actions into executable mission steps", () => {
  const mission = buildAgentMission({
    surface: "dashboard",
    title: "Order Controller",
    outcome: "Nhận đơn đang chờ",
    actions: [
      {
        id: "accept-order-1",
        type: "api",
        label: "Nhận đơn #001",
        priority: "primary",
        safety: "confirm"
      },
      {
        id: "open-orders",
        type: "link",
        label: "Mở đơn hàng",
        href: "/dashboard/orders"
      }
    ]
  });

  assert.equal(mission.steps[0].status, "needs_confirmation");
  assert.equal(mission.steps[0].actionId, "accept-order-1");
  assert.equal(mission.urgency, "now");
  assert.match(mission.operatorNote, /thanh toán/);
});

test("buildAgentMission creates fallback steps when no action exists", () => {
  const mission = buildAgentMission({
    surface: "customer",
    title: "Menu Guide",
    outcome: "Gợi ý món từ menu thật"
  });

  assert.equal(mission.steps.length, 2);
  assert.equal(mission.steps[0].status, "ready");
  assert.match(mission.successCriteria.join(" "), /Khách/);
});
