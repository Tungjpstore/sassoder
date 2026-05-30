"use client";

import { useCallback, useEffect, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import {
  BarChart3,
  Bell,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Fingerprint,
  Grid2X2,
  ListChecks,
  LockKeyhole,
  MapPin,
  RefreshCw,
  Send,
  UserRound,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { shouldQueueAttendanceOffline, useOfflineAttendanceQueue } from "@/features/attendance/hooks/use-offline-attendance-queue";
import { buildStaffAttendanceMachine, type StaffAttendanceMachine } from "@/features/staff/components/mobile/staff-attendance-machine";
import {
  clockInAttendance,
  clockOutAttendance,
  createStaffRequest,
  fetchStaffOperationsBundle,
  markStaffNotificationRead,
  reportStaffIncident,
  runStaffMobileQuickAction,
  sendStaffSessionHeartbeat,
  updateStaffSelfProfile,
  type StaffIncidentReportPayload,
  type StaffSelfProfilePayload,
  type StaffRequestCreatePayload,
  type StaffSessionHeartbeatResult
} from "@/features/staff/api/client";
import { useStaffMobileRealtime } from "@/features/staff/components/mobile/use-staff-mobile-realtime";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import type { StaffOperationsBundle, StaffOpsApprovalItem, StaffOpsAttendanceFeedItem, StaffOpsMobileWorkItem, StaffOpsShiftAssignment } from "@/features/staff/types";
import { cn } from "@/lib/utils";

type StaffMobileRedesignWorkspaceProps = {
  initialBundle: StaffOperationsBundle;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  userId: string;
  enableHeartbeat?: boolean;
};

type StaffAppTab = "home" | "schedule" | "attendance" | "requests" | "reports";
type ClockSource = "gps" | "qr" | "wifi";

type GpsPoint = {
  lat: number;
  lng: number;
  accuracyMeters?: number;
};

type RequestDraft = {
  kind: "leave_request" | "shift_swap" | "overtime";
  reason: string;
  fromDate: string;
  toDate: string;
  overtimeMinutes: number;
  shiftAssignmentId: string;
  targetStaffMemberId: string;
};

type ProfileDraft = StaffSelfProfilePayload;

type IncidentDraft = {
  title: string;
  description: string;
  severity: NonNullable<StaffIncidentReportPayload["severity"]>;
  attachmentUrl: string;
};

const tabs: Array<{ key: StaffAppTab; label: string; icon: LucideIcon }> = [
  { key: "home", label: "Trang chủ", icon: Grid2X2 },
  { key: "schedule", label: "Lịch ca", icon: CalendarDays },
  { key: "attendance", label: "Chấm công", icon: Fingerprint },
  { key: "requests", label: "Yêu cầu", icon: ListChecks },
  { key: "reports", label: "Cá nhân", icon: UserRound }
];

function todayInputValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function normalizeTab(value: string | null): StaffAppTab {
  if (value === "schedule" || value === "attendance" || value === "requests" || value === "reports" || value === "home") return value;
  if (value === "today") return "attendance";
  if (value === "work") return "home";
  return "home";
}

function writeTabToUrl(tab: StaffAppTab) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  window.history.replaceState(null, "", url);
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
      () => reject(new Error("Không lấy được vị trí GPS. Hãy bật quyền vị trí hoặc dùng QR/WiFi tại quán.")),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 20_000 }
    );
  });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "NV";
  return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
}

function shortTime(value: string | null | undefined) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date(value));
}

