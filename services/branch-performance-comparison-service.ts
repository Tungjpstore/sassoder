import "server-only";

import {
  buildBranchPerformanceComparisonReport,
  type BranchPerformanceBranch,
  type BranchPerformanceComparisonReport,
  type BranchPerformanceOrder,
  type BranchPerformanceStaffMetric,
  type BranchPerformanceStockMetric
} from "@/lib/ai/branch-performance-comparison";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type BranchRow = {
  id: string;
  name: string;
  is_primary: boolean | null;
  is_active: boolean | null;
};

type OrderRow = {
  id: string;
  branch_id: string | null;
  status: string | null;
  payment_status: string | null;
  total: number | string | null;
  created_at: string | null;
  accepted_at: string | null;
  served_at: string | null;
  service_due_at: string | null;
};

type StockBalanceRow = {
  branch_id: string | null;
  on_hand_quantity: number | string | null;
  reserved_quantity: number | string | null;
  ingredient: { minimum_quantity?: number | string | null } | { minimum_quantity?: number | string | null }[] | null;
};

type StaffBranchAssignmentRow = {
  branch_id: string | null;
  staff_member_id: string | null;
  ended_at: string | null;
};

type StaffSessionRow = {
  branch_id: string | null;
  staff_member_id: string | null;
};

type AttendanceLogRow = {
  branch_id: string | null;
  late_minutes: number | string | null;
  attendance_state: string | null;
};

type AttendanceApprovalRow = {
  branch_id: string | null;
  status: string | null;
};

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isMissingBranchPerformanceSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    /branch_id|store_branches|stock_balances|staff_|attendance_|Could not find|does not exist/i.test(error.message ?? "")
  );
}

async function safeRows<T>(
  label: string,
  promise: PromiseLike<{ data: T[] | null; error: any }>,
  warnings: string[]
): Promise<T[]> {
  const { data, error } = await promise;
  if (!error) return data ?? [];
  if (isMissingBranchPerformanceSchema(error)) {
    warnings.push(label);
    return [];
  }
  throw error;
}

function coverageScore(input: { assignedStaff: number; activeStaff: number; lateCount: number; pendingApprovals: number }) {
  if (input.assignedStaff <= 0) return null;
  return Math.max(
    0,
    Math.min(100, input.assignedStaff * 15 + input.activeStaff * 10 - input.lateCount * 8 - input.pendingApprovals * 6)
  );
}

function stockMetrics(rows: StockBalanceRow[]): BranchPerformanceStockMetric[] {
  const byBranch = new Map<string, BranchPerformanceStockMetric>();
  for (const row of rows) {
    if (!row.branch_id) continue;
    const metric = byBranch.get(row.branch_id) ?? {
      branchId: row.branch_id,
      stockBalanceCount: 0,
      lowStockCount: 0,
      outOfStockCount: 0
    };
    const ingredient = firstOrNull(row.ingredient);
    const minimumQuantity = numberValue(ingredient?.minimum_quantity);
    const availableQuantity = Math.max(0, numberValue(row.on_hand_quantity) - numberValue(row.reserved_quantity));
    metric.stockBalanceCount += 1;
    if (minimumQuantity > 0 && availableQuantity < minimumQuantity) metric.lowStockCount += 1;
    if (minimumQuantity > 0 && availableQuantity <= 0) metric.outOfStockCount += 1;
    byBranch.set(row.branch_id, metric);
  }
  return [...byBranch.values()];
}

function staffMetrics(input: {
  assignments: StaffBranchAssignmentRow[];
  sessions: StaffSessionRow[];
  attendance: AttendanceLogRow[];
  approvals: AttendanceApprovalRow[];
}): BranchPerformanceStaffMetric[] {
  const branchIds = new Set<string>();
  for (const row of [...input.assignments, ...input.sessions, ...input.attendance, ...input.approvals]) {
    if (row.branch_id) branchIds.add(row.branch_id);
  }

  return [...branchIds].map((branchId) => {
    const assignedMemberIds = new Set(
      input.assignments
        .filter((row) => row.branch_id === branchId && !row.ended_at && row.staff_member_id)
        .map((row) => row.staff_member_id as string)
    );
    const activeMemberIds = new Set(
      input.sessions.filter((row) => row.branch_id === branchId && row.staff_member_id).map((row) => row.staff_member_id as string)
    );
    const lateCount = input.attendance.filter(
      (row) => row.branch_id === branchId && (numberValue(row.late_minutes) > 0 || row.attendance_state === "late")
    ).length;
    const pendingApprovals = input.approvals.filter((row) => row.branch_id === branchId && row.status === "pending").length;

    return {
      branchId,
      assignedStaff: assignedMemberIds.size,
      activeStaff: activeMemberIds.size,
      lateCount,
      pendingApprovals,
      coverageScore: coverageScore({
        assignedStaff: assignedMemberIds.size,
        activeStaff: activeMemberIds.size,
        lateCount,
        pendingApprovals
      })
    };
  });
}

