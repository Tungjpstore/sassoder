"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChefHat,
  Clock3,
  CreditCard,
  Fingerprint,
  ListChecks,
  LogOut,
  MapPin,
  RefreshCw,
  Send,
  ShieldAlert,
  Store,
  UserRound,
  Wifi,
  WifiOff
} from "lucide-react";
import { shouldQueueAttendanceOffline, useOfflineAttendanceQueue } from "@/features/attendance/hooks/use-offline-attendance-queue";
import {
  clockInAttendance,
  clockOutAttendance,
  createStaffRequest,
  fetchStaffOperationsBundle,
  runStaffMobileQuickAction,
  sendStaffSessionHeartbeat
} from "@/features/staff/api/client";
import type { StaffRequestCreatePayload } from "@/features/staff/api/client";
import type { StaffSessionHeartbeatResult } from "@/features/staff/api/client";
import type { StaffOperationsBundle, StaffOpsApprovalItem, StaffOpsAttendanceFeedItem, StaffOpsMobileOps, StaffOpsMobileWorkItem, StaffOpsShiftAssignment } from "@/features/staff/types";

type StaffMobileWorkspaceProps = {
  initialBundle: StaffOperationsBundle;
  restaurantId: string;
  restaurantName: string;
  userId: string;
};

type GpsPoint = {
  lat: number;
  lng: number;
  accuracyMeters?: number;
};

function todayInputValue() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(value: string | null | undefined) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "NV";
  return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
}

function minutesToText(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} phút`;
  return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}

function durationBetween(startAt: string | null | undefined, endAt: string | null | undefined, nowMs: number) {
  if (!startAt) return "--";
  const endMs = endAt ? new Date(endAt).getTime() : nowMs;
  const minutes = Math.max(0, Math.round((endMs - new Date(startAt).getTime()) / 60_000));
  return minutesToText(minutes);
}

function relativeTime(value: string) {
  const diffMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (diffMinutes < 1) return "vừa xong";
  if (diffMinutes < 60) return `${diffMinutes}p trước`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}g trước`;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

function syncStatusText(queueLength: number, isOnline: boolean, syncing: boolean) {
  if (syncing) return "Đang đồng bộ";
  if (!isOnline) return "Mất kết nối";
  if (queueLength > 0) return "Chờ đồng bộ";
  return "Đã sẵn sàng";
}

function shiftStatusLabel(status: StaffOpsShiftAssignment["status"]) {
  if (status === "confirmed") return "Đã nhận";
  if (status === "completed") return "Hoàn tất";
  if (status === "swapped") return "Đổi ca";
  if (status === "cancelled") return "Đã huỷ";
  return "Đã xếp";
}

function shiftStatusTone(status: StaffOpsShiftAssignment["status"]) {
  if (status === "confirmed" || status === "completed") return "border-[var(--primary)]/20 bg-[var(--primary-soft)] text-[var(--primary)]";
  if (status === "swapped") return "border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent-strong)]";
  if (status === "cancelled") return "border-red-200 bg-red-50 text-red-700";
  return "border-[var(--border)] bg-[var(--surface-container)] text-[var(--muted-foreground)]";
}

function attendanceStateLabel(state: StaffOpsAttendanceFeedItem["state"] | null | undefined) {
  if (state === "on_time") return "Đúng giờ";
  if (state === "late") return "Đi muộn";
  if (state === "early_leave") return "Về sớm";
  if (state === "overtime") return "Tăng ca";
  if (state === "absent") return "Vắng";
  return "Chưa chấm";
}

function workItemKey(item: StaffOpsMobileWorkItem) {
  return `${item.kind}-${item.id}`;
}

function workItemTone(priority: StaffOpsMobileWorkItem["priority"]) {
  if (priority === "high") return "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent-strong)]";
  if (priority === "medium") return "border-[var(--primary)]/20 bg-[var(--primary-soft)] text-[var(--primary)]";
  return "border-[var(--border)] bg-[var(--surface-container)] text-[var(--muted-foreground)]";
}

function priorityLabel(priority: StaffOpsMobileWorkItem["priority"]) {
  if (priority === "high") return "Gấp";
  if (priority === "medium") return "Ưu tiên";
  return "Theo dõi";
}

function priorityRank(priority: StaffOpsMobileWorkItem["priority"]) {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  return 2;
}

type StaffMobileRequestKind = StaffRequestCreatePayload["requestType"];
type StaffMobileView = "shift" | "work" | "requests";

const staffRequestKinds: Array<{ key: StaffMobileRequestKind; label: string; icon: typeof CalendarClock }> = [
  { key: "leave_request", label: "Nghỉ phép", icon: CalendarClock },
  { key: "shift_swap", label: "Đổi ca", icon: RefreshCw },
  { key: "overtime", label: "Tăng ca", icon: Clock3 }
];

function staffRequestLabel(type: StaffOpsApprovalItem["requestType"] | StaffMobileRequestKind) {
  if (type === "leave_request") return "Nghỉ phép";
  if (type === "shift_swap") return "Đổi ca";
  if (type === "overtime") return "Tăng ca";
  if (type === "outside_location") return "Ngoài vị trí";
  if (type === "shift_override") return "Ca đột xuất";
  if (type === "attendance_edit") return "Sửa công";
  if (type === "device_restriction") return "Thiết bị";
  return "Chấm công";
}

function requestStatusLabel(status: StaffOpsApprovalItem["status"]) {
  if (status === "approved") return "Đã duyệt";
  if (status === "rejected") return "Từ chối";
  if (status === "cancelled") return "Đã huỷ";
  return "Chờ duyệt";
}

