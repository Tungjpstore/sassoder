import "server-only";

import {
  STAFF_PERMISSION_GROUPS,
  STAFF_ROLE_TEMPLATES,
  getStaffPermissionPreset,
  getStaffRoleTemplate,
  isDangerPermission,
  mapPermissionProfileToRoleTemplateCode,
  normalizeStaffPermissions,
  type StaffPermissionKey,
  type StaffPermissionProfile
} from "@/lib/staff-permissions";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ensureDefaultStoreBranch } from "@/services/branch-service";
import { staffOperationsCacheKey } from "@/lib/staff-operations-cache";
import { readVpsTenantCache, writeVpsTenantCache } from "@/lib/vps-tenant-cache";
import { listOrdersForRestaurant } from "@/services/order-service";
import { listRestaurantUsers, getRestaurantOperationsSummary } from "@/services/restaurant-service";
import { listOpenServiceRequests } from "@/services/service-request-service";
import { getRestaurantEntitlement, hasFeature } from "@/services/subscription-service";
import type { OrderDto, ServiceRequestDto } from "@/types/domain";
import type {
  StaffOpsActivityItem,
  StaffOpsApprovalItem,
  StaffOpsAttendanceFeedItem,
  StaffOpsBranchSummary,
  StaffOpsContractItem,
  StaffOpsCoverageDay,
  StaffOpsDeviceItem,
  StaffOpsDocumentItem,
  StaffOpsHeatmapCell,
  StaffOpsIncidentItem,
  StaffOpsMember,
  StaffOpsMobileOps,
  StaffOpsMobileWorkItem,
  StaffOpsReviewItem,
  StaffOpsRoleSummary,
  StaffOpsShiftAssignment,
  StaffOpsShiftTemplate,
  StaffOpsNotification,
  StaffOpsTimesheetSummary,
  StaffOperationsBundleScope,
  StaffOperationsBundle
} from "@/features/staff/types";

type StaffUserRow = {
  id: string;
  email: string;
  role: "ADMIN" | "STAFF";
  restaurant_id: string;
  staff_title?: string | null;
  permission_profile?: StaffPermissionProfile | null;
  permissions?: unknown;
  account_status?: "active" | "blocked";
};

type BranchRow = {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  is_primary: boolean;
  is_active: boolean;
};

type StaffRoleRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  legacy_permission_profile: StaffPermissionProfile;
  role_scope: "ADMIN" | "STAFF";
  is_system: boolean;
  preview_actions: string[] | null;
};

type StaffRolePermissionRow = {
  role_id: string;
  permission_key: StaffPermissionKey;
};

type StaffMemberRow = {
  id: string;
  user_id: string;
  employee_code: string | null;
  employee_number: number | null;
  role_id: string | null;
  role_code: string;
  full_name: string;
  avatar_url: string | null;
  date_of_birth: string | null;
  hometown: string | null;
  phone: string | null;
  username: string | null;
  pin_hash: string | null;
  must_change_app_password: boolean | null;
  app_password_attempts: number | null;
  app_password_locked_until: string | null;
  app_password_last_failed_at: string | null;
  notes: string | null;
  employment_status: "active" | "suspended" | "resigned";
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  last_seen_at: string | null;
  archived_at: string | null;
};

type StaffBranchAssignmentRow = {
  staff_member_id: string;
  branch_id: string;
  is_primary: boolean;
  assignment_status: "active" | "paused" | "ended";
  ended_at: string | null;
};

type ShiftAssignmentRow = {
  id: string;
  shift_id: string;
  branch_id: string | null;
  staff_member_id: string;
  scheduled_date: string;
  status: "scheduled" | "confirmed" | "swapped" | "cancelled" | "completed";
  source: "manual" | "template" | "copy_week" | "swap" | "system";
};

type ShiftRow = {
  id: string;
  code: string;
  name: string;
  branch_id: string | null;
  start_time: string;
  end_time: string;
  allowed_late_minutes: number;
  overtime_threshold_minutes: number;
  attendance_radius_meters: number;
  recurring_weekdays: number[] | null;
  is_template: boolean;
};

type AttendanceRow = {
  id: string;
  staff_member_id: string;
  staff_user_id: string;
  branch_id: string | null;
  shift_id: string | null;
  attendance_state: "on_time" | "late" | "early_leave" | "overtime" | "absent";
  approval_state: "auto_approved" | "pending" | "approved" | "rejected";
  clock_in_at: string;
  clock_out_at: string | null;
  clock_in_source: "gps" | "qr" | "wifi" | "manual" | "offline_sync";
  clock_in_distance_meters: number | null;
  late_minutes: number;
  work_minutes: number | null;
  overtime_minutes: number;
  anomaly_score: number;
};

type ApprovalRow = {
  id: string;
  attendance_log_id: string | null;
  staff_member_id: string;
  branch_id: string | null;
  request_type: "outside_location" | "attendance_edit" | "overtime" | "shift_override" | "manual_clock_in" | "leave_request" | "shift_swap" | "device_restriction";
  status: "pending" | "approved" | "rejected" | "cancelled";
  reason: string | null;
  requested_payload: Record<string, unknown> | null;
  review_note: string | null;
  created_at: string;
};

type StaffActivityRow = {
  id: string;
  actor_user_id: string | null;
  branch_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  severity: "info" | "warning" | "critical";
  reason: string | null;
  created_at: string;
};

type LegacyAuditRow = {
  id: string;
  actor_user_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  created_at: string;
};

type StaffSessionRow = {
  staff_member_id: string;
  branch_id: string | null;
  last_seen_at: string;
  forced_logout_at: string | null;
};

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  status: "unread" | "read" | "archived";
  action_url: string | null;
  created_at: string;
};

export type MarkStaffNotificationsReadInput = {
  restaurantId: string;
  userId: string;
  notificationId?: string;
  all?: boolean;
  includeShared?: boolean;
};

type StaffReviewRow = {
  id: string;
  staff_member_id: string;
  period_label: string;
  score: number;
  status: "draft" | "completed" | "archived";
  note: string | null;
  created_at: string;
};

type StaffContractRow = {
  id: string;
  staff_member_id: string;
  contract_type: "official" | "probation" | "part_time" | "service" | "other";
  template_code: string | null;
  contract_number: string | null;
  job_title: string | null;
  work_location: string | null;
  salary_amount: number | null;
  salary_payment_method: string | null;
  working_time: string | null;
  rest_time: string | null;
  start_date: string;
  end_date: string | null;
  status: "draft" | "active" | "expired" | "terminated";
  e_signature_status: "draft" | "pending_employee" | "pending_employer" | "signed" | "declined" | "voided";
  e_contract_provider: string | null;
  e_contract_id: string | null;
  signed_document_url: string | null;
  note: string | null;
  created_at: string;
};

type StaffDocumentRow = {
  id: string;
  staff_member_id: string;
  document_name: string;
  document_type: "identity_card" | "health_certificate" | "contract" | "training" | "other";
  file_url: string | null;
  file_size_bytes: number | null;
  status: "complete" | "missing" | "expired";
  note: string | null;
  created_at: string;
};

type StaffDeviceRow = {
  id: string;
  staff_member_id: string | null;
  device_name: string;
  device_type: "phone" | "tablet" | "pos" | "cash_drawer" | "other";
  serial_number: string | null;
  device_fingerprint: string | null;
  trusted_for_attendance: boolean | null;
  trusted_at: string | null;
  last_seen_at: string | null;
  issued_at: string;
  status: "assigned" | "returned" | "lost" | "maintenance";
  note: string | null;
  created_at: string;
};

