export type BranchPerformanceBranch = {
  id: string;
  name: string;
  isPrimary?: boolean | null;
  isActive?: boolean | null;
};

export type BranchPerformanceOrder = {
  id: string;
  branchId?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  total?: number | string | null;
  createdAt?: string | null;
  acceptedAt?: string | null;
  servedAt?: string | null;
  serviceDueAt?: string | null;
};

export type BranchPerformanceStockMetric = {
  branchId: string;
  stockBalanceCount: number;
  lowStockCount: number;
  outOfStockCount: number;
};

export type BranchPerformanceStaffMetric = {
  branchId: string;
  assignedStaff: number;
  activeStaff: number;
  lateCount: number;
  pendingApprovals: number;
  coverageScore: number | null;
};

export type BranchPerformanceComparisonRow = {
  branchId: string;
  branchName: string;
  isPrimary: boolean;
  isActive: boolean;
  orderCount: number;
  paidRevenue: number;
  averageServiceMinutes: number | null;
  overdueOrderCount: number;
  stockBalanceCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  assignedStaff: number;
  activeStaff: number;
  coverageScore: number | null;
  performanceScore: number;
  riskLevel: "strong" | "watch" | "risk";
  action: string;
};

export type BranchPerformanceComparisonReport = {
  schemaReady: boolean;
  generatedAt: string;
  windowDays: number;
  branchCount: number;
  orderCount: number;
  paidRevenue: number;
  averageServiceMinutes: number | null;
  lowStockCount: number;
  outOfStockCount: number;
  weakBranchCount: number;
  strongestBranch: BranchPerformanceComparisonRow | null;
  weakestBranch: BranchPerformanceComparisonRow | null;
  rows: BranchPerformanceComparisonRow[];
  dataWarnings: string[];
};

function asNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function minutesBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) return null;
  return Math.round((endTime - startTime) / 60000);
}

function isPaid(order: BranchPerformanceOrder) {
  return order.status === "paid" || order.paymentStatus === "paid";
}