function requestStatusTone(status: StaffOpsApprovalItem["status"]) {
  if (status === "approved") return "border-[var(--primary)]/20 bg-[var(--primary-soft)] text-[var(--primary)]";
  if (status === "rejected" || status === "cancelled") return "border-red-200 bg-red-50 text-red-700";
  return "border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent-strong)]";
}

function workItemIcon(kind: StaffOpsMobileWorkItem["kind"]) {
  if (kind === "kitchen_order") return ChefHat;
  if (kind === "payment_waiting") return CreditCard;
  if (kind === "service_request") return Bell;
  return ListChecks;
}

function removeWorkItem(mobileOps: StaffOpsMobileOps, item: StaffOpsMobileWorkItem): StaffOpsMobileOps {
  const workItems = mobileOps.workItems.filter((current) => workItemKey(current) !== workItemKey(item));
  return {
    ...mobileOps,
    pendingOrders: Math.max(0, mobileOps.pendingOrders - (item.kind === "order_pending" ? 1 : 0)),
    cookingOrders: Math.max(0, mobileOps.cookingOrders - (item.kind === "kitchen_order" ? 1 : 0)),
    waitingPayments: Math.max(0, mobileOps.waitingPayments - (item.kind === "payment_waiting" ? 1 : 0)),
    serviceRequests: Math.max(0, mobileOps.serviceRequests - (item.kind === "service_request" ? 1 : 0)),
    urgentCount: workItems.filter((current) => current.priority === "high").length,
    workItems
  };
}

