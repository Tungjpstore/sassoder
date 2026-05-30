import type { StaffSessionHeartbeatResult } from "@/features/staff/api/client";
import type { StaffOpsAttendanceFeedItem } from "@/features/staff/types";
import { syncStatusText } from "./staff-mobile-utils";

export type StaffAttendanceAction = "clock_in" | "clock_out";
export type StaffAttendanceSource = "gps" | "qr" | "wifi";
export type StaffAttendanceMachineState =
  | "needs_branch"
  | "needs_location_or_qr"
  | "needs_device_trust"
  | "ready"
  | "processing"
  | "queued_offline"
  | "confirmed"
  | "blocked";

export type StaffReadinessItem = {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "neutral";
};

export type StaffAttendanceMachine = {
  state: StaffAttendanceMachineState;
  action: StaffAttendanceAction;
  source: StaffAttendanceSource;
  canSubmit: boolean;
  primaryLabel: string;
  shortSourceLabel: string;
  title: string;
  detail: string;
  recoveryLabel: string;
  readiness: StaffReadinessItem[];
};

function deviceTrustText(deviceTrust: StaffSessionHeartbeatResult["deviceTrust"] | null, hasFingerprint: boolean) {
  if (deviceTrust?.status === "trusted") return "Đã tin cậy";
  if (deviceTrust?.status === "known") return "Đã ghi nhận";
  if (deviceTrust?.status === "needs_approval") return "Cần duyệt";
  if (deviceTrust?.status === "blocked") return "Đang khoá";
  if (deviceTrust?.status === "unavailable") return "Chưa bật";
  return hasFingerprint ? "Đã nhận diện" : "Đang nhận";
}

export function buildStaffAttendanceMachine({
  activeAttendance,
  selectedBranchId,
  selectedBranchName,
  canUseGps,
  qrReady,
  deviceTrust,
  hasFingerprint,
  isOnline,
  queueLength,
  syncing,
  processing
}: {
  activeAttendance: StaffOpsAttendanceFeedItem | null;
  selectedBranchId: string;
  selectedBranchName: string;
  canUseGps: boolean;
  qrReady: boolean;
  deviceTrust: StaffSessionHeartbeatResult["deviceTrust"] | null;
  hasFingerprint: boolean;
  isOnline: boolean;
  queueLength: number;
  syncing: boolean;
  processing: boolean;
}): StaffAttendanceMachine {
  const action: StaffAttendanceAction = activeAttendance ? "clock_out" : "clock_in";
  const source: StaffAttendanceSource = qrReady ? "qr" : canUseGps ? "gps" : "wifi";
  const deviceBlocked = Boolean(deviceTrust?.blocked || deviceTrust?.status === "blocked");
  const deviceNeedsApproval = Boolean(deviceTrust?.approvalRequired && !deviceTrust.trustedForAttendance);
  const shortSourceLabel = qrReady ? "QR" : canUseGps ? "GPS" : "WiFi";
  const readiness: StaffReadinessItem[] = [
    {
      label: "Chi nhánh",
      value: selectedBranchId ? selectedBranchName : "Chưa chọn",
      tone: selectedBranchId ? "success" : "warning"
    },
    {
      label: "Nguồn chấm",
      value: qrReady ? "QR tại quán" : canUseGps ? "GPS" : "WiFi quán",
      tone: canUseGps || qrReady || isOnline ? "success" : "warning"
    },
    {
      label: "Thiết bị",
      value: deviceTrustText(deviceTrust, hasFingerprint),
      tone: deviceBlocked ? "danger" : deviceNeedsApproval ? "warning" : "success"
    },
    {
      label: "Đồng bộ",
      value: syncStatusText(queueLength, isOnline, syncing),
      tone: !isOnline || queueLength > 0 ? "warning" : "success"
    }
  ];

  if (processing) {
    return {
      state: "processing",
      action,
      source,
      canSubmit: false,
      primaryLabel: "Đang xử lý...",
      shortSourceLabel,
      title: action === "clock_in" ? "Đang check-in" : "Đang kết ca",
      detail: "LogiVN đang xác thực vị trí, thiết bị và ca làm.",
      recoveryLabel: "Vui lòng giữ màn hình mở",
      readiness
    };
  }

  if (!selectedBranchId) {
    return {
      state: "needs_branch",
      action,
      source,
      canSubmit: false,
      primaryLabel: "Chọn chi nhánh",
      shortSourceLabel,
      title: "Cần chọn chi nhánh",
      detail: "Chọn đúng chi nhánh đang làm trước khi chấm công.",
      recoveryLabel: "Chọn chi nhánh ở thanh dưới",
      readiness
    };
  }

  if (deviceBlocked || deviceNeedsApproval) {
    return {
      state: deviceBlocked ? "blocked" : "needs_device_trust",
      action,
      source,
      canSubmit: false,
      primaryLabel: "Thiết bị cần quản lý duyệt",
      shortSourceLabel,
      title: deviceBlocked ? "Thiết bị đang bị khoá" : "Cần duyệt thiết bị",
      detail: deviceTrust?.message || "Thiết bị này chưa được tin cậy để chấm công.",
      recoveryLabel: "Báo quản lý kiểm tra thiết bị",
      readiness
    };
  }

  if (!canUseGps && !qrReady && !isOnline) {
    return {
      state: "needs_location_or_qr",
      action,
      source,
      canSubmit: false,
      primaryLabel: "Cần mạng quán",
      shortSourceLabel,
      title: "Cần WiFi hoặc QR",
      detail: "Kết nối WiFi quán hoặc quét QR tại chi nhánh.",
      recoveryLabel: "Kết nối lại mạng quán",
      readiness
    };
  }

  if (queueLength > 0 && !isOnline) {
    return {
      state: "queued_offline",
      action,
      source,
      canSubmit: canUseGps,
      primaryLabel: activeAttendance ? "Check-out offline" : "Check-in offline",
      shortSourceLabel,
      title: "Đang có công chờ đồng bộ",
      detail: "Mạng yếu. Công đã lưu trên thiết bị sẽ được đẩy lại khi online.",
      recoveryLabel: "Không xoá dữ liệu trình duyệt trước khi đồng bộ",
      readiness
    };
  }

  return {
    state: activeAttendance ? "confirmed" : "ready",
    action,
    source,
    canSubmit: true,
    primaryLabel: activeAttendance ? "Kết ca" : "Vào ca",
    shortSourceLabel,
    title: activeAttendance ? "Đang trong ca" : "Vào ca",
    detail: activeAttendance ? "Bàn giao xong thì kết ca." : "Chọn đúng chi nhánh rồi bắt đầu.",
    recoveryLabel: activeAttendance ? "Kết ca cuối ca làm" : "Bấm để vào ca",
    readiness
  };
}