type StaffIncidentRow = {
  id: string;
  staff_member_id: string;
  branch_id: string | null;
  title: string;
  description: string;
  severity: "low" | "normal" | "high" | "urgent";
  status: "open" | "reviewing" | "resolved" | "dismissed";
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

function isMissingStaffOperationsSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    error.code === "42P01" ||
    /staff_|attendance_|shift_|notifications|permission_key/i.test(message)
  );
}

export async function markStaffNotificationsRead(input: MarkStaffNotificationsReadInput) {
  const supabase = createAdminSupabaseClient() as any;
  let query = supabase
    .from("notifications")
    .update({
      status: "read",
      read_at: new Date().toISOString()
    })
    .eq("restaurant_id", input.restaurantId)
    .eq("status", "unread");

  query = input.includeShared ? query.or(`user_id.is.null,user_id.eq.${input.userId}`) : query.eq("user_id", input.userId);

  if (!input.all) {
    query = query.eq("id", input.notificationId);
  }

  const result = await query.select("id");
  if (result.error) throw result.error;

  return {
    updated: result.data?.length ?? 0
  };
}

function displayNameFromEmail(email: string) {
  return email
    .split("@")[0]
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dayKey(value: string) {
  return value.slice(0, 10);
}

function dateKeyInVietnam(value: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function nowMinusMinutes(minutes: number) {
  return Date.now() - minutes * 60 * 1000;
}

function isSessionActive(session: StaffSessionRow) {
  if (session.forced_logout_at) return false;
  return new Date(session.last_seen_at).getTime() >= nowMinusMinutes(15);
}

function formatWeekdayLabel(isoDate: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(`${isoDate}T00:00:00.000Z`));
}

function dayPartFromIso(isoDateTime: string) {
  const hour = Number(isoDateTime.slice(11, 13));
  if (hour < 12) return 0;
  if (hour < 18) return 1;
  return 2;
}

function attendanceWorkMinutes(attendance: AttendanceRow) {
  if (typeof attendance.work_minutes === "number") return attendance.work_minutes;
  if (!attendance.clock_out_at) return 0;
  return Math.max(0, Math.round((new Date(attendance.clock_out_at).getTime() - new Date(attendance.clock_in_at).getTime()) / 60_000));
}

function payloadText(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function payloadNumber(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function inclusiveDayCount(fromDate: string | null, toDate: string | null) {
  if (!fromDate) return 0;
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate || fromDate}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return 0;
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

function emptyMobileOps(): StaffOpsMobileOps {
  return {
    pendingOrders: 0,
    cookingOrders: 0,
    waitingPayments: 0,
    serviceRequests: 0,
    urgentCount: 0,
    workItems: [],
    shiftSwapCandidates: []
  };
}

function orderTableName(order: OrderDto) {
  if (order.table?.name) return order.table.name;
  if (order.fulfillmentType === "DELIVERY") return "Giao hàng";
  if (order.fulfillmentType === "PICKUP") return "Mang đi";
  return null;
}

function isOrderUrgent(order: OrderDto) {
  return Boolean(order.serviceDueAt && new Date(order.serviceDueAt).getTime() < Date.now());
}

function buildMobileOps({
  orders,
  requests,
  permissions,
  shiftSwapCandidates,
  branchById,
  allowedBranchIds
}: {
  orders: OrderDto[];
  requests: ServiceRequestDto[];
  permissions: StaffPermissionKey[];
  shiftSwapCandidates: StaffOpsMobileOps["shiftSwapCandidates"];
  branchById: Map<string, BranchRow>;
  allowedBranchIds: Set<string> | null;
}): StaffOpsMobileOps {
  const canUpdateOrders = permissions.includes("orders.update");
  const canConfirmPayments = permissions.includes("payments.confirm");
  const canManageTables = permissions.includes("tables.manage") || permissions.includes("orders.view");
  const workItems: StaffOpsMobileWorkItem[] = [];
  const branchAllowed = (branchId?: string | null) => {
    if (!allowedBranchIds) return true;
    if (branchId) return allowedBranchIds.has(branchId);
    return allowedBranchIds.size === 1;
  };
  const visibleOrders = orders.filter((order) => branchAllowed(order.branchId ?? null));
  const visibleRequests = requests.filter((request) => branchAllowed(request.branchId ?? null));

  visibleOrders.forEach((order) => {
    const tableName = orderTableName(order);
    const urgent = isOrderUrgent(order);
    const branchId = order.branchId ?? null;
    const branchName = branchId ? branchById.get(branchId)?.name ?? null : null;

    if (order.status === "pending") {
      workItems.push({
        id: order.id,
        kind: "order_pending",
        branchId,
        branchName,
        title: tableName ? `${tableName} gọi món` : "Đơn mới cần nhận",
        subtitle: `${order.items.length} món · ${order.total.toLocaleString("vi-VN")}đ`,
        tableName,
        priority: "high",
        action: canUpdateOrders ? "accept_order" : null,
        actionLabel: canUpdateOrders ? "Nhận đơn" : null,
        createdAt: order.createdAt
      });
    }

    if (order.status === "ordering") {
      workItems.push({
        id: order.id,
        kind: "kitchen_order",
        branchId,
        branchName,
        title: tableName ? `${tableName} đang ra món` : "Đơn đang xử lý",
        subtitle: urgent ? "Quá giờ ra món" : `${order.items.length} dòng món`,
        tableName,
        priority: urgent ? "high" : "medium",
        action: canUpdateOrders ? "complete_order" : null,
        actionLabel: canUpdateOrders ? "Xong món" : null,
        createdAt: order.acceptedAt ?? order.createdAt
      });
    }

    if (order.paymentStatus === "waiting_confirm" || order.status === "waiting_confirm") {
      workItems.push({
        id: order.id,
        kind: "payment_waiting",
        branchId,
        branchName,
        title: tableName ? `${tableName} chờ xác nhận tiền` : "Thanh toán cần xác nhận",
        subtitle: `${order.total.toLocaleString("vi-VN")}đ · ${order.paymentMethod ?? "chưa rõ"}`,
        tableName,
        priority: "high",
        action: canConfirmPayments ? "confirm_payment" : null,
        actionLabel: canConfirmPayments ? "Xác nhận" : null,
        createdAt: order.updatedAt ?? order.createdAt
      });
    }
  });

  if (canManageTables) {
    visibleRequests.forEach((request) => {
      const branchId = request.branchId ?? null;
      workItems.push({
        id: request.id,
        kind: "service_request",
        branchId,
        branchName: branchId ? branchById.get(branchId)?.name ?? null : null,
        title: request.tableName ? `${request.tableName} gọi nhân viên` : "Khách gọi nhân viên",
        subtitle: request.message || "Cần hỗ trợ tại bàn",
        tableName: request.tableName,
        priority: request.status === "open" ? "high" : "medium",
        action: "resolve_request",
        actionLabel: "Đã xử lý",
        createdAt: request.createdAt
      });
    });
  }

  const sortedWorkItems = workItems
    .sort((left, right) => {
      const priorityRank = { high: 0, medium: 1, low: 2 };
      return priorityRank[left.priority] - priorityRank[right.priority] || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    })
    .slice(0, 8);

  return {
    pendingOrders: visibleOrders.filter((order) => order.status === "pending").length,
    cookingOrders: visibleOrders.filter((order) => order.status === "ordering").length,
    waitingPayments: visibleOrders.filter((order) => order.paymentStatus === "waiting_confirm" || order.status === "waiting_confirm").length,
    serviceRequests: visibleRequests.length,
    urgentCount: sortedWorkItems.filter((item) => item.priority === "high").length,
    workItems: sortedWorkItems,
    shiftSwapCandidates
  };
}

function buildWeekRange() {
  const today = new Date();
  const base = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const day = base.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  base.setUTCDate(base.getUTCDate() + mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(base);
    current.setUTCDate(base.getUTCDate() + index);
    return current.toISOString().slice(0, 10);
  });
}

async function readOptionalRows<T>(query: Promise<{ data: T[] | null; error: { code?: string; message?: string } | null }>) {
  const { data, error } = await query;
  if (error) {
    if (isMissingStaffOperationsSchema(error)) return [] as T[];
    throw error;
  }
  return data ?? [];
}

async function readStaffMemberRows(supabase: any, restaurantId: string) {
  const fullSelect =
    "id,user_id,employee_code,employee_number,role_id,role_code,full_name,avatar_url,date_of_birth,hometown,phone,username,pin_hash,must_change_app_password,app_password_attempts,app_password_locked_until,app_password_last_failed_at,notes,employment_status,emergency_contact_name,emergency_contact_phone,last_seen_at,archived_at";
  const legacySelect = "id,user_id,role_id,role_code,full_name,phone,username,pin_hash,notes,employment_status,emergency_contact_name,emergency_contact_phone,last_seen_at,archived_at";
  const query = (select: string) => supabase.from("staff_members").select(select).eq("restaurant_id", restaurantId).order("created_at", { ascending: true });
  const result = await query(fullSelect);

  if (!result.error) return (result.data ?? []) as StaffMemberRow[];
  if (!isMissingStaffOperationsSchema(result.error)) throw result.error;

  const fallback = await query(legacySelect);
  if (fallback.error) {
    if (isMissingStaffOperationsSchema(fallback.error)) return [] as StaffMemberRow[];
    throw fallback.error;
  }

  return ((fallback.data ?? []) as Partial<StaffMemberRow>[]).map((row) => ({
    employee_code: null,
    employee_number: null,
    avatar_url: null,
    date_of_birth: null,
    hometown: null,
    must_change_app_password: null,
    app_password_attempts: null,
    app_password_locked_until: null,
    app_password_last_failed_at: null,
    ...row
  })) as StaffMemberRow[];
}

function notificationVisibilityQuery(supabase: any, restaurantId: string, currentUserId?: string | null, scope?: StaffOperationsBundleScope) {
  const query = supabase
    .from("notifications")
    .select("id,type,title,body,status,action_url,created_at")
    .eq("restaurant_id", restaurantId);

  if (scope === "self") {
    return query.eq("user_id", currentUserId ?? "00000000-0000-0000-0000-000000000000");
  }

  return currentUserId ? query.or(`user_id.is.null,user_id.eq.${currentUserId}`) : query.is("user_id", null);
}

function resolveStaffOpsConfigReadiness() {
  const attendanceQrSecretConfigured = Boolean(process.env.STAFF_ATTENDANCE_QR_SECRET?.trim());
  const attendanceQrSecretRequired = process.env.NODE_ENV === "production";
  const missingRequiredEnv = attendanceQrSecretRequired && !attendanceQrSecretConfigured ? ["STAFF_ATTENDANCE_QR_SECRET"] : [];

  return {
    attendanceQrSecretConfigured,
    attendanceQrSecretRequired,
    missingRequiredEnv
  };
}

function scopeStaffOperationsBundleForSelf(bundle: StaffOperationsBundle, currentUserId?: string | null): StaffOperationsBundle {
  const currentMember = bundle.members.find((member) => member.userId === currentUserId) ?? null;
  if (!currentMember) {
    return {
      ...bundle,
      overview: {
        ...bundle.overview,
        activeStaff: 0,
        lateAttendance: 0,
        absentStaff: 0,
        approvalRequests: 0,
        overtimeAlerts: 0,
        suspiciousActivities: 0,
        realtimeBranchActivity: 0,
        activeCashiers: 0,
        activeKitchenStaff: 0
      },
      roles: [],
      branches: [],
      members: [],
      attendanceFeed: [],
      approvals: [],
      activity: [],
      weeklyCoverage: [],
      heatmap: [],
      shiftAssignments: [],
      timesheets: [],
      reviews: [],
      contracts: [],
      documents: [],
      devices: [],
      incidents: [],
      mobileOps: emptyMobileOps()
    };
  }

  const currentMemberIds = new Set([currentMember.id]);
  const attendanceFeed = bundle.attendanceFeed.filter((item) => currentMemberIds.has(item.staffMemberId));
  const approvals = bundle.approvals.filter((item) => currentMemberIds.has(item.staffMemberId));
  const shiftAssignments = bundle.shiftAssignments.filter((item) => currentMemberIds.has(item.staffMemberId));
  const branchIds = new Set(
    [
      currentMember.primaryBranchId,
      ...shiftAssignments.map((assignment) => assignment.branchId),
      ...attendanceFeed.map((attendance) => bundle.branches.find((branch) => branch.name === attendance.branchName)?.id ?? null),
      ...approvals.map((approval) => bundle.branches.find((branch) => branch.name === approval.branchName)?.id ?? null)
    ].filter(Boolean) as string[]
  );
  const branches = bundle.branches.filter((branch) => branchIds.has(branch.id));
  const activeShiftAssignments = shiftAssignments.filter((item) => item.status !== "cancelled");
  const timesheets = bundle.timesheets.filter((item) => currentMemberIds.has(item.staffMemberId));
  const incidents = bundle.incidents.filter((item) => currentMemberIds.has(item.staffMemberId));

  return {
    ...bundle,
    overview: {
      ...bundle.overview,
      activeStaff: currentMember.activeSessionCount > 0 ? 1 : 0,
      lateAttendance: currentMember.lateMinutesToday > 0 ? 1 : 0,
      absentStaff: currentMember.todayAttendanceState ? 0 : 1,
      approvalRequests: approvals.filter((approval) => approval.status === "pending").length,
      overtimeAlerts: currentMember.overtimeMinutesToday >= 30 ? 1 : 0,
      suspiciousActivities: currentMember.suspiciousScore >= 40 ? 1 : 0,
      realtimeBranchActivity: currentMember.activeSessionCount > 0 ? 1 : 0,
      activeCashiers: currentMember.roleCode === "cashier" && currentMember.activeSessionCount > 0 ? 1 : 0,
      activeKitchenStaff: currentMember.roleCode === "kitchen" && currentMember.activeSessionCount > 0 ? 1 : 0
    },
    roles: bundle.roles.filter((role) => role.code === currentMember.roleCode),
    branches: branches.length > 0 ? branches : bundle.branches.length === 1 ? bundle.branches : [],
    members: [currentMember],
    attendanceFeed,
    approvals,
    activity: bundle.activity.filter((item) => item.fullName === currentMember.fullName || item.entityId === currentMember.id).slice(0, 10),
    weeklyCoverage: bundle.weeklyCoverage.map((day) => ({
      ...day,
      assigned: activeShiftAssignments.filter((assignment) => assignment.scheduledDate === day.isoDate).length,
      confirmed: activeShiftAssignments.filter((assignment) => assignment.scheduledDate === day.isoDate && assignment.status === "confirmed").length,
      overtimeAlerts: attendanceFeed.filter((attendance) => attendance.clockInAt.slice(0, 10) === day.isoDate && attendance.state === "overtime").length
    })),
    heatmap: [],
    shiftAssignments,
    timesheets,
    reviews: bundle.reviews.filter((item) => currentMemberIds.has(item.staffMemberId)),
    contracts: bundle.contracts.filter((item) => currentMemberIds.has(item.staffMemberId)),
    documents: bundle.documents.filter((item) => currentMemberIds.has(item.staffMemberId)),
    devices: bundle.devices.filter((item) => !item.staffMemberId || currentMemberIds.has(item.staffMemberId)),
    incidents,
    mobileOps: bundle.mobileOps
  };
}

export async function getStaffOperationsBundle(
  restaurantId: string,
  currentUserId?: string | null,
  options: { scope?: StaffOperationsBundleScope } = {}
): Promise<StaffOperationsBundle> {
  const cacheKey = staffOperationsCacheKey(restaurantId, currentUserId, options.scope);
  const cachedBundle = await readVpsTenantCache<StaffOperationsBundle>(cacheKey);
  if (cachedBundle) return cachedBundle;

  const supabase = createAdminSupabaseClient() as any;
  await ensureDefaultStoreBranch(restaurantId);
  const [users, branches, operations, entitlement] = await Promise.all([
    listRestaurantUsers(restaurantId) as Promise<StaffUserRow[]>,
    readOptionalRows<BranchRow>(
      supabase.from("store_branches").select("id,name,address,latitude,longitude,is_primary,is_active").eq("restaurant_id", restaurantId).order("is_primary", { ascending: false })
    ),
    getRestaurantOperationsSummary(restaurantId),
    getRestaurantEntitlement(restaurantId)
  ]);
  const shouldLoadMobileOps = options.scope === "self";
  const [mobileOrders, mobileRequests] = shouldLoadMobileOps
    ? await Promise.all([
        hasFeature(entitlement, "order_realtime") ? listOrdersForRestaurant(restaurantId, { limit: 40 }) : Promise.resolve([]),
        hasFeature(entitlement, "staff_call") ? listOpenServiceRequests(restaurantId) : Promise.resolve([])
      ])
    : [[], []];

  const weekRange = buildWeekRange();
  const weekStart = weekRange[0];
  const weekEnd = weekRange[weekRange.length - 1];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const shouldLoadAdminExtendedData = options.scope !== "self";
  const shouldLoadPeopleExtendedData = true;

  const [
    roles,
    rolePermissions,
    staffMembers,
    branchAssignments,
    shifts,
    shiftAssignments,
    attendanceRows,
    openAttendanceRows,
    approvalRows,
    activityRows,
    legacyAuditRows,
    sessionRows,
    notificationRows,
    reviewRows,
    contractRows,
    documentRows,
    deviceRows,
    incidentRows
  ] = await Promise.all([
    readOptionalRows<StaffRoleRow>(
      supabase
        .from("staff_roles")
        .select("id,code,name,description,legacy_permission_profile,role_scope,is_system,preview_actions")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
    ),
    readOptionalRows<StaffRolePermissionRow>(
      supabase.from("staff_role_permissions").select("role_id,permission_key").eq("restaurant_id", restaurantId)
    ),
    readStaffMemberRows(supabase, restaurantId),
    readOptionalRows<StaffBranchAssignmentRow>(
      supabase
        .from("staff_branch_assignments")
        .select("staff_member_id,branch_id,is_primary,assignment_status,ended_at")
        .eq("restaurant_id", restaurantId)
    ),
    readOptionalRows<ShiftRow>(
      supabase
        .from("shifts")
        .select("id,code,name,branch_id,start_time,end_time,allowed_late_minutes,overtime_threshold_minutes,attendance_radius_meters,recurring_weekdays,is_template")
        .eq("restaurant_id", restaurantId)
        .order("start_time", { ascending: true })
    ),
    readOptionalRows<ShiftAssignmentRow>(
      supabase
        .from("shift_assignments")
        .select("id,shift_id,branch_id,staff_member_id,scheduled_date,status,source")
        .eq("restaurant_id", restaurantId)
        .gte("scheduled_date", weekStart)
        .lte("scheduled_date", weekEnd)
    ),
    readOptionalRows<AttendanceRow>(
      supabase
        .from("attendance_logs")
        .select("id,staff_member_id,staff_user_id,branch_id,shift_id,attendance_state,approval_state,clock_in_at,clock_out_at,clock_in_source,clock_in_distance_meters,late_minutes,work_minutes,overtime_minutes,anomaly_score")
        .eq("restaurant_id", restaurantId)
        .gte("clock_in_at", sevenDaysAgo.toISOString())
        .order("clock_in_at", { ascending: false })
        .limit(100)
    ),
    readOptionalRows<AttendanceRow>(
      supabase
        .from("attendance_logs")
        .select("id,staff_member_id,staff_user_id,branch_id,shift_id,attendance_state,approval_state,clock_in_at,clock_out_at,clock_in_source,clock_in_distance_meters,late_minutes,work_minutes,overtime_minutes,anomaly_score")
        .eq("restaurant_id", restaurantId)
        .is("clock_out_at", null)
        .order("clock_in_at", { ascending: false })
        .limit(100)
    ),
    readOptionalRows<ApprovalRow>(
      supabase
        .from("attendance_approval_requests")
        .select("id,attendance_log_id,staff_member_id,branch_id,request_type,status,reason,requested_payload,review_note,created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(40)
    ),
    readOptionalRows<StaffActivityRow>(
      supabase
        .from("staff_activity_logs")
        .select("id,actor_user_id,branch_id,entity_type,entity_id,action,severity,reason,created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(40)
    ),
    shouldLoadAdminExtendedData
      ? readOptionalRows<LegacyAuditRow>(
          supabase
            .from("audit_logs")
            .select("id,actor_user_id,entity_type,entity_id,action,created_at")
            .eq("restaurant_id", restaurantId)
            .order("created_at", { ascending: false })
            .limit(20)
        )
      : Promise.resolve([] as LegacyAuditRow[]),
    readOptionalRows<StaffSessionRow>(
      supabase
        .from("staff_sessions")
        .select("staff_member_id,branch_id,last_seen_at,forced_logout_at")
        .eq("restaurant_id", restaurantId)
        .order("last_seen_at", { ascending: false })
        .limit(100)
    ),
    readOptionalRows<NotificationRow>(
      notificationVisibilityQuery(supabase, restaurantId, currentUserId, options.scope)
        .order("created_at", { ascending: false })
        .limit(20)
    ),
    shouldLoadPeopleExtendedData
      ? readOptionalRows<StaffReviewRow>(
          supabase
            .from("staff_reviews")
            .select("id,staff_member_id,period_label,score,status,note,created_at")
            .eq("restaurant_id", restaurantId)
            .order("created_at", { ascending: false })
            .limit(120)
        )
      : Promise.resolve([] as StaffReviewRow[]),
    shouldLoadPeopleExtendedData
      ? readOptionalRows<StaffContractRow>(
          supabase
            .from("staff_contracts")
            .select("id,staff_member_id,contract_type,template_code,contract_number,job_title,work_location,salary_amount,salary_payment_method,working_time,rest_time,start_date,end_date,status,e_signature_status,e_contract_provider,e_contract_id,signed_document_url,note,created_at")
            .eq("restaurant_id", restaurantId)
            .order("created_at", { ascending: false })
            .limit(120)
        )
      : Promise.resolve([] as StaffContractRow[]),
    shouldLoadPeopleExtendedData
      ? readOptionalRows<StaffDocumentRow>(
          supabase
            .from("staff_documents")
            .select("id,staff_member_id,document_name,document_type,file_url,file_size_bytes,status,note,created_at")
            .eq("restaurant_id", restaurantId)
            .order("created_at", { ascending: false })
            .limit(120)
        )
      : Promise.resolve([] as StaffDocumentRow[]),
    shouldLoadPeopleExtendedData
      ? readOptionalRows<StaffDeviceRow>(
          supabase
            .from("staff_devices")
            .select("id,staff_member_id,device_name,device_type,serial_number,device_fingerprint,trusted_for_attendance,trusted_at,last_seen_at,issued_at,status,note,created_at")
            .eq("restaurant_id", restaurantId)
            .order("created_at", { ascending: false })
            .limit(120)
      )
      : Promise.resolve([] as StaffDeviceRow[]),
    readOptionalRows<StaffIncidentRow>(
      supabase
        .from("staff_incident_reports")
        .select("id,staff_member_id,branch_id,title,description,severity,status,attachment_url,created_at,updated_at,resolved_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(80)
    )
  ]);

  const rolePermissionMap = new Map<string, StaffPermissionKey[]>();
  rolePermissions.forEach((permission) => {
    rolePermissionMap.set(permission.role_id, [...(rolePermissionMap.get(permission.role_id) ?? []), permission.permission_key]);
  });

  const roleRows = (roles.length > 0 ? roles : STAFF_ROLE_TEMPLATES.map((role) => ({
    id: role.code,
    code: role.code,
    name: role.title,
    description: role.description,
    legacy_permission_profile: role.profile,
    role_scope: role.role,
    is_system: true,
    preview_actions: [role.preview]
  }))) as StaffRoleRow[];

  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
  const userById = new Map(users.map((user) => [user.id, user]));
  const memberByUserId = new Map(staffMembers.map((member) => [member.user_id, member]));
  const memberById = new Map(staffMembers.map((member) => [member.id, member]));
  const roleById = new Map(roleRows.map((role) => [role.id, role]));
  const roleByCode = new Map(roleRows.map((role) => [role.code, role]));
  const assignmentsByMemberId = new Map<string, StaffBranchAssignmentRow[]>();

  const permissionsForRole = (role: StaffRoleRow) => {
    const template = STAFF_ROLE_TEMPLATES.find((item) => item.code === role.code);
    return rolePermissionMap.get(role.id) ?? template?.permissions ?? getStaffPermissionPreset(role.legacy_permission_profile).permissions;
  };

  branchAssignments.forEach((assignment) => {
    assignmentsByMemberId.set(assignment.staff_member_id, [...(assignmentsByMemberId.get(assignment.staff_member_id) ?? []), assignment]);
  });

  const activeSessionsByMemberId = new Map<string, StaffSessionRow[]>();
  sessionRows.filter(isSessionActive).forEach((session) => {
    activeSessionsByMemberId.set(session.staff_member_id, [...(activeSessionsByMemberId.get(session.staff_member_id) ?? []), session]);
  });

  const today = dateKeyInVietnam(new Date());
  const attendanceTodayByMemberId = new Map<string, AttendanceRow>();
  const todayAttendanceMemberIds = new Set<string>();
  const attendanceRowsWithOpen = [...openAttendanceRows, ...attendanceRows].reduce((rows, attendance) => {
    if (!rows.some((item) => item.id === attendance.id)) rows.push(attendance);
    return rows;
  }, [] as AttendanceRow[]);
  const todayAttendanceRows = attendanceRowsWithOpen.filter((attendance) => dayKey(attendance.clock_in_at) === today);
  todayAttendanceRows.forEach((attendance) => {
      todayAttendanceMemberIds.add(attendance.staff_member_id);
      if (!attendanceTodayByMemberId.has(attendance.staff_member_id)) {
        attendanceTodayByMemberId.set(attendance.staff_member_id, attendance);
      }
    });

  const lateCountByMemberId = new Map<string, number>();
  const outsideApprovalsByMemberId = new Map<string, number>();
  approvalRows.forEach((approval) => {
    if (approval.request_type === "outside_location") {
      outsideApprovalsByMemberId.set(approval.staff_member_id, (outsideApprovalsByMemberId.get(approval.staff_member_id) ?? 0) + 1);
    }
  });

  attendanceRowsWithOpen.forEach((attendance) => {
    if (attendance.late_minutes > 0) {
      lateCountByMemberId.set(attendance.staff_member_id, (lateCountByMemberId.get(attendance.staff_member_id) ?? 0) + 1);
    }
  });

  const members: StaffOpsMember[] = users.map((user) => {
    const member = memberByUserId.get(user.id);
    const roleCode = member?.role_code || (user.role === "ADMIN" ? "owner" : mapPermissionProfileToRoleTemplateCode(user.permission_profile ?? "service"));
    const resolvedRole = (member?.role_id ? roleById.get(member.role_id) : null) ?? roleByCode.get(roleCode) ?? null;
    const roleTemplate = getStaffRoleTemplate(resolvedRole?.code ?? roleCode);
    const rolePermissions = resolvedRole ? permissionsForRole(resolvedRole) : normalizeStaffPermissions(user.permissions, roleCode);
    const activeAssignments = (member ? assignmentsByMemberId.get(member.id) ?? [] : []).filter(
      (assignment) => assignment.assignment_status === "active" && !assignment.ended_at
    );
    const primaryAssignment = activeAssignments.find((assignment) => assignment.is_primary) ?? activeAssignments[0];
    const todayAttendance = member ? attendanceTodayByMemberId.get(member.id) ?? null : null;
    const activeSessions = member ? activeSessionsByMemberId.get(member.id) ?? [] : [];
    const suspiciousScore = Math.min(
      100,
      (user.account_status === "blocked" ? 25 : 0) +
        ((member?.archived_at ? 15 : 0) as number) +
        Math.min((lateCountByMemberId.get(member?.id ?? "") ?? 0) * 10, 30) +
        Math.min((outsideApprovalsByMemberId.get(member?.id ?? "") ?? 0) * 15, 30) +
        (activeSessions.length > 1 ? 10 : 0) +
        (todayAttendance?.anomaly_score ?? 0)
    );

    return {
      id: member?.id ?? user.id,
      userId: user.id,
      email: user.email,
      employeeCode: member?.employee_code ?? null,
      employeeNumber: member?.employee_number ?? null,
      fullName: member?.full_name || displayNameFromEmail(user.email),
      avatarUrl: member?.avatar_url ?? null,
      dateOfBirth: member?.date_of_birth ?? null,
      hometown: member?.hometown ?? null,
      phone: member?.phone ?? null,
      username: member?.username ?? user.email.split("@")[0]?.toLowerCase() ?? null,
      hasPin: Boolean(member?.pin_hash),
      mustChangeAppPassword: Boolean(member?.must_change_app_password),
      appPasswordAttempts: member?.app_password_attempts ?? 0,
      appPasswordLockedUntil: member?.app_password_locked_until ?? null,
      appPasswordLastFailedAt: member?.app_password_last_failed_at ?? null,
      roleCode: resolvedRole?.code ?? roleCode,
      roleTitle: resolvedRole?.name ?? roleTemplate.title,
      roleProfile: resolvedRole?.legacy_permission_profile ?? roleTemplate.profile,
      permissions: rolePermissions,
      employmentStatus: member?.employment_status ?? (user.account_status === "blocked" ? "suspended" : "active"),
      accountStatus: user.account_status ?? "active",
      isArchived: Boolean(member?.archived_at),
      primaryBranchId: primaryAssignment?.branch_id ?? null,
      primaryBranchName: primaryAssignment?.branch_id ? branchById.get(primaryAssignment.branch_id)?.name ?? null : null,
      branchNames: activeAssignments.map((assignment) => branchById.get(assignment.branch_id)?.name).filter(Boolean) as string[],
      lastSeenAt: activeSessions[0]?.last_seen_at ?? member?.last_seen_at ?? null,
      activeSessionCount: activeSessions.length,
      todayAttendanceState: todayAttendance?.attendance_state ?? null,
      lateMinutesToday: todayAttendance?.late_minutes ?? 0,
      overtimeMinutesToday: todayAttendance?.overtime_minutes ?? 0,
      suspiciousScore,
      notes: member?.notes ?? null,
      emergencyContactName: member?.emergency_contact_name ?? null,
      emergencyContactPhone: member?.emergency_contact_phone ?? null
    };
  });

  const memberByUserIdForName = new Map(members.map((member) => [member.userId, member]));
  const memberNameById = new Map(members.map((member) => [member.id, member.fullName]));

  const rolesSummary: StaffOpsRoleSummary[] = roleRows.map((role) => {
    const template = STAFF_ROLE_TEMPLATES.find((item) => item.code === role.code);
    const preset = getStaffPermissionPreset(role.legacy_permission_profile);
    const permissions = permissionsForRole(role);
    return {
      id: role.id,
      code: role.code,
      title: role.name,
      description: role.description ?? template?.description ?? preset.description,
      profile: role.legacy_permission_profile,
      scope: role.role_scope,
      permissionCount: permissions.length,
      dangerPermissionCount: permissions.filter(isDangerPermission).length,
      preview: role.preview_actions?.[0] ?? template?.preview ?? preset.description,
      permissions,
      system: role.is_system
    };
  });

  const recentAttendanceRowsById = new Map<string, AttendanceRow>();
  [...openAttendanceRows, ...todayAttendanceRows, ...attendanceRowsWithOpen.filter((attendance) => dayKey(attendance.clock_in_at) !== today).slice(0, 24)].forEach((attendance) => {
    recentAttendanceRowsById.set(attendance.id, attendance);
  });

  const attendanceFeed: StaffOpsAttendanceFeedItem[] = [...recentAttendanceRowsById.values()]
    .sort((left, right) => new Date(right.clock_in_at).getTime() - new Date(left.clock_in_at).getTime())
    .map((attendance) => ({
      id: attendance.id,
      staffMemberId: attendance.staff_member_id,
      fullName: memberNameById.get(attendance.staff_member_id) ?? userById.get(attendance.staff_user_id)?.email ?? "Nhân viên",
      branchId: attendance.branch_id,
      branchName: attendance.branch_id ? branchById.get(attendance.branch_id)?.name ?? null : null,
      shiftName: attendance.shift_id ? shiftById.get(attendance.shift_id)?.name ?? null : null,
      state: attendance.attendance_state,
      source: attendance.clock_in_source,
      approvalState: attendance.approval_state,
      clockInAt: attendance.clock_in_at,
      clockOutAt: attendance.clock_out_at,
      lateMinutes: attendance.late_minutes,
      overtimeMinutes: attendance.overtime_minutes,
      distanceMeters: attendance.clock_in_distance_meters ?? null
    }));

  const approvals: StaffOpsApprovalItem[] = approvalRows.map((approval) => ({
    id: approval.id,
    attendanceLogId: approval.attendance_log_id,
    staffMemberId: approval.staff_member_id,
    fullName: memberNameById.get(approval.staff_member_id) ?? "Nhân viên",
    branchName: approval.branch_id ? branchById.get(approval.branch_id)?.name ?? null : null,
    requestType: approval.request_type,
    status: approval.status,
    reason: approval.reason,
    requestedPayload: approval.requested_payload ?? {},
    reviewNote: approval.review_note,
    createdAt: approval.created_at
  }));

  const activitySource = activityRows.length > 0 ? activityRows : legacyAuditRows.map((log) => ({
    id: log.id,
    actor_user_id: log.actor_user_id,
    branch_id: null,
    entity_type: log.entity_type,
    entity_id: log.entity_id,
    action: log.action,
    severity: "warning" as const,
    reason: null,
    created_at: log.created_at
  }));

  const activity: StaffOpsActivityItem[] = activitySource.map((item) => ({
    id: item.id,
    fullName: item.actor_user_id ? memberByUserIdForName.get(item.actor_user_id)?.fullName ?? userById.get(item.actor_user_id)?.email ?? null : null,
    branchName: item.branch_id ? branchById.get(item.branch_id)?.name ?? null : null,
    entityType: item.entity_type,
    entityId: item.entity_id,
    action: item.action,
    severity: item.severity,
    reason: item.reason,
    createdAt: item.created_at
  }));

  const activeShiftAssignments = shiftAssignments.filter((assignment) => assignment.status !== "cancelled");

  const weeklyCoverage: StaffOpsCoverageDay[] = weekRange.map((isoDate) => {
    const dayAssignments = activeShiftAssignments.filter((assignment) => assignment.scheduled_date === isoDate);
    return {
      isoDate,
      label: formatWeekdayLabel(isoDate),
      assigned: dayAssignments.length,
      confirmed: dayAssignments.filter((assignment) => assignment.status === "confirmed").length,
      overtimeAlerts: attendanceRows.filter(
        (attendance) => dayKey(attendance.clock_in_at) === isoDate && attendance.overtime_minutes >= 30
      ).length
    };
  });

  const heatmap: StaffOpsHeatmapCell[][] = weekRange.map((isoDate) => {
    const dayAssignments = activeShiftAssignments.filter((assignment) => assignment.scheduled_date === isoDate);
    const dayAttendance = attendanceRows.filter((attendance) => dayKey(attendance.clock_in_at) === isoDate);

    return [
      {
        label: "Sáng",
        assigned: dayAssignments.filter((assignment) => dayPartFromIso(`${assignment.scheduled_date}T${shiftById.get(assignment.shift_id)?.start_time ?? "08:00:00"}Z`) === 0).length,
        attendance: dayAttendance.filter((attendance) => dayPartFromIso(attendance.clock_in_at) === 0).length
      },
      {
        label: "Chiều",
        assigned: dayAssignments.filter((assignment) => dayPartFromIso(`${assignment.scheduled_date}T${shiftById.get(assignment.shift_id)?.start_time ?? "14:00:00"}Z`) === 1).length,
        attendance: dayAttendance.filter((attendance) => dayPartFromIso(attendance.clock_in_at) === 1).length
      },
      {
        label: "Tối",
        assigned: dayAssignments.filter((assignment) => dayPartFromIso(`${assignment.scheduled_date}T${shiftById.get(assignment.shift_id)?.start_time ?? "19:00:00"}Z`) === 2).length,
        attendance: dayAttendance.filter((attendance) => dayPartFromIso(attendance.clock_in_at) === 2).length
      }
    ];
  });

  const shiftTemplates: StaffOpsShiftTemplate[] = shifts.map((shift) => ({
    id: shift.id,
    code: shift.code,
    name: shift.name,
    branchId: shift.branch_id,
    branchName: shift.branch_id ? branchById.get(shift.branch_id)?.name ?? null : null,
    startTime: shift.start_time.slice(0, 5),
    endTime: shift.end_time.slice(0, 5),
    allowedLateMinutes: shift.allowed_late_minutes,
    overtimeThresholdMinutes: shift.overtime_threshold_minutes,
    attendanceRadiusMeters: shift.attendance_radius_meters,
    recurringWeekdays: shift.recurring_weekdays ?? [],
    isTemplate: shift.is_template
  }));

  const shiftAssignmentSummaries: StaffOpsShiftAssignment[] = shiftAssignments.map((assignment) => {
    const shift = shiftById.get(assignment.shift_id);
    return {
      id: assignment.id,
      shiftId: assignment.shift_id,
      shiftName: shift?.name ?? "Ca làm",
      staffMemberId: assignment.staff_member_id,
      staffName: memberNameById.get(assignment.staff_member_id) ?? "Nhân viên",
      branchId: assignment.branch_id,
      branchName: assignment.branch_id ? branchById.get(assignment.branch_id)?.name ?? null : null,
      scheduledDate: assignment.scheduled_date,
      status: assignment.status,
      source: assignment.source
    };
  });

  const pendingApprovalsByMemberId = new Map<string, number>();
  const approvedOvertimeMinutesByMemberId = new Map<string, number>();
  const approvedPaidLeaveDaysByMemberId = new Map<string, number>();
  const approvedUnpaidLeaveDaysByMemberId = new Map<string, number>();
  approvals.forEach((approval) => {
    if (approval.status === "pending") {
      pendingApprovalsByMemberId.set(approval.staffMemberId, (pendingApprovalsByMemberId.get(approval.staffMemberId) ?? 0) + 1);
    }

    if (approval.status === "approved" && approval.requestType === "overtime" && !approval.attendanceLogId) {
      const minutes = payloadNumber(approval.requestedPayload, "overtimeMinutes") ?? 0;
      approvedOvertimeMinutesByMemberId.set(approval.staffMemberId, (approvedOvertimeMinutesByMemberId.get(approval.staffMemberId) ?? 0) + minutes);
    }

    if (approval.status === "approved" && approval.requestType === "leave_request") {
      const days = inclusiveDayCount(payloadText(approval.requestedPayload, "fromDate"), payloadText(approval.requestedPayload, "toDate"));
      const leaveType = payloadText(approval.requestedPayload, "leaveType") ?? "unpaid";
      const targetMap = leaveType === "paid" ? approvedPaidLeaveDaysByMemberId : approvedUnpaidLeaveDaysByMemberId;
      targetMap.set(approval.staffMemberId, (targetMap.get(approval.staffMemberId) ?? 0) + days);
    }
  });

  const timesheets: StaffOpsTimesheetSummary[] = members
    .filter((member) => !member.isArchived)
    .map((member) => {
      const rows = attendanceRows.filter((attendance) => attendance.staff_member_id === member.id);
      const payableRows = rows.filter((attendance) => attendance.approval_state === "auto_approved" || attendance.approval_state === "approved");
      const pendingAttendanceCount = rows.filter((attendance) => attendance.approval_state === "pending").length;
      const workMinutes = payableRows.reduce((total, attendance) => total + attendanceWorkMinutes(attendance), 0);
      const lateMinutes = payableRows.reduce((total, attendance) => total + attendance.late_minutes, 0);
      const approvedOvertimeMinutes = approvedOvertimeMinutesByMemberId.get(member.id) ?? 0;
      const overtimeMinutes = payableRows.reduce((total, attendance) => total + attendance.overtime_minutes, 0) + approvedOvertimeMinutes;
      const lateCount = payableRows.filter((attendance) => attendance.late_minutes > 0).length;
      const pendingApprovals = (pendingApprovalsByMemberId.get(member.id) ?? 0) + pendingAttendanceCount;
      const paidLeaveDays = approvedPaidLeaveDaysByMemberId.get(member.id) ?? 0;
      const unpaidLeaveDays = approvedUnpaidLeaveDaysByMemberId.get(member.id) ?? 0;
      const attendanceScore = Math.max(0, Math.min(100, 100 - lateCount * 8 - pendingApprovals * 12 - Math.floor(lateMinutes / 15) * 3));

      return {
        staffMemberId: member.id,
        fullName: member.fullName,
        branchName: member.primaryBranchName,
        attendanceCount: payableRows.length,
        workMinutes,
        lateMinutes,
        overtimeMinutes,
        approvedOvertimeMinutes,
        paidLeaveDays,
        unpaidLeaveDays,
        lateCount,
        pendingApprovals,
        attendanceScore
      };
    })
    .sort((left, right) => right.workMinutes - left.workMinutes || left.fullName.localeCompare(right.fullName, "vi"));

  const reviews: StaffOpsReviewItem[] = reviewRows.map((review) => ({
    id: review.id,
    staffMemberId: review.staff_member_id,
    staffName: memberNameById.get(review.staff_member_id) ?? "Nhân viên",
    periodLabel: review.period_label,
    score: Number(review.score),
    status: review.status,
    note: review.note,
    createdAt: review.created_at
  }));

  const contracts: StaffOpsContractItem[] = contractRows.map((contract) => ({
    id: contract.id,
    staffMemberId: contract.staff_member_id,
    staffName: memberNameById.get(contract.staff_member_id) ?? "Nhân viên",
    contractType: contract.contract_type,
    templateCode: contract.template_code,
    contractNumber: contract.contract_number,
    jobTitle: contract.job_title,
    workLocation: contract.work_location,
    salaryAmount: contract.salary_amount,
    salaryPaymentMethod: contract.salary_payment_method,
    workingTime: contract.working_time,
    restTime: contract.rest_time,
    startDate: contract.start_date,
    endDate: contract.end_date,
    status: contract.status,
    eSignatureStatus: contract.e_signature_status ?? "draft",
    eContractProvider: contract.e_contract_provider,
    eContractId: contract.e_contract_id,
    signedDocumentUrl: contract.signed_document_url,
    note: contract.note,
    createdAt: contract.created_at
  }));

  const documents: StaffOpsDocumentItem[] = documentRows.map((document) => ({
    id: document.id,
    staffMemberId: document.staff_member_id,
    staffName: memberNameById.get(document.staff_member_id) ?? "Nhân viên",
    documentName: document.document_name,
    documentType: document.document_type,
    fileUrl: document.file_url,
    fileSizeBytes: document.file_size_bytes,
    status: document.status,
    note: document.note,
    createdAt: document.created_at
  }));

  const devices: StaffOpsDeviceItem[] = deviceRows.map((device) => ({
    id: device.id,
    staffMemberId: device.staff_member_id,
    staffName: device.staff_member_id ? memberNameById.get(device.staff_member_id) ?? "Nhân viên" : null,
    deviceName: device.device_name,
    deviceType: device.device_type,
    serialNumber: device.serial_number,
    deviceFingerprint: device.device_fingerprint,
    trustedForAttendance: Boolean(device.trusted_for_attendance),
    trustedAt: device.trusted_at,
    lastSeenAt: device.last_seen_at,
    issuedAt: device.issued_at,
    status: device.status,
    note: device.note,
    createdAt: device.created_at
  }));

  const incidents: StaffOpsIncidentItem[] = incidentRows.map((incident) => ({
    id: incident.id,
    staffMemberId: incident.staff_member_id,
    staffName: memberNameById.get(incident.staff_member_id) ?? "Nhân viên",
    branchId: incident.branch_id,
    branchName: incident.branch_id ? branchById.get(incident.branch_id)?.name ?? null : null,
    title: incident.title,
    description: incident.description,
    severity: incident.severity,
    status: incident.status,
    attachmentUrl: incident.attachment_url,
    createdAt: incident.created_at,
    updatedAt: incident.updated_at,
    resolvedAt: incident.resolved_at
  }));

  const notifications: StaffOpsNotification[] = notificationRows.map((notification) => ({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    status: notification.status,
    actionUrl: notification.action_url,
    createdAt: notification.created_at
  }));

  const branchSummaries: StaffOpsBranchSummary[] = branches.map((branch) => {
    const memberIds = branchAssignments
      .filter((assignment) => assignment.branch_id === branch.id && assignment.assignment_status === "active" && !assignment.ended_at)
      .map((assignment) => assignment.staff_member_id);
    const activeStaff = memberIds.filter((memberId) => (activeSessionsByMemberId.get(memberId) ?? []).length > 0).length;
    const lateCount = attendanceRows.filter(
      (attendance) => attendance.branch_id === branch.id && dayKey(attendance.clock_in_at) === today && attendance.late_minutes > 0
    ).length;
    const pendingApprovals = approvalRows.filter((approval) => approval.branch_id === branch.id && approval.status === "pending").length;
    const suspiciousCount = members.filter((member) => member.primaryBranchId === branch.id && member.suspiciousScore >= 40).length;
    const coverageScore = Math.max(0, Math.min(100, memberIds.length * 15 + activeStaff * 10 - lateCount * 8 - pendingApprovals * 6));

    return {
      id: branch.id,
      name: branch.name,
      address: branch.address,
      isPrimary: branch.is_primary,
      isActive: branch.is_active,
      attendanceLocationConfigured: branch.latitude !== null && branch.longitude !== null,
      activeStaff,
      lateCount,
      pendingApprovals,
      suspiciousCount,
      coverageScore
    };
  });

  const todayCoverage = weeklyCoverage.find((item) => item.isoDate === today) ?? null;
  const currentStaffMember = members.find((member) => member.userId === currentUserId) ?? null;
  const currentStaffAllowedBranchIds = currentStaffMember
    ? (() => {
        if (["owner", "admin"].includes(String(currentStaffMember.roleCode))) return null;
        const ids = new Set<string>();
        if (currentStaffMember.primaryBranchId) ids.add(currentStaffMember.primaryBranchId);
        branchAssignments
          .filter((assignment) => assignment.staff_member_id === currentStaffMember.id && assignment.assignment_status === "active" && !assignment.ended_at)
          .forEach((assignment) => ids.add(assignment.branch_id));
        shiftAssignmentSummaries
          .filter((assignment) => assignment.staffMemberId === currentStaffMember.id && assignment.status !== "cancelled" && assignment.branchId)
          .forEach((assignment) => ids.add(assignment.branchId as string));
        if (ids.size === 0 && branches.length === 1) ids.add(branches[0].id);
        return ids;
      })()
    : null;
  const shiftSwapCandidates = currentStaffMember
    ? members
        .filter((member) => {
          if (member.id === currentStaffMember.id || member.isArchived || member.employmentStatus !== "active") return false;
          if (!currentStaffMember.primaryBranchId) return true;
          return member.primaryBranchId === currentStaffMember.primaryBranchId || member.branchNames.includes(currentStaffMember.primaryBranchName ?? "");
        })
        .sort((left, right) => right.activeSessionCount - left.activeSessionCount || left.fullName.localeCompare(right.fullName, "vi"))
        .slice(0, 12)
        .map((member) => ({
          id: member.id,
          fullName: member.fullName,
          roleTitle: member.roleTitle,
          primaryBranchId: member.primaryBranchId,
          primaryBranchName: member.primaryBranchName,
          activeSessionCount: member.activeSessionCount
        }))
    : [];
  const mobileOps = shouldLoadMobileOps && currentStaffMember
    ? buildMobileOps({
        orders: mobileOrders,
        requests: mobileRequests,
        permissions: currentStaffMember.permissions,
        shiftSwapCandidates,
        branchById,
        allowedBranchIds: currentStaffAllowedBranchIds
      })
    : emptyMobileOps();

  const premium = {
    isPremium: entitlement.planCode === "premium",
    gpsAttendance: entitlement.planCode === "premium",
    approvalWorkflows: entitlement.planCode === "premium",
    anomalyDetection: entitlement.planCode === "premium",
    operationalAnalytics: entitlement.planCode === "premium",
    customPermissions: entitlement.planCode === "premium"
  };

  const bundle = {
    generatedAt: new Date().toISOString(),
    opsConfig: resolveStaffOpsConfigReadiness(),
    overview: {
      activeStaff: members.filter((member) => member.activeSessionCount > 0 && !member.isArchived).length,
      lateAttendance: todayAttendanceRows.filter((attendance) => attendance.late_minutes > 0).length,
      absentStaff: todayCoverage?.assigned
        ? Math.max(0, todayCoverage.assigned - todayAttendanceMemberIds.size)
        : 0,
      approvalRequests: approvals.filter((approval) => approval.status === "pending").length,
      overtimeAlerts: todayAttendanceRows.filter((attendance) => attendance.overtime_minutes >= 30).length,
      suspiciousActivities: members.filter((member) => member.suspiciousScore >= 40).length,
      realtimeBranchActivity: branchSummaries.filter((branch) => branch.activeStaff > 0).length,
      activeCashiers: members.filter((member) => member.roleCode === "cashier" && member.activeSessionCount > 0).length,
      activeKitchenStaff: members.filter((member) => member.roleCode === "kitchen" && member.activeSessionCount > 0).length,
      operationsPending: operations.pending + operations.ordering,
      paidToday: operations.paid
    },
    roles: rolesSummary,
    branches: branchSummaries,
    members,
    attendanceFeed,
    approvals,
    activity,
    weeklyCoverage,
    heatmap,
    shifts: shiftTemplates,
    shiftAssignments: shiftAssignmentSummaries,
    timesheets,
    reviews,
    contracts,
    documents,
    devices,
    incidents,
    mobileOps,
    notifications,
    unreadNotificationCount: notifications.filter((notification) => notification.status === "unread").length,
    permissionGroups: STAFF_PERMISSION_GROUPS,
    premium
  } satisfies StaffOperationsBundle;

  const finalBundle = options.scope === "self" ? scopeStaffOperationsBundleForSelf(bundle, currentUserId) : bundle;
  void writeVpsTenantCache({ ...cacheKey, value: finalBundle, ttlSeconds: options.scope === "self" ? 4 : 8 });
  return finalBundle;
}
