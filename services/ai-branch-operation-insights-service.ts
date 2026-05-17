import "server-only";

import { buildBranchOperationInsights, type AiBranchOperationSnapshot } from "@/lib/ai/branch-operation-insights";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { persistAiOperationInsightsDeck } from "@/services/ai-operation-insights-service";
import { writeOperationalEvent } from "@/services/operational-observability-service";

type StoreBranchRow = {
  id: string;
  name: string;
  address: string | null;
  is_primary: boolean | null;
  is_active: boolean | null;
  metadata: unknown;
};

type BranchOrderRow = {
  id: string;
  branch_id?: string | null;
  branch_assignment_source?: string | null;
  status: string;
  total: number | null;
  payment_status: string | null;
  fulfillment_type: string | null;
  delivery_distance_km: number | string | null;
  delivery_quote_snapshot: unknown;
  created_at: string;
};

type StockBalanceRow = {
  branch_id: string | null;
  on_hand_quantity: number | string | null;
  reserved_quantity: number | string | null;
  ingredient: { name?: string | null; minimum_quantity?: number | string | null } | { name?: string | null; minimum_quantity?: number | string | null }[] | null;
};

type InventoryAlertRow = {
  branch_id: string | null;
  alert_type: string | null;
  severity: string | null;
  status: string | null;
};

type StaffBranchAssignmentRow = {
  branch_id: string | null;
  staff_member_id: string | null;
  assignment_status: string | null;
  ended_at: string | null;
};

type StaffSessionRow = {
  branch_id: string | null;
  staff_member_id: string | null;
  forced_logout_at: string | null;
  last_seen_at: string | null;
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

type GenerateBranchInsightsInput = {
  restaurantId: string;
  maxBranches?: number;
  now?: Date;
};

export type AiBranchOperationInsightsResult = {
  schemaReady: boolean;
  scanned: number;
  generated: number;
  persisted: number;
  skipped: number;
  failed: number;
  schemaMissing: number;
  primaryInsights: Array<{
    branchId: string;
    branchName: string;
    healthScore: number;
    summary: string;
    primaryInsightId: string | null;
  }>;
};

function isMissingBranchSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.message?.includes("Could not find") ||
    error.message?.includes("does not exist")
  );
}

function normalizeLimit(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return 8;
  return Math.max(1, Math.min(24, Math.floor(value)));
}

function firstOrNull<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(number) ? number : 0;
}

function metadataBoolean(metadata: unknown, key: string) {
  const value = asRecord(metadata)[key];
  return typeof value === "boolean" ? value : undefined;
}

function resolveOrderBranchId(order: BranchOrderRow, branchIds: Set<string>, onlyBranchId: string | null) {
  if (order.branch_id && branchIds.has(order.branch_id)) return order.branch_id;
  if (onlyBranchId) return onlyBranchId;

  const snapshot = asRecord(order.delivery_quote_snapshot);
  const nearestStore = asRecord(snapshot.nearestStore);
  const nearestStoreId = typeof nearestStore.id === "string" ? nearestStore.id : "";
  return branchIds.has(nearestStoreId) ? nearestStoreId : null;
}

function deliveryDistance(order: BranchOrderRow) {
  const direct = numberValue(order.delivery_distance_km);
  if (direct > 0) return direct;

  const snapshotDistance = numberValue(asRecord(order.delivery_quote_snapshot).distanceKm);
  return snapshotDistance > 0 ? snapshotDistance : 0;
}

async function safeRows<T>(
  label: string,
  promise: PromiseLike<{ data: T[] | null; error: any }>,
  warnings: string[]
): Promise<T[]> {
  const { data, error } = await promise;
  if (!error) return data ?? [];
  if (isMissingBranchSchema(error)) {
    warnings.push(label);
    return [];
  }
  throw error;
}

async function readRecentOrderRows(supabase: any, restaurantId: string, since24h: string, warnings: string[]) {
  const result = await supabase
    .from("orders")
    .select("id,branch_id,branch_assignment_source,status,total,payment_status,fulfillment_type,delivery_distance_km,delivery_quote_snapshot,created_at")
    .eq("restaurant_id", restaurantId)
    .gte("created_at", since24h)
    .order("created_at", { ascending: false })
    .limit(500);

  if (!result.error) return (result.data ?? []) as BranchOrderRow[];
  if (!isMissingBranchSchema(result.error)) throw result.error;

  warnings.push("orders.branch_id");
  const fallback = await supabase
    .from("orders")
    .select("id,status,total,payment_status,fulfillment_type,delivery_distance_km,delivery_quote_snapshot,created_at")
    .eq("restaurant_id", restaurantId)
    .gte("created_at", since24h)
    .order("created_at", { ascending: false })
    .limit(500);

  if (fallback.error) {
    if (isMissingBranchSchema(fallback.error)) {
      warnings.push("orders");
      return [];
    }
    throw fallback.error;
  }

  return (fallback.data ?? []) as BranchOrderRow[];
}

