export type InventoryAuditMovementType =
  | "receive"
  | "deduct_sale"
  | "adjust_increase"
  | "adjust_decrease"
  | "waste"
  | "rollback"
  | "transfer_in"
  | "transfer_out"
  | "expired"
  | "internal_use"
  | "supplier_return"
  | "reserve"
  | "release_reserve";

export type InventoryAuditMovementInput = {
  id: string;
  movementType: InventoryAuditMovementType;
  quantityDelta: number;
  unitCost: number | null;
  sourceType: string;
  reason: string | null;
  createdAt: string;
  ingredientName: string;
  ingredientUnit: string;
};

export type InventoryAuditCountInput = {
  id: string;
  title: string;
  status: string;
  locationName: string | null;
  lineCount: number;
  adjustedLineCount: number;
  totalAbsVariance: number;
  totalVarianceValue: number;
};

export type InventoryAuditAlertInput = {
  id: string;
  alertType: string;
  severity: "low" | "medium" | "high" | "critical";
  status: string;
  title: string;
};

export type InventoryAuditInput = {
  movements: InventoryAuditMovementInput[];
  countSessions: InventoryAuditCountInput[];
  alerts: InventoryAuditAlertInput[];
};

export type InventoryAuditReport = {
  auditScore: number;
  lossValue: number;
  manualAdjustmentValue: number;
  rollbackValue: number;
  movementCount: number;
  lossMovementCount: number;
  unreasonedMovementCount: number;
  openControlAlertCount: number;
  countVarianceValue: number;
  topLossItems: Array<{
    ingredientName: string;
    ingredientUnit: string;
    quantity: number;
    value: number;
    movementCount: number;
  }>;
  riskyMovements: Array<{
    id: string;
    title: string;
    detail: string;
    value: number;
    severity: "yellow" | "red" | "blue";
    createdAt: string;
  }>;
  controls: Array<{
    id: string;
    title: string;
    detail: string;
    severity: "green" | "yellow" | "red" | "blue";
  }>;
};

const lossMovementTypes = new Set<InventoryAuditMovementType>(["waste", "expired", "supplier_return", "internal_use", "adjust_decrease"]);
const manualRiskMovementTypes = new Set<InventoryAuditMovementType>(["adjust_increase", "adjust_decrease", "rollback"]);

function money(value: number) {
  return Math.round(Math.max(0, Number(value) || 0));
}

function absQuantity(value: number) {
  return Math.abs(Number(value) || 0);
}

function movementValue(movement: InventoryAuditMovementInput) {
  return money(absQuantity(movement.quantityDelta) * Math.max(0, Number(movement.unitCost ?? 0)));
}

function hasReason(movement: InventoryAuditMovementInput) {
  return Boolean(movement.reason?.trim() || movement.sourceType?.trim());
}

function buildTopLossItems(movements: InventoryAuditMovementInput[]) {
  const byIngredient = new Map<string, InventoryAuditReport["topLossItems"][number]>();
  for (const movement of movements.filter((item) => lossMovementTypes.has(item.movementType))) {
    const current =
      byIngredient.get(movement.ingredientName) ?? {
        ingredientName: movement.ingredientName,
        ingredientUnit: movement.ingredientUnit,
        quantity: 0,
        value: 0,
        movementCount: 0
      };
    current.quantity += absQuantity(movement.quantityDelta);
    current.value += movementValue(movement);
    current.movementCount += 1;
    byIngredient.set(movement.ingredientName, current);
  }

  return [...byIngredient.values()]
    .map((item) => ({ ...item, quantity: Math.round(item.quantity * 1000) / 1000, value: money(item.value) }))
    .sort((left, right) => right.value - left.value || right.movementCount - left.movementCount)
    .slice(0, 6);
}

function buildRiskyMovements(movements: InventoryAuditMovementInput[]) {
  return movements
    .map((movement) => {
      const value = movementValue(movement);
      if (lossMovementTypes.has(movement.movementType) && value > 0) {
        return {
          id: movement.id,
          title: `Xuất giảm ${movement.ingredientName}`,
          detail: movement.reason || movement.sourceType || "Cần bổ sung lý do để audit.",
          value,
          severity: value >= 300000 ? "red" : "yellow",
          createdAt: movement.createdAt
        } satisfies InventoryAuditReport["riskyMovements"][number];
      }
      if (manualRiskMovementTypes.has(movement.movementType) && !hasReason(movement)) {
        return {
          id: movement.id,
          title: `Movement cần lý do`,
          detail: `${movement.ingredientName} có điều chỉnh thủ công nhưng thiếu ghi chú audit.`,
          value,
          severity: "blue",
          createdAt: movement.createdAt
        } satisfies InventoryAuditReport["riskyMovements"][number];
      }
      return null;
    })
    .filter((item): item is InventoryAuditReport["riskyMovements"][number] => Boolean(item))
    .sort((left, right) => right.value - left.value)
    .slice(0, 8);
}

