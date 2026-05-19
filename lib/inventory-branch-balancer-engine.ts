export type InventoryBranchBalancerLocationInput = {
  id: string;
  branchName: string | null;
  name: string;
  locationType: string;
  isPrimary: boolean;
};

export type InventoryBranchBalancerStockInput = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  locationId: string | null;
  branchName: string | null;
  locationName: string | null;
  batchCode: string | null;
  expirationDate: string | null;
  availableQuantity: number;
  reservedQuantity: number;
  incomingQuantity: number;
  minimumQuantity: number;
  referenceUnitCost: number;
  status: "available" | "low" | "out_of_stock" | "expired" | "pending_import";
};

export type InventoryBranchBalancerTransferInput = {
  id: string;
  status: "draft" | "requested" | "approved" | "dispatched" | "received" | "cancelled";
  fromLocationId: string | null;
  toLocationId: string | null;
  lineCount: number;
  totalQuantity: number;
};

export type InventoryBranchBalancerInput = {
  locations: InventoryBranchBalancerLocationInput[];
  stockBalances: InventoryBranchBalancerStockInput[];
  transfers: InventoryBranchBalancerTransferInput[];
  now?: Date;
};

export type InventoryBranchBalancingReport = {
  balanceScore: number;
  locationCount: number;
  branchCount: number;
  centralLocationCount: number;
  shortageValue: number;
  surplusValue: number;
  expiringValue: number;
  openTransferCount: number;
  suggestedTransferCount: number;
  branches: Array<{
    branchName: string;
    locationCount: number;
    stockValue: number;
    shortageValue: number;
    surplusValue: number;
    expiringValue: number;
    shortageLineCount: number;
    surplusLineCount: number;
    expiringLineCount: number;
    openInboundTransferCount: number;
    openOutboundTransferCount: number;
    readinessScore: number;
  }>;
  centralKitchen: {
    ready: boolean;
    locationNames: string[];
    stockValue: number;
    surplusValue: number;
    shortageValue: number;
    suggestedOutboundValue: number;
  };
  transferSuggestions: Array<{
    id: string;
    ingredientId: string;
    ingredientName: string;
    ingredientUnit: string;
    fromLocationId: string | null;
    fromLocationName: string;
    fromBranchName: string;
    toLocationId: string | null;
    toLocationName: string;
    toBranchName: string;
    quantity: number;
    value: number;
    reason: string;
    priority: "urgent" | "soon" | "planned";
    expirationDate: string | null;
  }>;
  risks: Array<{
    id: string;
    title: string;
    detail: string;
    value: number;
    severity: "red" | "yellow" | "blue";
  }>;
};

type StockBucket = {
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  locationId: string | null;
  locationName: string;
  branchName: string;
  isCentral: boolean;
  availableQuantity: number;
  reservedQuantity: number;
  incomingQuantity: number;
  minimumQuantity: number;
  referenceUnitCost: number;
  earliestExpirationDate: string | null;
  expired: boolean;
};

function money(value: number) {
  return Math.round(Math.max(0, Number(value) || 0));
}

function quantity(value: number) {
  return Math.round(Math.max(0, Number(value) || 0) * 1000) / 1000;
}

