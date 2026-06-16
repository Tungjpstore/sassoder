import type { StaffOperationsBundle, StaffOperationsBundleScope } from "@/features/staff/types";

type StaffOperationsApiResponse = {
  success: boolean;
  message: string;
  data: StaffOperationsBundle | null;
  meta?: Record<string, unknown>;
  errors?: string[];
};

type AttendanceApiResponse<T> = {
  success?: boolean;
  ok?: boolean;
  message?: string;
  error?: string;
  data?: T | null;
  meta?: Record<string, unknown> | null;
  errors?: unknown;
  details?: unknown;
};

export class StaffOperationsApiError extends Error {
  status?: number;
  network: boolean;

  constructor(message: string, options?: { status?: number; network?: boolean }) {
    super(message);
    this.name = "StaffOperationsApiError";
    this.status = options?.status;
    this.network = options?.network ?? false;
  }
}

export function isStaffOperationsNetworkError(error: unknown) {
  return error instanceof StaffOperationsApiError && error.network;
}

export type AttendanceCapturePayload = {
  staffMemberId?: string;
  branchId?: string;
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
  capturedAt?: string;
  deviceInfo?: Record<string, unknown>;
  qrToken?: string;
  note?: string;
};

export type AttendanceClockInPayload = AttendanceCapturePayload & {
  shiftAssignmentId?: string;
  source?: "gps" | "qr" | "wifi" | "manual" | "offline_sync";
  offlineQueueKey?: string;
};

export type AttendanceClockOutPayload = AttendanceCapturePayload & {
  attendanceLogId?: string;
  source?: "gps" | "qr" | "wifi" | "manual" | "offline_sync";
};

export type AttendanceReviewPayload = {
  decision: "approved" | "rejected";
  note?: string;
};

export type MarkNotificationReadPayload = {
  notificationId?: string;
  all?: boolean;
};

export type StaffSessionHeartbeatPayload = {
  branchId?: string;
  sessionType?: "dashboard" | "mobile" | "kiosk" | "pwa";
  loginMethod?: "password" | "pin" | "recovery";
  deviceFingerprint: string;
  deviceName?: string;
  metadata?: Record<string, unknown>;
};

export type StaffSessionHeartbeatResult = {
  sessionId: string;
  attendanceSessionToken?: string;
  forcedLogout: boolean;
  forcedLogoutAt: string | null;
  lastSeenAt: string;
  deviceTrust?: {
    status: "trusted" | "known" | "needs_approval" | "blocked" | "missing" | "unavailable";
    deviceId: string | null;
    fingerprint: string | null;
    trustedForAttendance: boolean;
    restrictionActive: boolean;
    approvalRequired: boolean;
    blocked: boolean;
    message: string;
    flags: string[];
  };
};

export type StaffAttendanceQrTokenPayload = {
  branchId: string;
  expiresInMinutes?: number;
  mode?: "single_use" | "daily_branch";
};

export type StaffAttendanceQrTokenResult = {
  id: string;
  branchId: string;
  branchName: string;
  token: string;
  attendanceUrl: string;
  qrImageUrl: string;
  expiresAt: string;
  createdAt: string;
  mode?: "single_use" | "daily_branch";
  qrDate?: string | null;
};

export type StaffAttendanceWifiNetworkPayload = {
  branchId: string;
  label?: string;
};

export type StaffAttendanceWifiNetworkResult = {
  id: string;
  branchId: string;
  branchName: string;
  label: string;
  publicIpCidr: string;
  lastSeenIp: string;
  lastSeenAt: string;
  createdAt: string;
};

export type StaffSessionForceLogoutPayload = {
  sessionId?: string;
  staffMemberId?: string;
  reason?: string;
};

export type StaffMobileQuickAction = "accept_order" | "complete_order" | "confirm_payment" | "resolve_request";

export type StaffRequestCreatePayload = {
  requestType: "leave_request" | "shift_swap" | "overtime";
  staffMemberId?: string;
  branchId?: string;
  shiftAssignmentId?: string;
  targetStaffMemberId?: string;
  leaveType?: "paid" | "unpaid" | "sick" | "emergency" | "other";
  fromDate?: string;
  toDate?: string;
  overtimeMinutes?: number;
  reason?: string;
};

export type StaffSelfProfilePayload = {
  fullName: string;
  phone?: string;
  dateOfBirth?: string;
  hometown?: string;
};

export type StaffIncidentReportPayload = {
  staffMemberId: string;
  branchId?: string;
  title: string;
  description: string;
  severity?: "low" | "normal" | "high" | "urgent";
};

export type StaffSelfAvatarUploadResult = {
  avatarUrl: string;
};

async function parseOperationalResponse<T>(response: Response, fallback: string, options: { requireData?: boolean } = {}) {
  const payload = (await response.json().catch(() => null)) as AttendanceApiResponse<T> | null;
  const requireData = options.requireData ?? true;
  const requestSucceeded = payload?.success === true || payload?.ok === true;
  const hasData = payload && Object.prototype.hasOwnProperty.call(payload, "data") && payload.data !== null && payload.data !== undefined;

  if (!response.ok || !requestSucceeded || (requireData && !hasData)) {
    const firstError = Array.isArray(payload?.errors) ? payload.errors[0] : null;
    const message = typeof firstError === "string" ? firstError : payload?.message ?? payload?.error ?? fallback;
    throw new StaffOperationsApiError(message, {
      status: response.status
    });
  }

  return (hasData ? payload.data : null) as T;
}