function buildControls(input: {
  lossValue: number;
  unreasonedMovementCount: number;
  openControlAlertCount: number;
  countVarianceValue: number;
  rollbackValue: number;
}) {
  const controls: InventoryAuditReport["controls"] = [];
  controls.push({
    id: "loss-control",
    title: input.lossValue > 0 ? "Có giá trị xuất giảm cần theo dõi" : "Không có loss nổi bật",
    detail: input.lossValue > 0 ? `Giá trị loss gần đây khoảng ${input.lossValue.toLocaleString("vi-VN")}đ.` : "Movement gần đây chưa ghi nhận loss đáng kể.",
    severity: input.lossValue >= 500000 ? "red" : input.lossValue > 0 ? "yellow" : "green"
  });
  controls.push({
    id: "reason-control",
    title: input.unreasonedMovementCount > 0 ? "Có movement thiếu lý do" : "Lý do movement ổn",
    detail: input.unreasonedMovementCount > 0 ? `${input.unreasonedMovementCount} movement thủ công cần bổ sung lý do.` : "Các movement rủi ro đều có nguồn hoặc lý do.",
    severity: input.unreasonedMovementCount > 0 ? "yellow" : "green"
  });
  controls.push({
    id: "count-control",
    title: input.countVarianceValue > 0 ? "Có lệch kiểm kê" : "Không có lệch kiểm kê lớn",
    detail: input.countVarianceValue > 0 ? `Giá trị lệch kiểm kê khoảng ${input.countVarianceValue.toLocaleString("vi-VN")}đ.` : "Phiên kiểm kê gần đây chưa tạo chênh lệch đáng kể.",
    severity: input.countVarianceValue >= 500000 ? "red" : input.countVarianceValue > 0 ? "blue" : "green"
  });
  if (input.openControlAlertCount > 0 || input.rollbackValue > 0) {
    controls.push({
      id: "alert-control",
      title: "Cần rà cảnh báo kiểm soát",
      detail: `${input.openControlAlertCount} alert kiểm soát mở, rollback ${input.rollbackValue.toLocaleString("vi-VN")}đ.`,
      severity: input.openControlAlertCount > 0 ? "red" : "blue"
    });
  }
  return controls;
}

export function buildInventoryAuditReport(input: InventoryAuditInput): InventoryAuditReport {
  const lossMovements = input.movements.filter((movement) => lossMovementTypes.has(movement.movementType));
  const manualRiskMovements = input.movements.filter((movement) => manualRiskMovementTypes.has(movement.movementType));
  const lossValue = money(lossMovements.reduce((sum, movement) => sum + movementValue(movement), 0));
  const manualAdjustmentValue = money(manualRiskMovements.reduce((sum, movement) => sum + movementValue(movement), 0));
  const rollbackValue = money(input.movements.filter((movement) => movement.movementType === "rollback").reduce((sum, movement) => sum + movementValue(movement), 0));
  const unreasonedMovementCount = manualRiskMovements.filter((movement) => !hasReason(movement)).length;
  const openControlAlertCount = input.alerts.filter(
    (alert) =>
      (alert.status === "open" || alert.status === "acknowledged") &&
      ["waste_spike", "abnormal_usage", "missing_inventory", "expired"].includes(alert.alertType)
  ).length;
  const countVarianceValue = money(input.countSessions.reduce((sum, session) => sum + Math.abs(session.totalVarianceValue), 0));
  const auditScore = Math.max(
    0,
    Math.min(
      100,
      100 -
        Math.min(30, Math.floor(lossValue / 100000) * 3) -
        unreasonedMovementCount * 8 -
        openControlAlertCount * 7 -
        Math.min(20, Math.floor(countVarianceValue / 100000) * 2) -
        Math.min(10, Math.floor(rollbackValue / 100000) * 2)
    )
  );

  return {
    auditScore,
    lossValue,
    manualAdjustmentValue,
    rollbackValue,
    movementCount: input.movements.length,
    lossMovementCount: lossMovements.length,
    unreasonedMovementCount,
    openControlAlertCount,
    countVarianceValue,
    topLossItems: buildTopLossItems(input.movements),
    riskyMovements: buildRiskyMovements(input.movements),
    controls: buildControls({ lossValue, unreasonedMovementCount, openControlAlertCount, countVarianceValue, rollbackValue })
  };
}