function isActiveOrder(order: BranchPerformanceOrder) {
  return ["pending", "ordering", "preparing", "waiting_payment", "waiting_confirm"].includes(order.status ?? "");
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function scoreRow(input: {
  row: Omit<BranchPerformanceComparisonRow, "performanceScore" | "riskLevel" | "action">;
  maxRevenue: number;
  maxOrders: number;
}) {
  const revenueScore = input.maxRevenue > 0 ? (input.row.paidRevenue / input.maxRevenue) * 35 : 0;
  const orderScore = input.maxOrders > 0 ? (input.row.orderCount / input.maxOrders) * 18 : 0;
  const servicePenalty = input.row.averageServiceMinutes !== null ? Math.max(0, input.row.averageServiceMinutes - 25) * 0.4 : 0;
  const stockPenalty = input.row.outOfStockCount * 8 + input.row.lowStockCount * 3;
  const overduePenalty = input.row.overdueOrderCount * 6;
  const staffScore = input.row.coverageScore !== null ? Math.min(15, input.row.coverageScore * 0.15) : input.row.assignedStaff > 0 ? 6 : 0;
  return clampScore(32 + revenueScore + orderScore + staffScore - servicePenalty - stockPenalty - overduePenalty);
}

function actionForRow(row: Omit<BranchPerformanceComparisonRow, "performanceScore" | "riskLevel" | "action">) {
  if (row.outOfStockCount > 0 || row.lowStockCount >= 3) return "Ưu tiên chuyển kho hoặc nhập bổ sung cho chi nhánh này.";
  if (row.coverageScore !== null && row.coverageScore < 60) return "Cân lại ca trực hoặc xử lý yêu cầu nhân sự đang chờ.";
  if (row.overdueOrderCount > 0 || (row.averageServiceMinutes !== null && row.averageServiceMinutes > 35)) {
    return "Rà quy trình nhận đơn, bếp và phục vụ để giảm thời gian chờ.";
  }
  if (row.orderCount === 0) return "Theo dõi thêm hoặc kiểm tra trạng thái nhận đơn của chi nhánh.";
  return "Chi nhánh đang vận hành ổn, có thể dùng làm benchmark cho điểm bán khác.";
}

export function buildBranchPerformanceComparisonReport(input: {
  branches: BranchPerformanceBranch[];
  orders: BranchPerformanceOrder[];
  stockMetrics?: BranchPerformanceStockMetric[];
  staffMetrics?: BranchPerformanceStaffMetric[];
  windowDays?: number;
  generatedAt?: Date;
  schemaReady?: boolean;
  dataWarnings?: string[];
}): BranchPerformanceComparisonReport {
  const generatedAt = input.generatedAt ?? new Date();
  const stockByBranch = new Map((input.stockMetrics ?? []).map((metric) => [metric.branchId, metric]));
  const staffByBranch = new Map((input.staffMetrics ?? []).map((metric) => [metric.branchId, metric]));
  const ordersByBranch = new Map<string, BranchPerformanceOrder[]>();

  for (const order of input.orders) {
    const branchId = order.branchId?.trim();
    if (!branchId) continue;
    const list = ordersByBranch.get(branchId) ?? [];
    list.push(order);
    ordersByBranch.set(branchId, list);
  }

  const baseRows = input.branches.map((branch) => {
    const branchOrders = ordersByBranch.get(branch.id) ?? [];
    const paidRevenue = branchOrders.filter(isPaid).reduce((sum, order) => sum + asNumber(order.total), 0);
    const serviceMinutes = branchOrders
      .map((order) => minutesBetween(order.createdAt, order.servedAt ?? order.acceptedAt))
      .filter((value): value is number => value !== null);
    const overdueOrderCount = branchOrders.filter((order) => {
      if (!isActiveOrder(order) || !order.serviceDueAt) return false;
      const dueTime = new Date(order.serviceDueAt).getTime();
      return Number.isFinite(dueTime) && dueTime < generatedAt.getTime();
    }).length;
    const stock = stockByBranch.get(branch.id);
    const staff = staffByBranch.get(branch.id);

    return {
      branchId: branch.id,
      branchName: branch.name,
      isPrimary: Boolean(branch.isPrimary),
      isActive: branch.isActive !== false,
      orderCount: branchOrders.length,
      paidRevenue: Math.round(paidRevenue),
      averageServiceMinutes: average(serviceMinutes),
      overdueOrderCount,
      stockBalanceCount: stock?.stockBalanceCount ?? 0,
      lowStockCount: stock?.lowStockCount ?? 0,
      outOfStockCount: stock?.outOfStockCount ?? 0,
      assignedStaff: staff?.assignedStaff ?? 0,
      activeStaff: staff?.activeStaff ?? 0,
      coverageScore: staff?.coverageScore ?? null
    };
  });

  const maxRevenue = Math.max(0, ...baseRows.map((row) => row.paidRevenue));
  const maxOrders = Math.max(0, ...baseRows.map((row) => row.orderCount));
  const rows = baseRows
    .map((row): BranchPerformanceComparisonRow => {
      const performanceScore = scoreRow({ row, maxRevenue, maxOrders });
      return {
        ...row,
        performanceScore,
        riskLevel: performanceScore < 60 ? "risk" : performanceScore < 76 ? "watch" : "strong",
        action: actionForRow(row)
      };
    })
    .sort((left, right) => right.performanceScore - left.performanceScore || right.paidRevenue - left.paidRevenue);

  const serviceAverages = rows
    .map((row) => row.averageServiceMinutes)
    .filter((value): value is number => value !== null);

  return {
    schemaReady: input.schemaReady ?? true,
    generatedAt: generatedAt.toISOString(),
    windowDays: input.windowDays ?? 7,
    branchCount: rows.length,
    orderCount: input.orders.length,
    paidRevenue: rows.reduce((sum, row) => sum + row.paidRevenue, 0),
    averageServiceMinutes: average(serviceAverages),
    lowStockCount: rows.reduce((sum, row) => sum + row.lowStockCount, 0),
    outOfStockCount: rows.reduce((sum, row) => sum + row.outOfStockCount, 0),
    weakBranchCount: rows.filter((row) => row.riskLevel !== "strong").length,
    strongestBranch: rows[0] ?? null,
    weakestBranch: rows.length ? [...rows].sort((left, right) => left.performanceScore - right.performanceScore)[0] ?? null : null,
    rows,
    dataWarnings: input.dataWarnings ?? []
  };
}
