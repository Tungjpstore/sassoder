export type InventoryFefoDemandInput = {
  ingredientId: string;
  quantity: number;
};

export type InventoryFefoStockInput = {
  ingredientId: string;
  batchId: string | null;
  locationId: string | null;
  branchId: string | null;
  availableQuantity: number;
  expirationDate: string | null;
  batchStatus: string | null;
  unitCost: number | null;
  receivedAt?: string | null;
  createdAt?: string | null;
};

export type InventoryFefoAllocation = {
  ingredientId: string;
  batchId: string | null;
  locationId: string | null;
  branchId: string | null;
  quantity: number;
  unitCost: number | null;
  allocationIndex: number;
  expirationDate: string | null;
};

export type InventoryFefoShortage = {
  ingredientId: string;
  requestedQuantity: number;
  availableQuantity: number;
  shortageQuantity: number;
};

export type InventoryFefoAllocationPlan = {
  allocations: InventoryFefoAllocation[];
  shortages: InventoryFefoShortage[];
  requestedQuantity: number;
  allocatedQuantity: number;
};

export type InventoryRollbackMovementInput = {
  ingredientId: string;
  batchId: string | null;
  locationId: string | null;
  branchId: string | null;
  quantityDelta: number;
  unitCost: number | null;
  createdAt?: string | null;
};

const QUANTITY_PRECISION = 1000;

function quantity(value: number) {
  return Math.round(Math.max(0, Number(value) || 0) * QUANTITY_PRECISION) / QUANTITY_PRECISION;
}

function sortableDate(value: string | null | undefined) {
  if (!value) return "9999-12-31T23:59:59.999Z";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "9999-12-31T23:59:59.999Z";
  return new Date(timestamp).toISOString();
}

function isExpired(expirationDate: string | null, now: Date) {
  if (!expirationDate) return false;
  const expiry = Date.parse(`${expirationDate.slice(0, 10)}T23:59:59.999Z`);
  return !Number.isNaN(expiry) && expiry < now.getTime();
}

function isAllocatableStock(row: InventoryFefoStockInput, now: Date) {
  if (quantity(row.availableQuantity) <= 0) return false;
  if (row.batchStatus && row.batchStatus !== "active") return false;
  return !isExpired(row.expirationDate, now);
}

function stockSort(left: InventoryFefoStockInput, right: InventoryFefoStockInput) {
  return (
    sortableDate(left.expirationDate).localeCompare(sortableDate(right.expirationDate)) ||
    sortableDate(left.receivedAt).localeCompare(sortableDate(right.receivedAt)) ||
    sortableDate(left.createdAt).localeCompare(sortableDate(right.createdAt)) ||
    (left.locationId ?? "").localeCompare(right.locationId ?? "") ||
    (left.batchId ?? "").localeCompare(right.batchId ?? "")
  );
}

export function buildInventoryFefoAllocationPlan(input: {
  demands: InventoryFefoDemandInput[];
  stock: InventoryFefoStockInput[];
  now?: Date;
}): InventoryFefoAllocationPlan {
  const now = input.now ?? new Date();
  const stockByIngredient = new Map<string, InventoryFefoStockInput[]>();

  for (const row of input.stock) {
    if (!isAllocatableStock(row, now)) continue;
    const rows = stockByIngredient.get(row.ingredientId) ?? [];
    rows.push(row);
    stockByIngredient.set(row.ingredientId, rows);
  }

  for (const rows of stockByIngredient.values()) {
    rows.sort(stockSort);
  }

  const allocations: InventoryFefoAllocation[] = [];
  const shortages: InventoryFefoShortage[] = [];
  let requestedQuantity = 0;

  for (const demand of input.demands) {
    const requiredQuantity = quantity(demand.quantity);
    if (requiredQuantity <= 0) continue;

    requestedQuantity += requiredQuantity;
    let remainingQuantity = requiredQuantity;
    let availableQuantity = 0;
    let allocationIndex = 0;

    for (const stock of stockByIngredient.get(demand.ingredientId) ?? []) {
      if (remainingQuantity <= 0) break;
      const allocatableQuantity = quantity(Math.min(remainingQuantity, stock.availableQuantity));
      if (allocatableQuantity <= 0) continue;

      allocations.push({
        ingredientId: demand.ingredientId,
        batchId: stock.batchId,
        locationId: stock.locationId,
        branchId: stock.branchId,
        quantity: allocatableQuantity,
        unitCost: stock.unitCost,
        allocationIndex,
        expirationDate: stock.expirationDate
      });
      stock.availableQuantity = quantity(stock.availableQuantity - allocatableQuantity);
      availableQuantity += allocatableQuantity;
      remainingQuantity = quantity(remainingQuantity - allocatableQuantity);
      allocationIndex += 1;
    }

    if (remainingQuantity > 0) {
      shortages.push({
        ingredientId: demand.ingredientId,
        requestedQuantity: requiredQuantity,
        availableQuantity: quantity(availableQuantity),
        shortageQuantity: quantity(remainingQuantity)
      });
    }
  }

  return {
    allocations,
    shortages,
    requestedQuantity: quantity(requestedQuantity),
    allocatedQuantity: quantity(allocations.reduce((total, allocation) => total + allocation.quantity, 0))
  };
}

export function buildInventoryRollbackAllocations(movements: InventoryRollbackMovementInput[]): InventoryFefoAllocation[] {
  return movements
    .map((movement, index) => ({
      ingredientId: movement.ingredientId,
      batchId: movement.batchId,
      locationId: movement.locationId,
      branchId: movement.branchId,
      quantity: quantity(Math.abs(Number(movement.quantityDelta) || 0)),
      unitCost: movement.unitCost,
      allocationIndex: index,
      expirationDate: null
    }))
    .filter((movement) => movement.quantity > 0)
    .sort(
      (left, right) =>
        left.ingredientId.localeCompare(right.ingredientId) ||
        (left.locationId ?? "").localeCompare(right.locationId ?? "") ||
        (left.batchId ?? "").localeCompare(right.batchId ?? "") ||
        left.allocationIndex - right.allocationIndex
    )
    .map((movement, index) => ({ ...movement, allocationIndex: index }));
}