function getDeviceFingerprint() {
  const key = "logivn:staff-device-fingerprint:v1";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    const id = `staff-${randomId}`;
    window.localStorage.setItem(key, id);
    return id;
  } catch {
    return `staff-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function readGpsPosition(): Promise<GpsPoint> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Thiết bị không hỗ trợ GPS."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: Math.round(position.coords.accuracy)
        });
      },
      () => reject(new Error("Không lấy được vị trí GPS. Hãy bật quyền vị trí hoặc dùng QR fallback.")),
      {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 20_000
      }
    );
  });
}

function activeAttendanceForMember(bundle: StaffOperationsBundle, staffMemberId: string) {
  return bundle.attendanceFeed.find((item) => item.staffMemberId === staffMemberId && !item.clockOutAt) ?? null;
}

export function StaffMobileWorkspace({ initialBundle, restaurantId, restaurantName, userId }: StaffMobileWorkspaceProps) {
  const [bundle, setBundle] = useState(initialBundle);
  const [selectedBranchId, setSelectedBranchId] = useState(initialBundle.members[0]?.primaryBranchId ?? initialBundle.branches[0]?.id ?? "");
  const [message, setMessage] = useState<{ tone: "success" | "warning" | "neutral"; text: string } | null>(null);
  const [processingWorkItemKey, setProcessingWorkItemKey] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<StaffMobileView>("work");
  const [requestKind, setRequestKind] = useState<StaffMobileRequestKind>("leave_request");
  const [requestReason, setRequestReason] = useState("");
  const [requestFromDate, setRequestFromDate] = useState(() => todayInputValue());
  const [requestToDate, setRequestToDate] = useState(() => todayInputValue());
  const [requestLeaveType, setRequestLeaveType] = useState<NonNullable<StaffRequestCreatePayload["leaveType"]>>("unpaid");
  const [requestOvertimeMinutes, setRequestOvertimeMinutes] = useState(60);
  const [requestShiftAssignmentId, setRequestShiftAssignmentId] = useState("");
  const [requestTargetStaffMemberId, setRequestTargetStaffMemberId] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [qrToken, setQrToken] = useState("");
  const [deviceFingerprint, setDeviceFingerprint] = useState("");
  const [deviceTrust, setDeviceTrust] = useState<StaffSessionHeartbeatResult["deviceTrust"] | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date().toISOString());
  const [isPending, startTransition] = useTransition();
  const staff = bundle.members[0] ?? null;
  const today = todayInputValue();
  const activeAttendance = staff ? activeAttendanceForMember(bundle, staff.id) : null;
  const todayAssignments = useMemo(
    () => bundle.shiftAssignments.filter((assignment) => assignment.scheduledDate === today && assignment.status !== "cancelled" && (!staff || assignment.staffMemberId === staff.id)),
    [bundle.shiftAssignments, staff, today]
  );
  const latestAttendance = staff ? bundle.attendanceFeed.find((item) => item.staffMemberId === staff.id) ?? null : null;
  const mobileOps = bundle.mobileOps;
  const sortedWorkItems = [...mobileOps.workItems].sort(
    (left, right) => priorityRank(left.priority) - priorityRank(right.priority) || new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
  const recentAttendance = staff
    ? bundle.attendanceFeed
        .filter((item) => item.staffMemberId === staff.id)
        .sort((left, right) => new Date(right.clockInAt).getTime() - new Date(left.clockInAt).getTime())
        .slice(0, 3)
    : [];
  const upcomingAssignments = staff
    ? bundle.shiftAssignments
        .filter((assignment) => assignment.status !== "cancelled" && assignment.staffMemberId === staff.id && assignment.scheduledDate >= today)
        .sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate))
        .slice(0, 4)
    : [];
  const unreadNotifications = bundle.notifications.filter((notification) => notification.status === "unread");
  const visibleNotifications = unreadNotifications.length ? unreadNotifications.slice(0, 4) : bundle.notifications.slice(0, 4);
  const recentRequests = staff
    ? bundle.approvals
        .filter((approval) => approval.staffMemberId === staff.id && ["leave_request", "shift_swap", "overtime"].includes(approval.requestType))
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 3)
    : [];
  const pendingRequestCount = recentRequests.filter((request) => request.status === "pending").length;
  const shiftSwapCandidates = bundle.mobileOps.shiftSwapCandidates;
  const activeDuration = durationBetween(activeAttendance?.clockInAt, activeAttendance?.clockOutAt, nowMs);
  const canUseGps = bundle.premium.gpsAttendance;
  const primaryAction = activeAttendance ? "clock_out" : "clock_in";
  const primarySource = canUseGps ? "gps" : "qr";
  const leaveDateInvalid = requestKind === "leave_request" && requestToDate < requestFromDate;
  const normalizedOvertimeMinutes = clampNumber(requestOvertimeMinutes || 15, 15, 720);
  const selectedBranchName = bundle.branches.find((branch) => branch.id === selectedBranchId)?.name ?? staff?.primaryBranchName ?? "Chưa chọn";
  const requestShiftAssignmentIdForSubmit = requestShiftAssignmentId || upcomingAssignments[0]?.id || "";
  const requestBlockedReason =
    requestKind === "leave_request" && leaveDateInvalid
      ? "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu."
      : requestKind === "shift_swap" && !requestShiftAssignmentIdForSubmit
        ? "Bạn chưa có ca sắp tới để xin đổi."
        : requestKind === "overtime" && (requestOvertimeMinutes < 15 || requestOvertimeMinutes > 720)
          ? "OT hợp lệ từ 15 đến 720 phút."
          : null;
  const qrReady = Boolean(qrToken.trim());
  const deviceTrustLabel =
    deviceTrust?.status === "trusted"
      ? "Đã tin cậy"
      : deviceTrust?.status === "needs_approval"
        ? "Cần duyệt"
        : deviceTrust?.status === "blocked"
          ? "Đang khoá"
          : deviceTrust?.status === "unavailable"
            ? "Chưa bật"
            : deviceFingerprint
              ? "Đã ghi nhận"
              : "Đang nhận";
  const deviceTrustTone = deviceTrust?.status === "trusted" || deviceTrust?.status === "known" ? "ready" : deviceTrust?.status === "blocked" || deviceTrust?.status === "needs_approval" ? "warning" : "neutral";
  const canClock = Boolean(selectedBranchId) && !isPending && (primarySource !== "qr" || qrReady);
  const canUseQrClock = Boolean(selectedBranchId) && !isPending && qrReady;

  const refreshBundle = async () => {
    const next = await fetchStaffOperationsBundle("self");
    setBundle(next);
    setLastRefreshedAt(new Date().toISOString());
    const nextBranchId = next.members[0]?.primaryBranchId ?? next.branches[0]?.id ?? "";
    setSelectedBranchId((current) => current || nextBranchId);
  };

  const offlineQueue = useOfflineAttendanceQueue({
    restaurantId,
    userId,
    onSynced: refreshBundle
  });
  const readinessItems = [
    {
      label: "Chi nhánh",
      value: selectedBranchName,
      tone: selectedBranchId ? "ready" : "warning"
    },
    {
      label: "Nguồn",
      value: canUseGps ? "GPS Premium" : qrReady ? "QR đã quét" : "Cần QR",
      tone: canUseGps || qrReady ? "ready" : "warning"
    },
    {
      label: "Thiết bị",
      value: deviceTrustLabel,
      tone: deviceTrustTone
    },
    {
      label: "Kết nối",
      value: syncStatusText(offlineQueue.queue.length, offlineQueue.isOnline, offlineQueue.syncing),
      tone: !offlineQueue.isOnline || offlineQueue.queue.length > 0 ? "warning" : "ready"
    }
  ];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const fingerprint = getDeviceFingerprint();
      setDeviceFingerprint(fingerprint);

      const url = new URL(window.location.href);
      const nextQrToken = url.searchParams.get("qr")?.trim() ?? "";
      const nextBranchId = url.searchParams.get("branch")?.trim() ?? "";
      if (nextQrToken) {
        setQrToken(nextQrToken);
        setMessage({ tone: "success", text: "Đã nhận QR chấm công tại chi nhánh." });
      }
      if (nextBranchId) setSelectedBranchId(nextBranchId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!deviceFingerprint) return undefined;
    const sendHeartbeat = () => {
      void sendStaffSessionHeartbeat({
        branchId: selectedBranchId,
        sessionType: "mobile",
        loginMethod: "pin",
        deviceFingerprint,
        deviceName: navigator.userAgent.slice(0, 90),
        metadata: {
          screen: "staff_mobile"
        }
      })
        .then((result) => {
          if (result.deviceTrust) setDeviceTrust(result.deviceTrust);
          if (result.forcedLogout) setMessage({ tone: "warning", text: "Phiên thiết bị đã bị quản lý đăng xuất." });
        })
        .catch(() => undefined);
    };

    sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, 60_000);
    return () => window.clearInterval(timer);
  }, [deviceFingerprint, selectedBranchId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const runClockAction = (action: "clock_in" | "clock_out", source: "gps" | "qr") => {
    if (!staff) return;
    if (!selectedBranchId) {
      setMessage({ tone: "warning", text: "Bạn cần chọn chi nhánh trước khi chấm công." });
      return;
    }
    if (source === "qr" && !qrToken.trim()) {
      setMessage({ tone: "warning", text: "Bạn cần quét QR tại quán trước khi chấm công." });
      return;
    }
    setMessage(null);
    startTransition(() => {
      void (async () => {
        const capturedAt = new Date().toISOString();
        let gps: GpsPoint | undefined;
        const fingerprint = deviceFingerprint || getDeviceFingerprint();
        if (!deviceFingerprint) setDeviceFingerprint(fingerprint);
        const deviceInfo = {
          userAgent: navigator.userAgent,
          mode: "mobile_pwa",
          deviceFingerprint: fingerprint,
          deviceTrustStatus: deviceTrust?.status ?? null
        };

        try {
          if (source === "gps") {
            gps = await readGpsPosition();
          }

          if (action === "clock_in") {
            await clockInAttendance({
              staffMemberId: staff.id,
              branchId: selectedBranchId,
              source,
              capturedAt,
              lat: gps?.lat,
              lng: gps?.lng,
              accuracyMeters: gps?.accuracyMeters,
              qrToken: source === "qr" ? qrToken.trim() : undefined,
              deviceInfo
            });
            setMessage({ tone: "success", text: source === "gps" ? "Đã check-in bằng GPS." : "Đã check-in bằng QR tại quán." });
          } else {
            await clockOutAttendance({
              attendanceLogId: activeAttendance?.id,
              staffMemberId: staff.id,
              branchId: selectedBranchId,
              source,
              capturedAt,
              lat: gps?.lat,
              lng: gps?.lng,
              accuracyMeters: gps?.accuracyMeters,
              qrToken: source === "qr" ? qrToken.trim() : undefined,
              deviceInfo
            });
            setMessage({ tone: "success", text: "Đã kết ca." });
          }

          await refreshBundle();
        } catch (error) {
          const canQueue = shouldQueueAttendanceOffline({
            error,
            isPremium: bundle.premium.gpsAttendance,
            isOnline: offlineQueue.isOnline,
            source
          });

          if (canQueue && source === "gps") {
            offlineQueue.enqueue({
              action,
              branchId: selectedBranchId,
              attendanceLogId: activeAttendance?.id,
              source: "gps",
              lat: gps?.lat,
              lng: gps?.lng,
              accuracyMeters: gps?.accuracyMeters,
              capturedAt,
              deviceInfo
            });
            setMessage({ tone: "warning", text: "Mạng yếu. LogiVN đã đưa thao tác vào hàng đợi offline." });
            return;
          }

          setMessage({
            tone: "warning",
            text: error instanceof Error ? error.message : "Không thể xử lý chấm công lúc này."
          });
        }
      })();
    });
  };

  const runWorkItemAction = (item: StaffOpsMobileWorkItem) => {
    const action = item.action;
    if (!action) return;
    const key = workItemKey(item);
    const previousBundle = bundle;
    setProcessingWorkItemKey(key);
    setMessage({ tone: "neutral", text: `Đang xử lý: ${item.title}.` });
    setBundle((current) => ({
      ...current,
      mobileOps: removeWorkItem(current.mobileOps, item)
    }));

    void (async () => {
      try {
        await runStaffMobileQuickAction(action, item.id);
        setMessage({ tone: "success", text: `Đã xử lý: ${item.title}.` });
        await refreshBundle();
      } catch (error) {
        setBundle(previousBundle);
        setMessage({
          tone: "warning",
          text: error instanceof Error ? error.message : "Không thể xử lý việc trong ca."
        });
      } finally {
        setProcessingWorkItemKey(null);
      }
    })();
  };

  const runRequestAction = () => {
    if (!staff) return;
    const shiftAssignmentId = requestShiftAssignmentIdForSubmit;
    if (requestBlockedReason) {
      setMessage({ tone: "warning", text: requestBlockedReason });
      return;
    }
    const payload: StaffRequestCreatePayload = {
      requestType: requestKind,
      staffMemberId: staff.id,
      branchId: selectedBranchId,
      reason: requestReason.trim() || undefined
    };

    if (requestKind === "leave_request") {
      payload.leaveType = requestLeaveType;
      payload.fromDate = requestFromDate;
      payload.toDate = requestToDate;
    }

    if (requestKind === "shift_swap") {
      payload.shiftAssignmentId = shiftAssignmentId;
      payload.targetStaffMemberId = requestTargetStaffMemberId || undefined;
    }

    if (requestKind === "overtime") {
      payload.fromDate = requestFromDate;
      payload.overtimeMinutes = normalizedOvertimeMinutes;
    }

    setSubmittingRequest(true);
    setMessage({ tone: "neutral", text: "Đang gửi yêu cầu cho quản lý." });

    void (async () => {
      try {
        await createStaffRequest(payload);
        setMessage({ tone: "success", text: `Đã gửi yêu cầu ${staffRequestLabel(requestKind).toLowerCase()}.` });
        setRequestReason("");
        await refreshBundle();
      } catch (error) {
        setMessage({
          tone: "warning",
          text: error instanceof Error ? error.message : "Không thể gửi yêu cầu lúc này."
        });
      } finally {
        setSubmittingRequest(false);
      }
    })();
  };

  if (!staff) {
    return (
      <main className="stitch-admin min-h-screen bg-[var(--background)] p-4 text-[var(--foreground)]">
        <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-sm place-items-center rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-5 text-center shadow-[var(--shadow-soft)]">
          <div>
            <AlertTriangle className="mx-auto text-[var(--accent)]" />
            <h1 className="mt-3 text-xl font-black">Chưa có hồ sơ nhân sự</h1>
            <p className="mt-2 text-sm font-semibold text-[var(--muted-foreground)]">Vui lòng liên hệ quản lý để gán hồ sơ và chi nhánh.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="stitch-admin min-h-screen bg-[#EEF1EA] text-[#17201B]">
      <section className="mx-auto min-h-screen w-full max-w-md pb-[calc(11rem+env(safe-area-inset-bottom))]">
        <header className="sticky top-0 z-30 border-b border-[#D9DED4] bg-[#EEF1EA]/95 px-3 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur">
          <div className="flex min-h-12 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#13231E] text-sm font-black text-white">
                {initials(staff.fullName)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-black leading-5">{staff.fullName}</span>
                <span className="block truncate text-[11px] font-bold text-[#66736B]">{restaurantName}</span>
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  startTransition(() => {
                    void refreshBundle();
                  })
                }
                className="grid h-11 w-11 place-items-center rounded-lg border border-[#D9DED4] bg-white text-[#415049] active:scale-[0.98]"
                aria-label="Làm mới dữ liệu"
              >
                <RefreshCw size={17} className={isPending ? "animate-spin" : undefined} />
              </button>
              <a href="/auth/clear-session" className="grid h-11 w-11 place-items-center rounded-lg border border-[#D9DED4] bg-white text-[#415049]" aria-label="Đăng xuất">
                <LogOut size={17} />
              </a>
            </div>
          </div>

          <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg border border-[#D9DED4] bg-white p-1">
            {[
              { key: "shift" as const, label: "Ca", value: activeAttendance ? activeDuration : todayAssignments.length || "--", icon: Clock3 },
              { key: "work" as const, label: "Việc", value: sortedWorkItems.length, icon: ListChecks },
              { key: "requests" as const, label: "Yêu cầu", value: pendingRequestCount, icon: Send }
            ].map((item) => {
              const Icon = item.icon;
              const active = activeView === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveView(item.key)}
                  className={`grid min-h-11 grid-cols-[18px_minmax(0,1fr)] items-center gap-1 rounded-md px-2 text-left transition active:scale-[0.99] ${
                    active ? "bg-[#13231E] text-white" : "bg-transparent text-[#526058]"
                  }`}
                >
                  <Icon size={16} />
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-black">{item.label}</span>
                    <span className={`block truncate text-[10px] font-black ${active ? "text-white/68" : "text-[#7B877F]"}`}>{item.value}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </header>

        <section className="px-3 pt-2">
          <div className="rounded-lg border border-[#1B3029] bg-[#13231E] p-3 text-white shadow-[0_18px_42px_rgba(19,35,30,0.18)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/50">{selectedBranchName}</p>
                <h1 className="mt-1 text-[22px] font-black leading-none">
                  {activeAttendance ? "Đang làm" : "Chưa vào ca"}
                </h1>
              </div>
              <span className={`inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md border px-2.5 text-[11px] font-black ${
                offlineQueue.isOnline ? "border-[#86D99E]/30 bg-[#14382A] text-[#BDF4CC]" : "border-[#F6B06A]/40 bg-[#4D2F18] text-[#FFD7A8]"
              }`}>
                {offlineQueue.isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
                {offlineQueue.isOnline ? "Online" : "Offline"}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-[1.35fr_0.95fr] gap-2">
              <div className="rounded-md border border-white/10 bg-white/[0.07] p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/48">Thời lượng</p>
                <p className="mt-1 text-xl font-black leading-tight">{activeAttendance ? activeDuration : "--"}</p>
              </div>
              <div className="rounded-md border border-white/10 bg-white/[0.07] p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/48">Check-in</p>
                <p className="mt-1 text-xl font-black leading-tight">{formatTime(activeAttendance?.clockInAt ?? latestAttendance?.clockInAt)}</p>
              </div>
            </div>

            <div className="mt-2 hidden grid-cols-4 gap-1.5 sm:grid">
              {[
                { icon: CalendarClock, label: "Ca", value: todayAssignments[0]?.shiftName ?? "Trống", tone: "text-[#BDF4CC]" },
                { icon: Store, label: "Vai trò", value: staff.roleTitle, tone: "text-[#BFE0FF]" },
                { icon: Clock3, label: "Muộn", value: `${staff.lateMinutesToday}p`, tone: staff.lateMinutesToday ? "text-[#FFD7A8]" : "text-[#BDF4CC]" },
                { icon: ShieldAlert, label: "Risk", value: `${staff.suspiciousScore}`, tone: staff.suspiciousScore >= 40 ? "text-[#FFD7A8]" : "text-[#BDF4CC]" }
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="min-w-0 rounded-md border border-white/10 bg-white/[0.06] p-2">
                    <Icon size={14} className={item.tone} />
                    <p className="mt-1 truncate text-[9px] font-black uppercase tracking-[0.1em] text-white/46">{item.label}</p>
                    <p className="truncate text-[11px] font-black text-white">{item.value}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-2 hidden grid-cols-2 gap-1.5 sm:grid">
              {readinessItems.map((item) => (
                <div key={item.label} className="min-w-0 rounded-md border border-white/10 bg-white/[0.06] px-2 py-1.5">
                  <p className="truncate text-[9px] font-black uppercase tracking-[0.1em] text-white/45">{item.label}</p>
                  <p className={`truncate text-[11px] font-black ${
                    item.tone === "warning" ? "text-[#FFD7A8]" : item.tone === "ready" ? "text-[#BDF4CC]" : "text-white/72"
                  }`}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {message ? (
            <div
              className={`mt-2 rounded-lg border px-3 py-2 text-sm font-bold ${
                message.tone === "success"
                  ? "border-[#B8DDC0] bg-[#E8F5EC] text-[#0F5D3F]"
                  : message.tone === "neutral"
                    ? "border-[#D9DED4] bg-white text-[#526058]"
                    : "border-[#F0C38A] bg-[#FFF4E5] text-[#98530F]"
              }`}
            >
              {message.text}
            </div>
          ) : null}
        </section>

        {activeView === "shift" ? (
          <section className="grid gap-3 px-3 pt-3">
            <section className="rounded-lg border border-[#D9DED4] bg-white">
              <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[#E6E9E2] px-3">
                <h2 className="text-sm font-black">Lịch ca</h2>
                <span className="rounded-md bg-[#EEF1EA] px-2 py-1 text-[10px] font-black text-[#66736B]">{upcomingAssignments.length} ca</span>
              </div>
              <div className="divide-y divide-[#E6E9E2]">
                {upcomingAssignments.map((assignment) => (
                  <div key={assignment.id} className="grid min-h-[64px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-black">{assignment.shiftName}</p>
                      <p className="mt-0.5 truncate text-[12px] font-bold text-[#66736B]">{formatDate(assignment.scheduledDate)} · {assignment.branchName ?? staff.primaryBranchName ?? "Toàn quán"}</p>
                    </div>
                    <span className={`rounded-md border px-2 py-1 text-[10px] font-black ${shiftStatusTone(assignment.status)}`}>
                      {shiftStatusLabel(assignment.status)}
                    </span>
                  </div>
                ))}
                {!upcomingAssignments.length ? (
                  <div className="flex min-h-[64px] items-center gap-2 px-3 py-2 text-sm font-bold text-[#66736B]">
                    <CheckCircle2 size={17} className="text-[#0F6A45]" />
                    Chưa có ca sắp tới.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-lg border border-[#D9DED4] bg-white">
              <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[#E6E9E2] px-3">
                <h2 className="text-sm font-black">Chấm công gần đây</h2>
                <span className="rounded-md bg-[#EEF1EA] px-2 py-1 text-[10px] font-black text-[#66736B]">{attendanceStateLabel(activeAttendance?.state ?? latestAttendance?.state)}</span>
              </div>
              <div className="grid grid-cols-3 divide-x divide-[#E6E9E2]">
                {recentAttendance.map((item) => (
                  <div key={item.id} className="min-w-0 px-2 py-3 text-center">
                    <p className="truncate text-[10px] font-black uppercase tracking-[0.08em] text-[#66736B]">{attendanceStateLabel(item.state)}</p>
                    <p className="mt-1 text-[16px] font-black">{formatTime(item.clockInAt)}</p>
                    <p className="mt-0.5 truncate text-[10px] font-bold text-[#7B877F]">{item.branchName ?? "Toàn quán"}</p>
                  </div>
                ))}
                {!recentAttendance.length ? (
                  <div className="col-span-3 flex min-h-[72px] items-center gap-2 px-3 text-sm font-bold text-[#66736B]">
                    <Clock3 size={17} />
                    Chưa có lượt chấm công.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-lg border border-[#D9DED4] bg-white">
              <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[#E6E9E2] px-3">
                <h2 className="text-sm font-black">Thông báo</h2>
                <span className="rounded-md bg-[#FFF4E5] px-2 py-1 text-[10px] font-black text-[#98530F]">{unreadNotifications.length} mới</span>
              </div>
              <div className="divide-y divide-[#E6E9E2]">
                {visibleNotifications.map((notification) => (
                  <div key={notification.id} className={`flex min-h-[64px] items-start gap-2 px-3 py-2 ${notification.status === "unread" ? "bg-[#FFF9EF]" : ""}`}>
                    <Bell className="mt-0.5 shrink-0 text-[#C76A1B]" size={16} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[13px] font-black">{notification.title}</p>
                        <span className="shrink-0 text-[10px] font-black text-[#7B877F]">{relativeTime(notification.createdAt)}</span>
                      </div>
                      {notification.body ? <p className="mt-0.5 line-clamp-2 text-[12px] font-semibold text-[#66736B]">{notification.body}</p> : null}
                    </div>
                  </div>
                ))}
                {!visibleNotifications.length ? (
                  <div className="flex min-h-[64px] items-center gap-2 px-3 text-sm font-bold text-[#66736B]">
                    <CheckCircle2 size={17} className="text-[#0F6A45]" />
                    Chưa có thông báo mới.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-lg border border-[#D9DED4] bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black">Offline</h2>
                  <p className="mt-0.5 text-xs font-bold text-[#66736B]">{syncStatusText(offlineQueue.queue.length, offlineQueue.isOnline, offlineQueue.syncing)} · {offlineQueue.queue.length} hàng đợi</p>
                </div>
                <span className={`grid h-10 w-10 place-items-center rounded-lg ${offlineQueue.isOnline ? "bg-[#E8F5EC] text-[#0F6A45]" : "bg-[#FFF4E5] text-[#98530F]"}`}>
                  {offlineQueue.isOnline ? <Wifi size={18} /> : <WifiOff size={18} />}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void offlineQueue.syncQueue({ force: true })}
                  disabled={offlineQueue.syncing || offlineQueue.queue.length === 0}
                  className="min-h-11 rounded-lg border border-[#D9DED4] bg-[#EEF1EA] px-3 text-sm font-black text-[#17201B] disabled:opacity-50"
                >
                  Đồng bộ
                </button>
                <button
                  type="button"
                  onClick={() =>
                    startTransition(() => {
                      void refreshBundle();
                    })
                  }
                  className="min-h-11 rounded-lg border border-[#13231E] bg-white px-3 text-sm font-black text-[#13231E]"
                >
                  Làm mới
                </button>
              </div>
            </section>
          </section>
        ) : null}

        {activeView === "work" ? (
          <section className="grid gap-3 px-3 pt-3">
            <section className="grid grid-cols-4 gap-2">
              {[
                { label: "Đơn mới", value: mobileOps.pendingOrders, icon: ListChecks, tone: "bg-[#EEF4FF] text-[#1D4F91]" },
                { label: "Bếp", value: mobileOps.cookingOrders, icon: ChefHat, tone: "bg-[#F0F7EA] text-[#2F6B23]" },
                { label: "Tiền", value: mobileOps.waitingPayments, icon: CreditCard, tone: "bg-[#FFF4E5] text-[#98530F]" },
                { label: "Gọi", value: mobileOps.serviceRequests, icon: Bell, tone: "bg-[#FFF0F0] text-[#A43C32]" }
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-lg border border-[#D9DED4] bg-white p-2">
                    <span className={`grid h-8 w-8 place-items-center rounded-md ${item.tone}`}><Icon size={15} /></span>
                    <p className="mt-2 text-xl font-black leading-none">{item.value}</p>
                    <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.08em] text-[#66736B]">{item.label}</p>
                  </div>
                );
              })}
            </section>

            <section className="rounded-lg border border-[#D9DED4] bg-white">
              <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[#E6E9E2] px-3">
                <h2 className="text-sm font-black">Hàng việc</h2>
                <span className="rounded-md bg-[#FFF4E5] px-2 py-1 text-[10px] font-black text-[#98530F]">{mobileOps.urgentCount} gấp</span>
              </div>
              <div className="divide-y divide-[#E6E9E2]">
                {sortedWorkItems.map((item) => {
                  const Icon = workItemIcon(item.kind);
                  const key = workItemKey(item);
                  const isProcessing = processingWorkItemKey === key;
                  return (
                    <div key={key} className="px-3 py-3">
                      <div className="flex items-start gap-3">
                        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg border ${workItemTone(item.priority)}`}>
                          <Icon size={17} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-1 text-[14px] font-black">{item.title}</p>
                            {item.tableName ? <span className="shrink-0 rounded-md bg-[#EEF1EA] px-2 py-1 text-[10px] font-black text-[#526058]">{item.tableName}</span> : null}
                          </div>
                          <p className="mt-1 line-clamp-2 text-[12px] font-bold text-[#66736B]">
                            {priorityLabel(item.priority)} · {relativeTime(item.createdAt)} · {item.subtitle}
                          </p>
                        </div>
                      </div>
                      {item.action && item.actionLabel ? (
                        <button
                          type="button"
                          onClick={() => runWorkItemAction(item)}
                          disabled={isProcessing}
                          className="mt-3 min-h-11 w-full rounded-lg bg-[#13231E] px-4 text-sm font-black text-white disabled:opacity-55"
                        >
                          {isProcessing ? "Đang xử lý..." : item.actionLabel}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                {!sortedWorkItems.length ? (
                  <div className="flex min-h-[72px] items-center gap-2 px-3 text-sm font-bold text-[#66736B]">
                    <CheckCircle2 size={17} className="text-[#0F6A45]" />
                    Chưa có việc cần xử lý ngay.
                  </div>
                ) : null}
              </div>
            </section>
          </section>
        ) : null}

        {activeView === "requests" ? (
          <section className="grid gap-3 px-3 pt-3">
            <section className="rounded-lg border border-[#D9DED4] bg-white p-3">
              <div className="grid grid-cols-3 gap-2">
                {staffRequestKinds.map((item) => {
                  const Icon = item.icon;
                  const active = requestKind === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setRequestKind(item.key)}
                      className={`grid min-h-14 place-items-center gap-1 rounded-lg border px-2 text-[11px] font-black ${
                        active ? "border-[#13231E] bg-[#13231E] text-white" : "border-[#D9DED4] bg-[#EEF1EA] text-[#526058]"
                      }`}
                    >
                      <Icon size={16} />
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 grid gap-2">
                {requestKind === "shift_swap" ? (
                  <div className="grid gap-2">
                    <label className="grid gap-1">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#66736B]">Ca muốn đổi</span>
                      <select value={requestShiftAssignmentId} onChange={(event) => setRequestShiftAssignmentId(event.target.value)} className="h-12 rounded-lg border border-[#D9DED4] bg-white px-3 text-sm font-black outline-none">
                        <option value="">Chọn ca sắp tới</option>
                        {upcomingAssignments.map((assignment) => (
                          <option key={assignment.id} value={assignment.id}>
                            {assignment.shiftName} · {formatDate(assignment.scheduledDate)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#66736B]">Người nhận ca</span>
                      <select value={requestTargetStaffMemberId} onChange={(event) => setRequestTargetStaffMemberId(event.target.value)} className="h-12 rounded-lg border border-[#D9DED4] bg-white px-3 text-sm font-black outline-none">
                        <option value="">Quản lý tự sắp xếp</option>
                        {shiftSwapCandidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.fullName} · {candidate.roleTitle}
                          </option>
                        ))}
                      </select>
                    </label>
                    {requestTargetStaffMemberId ? (
                      <div className="flex items-center gap-2 rounded-lg border border-[#B8DDC0] bg-[#E8F5EC] px-3 py-2 text-xs font-bold text-[#0F5D3F]">
                        <UserRound size={15} />
                        Quản lý sẽ kiểm tra trùng lịch trước khi duyệt.
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {requestKind === "leave_request" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="grid gap-1">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#66736B]">Từ ngày</span>
                      <input type="date" value={requestFromDate} onChange={(event) => setRequestFromDate(event.target.value)} className="h-12 rounded-lg border border-[#D9DED4] bg-white px-3 text-sm font-black outline-none" />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#66736B]">Đến ngày</span>
                      <input type="date" value={requestToDate} onChange={(event) => setRequestToDate(event.target.value)} className="h-12 rounded-lg border border-[#D9DED4] bg-white px-3 text-sm font-black outline-none" />
                    </label>
                    <label className="col-span-2 grid gap-1">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#66736B]">Loại nghỉ</span>
                      <select value={requestLeaveType} onChange={(event) => setRequestLeaveType(event.target.value as typeof requestLeaveType)} className="h-12 rounded-lg border border-[#D9DED4] bg-white px-3 text-sm font-black outline-none">
                        <option value="unpaid">Nghỉ không lương</option>
                        <option value="paid">Nghỉ phép có lương</option>
                        <option value="sick">Nghỉ ốm</option>
                        <option value="emergency">Nghỉ gấp</option>
                        <option value="other">Khác</option>
                      </select>
                    </label>
                  </div>
                ) : null}

                {requestKind === "overtime" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="grid gap-1">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#66736B]">Ngày OT</span>
                      <input type="date" value={requestFromDate} onChange={(event) => setRequestFromDate(event.target.value)} className="h-12 rounded-lg border border-[#D9DED4] bg-white px-3 text-sm font-black outline-none" />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#66736B]">Số phút</span>
                      <input type="number" min="15" max="720" step="15" value={requestOvertimeMinutes} onChange={(event) => setRequestOvertimeMinutes(Number(event.target.value) || 15)} onBlur={() => setRequestOvertimeMinutes(normalizedOvertimeMinutes)} className="h-12 rounded-lg border border-[#D9DED4] bg-white px-3 text-sm font-black outline-none" />
                    </label>
                    <div className="col-span-2 grid grid-cols-4 gap-2">
                      {[30, 60, 90, 120].map((minutes) => (
                        <button
                          key={minutes}
                          type="button"
                          onClick={() => setRequestOvertimeMinutes(minutes)}
                          className={`min-h-11 rounded-lg border px-2 text-xs font-black ${requestOvertimeMinutes === minutes ? "border-[#13231E] bg-[#13231E] text-white" : "border-[#D9DED4] bg-[#EEF1EA] text-[#526058]"}`}
                        >
                          {minutes}p
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <textarea
                  value={requestReason}
                  onChange={(event) => setRequestReason(event.target.value)}
                  rows={2}
                  placeholder="Lý do ngắn gọn..."
                  className="min-h-20 rounded-lg border border-[#D9DED4] bg-white px-3 py-2 text-sm font-bold outline-none"
                />
                {requestBlockedReason ? (
                  <div className="rounded-lg border border-[#F0C38A] bg-[#FFF4E5] px-3 py-2 text-xs font-bold text-[#98530F]">
                    {requestBlockedReason}
                  </div>
                ) : null}
                <button type="button" onClick={runRequestAction} disabled={submittingRequest || Boolean(requestBlockedReason)} className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#13231E] px-4 text-sm font-black text-white disabled:opacity-55">
                  <Send size={16} />
                  {submittingRequest ? "Đang gửi..." : `Gửi ${staffRequestLabel(requestKind).toLowerCase()}`}
                </button>
              </div>
            </section>

            <section className="rounded-lg border border-[#D9DED4] bg-white">
              <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[#E6E9E2] px-3">
                <h2 className="text-sm font-black">Yêu cầu gần đây</h2>
                <span className="rounded-md bg-[#FFF4E5] px-2 py-1 text-[10px] font-black text-[#98530F]">{pendingRequestCount} chờ</span>
              </div>
              <div className="divide-y divide-[#E6E9E2]">
                {recentRequests.map((request) => (
                  <div key={request.id} className="flex min-h-[64px] items-start justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-black">{staffRequestLabel(request.requestType)}</p>
                      <p className="mt-0.5 line-clamp-2 text-[12px] font-bold text-[#66736B]">{request.reason ?? "Đã gửi cho quản lý"}</p>
                    </div>
                    <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-black ${requestStatusTone(request.status)}`}>
                      {requestStatusLabel(request.status)}
                    </span>
                  </div>
                ))}
                {!recentRequests.length ? (
                  <div className="flex min-h-[64px] items-center gap-2 px-3 text-sm font-bold text-[#66736B]">
                    <CheckCircle2 size={17} className="text-[#0F6A45]" />
                    Chưa có yêu cầu gần đây.
                  </div>
                ) : null}
              </div>
            </section>
          </section>
        ) : null}

        <section className="fixed inset-x-0 bottom-0 z-40 border-t border-[#C9D0C5] bg-white/96 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_44px_rgba(23,32,27,0.16)] backdrop-blur">
          <div className="mx-auto grid max-w-md gap-2">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <label className="min-w-0">
                <span className="sr-only">Chi nhánh</span>
                <select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)} className="h-12 w-full rounded-lg border border-[#D9DED4] bg-[#EEF1EA] px-3 text-sm font-black text-[#17201B] outline-none">
                  {!bundle.branches.length ? <option value="">Chưa có chi nhánh</option> : null}
                  {bundle.branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
              <span className={`inline-flex h-12 min-w-20 items-center justify-center rounded-lg border px-2 text-[10px] font-black ${
                offlineQueue.queue.length > 0 || !offlineQueue.isOnline ? "border-[#F0C38A] bg-[#FFF4E5] text-[#98530F]" : "border-[#B8DDC0] bg-[#E8F5EC] text-[#0F5D3F]"
              }`}>
                {readinessItems[3]?.value ?? "Sẵn sàng"}
              </span>
            </div>

            <button
              type="button"
              onClick={() => runClockAction(primaryAction, primarySource)}
              disabled={!canClock}
              className={`flex min-h-14 items-center justify-center gap-2 rounded-lg px-4 text-[15px] font-black text-white shadow-[0_12px_28px_rgba(19,35,30,0.22)] disabled:opacity-55 ${
                activeAttendance ? "bg-[#9A3412]" : "bg-[#13231E]"
              }`}
            >
              <MapPin size={19} />
              {isPending
                ? "Đang xử lý..."
                : canUseGps
                  ? activeAttendance
                    ? "Check-out GPS"
                    : "Check-in GPS"
                  : activeAttendance
                    ? "Check-out tại quán"
                    : "Check-in tại quán"}
            </button>
            <button
              type="button"
              onClick={() => runClockAction(primaryAction, "qr")}
              disabled={!canUseQrClock}
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[#D9DED4] bg-[#EEF1EA] px-4 text-sm font-black text-[#17201B] disabled:opacity-55"
            >
              <Fingerprint size={17} />
              {activeAttendance ? "Check-out QR" : "QR tại quán"}
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}
