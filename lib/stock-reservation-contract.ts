export type StockReservationDemand = {
  ingredientId: string;
  quantity: number;
};

export type StockReservationStock = {
  ingredientId: string;
  branchId: string | null;
  locationId: string | null;
  batchId: string | null;
  availableQuantity: number;
  expirationDate?: string | null;
  receivedAt?: string | null;
  createdAt?: string | null;
  status?: string | null;
};

export type StockReservationAllocation = {
  ingredientId: string;
  branchId: string | null;
  locationId: string | null;
  batchId: string | null;
  quantity: number;
  allocationIndex: number;
  expirationDate: string | null;
};

export type StockReservationShortage = {
  ingredientId: string;
  requestedQuantity: number;
  availableQuantity: number;
  shortageQuantity: number;
};

export type StockReservationPlan = {
  allocations: StockReservationAllocation[];
  shortages: StockReservationShortage[];
  requestedQuantity: number;
  allocatedQuantity: number;
};

const PRECISION = 1000;

function roundQuantity(value: number) {
  return Math.round(Math.max(0, Number(value) || 0) * PRECISION) / PRECISION;
}

function sortableDate(value: string | null | undefined) {
  if (!value) return "9999-12-31T23:59:59.999Z";
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? "9999-12-31T23:59:59.999Z" : new Date(timestamp).toISOString();
}

function isExpired(expirationDate: string | null | undefined, now: Date) {
  if (!expirationDate) return false;
  const timestamp = Date.parse(`${expirationDate.slice(0, 10)}T23:59:59.999Z`);
  return !Number.isNaN(timestamp) && timestamp < now.getTime();
}

function isAllocatable(row: StockReservationStock, branchId: string | null, now: Date) {
  if (row.branchId !== branchId) return false;
  if (row.status && row.status !== "active") return false;
  if (roundQuantity(row.availableQuantity) <= 0) return false;
  return !isExpired(row.expirationDate, now);
}

export function buildStockReservationPlan(input: {
  branchId: string | null;
  demands: StockReservationDemand[];
  stock: StockReservationStock[];
  now?: Date;
}): StockReservationPlan {
  const now = input.now ?? new Date();
  const stockByIngredient = new Map<string, StockReservationStock[]>();

  for (const row of input.stock) {
    if (!isAllocatable(row, input.branchId, now)) continue;
    const bucket = stockByIngredient.get(row.ingredientId) ?? [];
    bucket.push({ ...row, availableQuantity: roundQuantity(row.availableQuantity) });
    stockByIngredient.set(row.ingredientId, bucket);
  }

  for (const bucket of stockByIngredient.values()) {
    bucket.sort(
      (left, right) =>
        sortableDate(left.expirationDate).localeCompare(sortableDate(right.expirationDate)) ||
        sortableDate(left.receivedAt).localeCompare(sortableDate(right.receivedAt)) ||
        sortableDate(left.createdAt).localeCompare(sortableDate(right.createdAt)) ||
        (left.locationId ?? "").localeCompare(right.locationId ?? "") ||
        (left.batchId ?? "").localeCompare(right.batchId ?? "")
    );
  }

  const allocations: StockReservationAllocation[] = [];
  const shortages: StockReservationShortage[] = [];
  let requestedQuantity = 0;

  for (const demand of input.demands) {
    const requested = roundQuantity(demand.quantity);
    if (requested <= 0) continue;
    requestedQuantity += requested;
    let remaining = requested;
    let available = 0;
    let allocationIndex = 0;

    for (const stock of stockByIngredient.get(demand.ingredientId) ?? []) {
      if (remaining <= 0) break;
      const quantity = roundQuantity(Math.min(remaining, stock.availableQuantity));
      if (quantity <= 0) continue;
      allocations.push({
        ingredientId: demand.ingredientId,
        branchId: stock.branchId,
        locationId: stock.locationId,
        batchId: stock.batchId,
        quantity,
        allocationIndex,
        expirationDate: stock.expirationDate ?? null
      });
      stock.availableQuantity = roundQuantity(stock.availableQuantity - quantity);
      remaining = roundQuantity(remaining - quantity);
      available += quantity;
      allocationIndex += 1;
    }

    if (remaining > 0) {
      shortages.push({
        ingredientId: demand.ingredientId,
        requestedQuantity: requested,
        availableQuantity: roundQuantity(available),
        shortageQuantity: roundQuantity(remaining)
      });
    }
  }

  return {
    allocations,
    shortages,
    requestedQuantity: roundQuantity(requestedQuantity),
    allocatedQuantity: roundQuantity(allocations.reduce((total, row) => total + row.quantity, 0))
  };
}