async function postOperational<T>(url: string, payload: unknown, fallback: string, options: { requireData?: boolean } = {}) {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(payload)
    });
  } catch {
    throw new StaffOperationsApiError("Thiết bị đang mất kết nối. Đã sẵn sàng đưa thao tác vào hàng đợi offline.", {
      network: true
    });
  }

  return parseOperationalResponse<T>(response, fallback, options);
}

export async function fetchStaffOperationsBundle(scope: StaffOperationsBundleScope = "admin") {
  const url = scope === "self" ? "/api/admin/staff-operations?scope=self" : "/api/admin/staff-operations";
  const response = await fetch(url, {
    cache: "no-store"
  });

  const payload = (await response.json()) as StaffOperationsApiResponse;
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.errors?.[0] ?? payload.message ?? "Không thể tải staff operations.");
  }

  return payload.data;
}

export async function clockInAttendance(payload: AttendanceClockInPayload) {
  return postOperational("/api/admin/attendance/clock-in", payload, "Không thể chấm công.");
}

export async function clockOutAttendance(payload: AttendanceClockOutPayload) {
  return postOperational("/api/admin/attendance/clock-out", payload, "Không thể kết ca.");
}

export async function reviewAttendanceApproval(approvalId: string, payload: AttendanceReviewPayload) {
  return postOperational(`/api/admin/attendance/approvals/${approvalId}/review`, payload, "Không thể xử lý phê duyệt.");
}

export async function markStaffNotificationRead(payload: MarkNotificationReadPayload) {
  return postOperational("/api/admin/staff-operations/notifications/read", payload, "Không thể cập nhật thông báo.");
}

export async function sendStaffSessionHeartbeat(payload: StaffSessionHeartbeatPayload) {
  return postOperational<StaffSessionHeartbeatResult>("/api/admin/staff-operations/session/heartbeat", payload, "Không thể cập nhật hiện diện.");
}

export async function forceStaffSessionLogout(payload: StaffSessionForceLogoutPayload) {
  return postOperational("/api/admin/staff-operations/session/force-logout", payload, "Không thể buộc đăng xuất phiên nhân sự.");
}

export async function createStaffAttendanceQrToken(payload: StaffAttendanceQrTokenPayload) {
  return postOperational<StaffAttendanceQrTokenResult>("/api/admin/staff-operations/attendance-qr-tokens", payload, "Không thể tạo QR chấm công.");
}

export async function registerStaffAttendanceWifiNetwork(payload: StaffAttendanceWifiNetworkPayload) {
  return postOperational<StaffAttendanceWifiNetworkResult>("/api/admin/staff-operations/attendance-wifi-networks", payload, "Không thể lưu WiFi chấm công.");
}

export async function createStaffRequest(payload: StaffRequestCreatePayload) {
  return postOperational("/api/admin/staff-operations/requests", payload, "Không thể gửi yêu cầu nhân sự.");
}

export async function updateStaffSelfProfile(payload: StaffSelfProfilePayload) {
  return postOperational("/api/admin/staff-operations/profile", payload, "Không thể cập nhật hồ sơ nhân viên.");
}

export async function uploadStaffSelfAvatar(file: File) {
  const formData = new FormData();
  formData.append("avatar", file);

  let response: Response;
  try {
    response = await fetch("/api/admin/staff-operations/profile/avatar", {
      method: "POST",
      cache: "no-store",
      body: formData
    });
  } catch {
    throw new StaffOperationsApiError("Thiết bị đang mất kết nối. Vui lòng thử tải ảnh lại khi mạng ổn định.", { network: true });
  }

  return parseOperationalResponse<StaffSelfAvatarUploadResult>(response, "Không thể tải ảnh đại diện.");
}

export async function uploadStaffMemberAvatar(staffMemberId: string, file: File) {
  const formData = new FormData();
  formData.append("avatar", file);
  formData.append("staffMemberId", staffMemberId);

  let response: Response;
  try {
    response = await fetch("/api/admin/staff-operations/profile/avatar", {
      method: "POST",
      cache: "no-store",
      body: formData
    });
  } catch {
    throw new StaffOperationsApiError("Thiết bị đang mất kết nối. Vui lòng thử tải ảnh lại khi mạng ổn định.", { network: true });
  }

  return parseOperationalResponse<StaffSelfAvatarUploadResult>(response, "Không thể tải ảnh đại diện.");
}

export async function reportStaffIncident(payload: StaffIncidentReportPayload) {
  return postOperational("/api/admin/staff-operations/incidents", payload, "Không thể gửi báo cáo sự cố.");
}

export async function runStaffMobileQuickAction(action: StaffMobileQuickAction, targetId: string) {
  const endpoints: Record<StaffMobileQuickAction, string> = {
    accept_order: `/api/admin/orders/${targetId}/accept`,
    complete_order: `/api/admin/orders/${targetId}/complete`,
    confirm_payment: `/api/admin/orders/${targetId}/confirm-payment`,
    resolve_request: `/api/admin/service-requests/${targetId}/resolve`
  };

  return postOperational(endpoints[action], {}, "Không thể xử lý việc trong ca.", { requireData: false });
}