function emptyReport(windowDays: number, warnings: string[] = []): BranchPerformanceComparisonReport {
  return buildBranchPerformanceComparisonReport({
    branches: [],
    orders: [],
    windowDays,
    schemaReady: false,
    dataWarnings: warnings
  });
}

export async function getBranchPerformanceComparisonReport(
  restaurantId: string,
  input: { windowDays?: number; limit?: number; now?: Date } = {}
): Promise<BranchPerformanceComparisonReport> {
  const now = input.now ?? new Date();
  const windowDays = Math.max(1, Math.min(30, Math.floor(input.windowDays ?? 7)));
  const limit = Math.max(100, Math.min(5000, Math.floor(input.limit ?? 3000)));
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const activeSessionCutoff = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const warnings: string[] = [];
  const supabase = createAdminSupabaseClient() as any;

  const branchesResult = await supabase
    .from("store_branches")
    .select("id,name,is_primary,is_active")
    .eq("restaurant_id", restaurantId)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true })
    .limit(100);

  if (branchesResult.error) {
    if (isMissingBranchPerformanceSchema(branchesResult.error)) return emptyReport(windowDays, ["store_branches"]);
    throw branchesResult.error;
  }

  const [orders, stockRows, assignments, sessions, attendance, approvals] = await Promise.all([
    safeRows<OrderRow>(
      "orders",
      supabase
        .from("orders")
        .select("id,branch_id,status,payment_status,total,created_at,accepted_at,served_at,service_due_at")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(limit),
      warnings
    ),
    safeRows<StockBalanceRow>(
      "stock_balances",
      supabase
        .from("stock_balances")
        .select("branch_id,on_hand_quantity,reserved_quantity,ingredient:ingredients(minimum_quantity)")
        .eq("restaurant_id", restaurantId)
        .not("branch_id", "is", null)
        .limit(2000),
      warnings
    ),
    safeRows<StaffBranchAssignmentRow>(
      "staff_branch_assignments",
      supabase
        .from("staff_branch_assignments")
        .select("branch_id,staff_member_id,ended_at")
        .eq("restaurant_id", restaurantId)
        .eq("assignment_status", "active")
        .limit(1000),
      warnings
    ),
    safeRows<StaffSessionRow>(
      "staff_sessions",
      supabase
        .from("staff_sessions")
        .select("branch_id,staff_member_id")
        .eq("restaurant_id", restaurantId)
        .gte("last_seen_at", activeSessionCutoff)
        .is("forced_logout_at", null)
        .limit(1000),
      warnings
    ),
    safeRows<AttendanceLogRow>(
      "attendance_logs",
      supabase
        .from("attendance_logs")
        .select("branch_id,late_minutes,attendance_state")
        .eq("restaurant_id", restaurantId)
        .gte("clock_in_at", todayStart.toISOString())
        .limit(1000),
      warnings
    ),
    safeRows<AttendanceApprovalRow>(
      "attendance_approval_requests",
      supabase
        .from("attendance_approval_requests")
        .select("branch_id,status")
        .eq("restaurant_id", restaurantId)
        .eq("status", "pending")
        .limit(1000),
      warnings
    )
  ]);

  const branches: BranchPerformanceBranch[] = ((branchesResult.data ?? []) as BranchRow[]).map((branch) => ({
    id: branch.id,
    name: branch.name,
    isPrimary: branch.is_primary,
    isActive: branch.is_active
  }));
  const orderRows: BranchPerformanceOrder[] = orders.map((order) => ({
    id: order.id,
    branchId: order.branch_id,
    status: order.status,
    paymentStatus: order.payment_status,
    total: order.total,
    createdAt: order.created_at,
    acceptedAt: order.accepted_at,
    servedAt: order.served_at,
    serviceDueAt: order.service_due_at
  }));

  return buildBranchPerformanceComparisonReport({
    branches,
    orders: orderRows,
    stockMetrics: stockMetrics(stockRows),
    staffMetrics: staffMetrics({ assignments, sessions, attendance, approvals }),
    windowDays,
    generatedAt: now,
    dataWarnings: warnings
  });
}
