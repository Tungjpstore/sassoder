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
  const [requestKind, setRequestKind] = useState<StaffMobileRequestKind>("leave_request");
  const [requestReason, setRequestReason] = useState("");
  const [requestFromDate, setRequestFromDate] = useState(() => todayInputValue());
  const [requestToDate, setRequestToDate] = useState(() => todayInputValue());
  const [requestLeaveType, setRequestLeaveType] = useState<NonNullable<StaffRequestCreatePayload["leaveType"]>>("unpaid");
  const [requestOvertimeMinutes, setRequestOvertimeMinutes] = useState(60);
  const [requestShiftAssignmentId, setRequestShiftAssignmentId] = useState("");
  const [requestTargetStaffMemberId, setRequestTargetStaffMemberId] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
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

  const refreshBundle = async () => {
    const next = await fetchStaffOperationsBundle("self");
    setBundle(next);
    const nextBranchId = next.members[0]?.primaryBranchId ?? next.branches[0]?.id ?? "";
    setSelectedBranchId((current) => current || nextBranchId);
  };

  const offlineQueue = useOfflineAttendanceQueue({
    restaurantId,
    userId,
    onSynced: refreshBundle
  });

  useEffect(() => {
    const fingerprint = getDeviceFingerprint();
    const sendHeartbeat = () => {
      void sendStaffSessionHeartbeat({
        branchId: selectedBranchId,
        sessionType: "mobile",
        loginMethod: "pin",
        deviceFingerprint: fingerprint,
        deviceName: navigator.userAgent.slice(0, 90),
        metadata: {
          screen: "staff_mobile"
        }
      }).catch(() => undefined);
    };

    sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, 60_000);
    return () => window.clearInterval(timer);
  }, [selectedBranchId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const runClockAction = (action: "clock_in" | "clock_out", source: "gps" | "qr") => {
    if (!staff) return;
    setMessage(null);
    startTransition(() => {
      void (async () => {
        const capturedAt = new Date().toISOString();
        let gps: GpsPoint | undefined;

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
              deviceInfo: {
                userAgent: navigator.userAgent,
                mode: "mobile_pwa"
              }
            });
            setMessage({ tone: "success", text: source === "gps" ? "Đã check-in bằng GPS." : "Đã check-in bằng QR fallback." });
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
              deviceInfo: {
                userAgent: navigator.userAgent,
                mode: "mobile_pwa"
              }
            });
            setMessage({ tone: "success", text: "Đã kết ca." });
          }

          await refreshBundle();
        } catch (error) {
          const canQueue = shouldQueueAttendanceOffline({
            error,
            isPremium: bundle.premium.gpsAttendance,
            isOnline: offlineQueue.isOnline
          });

          if (canQueue) {
            offlineQueue.enqueue({
              action,
              branchId: selectedBranchId,
              attendanceLogId: activeAttendance?.id,
              source,
              lat: gps?.lat,
              lng: gps?.lng,
              accuracyMeters: gps?.accuracyMeters,
              capturedAt,
              deviceInfo: {
                userAgent: navigator.userAgent,
                mode: "mobile_pwa"
              }
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
    const shiftAssignmentId = requestShiftAssignmentId || upcomingAssignments[0]?.id || "";
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
      if (!shiftAssignmentId) {
        setMessage({ tone: "warning", text: "Bạn chưa có ca sắp tới để xin đổi." });
        return;
      }
      payload.shiftAssignmentId = shiftAssignmentId;
      payload.targetStaffMemberId = requestTargetStaffMemberId || undefined;
    }

    if (requestKind === "overtime") {
      payload.fromDate = requestFromDate;
      payload.overtimeMinutes = requestOvertimeMinutes;
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

  const canUseGps = bundle.premium.gpsAttendance;
  const primaryAction = activeAttendance ? "clock_out" : "clock_in";
  const primarySource = canUseGps ? "gps" : "qr";

  return (
    <main className="stitch-admin min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="mx-auto flex min-h-screen w-full max-w-md flex-col px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        <header className="flex items-center justify-between gap-3 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-soft)]">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--primary)] text-sm font-black text-[#FFF7EB]">
              {initials(staff.fullName)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-black">{staff.fullName}</span>
              <span className="mt-0.5 block truncate text-xs font-bold text-[var(--muted-foreground)]">{restaurantName}</span>
            </span>
          </div>
          <a href="/auth/clear-session" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[var(--border)] bg-[var(--surface-container)] text-[var(--muted-foreground)]">
            <LogOut size={18} />
          </a>
        </header>

        <section className="mt-3 rounded-[28px] border border-[var(--border)] bg-[linear-gradient(135deg,#0F4D3A,#143F33_58%,#F28C28_132%)] p-4 text-[#FFF7EB] shadow-[var(--shadow-lift)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/60">Ca hiện tại</p>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.05em]">
                {activeAttendance ? "Đang trong ca" : "Sẵn sàng vào ca"}
              </h1>
            </div>
            <span className="rounded-full border border-white/20 bg-white/12 px-3 py-1 text-xs font-black">
              {offlineQueue.isOnline ? "Online" : "Offline"}
            </span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-white/18 bg-white/12 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/58">Check-in</p>
              <p className="mt-1 text-lg font-black">{formatTime(activeAttendance?.clockInAt ?? latestAttendance?.clockInAt)}</p>
            </div>
            <div className="rounded-2xl border border-white/18 bg-white/12 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/58">Thời lượng</p>
              <p className="mt-1 text-lg font-black">{activeAttendance ? activeDuration : "--"}</p>
            </div>
            <div className="rounded-2xl border border-white/18 bg-white/12 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/58">Trạng thái</p>
              <p className="mt-1 text-lg font-black">{attendanceStateLabel(activeAttendance?.state ?? latestAttendance?.state)}</p>
            </div>
            <div className="rounded-2xl border border-white/18 bg-white/12 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/58">Việc gấp</p>
              <p className="mt-1 text-lg font-black">{mobileOps.urgentCount}</p>
            </div>
          </div>
        </section>

        <section className="mt-3 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-soft)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black">Ca & chấm công</h2>
              <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">
                {todayAssignments.length ? `${todayAssignments.length} ca hôm nay` : "Chưa có ca hôm nay"} · {recentAttendance.length} lượt gần nhất
              </p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-black ${activeAttendance ? "border-[var(--primary)]/20 bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] bg-[var(--surface-container)] text-[var(--muted-foreground)]"}`}>
              {activeAttendance ? activeDuration : "Chưa vào ca"}
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            {upcomingAssignments.map((assignment) => (
              <div key={assignment.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-[var(--border)] pt-2 first:border-t-0 first:pt-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{assignment.shiftName}</p>
                  <p className="mt-0.5 truncate text-xs font-bold text-[var(--muted-foreground)]">{formatDate(assignment.scheduledDate)} · {assignment.branchName ?? staff.primaryBranchName ?? "Toàn quán"}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${shiftStatusTone(assignment.status)}`}>
                  {shiftStatusLabel(assignment.status)}
                </span>
              </div>
            ))}
            {!upcomingAssignments.length ? (
              <div className="flex items-center gap-3 border-t border-[var(--border)] pt-2 text-sm font-bold text-[var(--muted-foreground)]">
                <CheckCircle2 size={17} className="text-[var(--primary)]" />
                Chưa có ca sắp tới được gán.
              </div>
            ) : null}
          </div>
          {recentAttendance.length ? (
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-container)] p-2">
              {recentAttendance.map((item) => (
                <div key={item.id} className="min-w-0 text-center">
                  <p className="truncate text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted-foreground)]">{attendanceStateLabel(item.state)}</p>
                  <p className="mt-0.5 text-sm font-black">{formatTime(item.clockInAt)}</p>
                  <p className="mt-0.5 truncate text-[10px] font-bold text-[var(--muted-foreground)]">{item.branchName ?? "Toàn quán"}</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="mt-3 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-soft)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black">Yêu cầu cá nhân</h2>
              <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">
                {pendingRequestCount} yêu cầu đang chờ · nghỉ phép, đổi ca, tăng ca
              </p>
            </div>
            <span className="rounded-full border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-3 py-1 text-xs font-black text-[var(--accent-strong)]">
              Realtime
            </span>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {staffRequestKinds.map((item) => {
              const Icon = item.icon;
              const active = requestKind === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setRequestKind(item.key)}
                  className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl border px-2 text-[11px] font-black ${active ? "border-[var(--primary)] bg-[var(--primary)] text-[#FFF7EB]" : "border-[var(--border)] bg-[var(--surface-container)] text-[var(--foreground)]"}`}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-container)] p-2">
            {requestKind === "shift_swap" ? (
              <div className="grid gap-2">
                <label className="grid gap-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Ca muốn đổi</span>
                  <select value={requestShiftAssignmentId} onChange={(event) => setRequestShiftAssignmentId(event.target.value)} className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-black outline-none">
                    <option value="">Chọn ca sắp tới</option>
                    {upcomingAssignments.map((assignment) => (
                      <option key={assignment.id} value={assignment.id}>
                        {assignment.shiftName} · {formatDate(assignment.scheduledDate)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Người nhận ca</span>
                  <select value={requestTargetStaffMemberId} onChange={(event) => setRequestTargetStaffMemberId(event.target.value)} className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-black outline-none">
                    <option value="">Quản lý tự sắp xếp</option>
                    {shiftSwapCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.fullName} · {candidate.roleTitle}
                      </option>
                    ))}
                  </select>
                </label>
                {requestTargetStaffMemberId ? (
                  <div className="flex items-center gap-2 rounded-2xl border border-[var(--primary)]/20 bg-[var(--primary-soft)] px-3 py-2 text-xs font-bold text-[var(--primary)]">
                    <UserRound size={15} />
                    Ca sẽ chuyển sang người nhận nếu quản lý duyệt và không trùng lịch.
                  </div>
                ) : null}
              </div>
            ) : null}

            {requestKind === "leave_request" ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Từ ngày</span>
                  <input type="date" value={requestFromDate} onChange={(event) => setRequestFromDate(event.target.value)} className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-black outline-none" />
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Đến ngày</span>
                  <input type="date" value={requestToDate} onChange={(event) => setRequestToDate(event.target.value)} className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-black outline-none" />
                </label>
                <label className="col-span-2 grid gap-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Loại nghỉ</span>
                  <select value={requestLeaveType} onChange={(event) => setRequestLeaveType(event.target.value as typeof requestLeaveType)} className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-black outline-none">
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
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Ngày OT</span>
                  <input type="date" value={requestFromDate} onChange={(event) => setRequestFromDate(event.target.value)} className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-black outline-none" />
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Số phút</span>
                  <input type="number" min="15" max="720" step="15" value={requestOvertimeMinutes} onChange={(event) => setRequestOvertimeMinutes(Number(event.target.value) || 15)} className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-black outline-none" />
                </label>
              </div>
            ) : null}

            <textarea
              value={requestReason}
              onChange={(event) => setRequestReason(event.target.value)}
              rows={2}
              placeholder="Lý do ngắn gọn..."
              className="min-h-20 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-bold outline-none"
            />
            <button type="button" onClick={runRequestAction} disabled={submittingRequest} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-4 text-sm font-black text-[#FFF7EB] disabled:opacity-55">
              <Send size={16} />
              {submittingRequest ? "Đang gửi..." : `Gửi ${staffRequestLabel(requestKind).toLowerCase()}`}
            </button>
          </div>

          {recentRequests.length ? (
            <div className="mt-3 grid gap-2">
              {recentRequests.map((request) => (
                <div key={request.id} className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-container)] p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{staffRequestLabel(request.requestType)}</p>
                    <p className="mt-1 line-clamp-2 text-xs font-bold text-[var(--muted-foreground)]">{request.reason ?? "Yêu cầu đã gửi cho quản lý"}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black ${requestStatusTone(request.status)}`}>
                    {requestStatusLabel(request.status)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="staff-mobile-action-card sticky bottom-3 z-20 mt-3 grid gap-3 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-lift)] backdrop-blur">
          <label className="grid gap-1">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Chi nhánh</span>
            <select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)} className="h-12 rounded-2xl border px-3 text-sm font-black outline-none">
              {bundle.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-container)] p-2 text-center">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Nguồn</p>
              <p className="mt-0.5 text-sm font-black">{primarySource.toUpperCase()}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Ca</p>
              <p className="mt-0.5 text-sm font-black">{activeAttendance ? "Đang mở" : "Chưa vào"}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Offline</p>
              <p className="mt-0.5 text-sm font-black">{offlineQueue.queue.length}</p>
            </div>
          </div>

          {message ? (
            <div
              className={`rounded-2xl border px-3 py-2 text-sm font-bold ${
                message.tone === "success"
                  ? "border-[var(--primary)]/20 bg-[var(--primary-soft)] text-[var(--primary)]"
                  : message.tone === "neutral"
                    ? "border-[var(--border)] bg-[var(--surface-container)] text-[var(--muted-foreground)]"
                  : "border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent-strong)]"
              }`}
            >
              {message.text}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => runClockAction(primaryAction, primarySource)}
            disabled={isPending}
            className="flex min-h-16 items-center justify-center gap-2 rounded-[22px] bg-[var(--primary)] px-4 text-base font-black text-[#FFF7EB] shadow-[0_18px_34px_rgba(15,77,58,0.2)] disabled:opacity-55"
          >
            <MapPin size={20} />
            {isPending
              ? "Đang xử lý..."
              : canUseGps
                ? activeAttendance
                  ? "Check-out bằng GPS"
                  : "Check-in bằng GPS"
                : activeAttendance
                  ? "Check-out tại quán"
                  : "Check-in tại quán"}
          </button>
          <button
            type="button"
            onClick={() => runClockAction(primaryAction, "qr")}
            disabled={isPending}
            className="flex min-h-14 items-center justify-center gap-2 rounded-[20px] border border-[var(--border)] bg-[var(--surface-container)] px-4 text-sm font-black text-[var(--foreground)] disabled:opacity-55"
          >
            <Fingerprint size={18} />
            {activeAttendance ? "Check-out QR fallback" : "QR fallback tại quán"}
          </button>
          {!canUseGps ? (
            <p className="rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] p-3 text-xs font-bold text-[var(--accent-strong)]">
              GPS thuộc gói Premium. LogiVN vẫn cho nhân viên đủ điều kiện chấm công cơ bản tại quán.
            </p>
          ) : null}
        </section>

        <section className="mt-3 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-soft)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black">Việc cần làm trong ca</h2>
              <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">
                {mobileOps.pendingOrders} đơn mới · {mobileOps.cookingOrders} đang ra món · {mobileOps.waitingPayments} chờ tiền · {mobileOps.serviceRequests} gọi nhân viên
              </p>
            </div>
            <span className="rounded-full border border-[var(--primary)]/20 bg-[var(--primary-soft)] px-3 py-1 text-xs font-black text-[var(--primary)]">
              {sortedWorkItems.length} việc
            </span>
          </div>

          <div className="mt-3 grid gap-2">
            {sortedWorkItems.map((item) => {
              const Icon = workItemIcon(item.kind);
              const key = workItemKey(item);
              const isProcessing = processingWorkItemKey === key;
              return (
                <div key={key} className="rounded-[20px] border border-[var(--border)] bg-[var(--surface-container)] p-3">
                  <div className="flex items-start gap-3">
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border ${workItemTone(item.priority)}`}>
                      <Icon size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-1 text-sm font-black">{item.title}</p>
                        {item.tableName ? <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-black text-[var(--muted-foreground)]">{item.tableName}</span> : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs font-bold text-[var(--muted-foreground)]">
                        {priorityLabel(item.priority)} · {relativeTime(item.createdAt)} · {item.subtitle}
                      </p>
                    </div>
                  </div>
                  {item.action && item.actionLabel ? (
                    <button
                      type="button"
                      onClick={() => runWorkItemAction(item)}
                      disabled={isProcessing}
                      className="mt-3 flex min-h-11 w-full items-center justify-center rounded-2xl bg-[var(--primary)] px-4 text-sm font-black text-[#FFF7EB] disabled:opacity-55"
                    >
                      {isProcessing ? "Đang xử lý..." : item.actionLabel}
                    </button>
                  ) : null}
                </div>
              );
            })}
            {!sortedWorkItems.length ? (
              <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-container)] p-3 text-sm font-bold text-[var(--muted-foreground)]">
                <CheckCircle2 size={17} className="text-[var(--primary)]" />
                Ca hiện tại chưa có việc cần xử lý ngay.
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-3 grid grid-cols-2 gap-3">
          <InfoCard icon={CalendarClock} label="Ca hôm nay" value={todayAssignments[0]?.shiftName ?? "Chưa gán"} helper={todayAssignments[0] ? formatDate(todayAssignments[0].scheduledDate) : "Liên hệ quản lý"} />
          <InfoCard icon={Store} label="Vai trò" value={staff.roleTitle} helper={staff.primaryBranchName ?? "Chưa gán chi nhánh"} />
          <InfoCard icon={Clock3} label="Đi muộn" value={`${staff.lateMinutesToday}p`} helper={`Tăng ca ${minutesToText(staff.overtimeMinutesToday)}`} />
          <InfoCard icon={ShieldAlert} label="Rủi ro" value={`${staff.suspiciousScore}/100`} helper={staff.suspiciousScore >= 40 ? "Cần quản lý xem" : "Ổn định"} />
        </section>

        <section className="mt-3 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black">Hàng đợi offline</h2>
              <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">Tự đồng bộ khi mạng quay lại.</p>
            </div>
            <span className={`grid h-10 w-10 place-items-center rounded-2xl ${offlineQueue.isOnline ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "bg-[var(--accent-soft)] text-[var(--accent-strong)]"}`}>
              {offlineQueue.isOnline ? <Wifi size={18} /> : <WifiOff size={18} />}
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void offlineQueue.syncQueue({ force: true })}
              disabled={offlineQueue.syncing || offlineQueue.queue.length === 0}
              className="dashboard-secondary-action flex-1 disabled:opacity-50"
            >
              <RefreshCw size={15} />
              Đồng bộ
            </button>
            <button
              type="button"
              onClick={() =>
                startTransition(() => {
                  void refreshBundle();
                })
              }
              className="dashboard-secondary-action flex-1"
            >
              Làm mới
            </button>
          </div>
        </section>

        <section className="mt-3 grid gap-2 pb-28">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black">Thông báo</h2>
              <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">{unreadNotifications.length} chưa đọc · {bundle.notifications.length} tổng</p>
            </div>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-black text-[var(--muted-foreground)]">
              Realtime
            </span>
          </div>
          {visibleNotifications.map((notification) => (
            <div key={notification.id} className={`flex items-start gap-3 rounded-2xl border p-3 ${notification.status === "unread" ? "border-[var(--accent)]/25 bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--surface)]"}`}>
              <Bell className="mt-0.5 shrink-0 text-[var(--accent)]" size={17} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-black">{notification.title}</p>
                  <span className="shrink-0 text-[10px] font-black text-[var(--muted-foreground)]">{relativeTime(notification.createdAt)}</span>
                </div>
                {notification.body ? <p className="mt-1 line-clamp-2 text-xs font-semibold text-[var(--muted-foreground)]">{notification.body}</p> : null}
              </div>
            </div>
          ))}
          {!visibleNotifications.length ? (
            <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm font-bold text-[var(--muted-foreground)]">
              <CheckCircle2 size={17} className="text-[var(--primary)]" />
              Chưa có thông báo mới.
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
  helper
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[22px] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
          <Icon size={16} />
        </span>
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{label}</p>
      </div>
      <p className="mt-3 line-clamp-1 text-lg font-black tracking-tight">{value}</p>
      <p className="mt-1 line-clamp-1 text-xs font-bold text-[var(--muted-foreground)]">{helper}</p>
    </div>
  );
}