function stockMetrics(rows: StockBalanceRow[]) {
  return rows.reduce(
    (metrics, row) => {
      const ingredient = firstOrNull(row.ingredient);
      const minimumQuantity = numberValue(ingredient?.minimum_quantity);
      const availableQuantity = Math.max(0, numberValue(row.on_hand_quantity) - numberValue(row.reserved_quantity));

      metrics.stockBalanceCount += 1;
      if (minimumQuantity > 0 && availableQuantity < minimumQuantity) metrics.lowStockCount += 1;
      if (minimumQuantity > 0 && availableQuantity <= 0) metrics.outOfStockCount += 1;
      return metrics;
    },
    { stockBalanceCount: 0, lowStockCount: 0, outOfStockCount: 0 }
  );
}

function coverageScore(input: {
  assignedStaff: number;
  activeStaff: number;
  lateCount: number;
  pendingApprovals: number;
}) {
  if (input.assignedStaff <= 0) return null;
  return Math.max(
    0,
    Math.min(100, input.assignedStaff * 15 + input.activeStaff * 10 - input.lateCount * 8 - input.pendingApprovals * 6)
  );
}

export async function generateAiBranchOperationInsightsForRestaurant(
  input: GenerateBranchInsightsInput
): Promise<AiBranchOperationInsightsResult> {
  const startedAt = Date.now();
  const now = input.now ?? new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const activeSessionCutoff = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const supabase = createAdminSupabaseClient() as any;
  const branchLimit = normalizeLimit(input.maxBranches);
  const warnings: string[] = [];
  const result: AiBranchOperationInsightsResult = {
    schemaReady: true,
    scanned: 0,
    generated: 0,
    persisted: 0,
    skipped: 0,
    failed: 0,
    schemaMissing: 0,
    primaryInsights: []
  };

  const branchesResult = await supabase
    .from("store_branches")
    .select("id,name,address,is_primary,is_active,metadata")
    .eq("restaurant_id", input.restaurantId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true })
    .limit(branchLimit);

  if (branchesResult.error) {
    if (isMissingBranchSchema(branchesResult.error)) {
      return { ...result, schemaReady: false, schemaMissing: 1 };
    }
    throw branchesResult.error;
  }

  const branches = (branchesResult.data ?? []) as StoreBranchRow[];
  result.scanned = branches.length;
  if (branches.length === 0) return result;

  const branchIds = new Set(branches.map((branch) => branch.id));
  const onlyBranchId = branches.length === 1 ? branches[0]?.id ?? null : null;

  const [orderRows, stockRows, alertRows, assignmentRows, sessionRows, attendanceRows, approvalRows] = await Promise.all([
    readRecentOrderRows(supabase, input.restaurantId, since24h, warnings),
    safeRows<StockBalanceRow>(
      "stock_balances",
      supabase
        .from("stock_balances")
        .select("branch_id,on_hand_quantity,reserved_quantity,ingredient:ingredients(name,minimum_quantity)")
        .eq("restaurant_id", input.restaurantId)
        .not("branch_id", "is", null)
        .limit(1000),
      warnings
    ),
    safeRows<InventoryAlertRow>(
      "inventory_alerts",
      supabase
        .from("inventory_alerts")
        .select("branch_id,alert_type,severity,status")
        .eq("restaurant_id", input.restaurantId)
        .in("status", ["open", "acknowledged"])
        .limit(500),
      warnings
    ),
    safeRows<StaffBranchAssignmentRow>(
      "staff_branch_assignments",
      supabase
        .from("staff_branch_assignments")
        .select("branch_id,staff_member_id,assignment_status,ended_at")
        .eq("restaurant_id", input.restaurantId)
        .eq("assignment_status", "active")
        .limit(1000),
      warnings
    ),
    safeRows<StaffSessionRow>(
      "staff_sessions",
      supabase
        .from("staff_sessions")
        .select("branch_id,staff_member_id,forced_logout_at,last_seen_at")
        .eq("restaurant_id", input.restaurantId)
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
        .eq("restaurant_id", input.restaurantId)
        .gte("clock_in_at", todayStart.toISOString())
        .limit(1000),
      warnings
    ),
    safeRows<AttendanceApprovalRow>(
      "attendance_approval_requests",
      supabase
        .from("attendance_approval_requests")
        .select("branch_id,status")
        .eq("restaurant_id", input.restaurantId)
        .eq("status", "pending")
        .limit(1000),
      warnings
    )
  ]);

  if (warnings.length > 0) {
    result.schemaMissing += 1;
  }

  const ordersByBranch = new Map<string, BranchOrderRow[]>();
  for (const order of orderRows) {
    const branchId = resolveOrderBranchId(order, branchIds, onlyBranchId);
    if (!branchId) continue;
    const list = ordersByBranch.get(branchId) ?? [];
    list.push(order);
    ordersByBranch.set(branchId, list);
  }

  for (const branch of branches) {
    try {
      const branchOrders = ordersByBranch.get(branch.id) ?? [];
      const deliveryDistances = branchOrders
        .filter((order) => order.fulfillment_type === "DELIVERY")
        .map(deliveryDistance)
        .filter((distance) => distance > 0);
      const branchStock = stockRows.filter((row) => row.branch_id === branch.id);
      const stock = stockMetrics(branchStock);
      const assignedMemberIds = new Set(
        assignmentRows
          .filter((row) => row.branch_id === branch.id && !row.ended_at && row.staff_member_id)
          .map((row) => row.staff_member_id as string)
      );
      const activeMemberIds = new Set(
        sessionRows
          .filter((row) => row.branch_id === branch.id && row.staff_member_id)
          .map((row) => row.staff_member_id as string)
      );
      const lateCount = attendanceRows.filter(
        (row) => row.branch_id === branch.id && (numberValue(row.late_minutes) > 0 || row.attendance_state === "late")
      ).length;
      const pendingApprovals = approvalRows.filter((row) => row.branch_id === branch.id && row.status === "pending").length;
      const branchAlerts = alertRows.filter((row) => row.branch_id === branch.id);
      const snapshot: AiBranchOperationSnapshot = {
        branchId: branch.id,
        branchName: branch.name,
        isPrimary: Boolean(branch.is_primary),
        isActive: branch.is_active !== false,
        acceptingDelivery: metadataBoolean(branch.metadata, "acceptingDelivery"),
        deliveryPaused: metadataBoolean(branch.metadata, "deliveryPaused"),
        temporarilyClosed: metadataBoolean(branch.metadata, "temporarilyClosed"),
        orders24h: branchOrders.length,
        deliveryOrders24h: branchOrders.filter((order) => order.fulfillment_type === "DELIVERY").length,
        paidRevenue: branchOrders
          .filter((order) => order.status === "paid" || order.payment_status === "paid")
          .reduce((sum, order) => sum + numberValue(order.total), 0),
        waitingPayment: branchOrders.filter((order) => order.payment_status === "waiting_payment").length,
        waitingConfirm: branchOrders.filter((order) => order.payment_status === "waiting_confirm").length,
        averageDeliveryDistanceKm: deliveryDistances.length
          ? Math.round((deliveryDistances.reduce((sum, distance) => sum + distance, 0) / deliveryDistances.length) * 10) / 10
          : null,
        stockBalanceCount: stock.stockBalanceCount,
        lowStockCount: stock.lowStockCount,
        outOfStockCount: stock.outOfStockCount,
        openInventoryAlertCount: branchAlerts.length,
        wasteSpikeAlertCount: branchAlerts.filter((row) => row.alert_type === "waste_spike").length,
        priceSpikeAlertCount: branchAlerts.filter((row) => row.alert_type === "price_spike").length,
        supplierDelayAlertCount: branchAlerts.filter((row) => row.alert_type === "supplier_delay").length,
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
      const deck = buildBranchOperationInsights(snapshot, now);
      result.generated += 1;

      if (deck.insights.length === 0) {
        result.skipped += 1;
        continue;
      }

      const persisted = await persistAiOperationInsightsDeck({
        restaurantId: input.restaurantId,
        branchId: branch.id,
        deck
      });

      if (persisted.schemaReady) result.persisted += 1;
      else result.schemaMissing += 1;

      result.primaryInsights.push({
        branchId: branch.id,
        branchName: branch.name,
        healthScore: persisted.deck.healthScore,
        summary: persisted.deck.summary,
        primaryInsightId: persisted.deck.primaryInsightId
      });
    } catch (error) {
      result.failed += 1;
      writeOperationalEvent({
        area: "ai",
        event: "ai_branch_ops_generation_failed",
        restaurantId: input.restaurantId,
        status: "warn",
        metadata: {
          branchId: branch.id,
          branchName: branch.name,
          message: error instanceof Error ? error.message : "Unknown branch AI Ops failure"
        }
      });
    }
  }

  writeOperationalEvent({
    area: "ai",
    event: "ai_branch_ops_completed",
    restaurantId: input.restaurantId,
    status: result.failed > 0 || result.schemaMissing > 0 ? "warn" : "success",
    latencyMs: Date.now() - startedAt,
    metadata: {
      scanned: result.scanned,
      generated: result.generated,
      persisted: result.persisted,
      failed: result.failed,
      schemaMissing: result.schemaMissing
    }
  });

  return result;
}