function durationBetween(start: string | null | undefined, end: string | null | undefined, nowMs: number) {
  if (!start) return "0h";
  const endTime = end ? new Date(end).getTime() : nowMs;
  const diff = Math.max(0, endTime - new Date(start).getTime());
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest}p` : `${rest}p`;
}

function activeAttendanceForMember(bundle: StaffOperationsBundle, staffMemberId: string) {
  return bundle.attendanceFeed.find((item) => item.staffMemberId === staffMemberId && !item.clockOutAt) ?? null;
}

function requestTypeLabel(type: StaffOpsApprovalItem["requestType"] | RequestDraft["kind"]) {
  const map: Record<string, string> = {
    leave_request: "Nghỉ phép",
    shift_swap: "Đổi ca",
    overtime: "Tăng ca",
    outside_location: "Ngoài vị trí",
    attendance_edit: "Sửa công",
    shift_override: "Ghi đè ca",
    manual_clock_in: "Chấm hộ",
    device_restriction: "Thiết bị"
  };
  return map[type] ?? "Yêu cầu";
}

function priorityRank(priority: StaffOpsMobileWorkItem["priority"]) {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  return 2;
}

function initialRequestDraft(): RequestDraft {
  const today = todayInputValue();
  return {
    kind: "leave_request",
    reason: "",
    fromDate: today,
    toDate: today,
    overtimeMinutes: 60,
    shiftAssignmentId: "",
    targetStaffMemberId: ""
  };
}

function profileDraftFromStaff(staff: StaffOperationsBundle["members"][number] | null): ProfileDraft {
  return {
    fullName: staff?.fullName ?? "",
    phone: staff?.phone ?? "",
    dateOfBirth: staff?.dateOfBirth ?? "",
    hometown: staff?.hometown ?? "",
    avatarUrl: staff?.avatarUrl ?? ""
  };
}

function initialIncidentDraft(): IncidentDraft {
  return {
    title: "",
    description: "",
    severity: "normal",
    attachmentUrl: ""
  };
}

function weekDays() {
  const base = new Date();
  const day = base.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  base.setDate(base.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(base);
    current.setDate(base.getDate() + index);
    const iso = new Date(current.getTime() - current.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    return { iso, label: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][current.getDay()], day: current.getDate() };
  });
}

function ShellButton({ children, className, variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-black transition active:scale-[0.99] disabled:opacity-55",
        variant === "primary" && "bg-[#0F4D3A] text-white shadow-[0_10px_22px_rgba(15,77,58,0.18)]",
        variant === "secondary" && "border border-[#D8D1C7] bg-white text-[#2B2B2B]",
        variant === "ghost" && "bg-[#F0ECE6] text-[#4B4945]",
        variant === "danger" && "bg-[#FFF0D9] text-[#A33D10]",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function AppCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("staff-brand-panel", className)}>{children}</section>;
}

function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "success" | "danger" | "warning" | "neutral" }) {
  return <span className={cn("inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-bold", tone === "success" && "bg-[#DDF8E9] text-[#0F4D3A]", tone === "danger" && "bg-[#FFF0D9] text-[#A33D10]", tone === "warning" && "bg-[#FFF0D9] text-[#93540A]", tone === "neutral" && "bg-[#ECE9E3] text-[#595650]")}>{children}</span>;
}

export function StaffMobileRedesignWorkspace({ initialBundle, restaurantId, restaurantName, restaurantSlug, userId, enableHeartbeat = true }: StaffMobileRedesignWorkspaceProps) {
  const [bundle, setBundle] = useState(initialBundle);
  const [activeTab, setActiveTab] = useState<StaffAppTab>("home");
  const [selectedBranchId, setSelectedBranchId] = useState(initialBundle.members[0]?.primaryBranchId ?? initialBundle.branches[0]?.id ?? "");
  const [message, setMessage] = useState<{ tone: "success" | "warning" | "neutral"; text: string } | null>(null);
  const [qrToken, setQrToken] = useState("");
  const [deviceFingerprint, setDeviceFingerprint] = useState("");
  const [deviceTrust, setDeviceTrust] = useState<StaffSessionHeartbeatResult["deviceTrust"] | null>(null);
  const [nowMs, setNowMs] = useState(() => new Date(initialBundle.generatedAt).getTime());
  const [processingAttendance, setProcessingAttendance] = useState(false);
  const [processingWorkItemKey, setProcessingWorkItemKey] = useState<string | null>(null);
  const [requestDraft, setRequestDraft] = useState<RequestDraft>(initialRequestDraft);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(() => profileDraftFromStaff(initialBundle.members[0] ?? null));
  const [incidentDraft, setIncidentDraft] = useState<IncidentDraft>(initialIncidentDraft);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [submittingIncident, setSubmittingIncident] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [forcedLogout, setForcedLogout] = useState(false);

  const staff = bundle.members[0] ?? null;
  const today = todayInputValue();
  const activeAttendance = staff ? activeAttendanceForMember(bundle, staff.id) : null;
  const latestAttendance = staff ? bundle.attendanceFeed.find((item) => item.staffMemberId === staff.id) ?? null : null;
  const selectedBranchName = bundle.branches.find((branch) => branch.id === selectedBranchId)?.name ?? staff?.primaryBranchName ?? "Chi nhánh";

  const refreshBundle = useCallback(async () => {
    try {
      const next = await fetchStaffOperationsBundle("self");
      setBundle(next);
      setSelectedBranchId((current) => current || next.members[0]?.primaryBranchId || next.branches[0]?.id || "");
    } catch {
      setMessage({ tone: "warning", text: "Chưa thể làm mới dữ liệu. Vui lòng thử lại sau." });
    }
  }, []);

  useStaffMobileRealtime({ restaurantId, onRefresh: refreshBundle });

  const offlineQueue = useOfflineAttendanceQueue({ restaurantId, userId, onSynced: refreshBundle });
  const pendingOfflineClockIn = offlineQueue.queue.some((item) => item.action === "clock_in");
  const pendingOfflineClockOut = offlineQueue.queue.some((item) => item.action === "clock_out" && (!activeAttendance?.id || item.attendanceLogId === activeAttendance.id));
  const attendanceBlockedByOffline = pendingOfflineClockIn || pendingOfflineClockOut;
  const qrReady = Boolean(qrToken.trim());
  const attendanceMachine = useMemo(
    () => buildStaffAttendanceMachine({
      activeAttendance,
      selectedBranchId,
      selectedBranchName,
      canUseGps: bundle.premium.gpsAttendance,
      qrReady,
      deviceTrust,
      hasFingerprint: Boolean(deviceFingerprint),
      isOnline: offlineQueue.isOnline,
      queueLength: offlineQueue.queue.length,
      syncing: offlineQueue.syncing,
      processing: processingAttendance
    }),
    [activeAttendance, bundle.premium.gpsAttendance, deviceFingerprint, deviceTrust, offlineQueue.isOnline, offlineQueue.queue.length, offlineQueue.syncing, processingAttendance, qrReady, selectedBranchId, selectedBranchName]
  );

  const todayAssignments = useMemo(
    () => bundle.shiftAssignments.filter((assignment) => assignment.scheduledDate === today && assignment.status !== "cancelled" && (!staff || assignment.staffMemberId === staff.id)),
    [bundle.shiftAssignments, staff, today]
  );
  const upcomingAssignments = useMemo(
    () => (staff ? bundle.shiftAssignments.filter((assignment) => assignment.staffMemberId === staff.id && assignment.scheduledDate >= today && assignment.status !== "cancelled").sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)) : []),
    [bundle.shiftAssignments, staff, today]
  );
  const workItems = useMemo(() => [...bundle.mobileOps.workItems].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)), [bundle.mobileOps.workItems]);
  const recentRequests = useMemo(
    () => (staff ? bundle.approvals.filter((approval) => approval.staffMemberId === staff.id && ["leave_request", "shift_swap", "overtime"].includes(approval.requestType)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : []),
    [bundle.approvals, staff]
  );
  const recentAttendance = useMemo(
    () => (staff ? bundle.attendanceFeed.filter((item) => item.staffMemberId === staff.id).slice(0, 6) : []),
    [bundle.attendanceFeed, staff]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const fingerprint = getDeviceFingerprint();
      setMounted(true);
      setDeviceFingerprint(fingerprint);
      const url = new URL(window.location.href);
      setActiveTab(normalizeTab(url.searchParams.get("tab")));
      const nextQrToken = url.searchParams.get("qr")?.trim() ?? "";
      const nextBranchId = url.searchParams.get("branch")?.trim() ?? "";
      if (nextQrToken) {
        setQrToken(nextQrToken);
        setActiveTab("attendance");
        setMessage({ tone: "success", text: "Đã nhận QR chấm công tại quán." });
      }
      if (nextBranchId) setSelectedBranchId(nextBranchId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!deviceFingerprint || !enableHeartbeat) return undefined;
    const sendHeartbeat = () => {
      void sendStaffSessionHeartbeat({
        branchId: selectedBranchId,
        sessionType: "mobile",
        loginMethod: "password",
        deviceFingerprint,
        deviceName: navigator.userAgent.slice(0, 90),
        metadata: { screen: "staff_mobile_redesign" }
      })
        .then((result) => {
          if (result.deviceTrust) setDeviceTrust(result.deviceTrust);
          if (result.forcedLogout) {
            setForcedLogout(true);
            setMessage({ tone: "warning", text: "Phiên thiết bị đã bị quản lý đăng xuất." });
            const loginPath = `/staff/${restaurantSlug}/login?session=forced`;
            window.setTimeout(() => {
              window.location.assign(`/auth/clear-session?next=${encodeURIComponent(loginPath)}`);
            }, 900);
          }
        })
        .catch(() => undefined);
    };
    sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, 60_000);
    return () => window.clearInterval(timer);
  }, [deviceFingerprint, enableHeartbeat, restaurantSlug, selectedBranchId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function runClockAction(source: ClockSource) {
    if (!staff || processingAttendance) return;
    if (forcedLogout) {
      setMessage({ tone: "warning", text: "Phiên đã bị quản lý đăng xuất. Vui lòng đăng nhập lại." });
      return;
    }
    if (!selectedBranchId) {
      setMessage({ tone: "warning", text: "Bạn cần chọn chi nhánh trước khi chấm công." });
      return;
    }
    if (attendanceBlockedByOffline) {
      setMessage({ tone: "warning", text: pendingOfflineClockIn ? "Đang có check-in offline chờ đồng bộ. Hãy đồng bộ trước khi thao tác tiếp." : "Lần kết ca này đang chờ đồng bộ offline." });
      return;
    }
    if (source === "gps" && !bundle.premium.gpsAttendance) {
      setMessage({ tone: "warning", text: "Gói hiện tại chưa bật GPS. Vui lòng dùng QR hoặc WiFi tại quán." });
      return;
    }
    if (source === "qr" && !qrToken.trim()) {
      setMessage({ tone: "warning", text: "Bạn cần quét QR tại quán trước khi dùng chế độ QR." });
      return;
    }
    if (source === "wifi" && !offlineQueue.isOnline) {
      setMessage({ tone: "warning", text: "WiFi chấm công cần thiết bị đang online tại mạng quán." });
      return;
    }

    setMessage(null);
    setProcessingAttendance(true);
    const action = activeAttendance ? "clock_out" : "clock_in";
    const capturedAt = new Date().toISOString();
    let gps: GpsPoint | undefined;
    const fingerprint = deviceFingerprint || getDeviceFingerprint();
    if (!deviceFingerprint) setDeviceFingerprint(fingerprint);
    const deviceInfo = { mode: "staff_mobile_redesign", deviceFingerprint: fingerprint, deviceTrustStatus: deviceTrust?.status ?? null, userAgent: navigator.userAgent };

    try {
      if (source === "gps") gps = await readGpsPosition();
      if (action === "clock_in") {
        await clockInAttendance({ staffMemberId: staff.id, branchId: selectedBranchId, source, capturedAt, lat: gps?.lat, lng: gps?.lng, accuracyMeters: gps?.accuracyMeters, qrToken: source === "qr" ? qrToken.trim() : undefined, deviceInfo });
      } else {
        await clockOutAttendance({ attendanceLogId: activeAttendance?.id, staffMemberId: staff.id, branchId: selectedBranchId, source, capturedAt, lat: gps?.lat, lng: gps?.lng, accuracyMeters: gps?.accuracyMeters, qrToken: source === "qr" ? qrToken.trim() : undefined, deviceInfo });
      }
      setMessage({ tone: "success", text: action === "clock_in" ? "Đã check-in." : "Đã kết ca." });
      await refreshBundle();
    } catch (error) {
      const canQueue = shouldQueueAttendanceOffline({ error, isPremium: bundle.premium.gpsAttendance, isOnline: offlineQueue.isOnline, source });
      if (canQueue && source === "gps" && gps) {
        const queued = offlineQueue.enqueue({ action, branchId: selectedBranchId, attendanceLogId: activeAttendance?.id, source: "gps", lat: gps.lat, lng: gps.lng, accuracyMeters: gps.accuracyMeters, capturedAt, deviceInfo });
        setMessage({ tone: "warning", text: queued.error ?? "Mạng yếu. Thao tác đã được lưu vào hàng đợi offline." });
      } else {
        setMessage({ tone: "warning", text: error instanceof Error ? error.message : "Không thể xử lý chấm công lúc này." });
      }
    } finally {
      setProcessingAttendance(false);
    }
  }

  function runWorkItem(item: StaffOpsMobileWorkItem) {
    if (!item.action) return;
    if (forcedLogout) {
      setMessage({ tone: "warning", text: "Phiên đã bị quản lý đăng xuất. Vui lòng đăng nhập lại." });
      return;
    }
    setProcessingWorkItemKey(item.id);
    void (async () => {
      try {
        await runStaffMobileQuickAction(item.action!, item.id);
        setMessage({ tone: "success", text: `Đã xử lý: ${item.title}.` });
        await refreshBundle();
      } catch (error) {
        setMessage({ tone: "warning", text: error instanceof Error ? error.message : "Không thể xử lý việc trong ca." });
      } finally {
        setProcessingWorkItemKey(null);
      }
    })();
  }

  function submitRequest() {
    if (!staff) return;
    if (forcedLogout) {
      setMessage({ tone: "warning", text: "Phiên đã bị quản lý đăng xuất. Vui lòng đăng nhập lại." });
      return;
    }
    const payload: StaffRequestCreatePayload = { requestType: requestDraft.kind, staffMemberId: staff.id, branchId: selectedBranchId, reason: requestDraft.reason.trim() || undefined };
    if (requestDraft.kind === "leave_request") {
      payload.fromDate = requestDraft.fromDate;
      payload.toDate = requestDraft.toDate;
      payload.leaveType = "unpaid";
    }
    if (requestDraft.kind === "overtime") {
      payload.fromDate = requestDraft.fromDate;
      payload.overtimeMinutes = Math.max(15, Math.min(720, requestDraft.overtimeMinutes || 60));
    }
    if (requestDraft.kind === "shift_swap") {
      payload.shiftAssignmentId = requestDraft.shiftAssignmentId || upcomingAssignments[0]?.id;
      payload.targetStaffMemberId = requestDraft.targetStaffMemberId || undefined;
      if (!payload.shiftAssignmentId) {
        setMessage({ tone: "warning", text: "Bạn chưa có ca hợp lệ để gửi yêu cầu đổi ca." });
        return;
      }
    }
    if (payload.fromDate && payload.toDate && payload.toDate < payload.fromDate) {
      setMessage({ tone: "warning", text: "Ngày kết thúc phải sau ngày bắt đầu." });
      return;
    }
    setSubmittingRequest(true);
    void (async () => {
      try {
        await createStaffRequest(payload);
        setMessage({ tone: "success", text: `Đã gửi yêu cầu ${requestTypeLabel(requestDraft.kind).toLowerCase()}.` });
        setRequestDraft((current) => ({ ...current, reason: "" }));
        await refreshBundle();
      } catch (error) {
        setMessage({ tone: "warning", text: error instanceof Error ? error.message : "Không thể gửi yêu cầu." });
      } finally {
        setSubmittingRequest(false);
      }
    })();
  }

  function submitProfile() {
    if (!staff) return;
    if (forcedLogout) {
      setMessage({ tone: "warning", text: "Phiên đã bị quản lý đăng xuất. Vui lòng đăng nhập lại." });
      return;
    }
    if (!profileDraft.fullName.trim()) {
      setMessage({ tone: "warning", text: "Vui lòng nhập họ tên trước khi lưu hồ sơ." });
      return;
    }
    setSavingProfile(true);
    void (async () => {
      try {
        await updateStaffSelfProfile(profileDraft);
        setMessage({ tone: "success", text: "Đã cập nhật hồ sơ cá nhân." });
        await refreshBundle();
      } catch (error) {
        setMessage({ tone: "warning", text: error instanceof Error ? error.message : "Không thể cập nhật hồ sơ." });
      } finally {
        setSavingProfile(false);
      }
    })();
  }

  function submitIncident() {
    if (!staff) return;
    if (forcedLogout) {
      setMessage({ tone: "warning", text: "Phiên đã bị quản lý đăng xuất. Vui lòng đăng nhập lại." });
      return;
    }
    if (incidentDraft.title.trim().length < 2 || incidentDraft.description.trim().length < 5) {
      setMessage({ tone: "warning", text: "Vui lòng nhập tiêu đề và mô tả sự cố rõ hơn." });
      return;
    }
    setSubmittingIncident(true);
    void (async () => {
      try {
        await reportStaffIncident({
          staffMemberId: staff.id,
          branchId: selectedBranchId || undefined,
          title: incidentDraft.title,
          description: incidentDraft.description,
          severity: incidentDraft.severity,
          attachmentUrl: incidentDraft.attachmentUrl || undefined
        });
        setMessage({ tone: "success", text: "Đã gửi báo cáo sự cố cho quản lý." });
        setIncidentDraft(initialIncidentDraft());
        await refreshBundle();
      } catch (error) {
        setMessage({ tone: "warning", text: error instanceof Error ? error.message : "Không thể gửi báo cáo sự cố." });
      } finally {
        setSubmittingIncident(false);
      }
    })();
  }

  async function markNotificationsRead() {
    if (!bundle.unreadNotificationCount) {
      setMessage({ tone: "success", text: "Không có thông báo mới." });
      return;
    }
    try {
      await markStaffNotificationRead({ all: true });
      setMessage({ tone: "success", text: "Đã đánh dấu thông báo là đã đọc." });
      await refreshBundle();
    } catch (error) {
      setMessage({ tone: "warning", text: error instanceof Error ? error.message : "Không thể cập nhật thông báo." });
    }
  }

  if (!staff) {
    return (
      <main className="staff-brand-page staff-brand-page--mobile dashboard-density grid place-items-center p-5 text-[#2B2B2B]">
        <AppCard className="max-w-sm p-6 text-center"><LogiVNLogo priority className="mx-auto h-10 w-auto" /><UserRound className="mx-auto mt-5 text-[#0F4D3A]" /><h1 className="mt-3 text-2xl font-black">Chưa có hồ sơ nhân sự</h1><p className="mt-2 font-medium text-[#5E5A54]">Vui lòng liên hệ quản lý để gán hồ sơ và chi nhánh.</p></AppCard>
      </main>
    );
  }

  const activeDuration = durationBetween(activeAttendance?.clockInAt, activeAttendance?.clockOutAt, nowMs);
  const onTimeCount = bundle.attendanceFeed.filter((item) => item.state === "on_time" || item.state === "overtime").length;
  const lateCount = bundle.attendanceFeed.filter((item) => item.state === "late" || item.state === "absent").length;

  return (
    <main className="staff-brand-page staff-brand-page--mobile dashboard-density text-[#2B2B2B]">
      <header className="staff-brand-mobile-header sticky top-0 z-40 border-b px-5 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#E5EEE2] text-base font-black text-[#0F4D3A] ring-1 ring-[#D8D1C7]">{initials(staff.fullName)}</span>
            <div className="min-w-0">
              <LogiVNLogo priority className="h-8 w-auto" />
              <p className="mt-0.5 truncate text-sm font-bold text-[#5E5A54]">{restaurantName}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={markNotificationsRead} className="relative grid h-12 w-12 place-items-center rounded-full text-[#2B2B2B]" aria-label={bundle.unreadNotificationCount ? `Đánh dấu ${bundle.unreadNotificationCount} thông báo đã đọc` : "Thông báo"}><Bell size={28} />{bundle.unreadNotificationCount ? <span className="absolute right-3 top-2 h-3 w-3 rounded-full bg-[#A33D10]" /> : null}</button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-5 px-5 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-7 lg:grid-cols-[minmax(390px,460px)_minmax(0,1fr)] lg:pb-10">
        <div className="min-w-0 space-y-5">
          {message ? <MessageBar message={message} /> : null}
          {attendanceBlockedByOffline ? <MessageBar message={{ tone: "warning", text: pendingOfflineClockIn ? "Có check-in offline đang chờ đồng bộ." : "Có kết ca offline đang chờ đồng bộ." }} /> : null}
          {activeTab === "home" ? (
            <HomeTab
              staffName={staff.fullName}
              workItems={workItems}
              processingKey={processingWorkItemKey}
              onRunWorkItem={runWorkItem}
              currentShift={todayAssignments[0] ?? upcomingAssignments[0] ?? null}
              activeDuration={activeAttendance ? activeDuration : null}
              clockCard={
                <ClockControlCard
                  machine={attendanceMachine}
                  activeAttendance={activeAttendance}
                  latestAttendance={latestAttendance}
                  activeDuration={activeDuration}
                  selectedBranchId={selectedBranchId}
                  selectedBranchName={selectedBranchName}
                  branches={bundle.branches}
                  onBranchChange={setSelectedBranchId}
                  onClock={runClockAction}
                  processing={processingAttendance || forcedLogout || attendanceBlockedByOffline}
                  gpsEnabled={bundle.premium.gpsAttendance}
                  qrReady={qrReady}
                  online={offlineQueue.isOnline}
                  queueLength={offlineQueue.queue.length}
                  syncing={offlineQueue.syncing}
                  onSync={() => void offlineQueue.syncQueue({ force: true })}
                />
              }
            />
          ) : null}
          {activeTab === "schedule" ? <ScheduleTab assignments={upcomingAssignments} branchName={selectedBranchName} /> : null}
          {activeTab === "attendance" ? (
            <AttendanceTab
              clockCard={
                <ClockControlCard
                  machine={attendanceMachine}
                  activeAttendance={activeAttendance}
                  latestAttendance={latestAttendance}
                  activeDuration={activeDuration}
                  selectedBranchId={selectedBranchId}
                  selectedBranchName={selectedBranchName}
                  branches={bundle.branches}
                  onBranchChange={setSelectedBranchId}
                  onClock={runClockAction}
                  processing={processingAttendance || forcedLogout || attendanceBlockedByOffline}
                  gpsEnabled={bundle.premium.gpsAttendance}
                  qrReady={qrReady}
                  online={offlineQueue.isOnline}
                  queueLength={offlineQueue.queue.length}
                  syncing={offlineQueue.syncing}
                  onSync={() => void offlineQueue.syncQueue({ force: true })}
                />
              }
              recentAttendance={recentAttendance}
              onTimeCount={onTimeCount}
              lateCount={lateCount}
            />
          ) : null}
          {activeTab === "requests" ? <RequestsTab draft={requestDraft} onDraftChange={(patch) => setRequestDraft((current) => ({ ...current, ...patch }))} recentRequests={recentRequests} assignments={upcomingAssignments} onSubmit={submitRequest} submitting={submittingRequest} /> : null}
          {activeTab === "reports" ? <ProfileTab staff={staff} bundle={bundle} profileDraft={profileDraft} incidentDraft={incidentDraft} onProfileDraftChange={(patch) => setProfileDraft((current) => ({ ...current, ...patch }))} onIncidentDraftChange={(patch) => setIncidentDraft((current) => ({ ...current, ...patch }))} onSubmitProfile={submitProfile} onSubmitIncident={submitIncident} savingProfile={savingProfile} submittingIncident={submittingIncident} /> : null}
        </div>

        <aside className="hidden min-w-0 space-y-5 lg:block">
          <AppCard className="p-5"><p className="text-xs font-black uppercase tracking-[0.12em] text-[#5E5A54]">Đang hoạt động</p><h2 className="mt-2 text-2xl font-black text-[#2B2B2B]">{staff.fullName}</h2><p className="mt-1 text-sm font-semibold text-[#5E5A54]">{staff.roleTitle} · {selectedBranchName}</p><div className="mt-4 grid grid-cols-3 gap-2"><MiniStat label="Ca" value={todayAssignments.length || upcomingAssignments.length} /><MiniStat label="Việc" value={workItems.length} /><MiniStat label="Tin" value={bundle.unreadNotificationCount} /></div></AppCard>
          <AppCard className="p-5"><p className="text-xs font-black uppercase tracking-[0.12em] text-[#5E5A54]">Chấm công</p><div className="mt-3 flex items-center justify-between"><div><p className="text-xl font-black text-[#2B2B2B]">{activeAttendance ? "Đang trong ca" : "Chưa vào ca"}</p><p className="mt-1 text-xs font-semibold text-[#5E5A54]">{activeAttendance ? activeDuration : selectedBranchName}</p></div><StatusPill tone={activeAttendance ? "success" : "neutral"}>{mounted && offlineQueue.isOnline ? "Online" : "Offline"}</StatusPill></div></AppCard>
        </aside>
      </section>

      <nav className="staff-brand-bottom-nav fixed inset-x-0 bottom-0 z-50 grid h-[88px] grid-cols-5 border-t px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2" aria-label="Staff app navigation">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return <button key={tab.key} type="button" onClick={() => { setActiveTab(tab.key); writeTabToUrl(tab.key); }} className={cn("grid min-h-16 place-items-center rounded-xl text-xs font-semibold transition", active ? "text-[#0F4D3A]" : "text-[#3F3D39]")}><Icon size={27} strokeWidth={active ? 2.7 : 2.1} /><span className="mt-0.5 truncate">{tab.label}</span><span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-[#0F4D3A]" : "bg-transparent")} /></button>;
        })}
      </nav>
    </main>
  );
}

function MessageBar({ message }: { message: { tone: "success" | "warning" | "neutral"; text: string } }) {
  return <div className={cn("rounded-2xl border px-4 py-3 text-sm font-bold", message.tone === "success" && "border-[#0F4D3A]/20 bg-[#DDF8E9] text-[#0F4D3A]", message.tone === "warning" && "border-[#F28C28]/30 bg-[#FFF0D9] text-[#93540A]", message.tone === "neutral" && "border-[#D8D1C7] bg-white text-[#3F3D39]")}>{message.text}</div>;
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-xl bg-[#F5F8F1] p-3"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#5E5A54]">{label}</p><p className="mt-1 text-xl font-black text-[#2B2B2B]">{value}</p></div>;
}

function ClockControlCard({
  machine,
  activeAttendance,
  latestAttendance,
  activeDuration,
  selectedBranchId,
  selectedBranchName,
  branches,
  onBranchChange,
  onClock,
  processing,
  gpsEnabled,
  qrReady,
  online,
  queueLength,
  syncing,
  onSync
}: {
  machine: StaffAttendanceMachine;
  activeAttendance: StaffOpsAttendanceFeedItem | null;
  latestAttendance: StaffOpsAttendanceFeedItem | null;
  activeDuration: string;
  selectedBranchId: string;
  selectedBranchName: string;
  branches: StaffOperationsBundle["branches"];
  onBranchChange: (value: string) => void;
  onClock: (source: ClockSource) => void;
  processing: boolean;
  gpsEnabled: boolean;
  qrReady: boolean;
  online: boolean;
  queueLength: number;
  syncing: boolean;
  onSync: () => void;
}) {
  const PrimaryIcon = machine.source === "qr" ? Fingerprint : machine.source === "wifi" ? Wifi : MapPin;
  const stateTone = machine.state === "blocked" ? "danger" : machine.state.includes("needs") || machine.state === "queued_offline" ? "warning" : activeAttendance ? "success" : "neutral";
  const sourceDisabled = processing || !machine.canSubmit;

  return (
    <AppCard className="overflow-hidden p-0">
      <div className="bg-[#0F4D3A] p-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-white/70">Chấm công</p>
            <h2 className="mt-1 truncate text-xl font-black">{machine.title}</h2>
            <p className="mt-1 line-clamp-1 text-sm font-semibold text-white/78">{activeAttendance ? `${shortTime(activeAttendance.clockInAt)} · ${activeDuration}` : machine.detail}</p>
          </div>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/12 text-white">
            <PrimaryIcon size={22} aria-hidden="true" />
          </span>
        </div>
      </div>

      <div className="grid gap-3 p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <label className="min-w-0">
            <span className="sr-only">Chi nhánh chấm công</span>
            <select value={selectedBranchId} onChange={(event) => onBranchChange(event.target.value)} disabled={!branches.length} className="staff-redesign-input w-full">
              <option value="">Chưa có chi nhánh</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <StatusPill tone={stateTone}>{machine.shortSourceLabel}</StatusPill>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#F5F8F1] p-3 text-sm font-black text-[#2B2B2B]">
          <span>{shortTime(activeAttendance?.clockInAt ?? latestAttendance?.clockInAt)}</span>
          <span className="border-l border-[#D8D1C7] pl-3 text-right">{activeAttendance ? activeDuration : shortTime(latestAttendance?.clockOutAt)}</span>
        </div>

        <ShellButton disabled={sourceDisabled} onClick={() => onClock(machine.source)} className="min-h-14 w-full">
          <PrimaryIcon size={19} /> {processing ? "Đang xử lý..." : machine.primaryLabel}
        </ShellButton>

        <div className="grid grid-cols-3 gap-2">
          <ShellButton variant="secondary" disabled={sourceDisabled || !gpsEnabled} onClick={() => onClock("gps")} className="px-2 text-xs"><MapPin size={17} /> GPS</ShellButton>
          <ShellButton variant="secondary" disabled={sourceDisabled || !online} onClick={() => onClock("wifi")} className="px-2 text-xs"><Wifi size={17} /> WiFi</ShellButton>
          <ShellButton variant="secondary" disabled={sourceDisabled || !qrReady} onClick={() => onClock("qr")} className="px-2 text-xs"><Fingerprint size={17} /> QR</ShellButton>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#5E5A54]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F5F8F1] px-2.5 py-1.5">{online ? <Wifi size={14} /> : <WifiOff size={14} />} {online ? "Online" : "Offline"}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F5F8F1] px-2.5 py-1.5">{selectedBranchName}</span>
          {queueLength ? <button type="button" onClick={onSync} disabled={syncing} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[#D8D1C7] bg-white px-2.5 text-xs font-black text-[#0F4D3A] disabled:opacity-55"><RefreshCw size={14} className={syncing ? "animate-spin" : undefined} /> Đồng bộ {queueLength}</button> : null}
        </div>
      </div>
    </AppCard>
  );
}

function HomeTab({ staffName, workItems, processingKey, onRunWorkItem, currentShift, activeDuration, clockCard }: { staffName: string; workItems: StaffOpsMobileWorkItem[]; processingKey: string | null; onRunWorkItem: (item: StaffOpsMobileWorkItem) => void; currentShift: StaffOpsShiftAssignment | null; activeDuration: string | null; clockCard: ReactNode }) {
  return (
    <div className="space-y-4">
      <section className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#5E5A54]">Ca làm</p>
          <h1 className="mt-1 truncate text-2xl font-black leading-tight text-[#2B2B2B]">{staffName}</h1>
        </div>
        <StatusPill tone={activeDuration ? "success" : "neutral"}>{activeDuration ?? "Chưa vào"}</StatusPill>
      </section>

      {clockCard}

      <AppCard className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[#5E5A54]">Ca gần nhất</p>
            <h2 className="mt-2 truncate text-lg font-black text-[#2B2B2B]">{currentShift?.shiftName ?? "Chưa có ca"}</h2>
            <p className="mt-1 truncate text-sm font-semibold text-[#5E5A54]">{currentShift?.branchName ?? "Theo phân công"}</p>
          </div>
          <CalendarDays size={22} className="shrink-0 text-[#0F4D3A]" aria-hidden="true" />
        </div>
      </AppCard>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-black uppercase tracking-[0.12em] text-[#5E5A54]">Việc cần xử lý</h2>
          <StatusPill tone={workItems.length ? "warning" : "success"}>{workItems.length}</StatusPill>
        </div>
        {workItems.length ? workItems.map((item) => (
          <AppCard key={item.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-black text-[#2B2B2B]">{item.title}</p>
                <p className="mt-1 line-clamp-2 text-sm font-medium text-[#5E5A54]">{item.subtitle}</p>
              </div>
              <StatusPill tone={item.priority === "high" ? "danger" : item.priority === "medium" ? "warning" : "neutral"}>{item.priority === "high" ? "Gấp" : item.priority === "medium" ? "Vừa" : "Thấp"}</StatusPill>
            </div>
            {item.action ? <ShellButton onClick={() => onRunWorkItem(item)} disabled={processingKey === item.id} className="mt-4 w-full">{processingKey === item.id ? "Đang xử lý..." : item.actionLabel ?? "Xử lý"}</ShellButton> : null}
          </AppCard>
        )) : <AppCard className="grid min-h-28 place-items-center p-5 text-center"><div><Check className="mx-auto text-[#0F4D3A]" /><p className="mt-2 text-sm font-black">Không có việc đang chờ</p></div></AppCard>}
      </section>
    </div>
  );
}

function ScheduleTab({ assignments, branchName }: { assignments: StaffOpsShiftAssignment[]; branchName: string }) {
  const days = weekDays();
  const today = todayInputValue();
  const activeAssignments = assignments.filter((assignment) => assignment.status !== "cancelled");
  const groupDates = Array.from(new Set(activeAssignments.map((assignment) => assignment.scheduledDate))).sort((a, b) => a.localeCompare(b));
  const groups = groupDates.map((iso) => ({
    iso,
    assignments: activeAssignments.filter((assignment) => assignment.scheduledDate === iso)
  }));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3"><select className="h-11 min-w-0 flex-1 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm font-bold"><option>{branchName}</option></select><div className="flex shrink-0 items-center gap-2 text-xs font-black"><ChevronLeft size={16} />Tuần này<ChevronRight size={16} /></div></div>
      <div className="-mx-1 overflow-x-auto px-1"><div className="grid auto-cols-[48px] grid-flow-col gap-2">{days.map((day) => <button key={day.iso} type="button" className={cn("grid h-16 place-items-center rounded-xl border text-center", day.iso === today ? "border-[#0F4D3A] bg-[#0F4D3A] text-white" : "border-[#E5DDD2] bg-white text-[#2B2B2B]")}><span className="text-xs font-bold">{day.label}</span><span className="text-base font-black">{day.day}</span></button>)}</div></div>
      {groups.map((group) => <ShiftGroup key={group.iso} title={formatDate(group.iso)} assignments={group.assignments} />)}
      {!activeAssignments.length ? <AppCard className="grid min-h-40 place-items-center p-5 text-center"><p className="text-base font-black text-[#5E5A54]">Chưa có ca sắp tới</p></AppCard> : null}
    </div>
  );
}

function ShiftGroup({ title, assignments }: { title: string; assignments: StaffOpsShiftAssignment[] }) {
  return <section className="space-y-3"><div className="flex items-center gap-3"><Clock3 size={18} className="text-[#F28C28]" /><h2 className="text-xs font-black uppercase tracking-[0.08em] text-[#3F3D39]">{title}</h2><span className="h-px flex-1 bg-[#E5DDD2]" /></div>{assignments.map((assignment) => <AppCard key={assignment.id} className="p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-lg font-black text-[#2B2B2B]">{assignment.shiftName}</h3><p className="mt-1 text-sm font-semibold text-[#5E5A54]">{assignment.branchName ?? "Chi nhánh"}</p></div><StatusPill tone="success">Đã gán</StatusPill></div><div className="mt-4 border-t border-[#E5DDD2] pt-4"><p className="text-sm font-semibold text-[#2B2B2B]">{assignment.staffName}</p></div></AppCard>)}</section>;
}

function AttendanceTab({ clockCard, recentAttendance, onTimeCount, lateCount }: { clockCard: ReactNode; recentAttendance: StaffOpsAttendanceFeedItem[]; onTimeCount: number; lateCount: number }) {
  return (
    <div className="space-y-4">
      <section className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#5E5A54]">Hôm nay</p>
          <h1 className="mt-1 text-2xl font-black leading-tight text-[#2B2B2B]">Chấm công</h1>
        </div>
        <p className="text-right text-xs font-bold text-[#5E5A54]">{formatDate(todayInputValue())}</p>
      </section>

      {clockCard}

      <AppCard className="p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-black text-[#2B2B2B]">Lịch sử gần đây</h2>
          <div className="flex gap-2"><StatusPill tone="success">{onTimeCount} đúng</StatusPill><StatusPill tone={lateCount ? "warning" : "neutral"}>{lateCount} lệch</StatusPill></div>
        </div>
        <div className="mt-4 grid gap-2">
          {recentAttendance.map((item) => (
            <article key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-[#E5DDD2] bg-[#FFFDF8] p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[#2B2B2B]">{item.shiftName ?? "Ca làm"}</p>
                <p className="mt-1 text-xs font-semibold text-[#5E5A54]">{shortTime(item.clockInAt)} - {shortTime(item.clockOutAt)} · {item.branchName ?? "Chi nhánh"}</p>
              </div>
              <StatusPill tone={item.state === "late" || item.state === "early_leave" ? "warning" : item.state === "absent" ? "danger" : "success"}>{item.source.toUpperCase()}</StatusPill>
            </article>
          ))}
          {!recentAttendance.length ? <InlineEmptyState title="Chưa có công" text="Check-in bằng GPS, QR hoặc WiFi để tạo dữ liệu thật." /> : null}
        </div>
      </AppCard>
    </div>
  );
}

function RequestsTab({ draft, onDraftChange, recentRequests, assignments, onSubmit, submitting }: { draft: RequestDraft; onDraftChange: (patch: Partial<RequestDraft>) => void; recentRequests: StaffOpsApprovalItem[]; assignments: StaffOpsShiftAssignment[]; onSubmit: () => void; submitting: boolean }) {
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const visibleRequests = recentRequests.filter((request) => request.status === statusFilter);
  const cannotSubmitShiftSwap = draft.kind === "shift_swap" && !assignments.length;
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto">{(["pending", "approved", "rejected"] as const).map((status) => <button key={status} type="button" onClick={() => setStatusFilter(status)} className={cn("min-h-11 rounded-xl px-4 text-sm font-black", statusFilter === status ? "bg-[#0F4D3A] text-white" : "bg-[#ECE9E3] text-[#4B4945]")}>{status === "pending" ? "Chờ" : status === "approved" ? "Duyệt" : "Từ chối"}</button>)}</div>
      <AppCard className="p-4"><h1 className="text-xl font-black text-[#2B2B2B]">Tạo yêu cầu</h1><div className="mt-4 grid gap-3"><select value={draft.kind} onChange={(event) => onDraftChange({ kind: event.target.value as RequestDraft["kind"] })} className="staff-redesign-input"><option value="leave_request">Nghỉ phép</option><option value="shift_swap">Đổi ca</option><option value="overtime">Tăng ca</option></select>{draft.kind === "shift_swap" ? assignments.length ? <select value={draft.shiftAssignmentId || assignments[0]?.id || ""} onChange={(event) => onDraftChange({ shiftAssignmentId: event.target.value })} className="staff-redesign-input">{assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.shiftName} · {assignment.scheduledDate}</option>)}</select> : <InlineEmptyState title="Chưa có ca để đổi" text="Cần một ca thật đã được gán." /> : <div className="grid grid-cols-2 gap-3"><input type="date" value={draft.fromDate} onChange={(event) => onDraftChange({ fromDate: event.target.value })} className="staff-redesign-input" /><input type="date" value={draft.toDate} onChange={(event) => onDraftChange({ toDate: event.target.value })} className="staff-redesign-input" /></div>}{draft.kind === "overtime" ? <input type="number" value={draft.overtimeMinutes} onChange={(event) => onDraftChange({ overtimeMinutes: Number(event.target.value) })} className="staff-redesign-input" min={15} max={720} /> : null}<textarea value={draft.reason} onChange={(event) => onDraftChange({ reason: event.target.value })} className="min-h-24 rounded-xl border border-[#D8D1C7] bg-white p-4 text-sm font-semibold outline-none" placeholder="Lý do" /><ShellButton onClick={onSubmit} disabled={submitting || cannotSubmitShiftSwap}><Send size={18} /> {submitting ? "Đang gửi..." : `Gửi ${requestTypeLabel(draft.kind).toLowerCase()}`}</ShellButton></div></AppCard>
      <div className="space-y-3">{visibleRequests.map((request) => <AppCard key={request.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-base font-black text-[#2B2B2B]">{requestTypeLabel(request.requestType)}</p><p className="mt-1 line-clamp-2 text-sm font-medium text-[#5E5A54]">{request.reason ?? "Không có ghi chú"}</p></div><StatusPill tone={request.status === "approved" ? "success" : request.status === "rejected" ? "danger" : "neutral"}>{request.status === "pending" ? "Chờ" : request.status === "approved" ? "Duyệt" : "Từ chối"}</StatusPill></div></AppCard>)}{!visibleRequests.length ? <InlineEmptyState title="Không có yêu cầu" text="Dữ liệu sẽ xuất hiện sau khi gửi." /> : null}</div>
    </div>
  );
}

function ProfileTab({ staff, bundle, profileDraft, incidentDraft, onProfileDraftChange, onIncidentDraftChange, onSubmitProfile, onSubmitIncident, savingProfile, submittingIncident }: { staff: StaffOperationsBundle["members"][number]; bundle: StaffOperationsBundle; profileDraft: ProfileDraft; incidentDraft: IncidentDraft; onProfileDraftChange: (patch: Partial<ProfileDraft>) => void; onIncidentDraftChange: (patch: Partial<IncidentDraft>) => void; onSubmitProfile: () => void; onSubmitIncident: () => void; savingProfile: boolean; submittingIncident: boolean }) {
  const timesheet = bundle.timesheets.find((item) => item.staffMemberId === staff.id);
  const attendanceCount = timesheet?.attendanceCount ?? 0;
  const score = timesheet?.attendanceScore ?? 100;
  const overtime = timesheet?.overtimeMinutes ?? 0;
  const attendanceRows = bundle.attendanceFeed.filter((item) => item.staffMemberId === staff.id).slice(0, 7).reverse();
  const maxMinutes = Math.max(...attendanceRows.map(attendanceWorkMinutes), 1);
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-black text-[#2B2B2B]">Cá nhân</h1>
        <p className="mt-1 text-sm font-semibold text-[#3F3D39]">Hồ sơ, mật khẩu app, báo cáo sự cố và công cá nhân.</p>
      </section>

      <AppCard className="p-5">
        <div className="flex items-center gap-4">
          {staff.avatarUrl ? <img src={staff.avatarUrl} alt="" className="h-16 w-16 rounded-full border border-[#D8D1C7] object-cover" /> : <span className="grid h-16 w-16 place-items-center rounded-full bg-[#E5EEE2] text-lg font-black text-[#0F4D3A]">{initials(staff.fullName)}</span>}
          <div className="min-w-0">
            <p className="truncate text-xl font-black text-[#2B2B2B]">{staff.fullName}</p>
            <p className="mt-1 text-sm font-bold text-[#5E5A54]">{staff.employeeCode ?? "Chưa có mã"} · {staff.roleTitle}</p>
          </div>
        </div>
      </AppCard>

      <AppCard className="p-5">
        <h2 className="flex items-center gap-2 text-xl font-black"><UserRound size={20} /> Hồ sơ</h2>
        <div className="mt-4 grid gap-3">
          <input value={profileDraft.fullName} onChange={(event) => onProfileDraftChange({ fullName: event.target.value })} className="staff-redesign-input" placeholder="Họ tên" />
          <input value={profileDraft.phone ?? ""} onChange={(event) => onProfileDraftChange({ phone: event.target.value })} className="staff-redesign-input" placeholder="Số điện thoại" />
          <div className="grid grid-cols-2 gap-3"><input type="date" value={profileDraft.dateOfBirth ?? ""} onChange={(event) => onProfileDraftChange({ dateOfBirth: event.target.value })} className="staff-redesign-input" /><input value={profileDraft.hometown ?? ""} onChange={(event) => onProfileDraftChange({ hometown: event.target.value })} className="staff-redesign-input" placeholder="Quê quán" /></div>
          <label className="relative block"><Camera className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5E5A54]" size={18} /><input value={profileDraft.avatarUrl ?? ""} onChange={(event) => onProfileDraftChange({ avatarUrl: event.target.value })} className="staff-redesign-input pl-10" placeholder="Link ảnh đại diện" /></label>
          <ShellButton onClick={onSubmitProfile} disabled={savingProfile}><Check size={18} /> {savingProfile ? "Đang lưu..." : "Lưu hồ sơ"}</ShellButton>
          <ShellButton variant="secondary" onClick={() => { window.location.assign(`/staff/change-password?next=${encodeURIComponent("/dashboard/staff/mobile?tab=reports")}`); }}><LockKeyhole size={18} /> Đổi mật khẩu app</ShellButton>
        </div>
      </AppCard>

      <AppCard className="p-5">
        <h2 className="flex items-center gap-2 text-xl font-black"><Send size={20} /> Báo cáo sự cố</h2>
        <div className="mt-4 grid gap-3">
          <input value={incidentDraft.title} onChange={(event) => onIncidentDraftChange({ title: event.target.value })} className="staff-redesign-input" placeholder="Tiêu đề sự cố" />
          <select value={incidentDraft.severity} onChange={(event) => onIncidentDraftChange({ severity: event.target.value as IncidentDraft["severity"] })} className="staff-redesign-input"><option value="low">Thấp</option><option value="normal">Bình thường</option><option value="high">Cao</option><option value="urgent">Khẩn cấp</option></select>
          <textarea value={incidentDraft.description} onChange={(event) => onIncidentDraftChange({ description: event.target.value })} className="min-h-24 rounded-xl border border-[#D8D1C7] bg-white p-4 text-base font-semibold outline-none" placeholder="Mô tả để quản lý xử lý" />
          <input value={incidentDraft.attachmentUrl} onChange={(event) => onIncidentDraftChange({ attachmentUrl: event.target.value })} className="staff-redesign-input" placeholder="Link ảnh/tài liệu nếu có" />
          <ShellButton onClick={onSubmitIncident} disabled={submittingIncident}><Send size={18} /> {submittingIncident ? "Đang gửi..." : "Gửi cho quản lý"}</ShellButton>
        </div>
      </AppCard>

      <div className="grid grid-cols-2 gap-3"><AppCard className="p-4"><p className="text-xs font-black uppercase tracking-[0.12em] text-[#5E5A54]">Số ca</p><p className="mt-3 text-3xl font-black">{attendanceCount}</p></AppCard><AppCard className="p-4"><p className="text-xs font-black uppercase tracking-[0.12em] text-[#5E5A54]">Điểm công</p><p className="mt-3 text-3xl font-black">{score}</p></AppCard><AppCard className="p-4"><p className="text-xs font-black uppercase tracking-[0.12em] text-[#5E5A54]">Tăng ca</p><p className="mt-3 text-3xl font-black">{Math.round(overtime / 60)}h</p></AppCard><AppCard className="p-4"><p className="text-xs font-black uppercase tracking-[0.12em] text-[#5E5A54]">Yêu cầu</p><p className="mt-3 text-3xl font-black">{bundle.approvals.length}</p></AppCard></div>
      <AppCard className="p-5"><h2 className="flex items-center gap-2 text-xl font-black"><BarChart3 size={20} /> Giờ công gần đây</h2>{attendanceRows.length ? <div className="mt-6 flex h-44 items-end gap-3 border-b border-[#D8D1C7]">{attendanceRows.map((item) => { const minutes = attendanceWorkMinutes(item); return <span key={item.id} className="flex flex-1 flex-col items-center justify-end gap-2"><span className="w-full rounded-t-xl bg-[#0F4D3A]" style={{ height: `${Math.max(8, Math.round((minutes / maxMinutes) * 100))}%` }} /><span className="text-[11px] font-black text-[#5E5A54]">{new Date(item.clockInAt).getDate()}</span></span>; })}</div> : <InlineEmptyState title="Chưa có log công" text="Biểu đồ chỉ hiển thị khi có chấm công thật." />}</AppCard>
    </div>
  );
}

function attendanceWorkMinutes(item: StaffOperationsBundle["attendanceFeed"][number]) {
  if (!item.clockInAt || !item.clockOutAt) return 0;
  const diff = new Date(item.clockOutAt).getTime() - new Date(item.clockInAt).getTime();
  return Number.isFinite(diff) && diff > 0 ? Math.round(diff / 60_000) : 0;
}

function InlineEmptyState({ title, text }: { title: string; text: string }) {
  return <div className="mt-6 grid min-h-36 place-items-center rounded-xl border border-dashed border-[#D8D1C7] bg-[#FFFDF8] p-5 text-center"><div><p className="text-lg font-black text-[#2B2B2B]">{title}</p><p className="mt-1 text-sm font-semibold text-[#5E5A54]">{text}</p></div></div>;
}