function daysUntil(value: string | null, now: Date) {
  if (!value) return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const target = new Date(`${value}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - start.getTime()) / 86_400_000);
}

function locationLabel(location?: InventoryBranchBalancerLocationInput | null, fallback?: string | null) {
  if (location?.name) return location.name;
  return fallback || "Kho chính";
}

function branchLabel(location?: InventoryBranchBalancerLocationInput | null, fallback?: string | null) {
  return location?.branchName || fallback || "Toàn quán";
}

function isCentralLocation(location?: InventoryBranchBalancerLocationInput | null) {
  const text = `${location?.name ?? ""} ${location?.locationType ?? ""}`.toLowerCase();
  return /central|trung tâm|tong|tổng|kho tổng|warehouse|bếp trung tâm|kitchen/.test(text);
}

function bucketKey(row: InventoryBranchBalancerStockInput) {
  return `${row.ingredientId}:${row.locationId || row.locationName || row.branchName || "main"}`;
}

function buildBuckets(input: InventoryBranchBalancerInput) {
  const locationById = new Map(input.locations.map((location) => [location.id, location]));
  const buckets = new Map<string, StockBucket>();

  for (const row of input.stockBalances) {
    const location = row.locationId ? locationById.get(row.locationId) : null;
    const key = bucketKey(row);
    const current =
      buckets.get(key) ?? {
        ingredientId: row.ingredientId,
        ingredientName: row.ingredientName,
        ingredientUnit: row.ingredientUnit,
        locationId: row.locationId,
        locationName: locationLabel(location, row.locationName),
        branchName: branchLabel(location, row.branchName),
        isCentral: isCentralLocation(location),
        availableQuantity: 0,
        reservedQuantity: 0,
        incomingQuantity: 0,
        minimumQuantity: 0,
        referenceUnitCost: Math.max(0, row.referenceUnitCost),
        earliestExpirationDate: null,
        expired: false
      };

    current.availableQuantity += Math.max(0, row.availableQuantity);
    current.reservedQuantity += Math.max(0, row.reservedQuantity);
    current.incomingQuantity += Math.max(0, row.incomingQuantity);
    current.minimumQuantity = Math.max(current.minimumQuantity, row.minimumQuantity);
    current.referenceUnitCost = Math.max(current.referenceUnitCost, row.referenceUnitCost);
    current.expired = current.expired || row.status === "expired";
    if (row.expirationDate && (!current.earliestExpirationDate || row.expirationDate < current.earliestExpirationDate)) {
      current.earliestExpirationDate = row.expirationDate;
    }
    buckets.set(key, current);
  }

  return [...buckets.values()];
}

function shortageQuantity(bucket: StockBucket) {
  return quantity(Math.max(0, bucket.minimumQuantity - bucket.availableQuantity - bucket.incomingQuantity));
}

function surplusQuantity(bucket: StockBucket) {
  const buffer = Math.max(bucket.minimumQuantity * 1.35, bucket.minimumQuantity + 0.001);
  if (bucket.minimumQuantity <= 0) return quantity(Math.max(0, bucket.availableQuantity - bucket.reservedQuantity));
  return quantity(Math.max(0, bucket.availableQuantity - bucket.reservedQuantity - buffer));
}

function buildTransferSuggestions(buckets: StockBucket[], now: Date) {
  const shortages = buckets
    .map((bucket) => ({ bucket, shortage: shortageQuantity(bucket) }))
    .filter((item) => item.shortage > 0)
    .sort((left, right) => right.shortage * right.bucket.referenceUnitCost - left.shortage * left.bucket.referenceUnitCost);
  const surplusByIngredient = new Map<string, Array<{ bucket: StockBucket; surplus: number }>>();

  for (const bucket of buckets) {
    if (bucket.expired) continue;
    const surplus = surplusQuantity(bucket);
    if (surplus <= 0) continue;
    const rows = surplusByIngredient.get(bucket.ingredientId) ?? [];
    rows.push({ bucket, surplus });
    surplusByIngredient.set(bucket.ingredientId, rows);
  }

  for (const rows of surplusByIngredient.values()) {
    rows.sort((left, right) => {
      if (left.bucket.isCentral !== right.bucket.isCentral) return left.bucket.isCentral ? -1 : 1;
      const leftDays = daysUntil(left.bucket.earliestExpirationDate, now) ?? 9999;
      const rightDays = daysUntil(right.bucket.earliestExpirationDate, now) ?? 9999;
      return leftDays - rightDays || right.surplus * right.bucket.referenceUnitCost - left.surplus * left.bucket.referenceUnitCost;
    });
  }

  const suggestions: InventoryBranchBalancingReport["transferSuggestions"] = [];
  for (const shortageRow of shortages) {
    let remaining = shortageRow.shortage;
    const sourceRows = surplusByIngredient.get(shortageRow.bucket.ingredientId) ?? [];
    for (const sourceRow of sourceRows) {
      if (remaining <= 0) break;
      if (sourceRow.surplus <= 0) continue;
      if (sourceRow.bucket.locationId && sourceRow.bucket.locationId === shortageRow.bucket.locationId) continue;
      if (sourceRow.bucket.branchName === shortageRow.bucket.branchName && !sourceRow.bucket.isCentral) continue;

      const transferQuantity = quantity(Math.min(remaining, sourceRow.surplus));
      if (transferQuantity <= 0) continue;
      const transferValue = money(transferQuantity * sourceRow.bucket.referenceUnitCost);
      const shortageRatio = shortageRow.bucket.minimumQuantity > 0 ? shortageRow.shortage / shortageRow.bucket.minimumQuantity : 1;
      const expirationDays = daysUntil(sourceRow.bucket.earliestExpirationDate, now);
      const priority =
        shortageRatio >= 0.75 || shortageRow.bucket.availableQuantity <= 0
          ? "urgent"
          : expirationDays !== null && expirationDays <= 3
            ? "soon"
            : "planned";

      suggestions.push({
        id: `${sourceRow.bucket.locationId || sourceRow.bucket.locationName}:${shortageRow.bucket.locationId || shortageRow.bucket.locationName}:${shortageRow.bucket.ingredientId}`,
        ingredientId: shortageRow.bucket.ingredientId,
        ingredientName: shortageRow.bucket.ingredientName,
        ingredientUnit: shortageRow.bucket.ingredientUnit,
        fromLocationId: sourceRow.bucket.locationId,
        fromLocationName: sourceRow.bucket.locationName,
        fromBranchName: sourceRow.bucket.branchName,
        toLocationId: shortageRow.bucket.locationId,
        toLocationName: shortageRow.bucket.locationName,
        toBranchName: shortageRow.bucket.branchName,
        quantity: transferQuantity,
        value: transferValue,
        reason: sourceRow.bucket.isCentral
          ? "Kho trung tâm còn dư so với buffer, nên cấp bù cho điểm bán thiếu."
          : "Điểm bán/kho khác đang dư so với mức tối thiểu, có thể điều chuyển nội bộ.",
        priority,
        expirationDate: sourceRow.bucket.earliestExpirationDate
      });

      remaining = quantity(remaining - transferQuantity);
      sourceRow.surplus = quantity(sourceRow.surplus - transferQuantity);
    }
  }

  return suggestions.sort((left, right) => right.value - left.value).slice(0, 10);
}

export function buildInventoryBranchBalancingReport(input: InventoryBranchBalancerInput): InventoryBranchBalancingReport {
  const now = input.now ?? new Date();
  const buckets = buildBuckets(input);
  const openTransferStatuses = new Set(["draft", "requested", "approved", "dispatched"]);
  const openTransfers = input.transfers.filter((transfer) => openTransferStatuses.has(transfer.status));
  const transferSuggestions = buildTransferSuggestions(buckets, now);
  const branchMap = new Map<string, InventoryBranchBalancingReport["branches"][number]>();
  const locationBranchMap = new Map(input.locations.map((location) => [location.id, branchLabel(location)]));
  const centralLocationNames = input.locations.filter(isCentralLocation).map((location) => location.name);
  let centralStockValue = 0;
  let centralSurplusValue = 0;
  let centralShortageValue = 0;

  for (const bucket of buckets) {
    const shortage = shortageQuantity(bucket);
    const surplus = surplusQuantity(bucket);
    const expiringDays = daysUntil(bucket.earliestExpirationDate, now);
    const expiring = expiringDays !== null && expiringDays <= 7 && bucket.availableQuantity > 0;
    const stockValue = money(bucket.availableQuantity * bucket.referenceUnitCost);
    const shortageValue = money(shortage * bucket.referenceUnitCost);
    const surplusValue = money(surplus * bucket.referenceUnitCost);
    const expiringValue = expiring ? stockValue : 0;
    const branch =
      branchMap.get(bucket.branchName) ?? {
        branchName: bucket.branchName,
        locationCount: 0,
        stockValue: 0,
        shortageValue: 0,
        surplusValue: 0,
        expiringValue: 0,
        shortageLineCount: 0,
        surplusLineCount: 0,
        expiringLineCount: 0,
        openInboundTransferCount: 0,
        openOutboundTransferCount: 0,
        readinessScore: 100
      };

    branch.stockValue += stockValue;
    branch.shortageValue += shortageValue;
    branch.surplusValue += surplusValue;
    branch.expiringValue += expiringValue;
    branch.shortageLineCount += shortage > 0 ? 1 : 0;
    branch.surplusLineCount += surplus > 0 ? 1 : 0;
    branch.expiringLineCount += expiring ? 1 : 0;
    branchMap.set(bucket.branchName, branch);

    if (bucket.isCentral) {
      centralStockValue += stockValue;
      centralSurplusValue += surplusValue;
      centralShortageValue += shortageValue;
    }
  }

  for (const location of input.locations) {
    const branchName = branchLabel(location);
    const branch =
      branchMap.get(branchName) ?? {
        branchName,
        locationCount: 0,
        stockValue: 0,
        shortageValue: 0,
        surplusValue: 0,
        expiringValue: 0,
        shortageLineCount: 0,
        surplusLineCount: 0,
        expiringLineCount: 0,
        openInboundTransferCount: 0,
        openOutboundTransferCount: 0,
        readinessScore: 100
      };
    branch.locationCount += 1;
    branchMap.set(branchName, branch);
  }

  for (const transfer of openTransfers) {
    const fromBranchName = transfer.fromLocationId ? locationBranchMap.get(transfer.fromLocationId) : null;
    const toBranchName = transfer.toLocationId ? locationBranchMap.get(transfer.toLocationId) : null;
    if (fromBranchName && branchMap.has(fromBranchName)) branchMap.get(fromBranchName)!.openOutboundTransferCount += 1;
    if (toBranchName && branchMap.has(toBranchName)) branchMap.get(toBranchName)!.openInboundTransferCount += 1;
  }

  const branches = [...branchMap.values()]
    .map((branch) => ({
      ...branch,
      stockValue: money(branch.stockValue),
      shortageValue: money(branch.shortageValue),
      surplusValue: money(branch.surplusValue),
      expiringValue: money(branch.expiringValue),
      readinessScore: Math.max(
        0,
        Math.min(100, 100 - branch.shortageLineCount * 11 - branch.expiringLineCount * 7 - branch.openInboundTransferCount * 3 - branch.openOutboundTransferCount * 2)
      )
    }))
    .sort((left, right) => left.readinessScore - right.readinessScore || right.shortageValue - left.shortageValue);

  const shortageValue = money(branches.reduce((sum, branch) => sum + branch.shortageValue, 0));
  const surplusValue = money(branches.reduce((sum, branch) => sum + branch.surplusValue, 0));
  const expiringValue = money(branches.reduce((sum, branch) => sum + branch.expiringValue, 0));
  const unresolvedShortageValue = money(Math.max(0, shortageValue - transferSuggestions.reduce((sum, item) => sum + item.value, 0)));
  const balanceScore = Math.max(
    0,
    Math.min(
      100,
      100 -
        Math.min(35, Math.floor(unresolvedShortageValue / 100000) * 4) -
        Math.min(20, Math.floor(expiringValue / 150000) * 3) -
        Math.min(20, openTransfers.length * 4) -
        Math.min(15, branches.filter((branch) => branch.readinessScore < 70).length * 5)
    )
  );

  const risks: InventoryBranchBalancingReport["risks"] = [];
  for (const branch of branches.filter((item) => item.shortageValue > 0).slice(0, 3)) {
    risks.push({
      id: `shortage-${branch.branchName}`,
      title: `${branch.branchName} thiếu hàng`,
      detail: `${branch.shortageLineCount} SKU dưới ngưỡng, cần điều chuyển hoặc mua bù.`,
      value: branch.shortageValue,
      severity: branch.shortageValue >= 300000 ? "red" : "yellow"
    });
  }
  for (const branch of branches.filter((item) => item.expiringValue > 0).slice(0, 2)) {
    risks.push({
      id: `expiry-${branch.branchName}`,
      title: `${branch.branchName} có hàng sắp HSD`,
      detail: `${branch.expiringLineCount} dòng tồn cần đẩy bán hoặc chuyển sang điểm tiêu thụ nhanh.`,
      value: branch.expiringValue,
      severity: "yellow"
    });
  }
  if (centralLocationNames.length === 0 && input.locations.length > 1) {
    risks.push({
      id: "central-missing",
      title: "Chưa nhận diện kho trung tâm",
      detail: "Nên chuẩn hóa location type/tên kho tổng để AI cân bằng chuỗi chính xác hơn.",
      value: 0,
      severity: "blue"
    });
  }

  return {
    balanceScore,
    locationCount: input.locations.length,
    branchCount: branches.length,
    centralLocationCount: centralLocationNames.length,
    shortageValue,
    surplusValue,
    expiringValue,
    openTransferCount: openTransfers.length,
    suggestedTransferCount: transferSuggestions.length,
    branches,
    centralKitchen: {
      ready: centralLocationNames.length > 0,
      locationNames: centralLocationNames,
      stockValue: money(centralStockValue),
      surplusValue: money(centralSurplusValue),
      shortageValue: money(centralShortageValue),
      suggestedOutboundValue: money(transferSuggestions.filter((item) => centralLocationNames.includes(item.fromLocationName)).reduce((sum, item) => sum + item.value, 0))
    },
    transferSuggestions,
    risks: risks.slice(0, 6)
  };
}
