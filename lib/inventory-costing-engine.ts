export type InventoryCostStatus = "healthy" | "watch" | "high" | "critical";

export type InventoryRecipeCostLineInput = {
  quantityPerItem: number;
  wastePercent: number;
  referenceUnitCost: number;
};

export type InventoryRecipeCostInput = {
  price: number;
  lines: InventoryRecipeCostLineInput[];
};

export type InventoryRecipeCostSummary = {
  totalRecipeCost: number;
  recipeCostPercent: number;
  grossProfit: number;
  grossMarginPercent: number;
  costStatus: InventoryCostStatus;
  marginWarning: string | null;
};

function roundCurrency(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

function roundPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function calculateRecipeLineCost(line: InventoryRecipeCostLineInput) {
  const quantity = Math.max(0, Number(line.quantityPerItem) || 0);
  const wastePercent = Math.max(0, Number(line.wastePercent) || 0);
  const unitCost = Math.max(0, Number(line.referenceUnitCost) || 0);
  return quantity * (1 + wastePercent / 100) * unitCost;
}

function classifyCostStatus(recipeCostPercent: number): InventoryCostStatus {
  if (recipeCostPercent >= 65) return "critical";
  if (recipeCostPercent >= 50) return "high";
  if (recipeCostPercent >= 38) return "watch";
  return "healthy";
}

function buildMarginWarning(status: InventoryCostStatus, recipeCostPercent: number) {
  if (status === "critical") return `Food cost ${roundPercent(recipeCostPercent)}% đang rất cao, cần tăng giá bán hoặc đổi định lượng/NCC.`;
  if (status === "high") return `Food cost ${roundPercent(recipeCostPercent)}% cao hơn ngưỡng an toàn, nên rà lại recipe và giá nhập.`;
  if (status === "watch") return `Food cost ${roundPercent(recipeCostPercent)}% cần theo dõi khi giá nguyên liệu biến động.`;
  return null;
}

export function calculateRecipeCost(input: InventoryRecipeCostInput): InventoryRecipeCostSummary {
  const price = Math.max(0, Number(input.price) || 0);
  const totalRecipeCostRaw = input.lines.reduce((sum, line) => sum + calculateRecipeLineCost(line), 0);
  const totalRecipeCost = roundCurrency(totalRecipeCostRaw);
  const recipeCostPercent = price > 0 ? roundPercent((totalRecipeCostRaw / price) * 100) : 0;
  const grossProfit = roundCurrency(price - totalRecipeCostRaw);
  const grossMarginPercent = price > 0 ? roundPercent(((price - totalRecipeCostRaw) / price) * 100) : 0;
  const costStatus = classifyCostStatus(recipeCostPercent);

  return {
    totalRecipeCost,
    recipeCostPercent,
    grossProfit,
    grossMarginPercent,
    costStatus,
    marginWarning: price > 0 ? buildMarginWarning(costStatus, recipeCostPercent) : "Chưa có giá bán để tính margin."
  };
}
