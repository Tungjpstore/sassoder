"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
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
  X,
  UserRound,
  Wallet,
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
  uploadStaffSelfAvatar,
  type StaffIncidentReportPayload,
  type StaffSelfProfilePayload,
  type StaffRequestCreatePayload,
  type StaffSessionHeartbeatResult
} from "@/features/staff/api/client";
import { useStaffMobileRealtime } from "@/features/staff/components/mobile/use-staff-mobile-realtime";
import { resolveStaffModules, type StaffModule, type StaffModuleId } from "@/features/staff/components/mobile/module-registry";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import type { StaffOperationsBundle, StaffOpsApprovalItem, StaffOpsAttendanceFeedItem, StaffOpsMobileOps, StaffOpsMobileWorkItem, StaffOpsShiftAssignment } from "@/features/staff/types";
import { cn } from "@/lib/utils";
import { summarizePayroll, DEFAULT_PAYROLL_DEDUCTIONS, type StaffPayrollDeductions, type StaffPayrollProfile } from "@/features/staff/services/staff-payroll-compute";

type StaffPayrollSelfView = {
  deductions: StaffPayrollDeductions;
  profile: StaffPayrollProfile | null;
};

type StaffMobileRedesignWorkspaceProps = {
  initialBundle: StaffOperationsBundle;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  userId: string;
  payrollSelf?: StaffPayrollSelfView | null;
  payrollDataError?: string | null;
  permissionDataError?: string | null;
  effectivePermissions?: string[];
  enableHeartbeat?: boolean;
};

type StaffAppTab = StaffModuleId;
type ClockSource = "gps" | "qr" | "wifi";

type GpsPoint = {
  lat: number;
  lng: number;
  accuracyMeters?: number;
};

const staffGpsMaxAccuracyMeters = 80;

type StaffQrScanPayload = {
  token: string;
  branchId: string | null;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>>;
};

type JsQrDecoder = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst" }
) => { data: string } | null;

let jsQrDecoderPromise: Promise<JsQrDecoder> | null = null;

function loadJsQrDecoder() {
  jsQrDecoderPromise ??= import("jsqr").then((module) => module.default as JsQrDecoder);
  return jsQrDecoderPromise;
}

async function decodeQrFromCanvasSource(source: CanvasImageSource, sourceWidth: number, sourceHeight: number) {
  if (typeof document === "undefined" || sourceWidth <= 0 || sourceHeight <= 0) return "";

  const maxSize = 760;
  const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "";
  context.drawImage(source, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const jsQr = await loadJsQrDecoder();
  return jsQr(imageData.data, width, height, { inversionAttempts: "attemptBoth" })?.data.trim() ?? "";
}

type RequestDraft = {
  kind: "leave_request" | "shift_swap" | "overtime";
  reason: string;
  fromDate: string;
  toDate: string;
  overtimeMinutes: number;
  shiftAssignmentId: string;
  targetStaffMemberId: string;
};

type ProfileDraft = StaffSelfProfilePayload & { avatarUrl?: string };

type IncidentDraft = {
  title: string;
  description: string;
  severity: NonNullable<StaffIncidentReportPayload["severity"]>;
};

const ROLE_MODULE_IDS: StaffModuleId[] = ["kitchen", "cashier", "service", "delivery", "accounting", "marketing", "ops"];

function isRoleModuleTab(tab: StaffAppTab): tab is "kitchen" | "cashier" | "service" | "delivery" | "accounting" | "marketing" | "ops" {
  return (ROLE_MODULE_IDS as string[]).includes(tab);
}

function todayInputValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function normalizeTab(value: string | null): StaffAppTab {
  const moduleIds: StaffAppTab[] = ["home", "kitchen", "cashier", "service", "delivery", "accounting", "marketing", "ops", "schedule", "requests", "inbox", "profile"];
  if (value && moduleIds.includes(value as StaffAppTab)) return value as StaffAppTab;
  if (value === "reports") return "profile";
  if (value === "attendance" || value === "today") return "home";
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
        const accuracyMeters = Math.round(position.coords.accuracy);
        if (!Number.isFinite(accuracyMeters) || accuracyMeters > staffGpsMaxAccuracyMeters) {
          reject(new Error(`GPS sai số ${Number.isFinite(accuracyMeters) ? `${accuracyMeters}m` : "quá cao"}. Hãy đứng thoáng hơn tại chi nhánh, bật định vị chính xác rồi thử lại.`));
          return;
        }

        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters
        });
      },
      () => reject(new Error("Không lấy được vị trí GPS. QR/WiFi vẫn cần GPS chính xác để chống chấm công từ xa.")),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }
    );
  });
}

function isPendingAttendanceResult(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const result = value as { approval?: unknown; attendance?: { approval_state?: string; approvalState?: string } };
  return Boolean(result.approval) || result.attendance?.approval_state === "pending" || result.attendance?.approvalState === "pending";
}

function normalizePlainText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseStaffQrScanValue(value: string): StaffQrScanPayload | null {
  const raw = value.trim();
  if (!raw) return null;

  const extractToken = (candidate: string | null | undefined) => {
    const token = candidate?.trim() ?? "";
    return /^stqr_[a-zA-Z0-9_-]{20,}$/.test(token) ? token : "";
  };

  try {
    const url = new URL(raw, window.location.origin);
    const token = extractToken(url.searchParams.get("qr") ?? url.searchParams.get("token"));
    if (token) {
      return {
        token,
        branchId: url.searchParams.get("branch")?.trim() || null
      };
    }
  } catch {
    // Raw QR token or copied text is handled below.
  }

  const directToken = extractToken(raw);
  if (directToken) return { token: directToken, branchId: null };

  const tokenMatch = raw.match(/stqr_[a-zA-Z0-9_-]{20,}/);
  if (tokenMatch?.[0]) return { token: tokenMatch[0], branchId: null };
  return null;
}

function clearStaffQrParamsFromUrl() {
  const url = new URL(window.location.href);
  const hadQrParams = url.searchParams.has("qr") || url.searchParams.has("branch");
  url.searchParams.delete("qr");
  url.searchParams.delete("branch");
  if (hadQrParams) window.history.replaceState(null, "", url);
}

function isQrAttendanceError(error: unknown) {
  const message = normalizePlainText(error instanceof Error ? error.message : String(error ?? ""));
  return message.includes("qr") || message.includes("ma qr") || message.includes("sai chi nhanh") || message.includes("het han") || message.includes("da duoc su dung");
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

function formatDateTime(value: string | null | undefined) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
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

function openAttendanceAgeHours(item: StaffOpsAttendanceFeedItem | null, nowMs: number) {
  if (!item?.clockInAt || item.clockOutAt) return 0;
  const diff = nowMs - new Date(item.clockInAt).getTime();
  return Number.isFinite(diff) && diff > 0 ? Math.floor(diff / 3_600_000) : 0;
}

function isStaleOpenAttendance(item: StaffOpsAttendanceFeedItem | null, nowMs: number) {
  return openAttendanceAgeHours(item, nowMs) >= 18;
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
    severity: "normal"
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

export function StaffMobileRedesignWorkspace({ initialBundle, restaurantId, restaurantName, restaurantSlug, userId, payrollSelf = null, payrollDataError = null, permissionDataError = null, effectivePermissions = [], enableHeartbeat = true }: StaffMobileRedesignWorkspaceProps) {
  const [bundle, setBundle] = useState(initialBundle);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<StaffAppTab>("home");
  const moduleNav = useMemo(() => resolveStaffModules(new Set(effectivePermissions)), [effectivePermissions]);
  const allowedModuleIds = useMemo(() => new Set(moduleNav.allowed.map((module) => module.id)), [moduleNav]);
  const resolvedTab: StaffAppTab = allowedModuleIds.has(activeTab) ? activeTab : "home";
  const [selectedBranchId, setSelectedBranchId] = useState(initialBundle.members[0]?.primaryBranchId ?? initialBundle.branches[0]?.id ?? "");
  const [message, setMessage] = useState<{ tone: "success" | "warning" | "neutral"; text: string } | null>(null);
  const [selectedClockSource, setSelectedClockSource] = useState<ClockSource>(initialBundle.premium.gpsAttendance ? "gps" : "wifi");
  const [qrToken, setQrToken] = useState("");
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [deviceFingerprint, setDeviceFingerprint] = useState("");
  const [attendanceSessionToken, setAttendanceSessionToken] = useState("");
  const [deviceTrust, setDeviceTrust] = useState<StaffSessionHeartbeatResult["deviceTrust"] | null>(null);
  const [nowMs, setNowMs] = useState(() => new Date(initialBundle.generatedAt).getTime());
  const [processingAttendance, setProcessingAttendance] = useState(false);
  const [processingWorkItemKey, setProcessingWorkItemKey] = useState<string | null>(null);
  const [requestDraft, setRequestDraft] = useState<RequestDraft>(initialRequestDraft);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(() => profileDraftFromStaff(initialBundle.members[0] ?? null));
  const [incidentDraft, setIncidentDraft] = useState<IncidentDraft>(initialIncidentDraft);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [submittingIncident, setSubmittingIncident] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [forcedLogout, setForcedLogout] = useState(false);

  const staff = bundle.members[0] ?? null;
  const today = todayInputValue();
  const activeAttendance = staff ? activeAttendanceForMember(bundle, staff.id) : null;
  const staleOpenAttendance = isStaleOpenAttendance(activeAttendance, nowMs);
  const latestAttendance = staff ? bundle.attendanceFeed.find((item) => item.staffMemberId === staff.id) ?? null : null;
  const selectedBranch = bundle.branches.find((branch) => branch.id === selectedBranchId) ?? null;
  const selectedBranchName = selectedBranch?.name ?? staff?.primaryBranchName ?? "Chi nhánh";

  const refreshBundle = useCallback(async () => {
    try {
      const next = await fetchStaffOperationsBundle("self");
      setBundle(next);
      setSelectedBranchId((current) => current || next.members[0]?.primaryBranchId || next.branches[0]?.id || "");
    } catch {
      setMessage({ tone: "warning", text: "Chưa thể làm mới dữ liệu. Vui lòng thử lại sau." });
    }
  }, []);

  // Realtime: làm mới bundle (client) + nạp lại server props (effectivePermissions) để
  // phân giải lại module khi admin đổi vai trò/quyền — Req 10.10.
  const handleRealtimeRefresh = useCallback(async () => {
    await refreshBundle();
    router.refresh();
  }, [refreshBundle, router]);

  useStaffMobileRealtime({ restaurantId, onRefresh: handleRealtimeRefresh });

  const offlineQueue = useOfflineAttendanceQueue({ restaurantId, userId, onSynced: refreshBundle });
  const pendingOfflineClockIn = offlineQueue.queue.some((item) => item.action === "clock_in");
  const pendingOfflineClockOut = offlineQueue.queue.some((item) => item.action === "clock_out" && (!activeAttendance?.id || item.attendanceLogId === activeAttendance.id));
  const attendanceBlockedByOffline = pendingOfflineClockIn || pendingOfflineClockOut;
  const qrReady = Boolean(qrToken.trim());
  const fallbackClockSource: ClockSource = bundle.premium.gpsAttendance ? "gps" : "wifi";
  const attendanceMachine = useMemo(
    () => buildStaffAttendanceMachine({
      activeAttendance,
      selectedBranchId,
      selectedBranchName,
      canUseGps: bundle.premium.gpsAttendance,
      selectedSource: selectedClockSource,
      qrReady,
      deviceTrust,
      hasFingerprint: Boolean(deviceFingerprint),
      isOnline: offlineQueue.isOnline,
      queueLength: offlineQueue.queue.length,
      syncing: offlineQueue.syncing,
      processing: processingAttendance
    }),
    [activeAttendance, bundle.premium.gpsAttendance, deviceFingerprint, deviceTrust, offlineQueue.isOnline, offlineQueue.queue.length, offlineQueue.syncing, processingAttendance, qrReady, selectedBranchId, selectedBranchName, selectedClockSource]
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

  const applyQrScanValue = useCallback((value: string) => {
    const parsed = parseStaffQrScanValue(value);
    if (!parsed) {
      setMessage({ tone: "warning", text: "Không đọc được mã QR chấm công. Hãy quét lại mã mới tại quán." });
      return false;
    }

    setQrToken(parsed.token);
    setSelectedClockSource("qr");
    setQrScannerOpen(false);
    setActiveTab("home");
    if (parsed.branchId) setSelectedBranchId(parsed.branchId);
    clearStaffQrParamsFromUrl();
    setMessage({ tone: "success", text: "Đã nhận QR chấm công. Bấm Vào ca/Kết ca để xác thực." });
    return true;
  }, []);

  function clearQrTokenAfterFailure() {
    setQrToken("");
    setSelectedClockSource(fallbackClockSource);
    clearStaffQrParamsFromUrl();
  }

  const refreshAttendanceSessionToken = useCallback(async (fingerprint: string) => {
    const result = await sendStaffSessionHeartbeat({
      branchId: selectedBranchId,
      sessionType: "mobile",
      loginMethod: "password",
      deviceFingerprint: fingerprint,
      deviceName: navigator.userAgent.slice(0, 90),
      metadata: { screen: "staff_mobile_redesign" }
    });
    if (result.deviceTrust) setDeviceTrust(result.deviceTrust);
    if (result.attendanceSessionToken) setAttendanceSessionToken(result.attendanceSessionToken);
    if (result.forcedLogout) {
      setForcedLogout(true);
      setMessage({ tone: "warning", text: "Phiên thiết bị đã bị quản lý đăng xuất." });
      const loginPath = `/staff/${restaurantSlug}/login?session=forced`;
      window.setTimeout(() => {
        window.location.assign(`/auth/clear-session?next=${encodeURIComponent(loginPath)}`);
      }, 900);
    }
    return result.attendanceSessionToken ?? "";
  }, [restaurantSlug, selectedBranchId]);

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
        applyQrScanValue(window.location.href);
      } else if (nextBranchId) {
        setSelectedBranchId(nextBranchId);
        clearStaffQrParamsFromUrl();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [applyQrScanValue]);

  useEffect(() => {
    if (!deviceFingerprint || !enableHeartbeat) return undefined;
    const sendHeartbeat = () => {
      void refreshAttendanceSessionToken(deviceFingerprint)
        .catch(() => undefined);
    };
    sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, 60_000);
    return () => window.clearInterval(timer);
  }, [deviceFingerprint, enableHeartbeat, refreshAttendanceSessionToken]);

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
      setMessage({ tone: "warning", text: "Gói hiện tại chưa bật GPS độc lập. QR/WiFi vẫn cần vị trí chính xác tại quán để chống chấm công từ xa." });
      return;
    }
    if (!selectedBranch?.attendanceLocationConfigured) {
      setMessage({ tone: "warning", text: "Chi nhánh chưa có toạ độ GPS nên chưa thể xác minh chấm công chống gian lận. Vui lòng báo quản lý cập nhật vị trí chi nhánh." });
      return;
    }
    if (source === "qr" && !qrToken.trim()) {
      setSelectedClockSource("qr");
      setQrScannerOpen(true);
      setMessage({ tone: "warning", text: "Mở khung quét QR để lấy mã mới tại đúng chi nhánh." });
      return;
    }
    if (source === "wifi" && !offlineQueue.isOnline) {
      setMessage({ tone: "warning", text: "WiFi chấm công cần thiết bị online bằng mạng quán đã lưu và vẫn phải có GPS chính xác." });
      return;
    }

    setMessage(null);
    setProcessingAttendance(true);
    const action = activeAttendance ? "clock_out" : "clock_in";
    const capturedAt = new Date().toISOString();
    let gps: GpsPoint | undefined;
    let deviceInfo: Record<string, unknown> | undefined;
    const fingerprint = deviceFingerprint || getDeviceFingerprint();
    if (!deviceFingerprint) setDeviceFingerprint(fingerprint);

    try {
      const sessionToken = attendanceSessionToken || await refreshAttendanceSessionToken(fingerprint);
      if (!sessionToken) throw new Error("Phiên thiết bị chưa sẵn sàng. Vui lòng chờ vài giây rồi thử lại.");
      deviceInfo = { mode: "staff_mobile_redesign", deviceFingerprint: fingerprint, attendanceSessionToken: sessionToken, deviceTrustStatus: deviceTrust?.status ?? null, userAgent: navigator.userAgent };
      gps = await readGpsPosition();
      const result = action === "clock_in"
        ? await clockInAttendance({ staffMemberId: staff.id, branchId: selectedBranchId, source, capturedAt, lat: gps?.lat, lng: gps?.lng, accuracyMeters: gps?.accuracyMeters, qrToken: source === "qr" ? qrToken.trim() : undefined, deviceInfo })
        : await clockOutAttendance({ attendanceLogId: activeAttendance?.id, staffMemberId: staff.id, branchId: selectedBranchId, source, capturedAt, lat: gps?.lat, lng: gps?.lng, accuracyMeters: gps?.accuracyMeters, qrToken: source === "qr" ? qrToken.trim() : undefined, deviceInfo });
      setMessage({
        tone: isPendingAttendanceResult(result) ? "warning" : "success",
        text: isPendingAttendanceResult(result)
          ? "Đã ghi nhận nhưng đang chờ quản lý duyệt trước khi tính công."
          : action === "clock_in" ? "Đã check-in." : "Đã kết ca."
      });
      await refreshBundle();
    } catch (error) {
      const canQueue = shouldQueueAttendanceOffline({ error, isPremium: bundle.premium.gpsAttendance, isOnline: offlineQueue.isOnline, source });
      if (canQueue && source === "gps" && gps) {
        const queued = offlineQueue.enqueue({ action, branchId: selectedBranchId, attendanceLogId: activeAttendance?.id, source: "gps", lat: gps.lat, lng: gps.lng, accuracyMeters: gps.accuracyMeters, capturedAt, deviceInfo });
        setMessage({ tone: "warning", text: queued.error ?? "Mạng yếu. Thao tác đã được lưu vào hàng đợi offline." });
      } else {
        if (source === "qr" && isQrAttendanceError(error)) {
          clearQrTokenAfterFailure();
          setQrScannerOpen(true);
          setMessage({ tone: "warning", text: "QR này không còn hợp lệ cho chi nhánh/ca hiện tại. Hãy quét lại mã mới hoặc dùng GPS/WiFi tại quán với vị trí chính xác." });
        } else {
          setMessage({ tone: "warning", text: error instanceof Error ? error.message : "Không thể xử lý chấm công lúc này." });
        }
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

  function uploadAvatar(file: File | null) {
    if (!file) return;
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
      setMessage({ tone: "warning", text: "Ảnh đại diện chỉ hỗ trợ JPG, PNG hoặc WebP." });
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setMessage({ tone: "warning", text: "Ảnh đại diện không được vượt quá 3MB." });
      return;
    }
    if (forcedLogout) {
      setMessage({ tone: "warning", text: "Phiên đã bị quản lý đăng xuất. Vui lòng đăng nhập lại." });
      return;
    }

    setUploadingAvatar(true);
    void (async () => {
      try {
        const result = await uploadStaffSelfAvatar(file);
        setProfileDraft((current) => ({ ...current, avatarUrl: result.avatarUrl }));
        setMessage({ tone: "success", text: "Đã cập nhật ảnh đại diện." });
        await refreshBundle();
      } catch (error) {
        setMessage({ tone: "warning", text: error instanceof Error ? error.message : "Không thể tải ảnh đại diện." });
      } finally {
        setUploadingAvatar(false);
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
          severity: incidentDraft.severity
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
  return (
    <main className="staff-brand-page staff-brand-page--mobile dashboard-density text-[#2B2B2B]">
      <header className="staff-brand-mobile-header sticky top-0 z-40 border-b px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#E5EEE2] text-sm font-black text-[#0F4D3A] ring-1 ring-[#D8D1C7]">{initials(staff.fullName)}</span>
            <div className="min-w-0">
              <LogiVNLogo priority className="h-7 w-auto" />
              <p className="mt-0.5 truncate text-xs font-bold text-[#5E5A54]">{restaurantName}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={markNotificationsRead} className="relative grid h-11 w-11 place-items-center rounded-full text-[#2B2B2B]" aria-label={bundle.unreadNotificationCount ? `Đánh dấu ${bundle.unreadNotificationCount} thông báo đã đọc` : "Thông báo"}><Bell size={22} />{bundle.unreadNotificationCount ? <span className="absolute right-2.5 top-2 h-2.5 w-2.5 rounded-full bg-[#A33D10]" /> : null}</button>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[640px] space-y-4 px-4 pb-[calc(7.25rem+env(safe-area-inset-bottom))] pt-5">
        {message ? <MessageBar message={message} /> : null}
          {permissionDataError ? <MessageBar message={{ tone: "warning", text: permissionDataError }} /> : null}
          {attendanceBlockedByOffline ? <MessageBar message={{ tone: "warning", text: pendingOfflineClockIn ? "Có check-in offline đang chờ đồng bộ." : "Có kết ca offline đang chờ đồng bộ." }} /> : null}
          {staleOpenAttendance && activeAttendance ? <MessageBar message={{ tone: "warning", text: `Phiên công chưa kết từ ${formatDate(activeAttendance.clockInAt)} lúc ${shortTime(activeAttendance.clockInAt)}. Hãy kết ca hoặc báo quản lý kết ca hộ trước khi vào ca mới.` }} /> : null}
          {resolvedTab === "home" ? (
            <HomeTab
              staffName={staff.fullName}
              workItems={workItems}
              processingKey={processingWorkItemKey}
              onRunWorkItem={runWorkItem}
              currentShift={todayAssignments[0] ?? upcomingAssignments[0] ?? null}
              activeDuration={activeAttendance ? activeDuration : null}
              overflowModules={moduleNav.overflow}
              onOpenModule={(id) => { setActiveTab(id); writeTabToUrl(id); }}
              clockCard={
                <ClockControlCard
                  machine={attendanceMachine}
                  activeAttendance={activeAttendance}
                  staleOpenAttendance={staleOpenAttendance}
                  nowMs={nowMs}
                  latestAttendance={latestAttendance}
                  activeDuration={activeDuration}
                  selectedBranchId={selectedBranchId}
                  selectedBranchName={selectedBranchName}
                  branches={bundle.branches}
                  onBranchChange={setSelectedBranchId}
                  selectedSource={selectedClockSource}
                  onSourceChange={setSelectedClockSource}
                  onOpenQrScanner={() => {
                    setSelectedClockSource("qr");
                    setQrScannerOpen(true);
                  }}
                  onClock={runClockAction}
                  processing={processingAttendance || forcedLogout || attendanceBlockedByOffline}
                  gpsEnabled={bundle.premium.gpsAttendance}
                  qrReady={qrReady}
                  branchLocationConfigured={Boolean(selectedBranch?.attendanceLocationConfigured)}
                  online={offlineQueue.isOnline}
                  queueLength={offlineQueue.queue.length}
                  syncing={offlineQueue.syncing}
                  onSync={() => void offlineQueue.syncQueue({ force: true })}
                />
              }
            />
          ) : null}
          {resolvedTab === "schedule" ? <ScheduleTab assignments={upcomingAssignments} branchName={selectedBranchName} /> : null}
          {resolvedTab === "inbox" ? <InboxTab notifications={bundle.notifications} unreadCount={bundle.unreadNotificationCount} onMarkRead={markNotificationsRead} /> : null}
          {resolvedTab === "requests" ? <RequestsTab draft={requestDraft} onDraftChange={(patch) => setRequestDraft((current) => ({ ...current, ...patch }))} recentRequests={recentRequests} assignments={upcomingAssignments} onSubmit={submitRequest} submitting={submittingRequest} /> : null}
          {isRoleModuleTab(resolvedTab) ? (
            <RoleModuleTab
              moduleId={resolvedTab}
              ops={bundle.mobileOps}
              workItems={workItems}
              processingKey={processingWorkItemKey}
              onRunWorkItem={runWorkItem}
              restaurantSlug={restaurantSlug}
            />
          ) : null}
          {resolvedTab === "profile" ? <ProfileTab staff={staff} bundle={bundle} payrollSelf={payrollSelf} payrollDataError={payrollDataError} profileDraft={profileDraft} incidentDraft={incidentDraft} onProfileDraftChange={(patch) => setProfileDraft((current) => ({ ...current, ...patch }))} onIncidentDraftChange={(patch) => setIncidentDraft((current) => ({ ...current, ...patch }))} onAvatarFile={uploadAvatar} onSubmitProfile={submitProfile} onSubmitIncident={submitIncident} savingProfile={savingProfile} uploadingAvatar={uploadingAvatar} submittingIncident={submittingIncident} /> : null}
      </section>

      <QrScannerSheet
        open={qrScannerOpen}
        branchName={selectedBranchName}
        qrReady={qrReady}
        onScanValue={applyQrScanValue}
        onClose={() => setQrScannerOpen(false)}
      />

      <nav
        className="staff-brand-bottom-nav fixed inset-x-0 bottom-0 z-50 grid h-[82px] border-t px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2"
        style={{ gridTemplateColumns: `repeat(${moduleNav.nav.length}, minmax(0, 1fr))` }}
        aria-label="Staff app navigation"
      >
        {moduleNav.nav.map((module) => {
          const Icon = module.icon;
          const active = resolvedTab === module.id;
          return (
            <button
              key={module.id}
              type="button"
              onClick={() => { setActiveTab(module.id); writeTabToUrl(module.id); }}
              aria-current={active ? "page" : undefined}
              className={cn("grid min-h-14 place-items-center rounded-xl text-xs font-semibold transition", active ? "text-[#0F4D3A]" : "text-[#3F3D39]")}
            >
              <Icon size={23} strokeWidth={active ? 2.7 : 2.1} />
              <span className="mt-0.5 truncate">{module.label}</span>
              <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-[#0F4D3A]" : "bg-transparent")} />
            </button>
          );
        })}
      </nav>
    </main>
  );
}

function MessageBar({ message }: { message: { tone: "success" | "warning" | "neutral"; text: string } }) {  return <div className={cn("rounded-2xl border px-4 py-3 text-sm font-bold", message.tone === "success" && "border-[#0F4D3A]/20 bg-[#DDF8E9] text-[#0F4D3A]", message.tone === "warning" && "border-[#F28C28]/30 bg-[#FFF0D9] text-[#93540A]", message.tone === "neutral" && "border-[#D8D1C7] bg-white text-[#3F3D39]")}>{message.text}</div>;
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {  return <div className="rounded-xl bg-[#F5F8F1] p-3"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#5E5A54]">{label}</p><p className="mt-1 text-xl font-black text-[#2B2B2B]">{value}</p></div>;
}

function InboxTab({
  notifications,
  unreadCount,
  onMarkRead
}: {
  notifications: StaffOperationsBundle["notifications"];
  unreadCount: number;
  onMarkRead: () => void;
}) {
  return (
    <div className="space-y-4">
      <AppCard className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[#5E5A54]">Hộp thư</p>
            <h2 className="mt-1 text-2xl font-black text-[#2B2B2B]">Thông báo</h2>
          </div>
          {unreadCount > 0 ? (
            <button type="button" onClick={onMarkRead} className="min-h-11 shrink-0 rounded-xl bg-[#0F4D3A] px-4 text-sm font-black text-white">
              Đọc tất cả ({unreadCount})
            </button>
          ) : (
            <StatusPill tone="success">Đã đọc hết</StatusPill>
          )}
        </div>
      </AppCard>
      {notifications.length === 0 ? (
        <AppCard className="p-8 text-center">
          <Bell className="mx-auto text-[#0F4D3A]" />
          <p className="mt-3 font-black text-[#2B2B2B]">Chưa có thông báo</p>
          <p className="mt-1 text-sm font-semibold text-[#5E5A54]">Thông báo ca, duyệt và nhắc việc sẽ hiện ở đây.</p>
        </AppCard>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <AppCard key={n.id} className={cn("p-4", n.status === "unread" && "ring-1 ring-[#0F4D3A]/25")}>
              <div className="flex items-start gap-3">
                <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", n.status === "unread" ? "bg-[#0F4D3A]" : "bg-[#D8D1C7]")} />
                <div className="min-w-0 flex-1">
                  <p className="font-black text-[#2B2B2B]">{n.title}</p>
                  {n.body ? <p className="mt-0.5 text-sm font-semibold text-[#5E5A54]">{n.body}</p> : null}
                  <p className="mt-1 text-xs font-bold text-[#8A867E]">{formatDate(n.createdAt)} · {shortTime(n.createdAt)}</p>
                </div>
              </div>
            </AppCard>
          ))}
        </div>
      )}
    </div>
  );
}

function ClockControlCard({
  machine,
  activeAttendance,
  staleOpenAttendance,
  nowMs,
  latestAttendance,
  activeDuration,
  selectedBranchId,
  selectedBranchName,
  branches,
  onBranchChange,
  selectedSource,
  onSourceChange,
  onOpenQrScanner,
  onClock,
  processing,
  gpsEnabled,
  qrReady,
  branchLocationConfigured,
  online,
  queueLength,
  syncing,
  onSync
}: {
  machine: StaffAttendanceMachine;
  activeAttendance: StaffOpsAttendanceFeedItem | null;
  staleOpenAttendance: boolean;
  nowMs: number;
  latestAttendance: StaffOpsAttendanceFeedItem | null;
  activeDuration: string;
  selectedBranchId: string;
  selectedBranchName: string;
  branches: StaffOperationsBundle["branches"];
  onBranchChange: (value: string) => void;
  selectedSource: ClockSource;
  onSourceChange: (value: ClockSource) => void;
  onOpenQrScanner: () => void;
  onClock: (source: ClockSource) => void;
  processing: boolean;
  gpsEnabled: boolean;
  qrReady: boolean;
  branchLocationConfigured: boolean;
  online: boolean;
  queueLength: number;
  syncing: boolean;
  onSync: () => void;
}) {
  const PrimaryIcon = machine.source === "qr" ? Fingerprint : machine.source === "wifi" ? Wifi : MapPin;
  const stateTone = machine.state === "blocked" ? "danger" : machine.state.includes("needs") || machine.state === "queued_offline" ? "warning" : activeAttendance ? "success" : "neutral";
  const sourceDisabled = processing || !machine.canSubmit;
  const activeDetail = staleOpenAttendance && activeAttendance
    ? `Chưa kết từ ${formatDate(activeAttendance.clockInAt)} · ${activeDuration}`
    : activeAttendance
      ? `${shortTime(activeAttendance.clockInAt)} · ${activeDuration}`
      : machine.detail;
  const sourceOptions: Array<{ key: ClockSource; label: string; icon: LucideIcon; disabled: boolean }> = [
    { key: "gps", label: "GPS", icon: MapPin, disabled: !gpsEnabled },
    { key: "wifi", label: "WiFi", icon: Wifi, disabled: !online },
    { key: "qr", label: qrReady ? "QR" : "Quét QR", icon: Fingerprint, disabled: false }
  ];

  return (
    <AppCard className="overflow-hidden p-0">
      <div className="bg-[#0F4D3A] p-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-white/70">Chấm công</p>
            <h2 className="mt-1 truncate text-lg font-black">{machine.title}</h2>
            <p className="mt-1 line-clamp-1 text-xs font-semibold text-white/78">{activeDetail}</p>
          </div>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/12 text-white">
            <PrimaryIcon size={20} aria-hidden="true" />
          </span>
        </div>
      </div>

      <div className="grid gap-3 p-3.5">
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

        {staleOpenAttendance && activeAttendance ? (
          <div className="rounded-xl border border-[#F2D2B2] bg-[#FFF8EB] px-3 py-2 text-xs font-bold leading-5 text-[#93540A]">
            Phiên này đã mở hơn {openAttendanceAgeHours(activeAttendance, nowMs)} giờ. Nếu không phải ca hiện tại, hãy bấm kết ca hoặc báo quản lý kết ca hộ để tránh lệch công/lương.
          </div>
        ) : null}

        {!branchLocationConfigured ? (
          <div className="rounded-xl border border-[#F2D2B2] bg-[#FFF8EB] px-3 py-2 text-xs font-bold leading-5 text-[#93540A]">
            Chi nhánh chưa có toạ độ GPS. QR/WiFi/GPS sẽ bị chặn cho tới khi quản lý cập nhật vị trí chi nhánh.
          </div>
        ) : null}

        <ShellButton disabled={sourceDisabled || !branchLocationConfigured} onClick={() => onClock(machine.source)} className="min-h-14 w-full text-[15px]">
          <PrimaryIcon size={19} /> {processing ? "Đang xử lý..." : machine.primaryLabel}
        </ShellButton>

        <div className="grid grid-cols-3 gap-2" aria-label="Chọn phương thức chấm công">
          {sourceOptions.map((option) => {
            const Icon = option.icon;
            const active = selectedSource === option.key;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                disabled={processing || option.disabled}
                onClick={() => {
                  onSourceChange(option.key);
                  if (option.key === "qr") onOpenQrScanner();
                }}
                className={cn("inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-black transition active:scale-[0.99] disabled:opacity-55", active ? "border-[#0F4D3A] bg-[#E5EEE2] text-[#0F4D3A]" : "border-[#D8D1C7] bg-white text-[#2B2B2B]")}
              >
                <Icon size={17} /> {option.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#5E5A54]">
          {!online ? <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF0D9] px-2.5 py-1.5 text-[#93540A]"><WifiOff size={14} /> Offline</span> : null}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F5F8F1] px-2.5 py-1.5">{selectedBranchName}</span>
          {queueLength ? <button type="button" onClick={onSync} disabled={syncing} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[#D8D1C7] bg-white px-2.5 text-xs font-black text-[#0F4D3A] disabled:opacity-55"><RefreshCw size={14} className={syncing ? "animate-spin" : undefined} /> Đồng bộ {queueLength}</button> : null}
        </div>
      </div>
    </AppCard>
  );
}

function QrScannerSheet({
  open,
  branchName,
  qrReady,
  onScanValue,
  onClose
}: {
  open: boolean;
  branchName: string;
  qrReady: boolean;
  onScanValue: (value: string) => boolean;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopRef = useRef(false);
  const [scannerMessage, setScannerMessage] = useState("");
  const [cameraActive, setCameraActive] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    let frameId = 0;
    const resetId = window.setTimeout(() => {
      setCameraActive(false);
      setScannerMessage("");
    }, 0);
    stopRef.current = false;
    const BarcodeDetector = (window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;

    async function startScanner() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setScannerMessage("Thiết bị chưa cấp quyền camera. Hãy bật camera hoặc dùng GPS/WiFi tại chi nhánh với vị trí chính xác.");
        return;
      }

      try {
        if (!BarcodeDetector) {
          setScannerMessage("Đang dùng chế độ quét tương thích. Giữ QR trong khung vài giây.");
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stopRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setCameraActive(true);
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const detector = BarcodeDetector ? new BarcodeDetector({ formats: ["qr_code"] }) : null;

        const scan = async () => {
          if (stopRef.current || !videoRef.current) return;
          try {
            const videoElement = videoRef.current;
            if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
              let rawValue = "";
              if (detector) {
                const codes = await detector.detect(videoElement);
                rawValue = codes.find((code) => code.rawValue)?.rawValue ?? "";
              }
              if (!rawValue && videoElement.videoWidth && videoElement.videoHeight) {
                rawValue = await decodeQrFromCanvasSource(videoElement, videoElement.videoWidth, videoElement.videoHeight);
              }
              if (rawValue && onScanValue(rawValue)) return;
            }
          } catch {
            setScannerMessage((current) => current || "Camera chưa đọc được QR. Giữ mã trong khung và tránh rung tay.");
          }
          frameId = window.setTimeout(scan, 500);
        };
        void scan();
      } catch {
        setScannerMessage("Không mở được camera. Hãy cấp quyền camera hoặc dùng GPS/WiFi tại quán với vị trí chính xác.");
      }
    }

    void startScanner();

    return () => {
      stopRef.current = true;
      window.clearTimeout(resetId);
      window.clearTimeout(frameId);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCameraActive(false);
    };
  }, [onScanValue, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] grid items-end bg-[#1F1D1A]/60 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-8 backdrop-blur-sm sm:items-center sm:px-6" role="dialog" aria-modal="true" aria-label="Quét QR chấm công">
      <section className="mx-auto w-full max-w-md overflow-hidden rounded-[24px] border border-[#D8D1C7] bg-[#FFFDF8] shadow-[0_24px_70px_rgba(31,29,26,0.28)]">
        <header className="flex items-center justify-between gap-3 border-b border-[#E5DDD2] p-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0F4D3A]">QR chấm công</p>
            <h2 className="truncate text-xl font-black text-[#2B2B2B]">{branchName}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#F0ECE6] text-[#2B2B2B]" aria-label="Đóng quét QR"><X size={20} /></button>
        </header>
        <div className="grid gap-4 p-4">
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-[#D8D1C7] bg-[#151713]">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/85 shadow-[0_0_0_999px_rgba(0,0,0,0.22)]" />
            <div className="absolute inset-x-4 bottom-4 rounded-xl bg-black/50 px-3 py-2 text-center text-xs font-bold text-white">
              {cameraActive ? "Đưa QR vào giữa khung" : "Đang mở camera"}
            </div>
          </div>
          {scannerMessage ? <MessageBar message={{ tone: "warning", text: scannerMessage }} /> : null}
          {qrReady ? <MessageBar message={{ tone: "success", text: "Đã có QR trong phiên này. Quét lại nếu vừa đổi chi nhánh hoặc mã đã hết hạn." }} /> : null}
        </div>
      </section>
    </div>
  );
}

function HomeTab({ staffName, workItems, processingKey, onRunWorkItem, currentShift, activeDuration, clockCard, overflowModules, onOpenModule }: { staffName: string; workItems: StaffOpsMobileWorkItem[]; processingKey: string | null; onRunWorkItem: (item: StaffOpsMobileWorkItem) => void; currentShift: StaffOpsShiftAssignment | null; activeDuration: string | null; clockCard: ReactNode; overflowModules: StaffModule[]; onOpenModule: (id: StaffModuleId) => void }) {
  const visibleWorkItems = workItems.slice(0, 2);
  const hiddenWorkItemCount = Math.max(0, workItems.length - visibleWorkItems.length);
  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-[#E5DDD2] bg-[#FFFDF8] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[#5E5A54]">Ca hôm nay</p>
            <h1 className="mt-1 truncate text-xl font-black leading-tight text-[#2B2B2B]">{staffName}</h1>
            <p className="mt-2 truncate text-sm font-semibold text-[#5E5A54]">{currentShift ? `${currentShift.shiftName} · ${currentShift.branchName ?? "Chi nhánh"}` : "Chưa có ca được gán"}</p>
          </div>
          <StatusPill tone={activeDuration ? "success" : currentShift ? "warning" : "neutral"}>{activeDuration ?? (currentShift ? "Chờ vào" : "Trống")}</StatusPill>
        </div>
      </section>

      {clockCard}

      {overflowModules.length ? (
        <section className="space-y-2">
          <h2 className="text-xs font-black uppercase tracking-[0.12em] text-[#5E5A54]">Khu vực làm việc</h2>
          <div className="grid grid-cols-3 gap-2">
            {overflowModules.map((module) => {
              const Icon = module.icon;
              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => onOpenModule(module.id)}
                  className="grid min-h-20 place-items-center gap-1.5 rounded-2xl border border-[#E5DDD2] bg-[#FFFDF8] p-2 text-center transition active:scale-[0.98]"
                >
                  <Icon size={22} className="text-[#0F4D3A]" />
                  <span className="text-[11px] font-bold leading-tight text-[#3F3D39]">{module.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-black uppercase tracking-[0.12em] text-[#5E5A54]">Việc khẩn</h2>
          <StatusPill tone={workItems.length ? "warning" : "success"}>{workItems.length || "0"}</StatusPill>
        </div>
        {visibleWorkItems.length ? visibleWorkItems.map((item) => (
          <AppCard key={item.id} className="p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[#2B2B2B]">{item.title}</p>
                <p className="mt-1 line-clamp-1 text-xs font-semibold text-[#5E5A54]">{item.subtitle}</p>
              </div>
              <StatusPill tone={item.priority === "high" ? "danger" : item.priority === "medium" ? "warning" : "neutral"}>{item.priority === "high" ? "Gấp" : item.priority === "medium" ? "Vừa" : "Thấp"}</StatusPill>
            </div>
            {item.action ? <ShellButton onClick={() => onRunWorkItem(item)} disabled={processingKey === item.id} className="mt-3 min-h-11 w-full text-sm">{processingKey === item.id ? "Đang xử lý..." : item.actionLabel ?? "Xử lý"}</ShellButton> : null}
          </AppCard>
        )) : <AppCard className="grid min-h-20 place-items-center p-4 text-center"><div><Check className="mx-auto text-[#0F4D3A]" size={19} /><p className="mt-2 text-sm font-black">Không có việc đang chờ</p></div></AppCard>}
        {hiddenWorkItemCount ? <p className="px-1 text-xs font-bold text-[#5E5A54]">Còn {hiddenWorkItemCount} việc trong tab Yêu cầu.</p> : null}
      </section>
    </div>
  );
}

type RoleModuleId = "kitchen" | "cashier" | "service" | "delivery" | "accounting" | "marketing" | "ops";

type RoleModuleMetric = { label: string; value: number };
type RoleModuleLink = { label: string; href: string };
type RoleModuleConfig = {
  title: string;
  description: string;
  kinds: StaffOpsMobileWorkItem["kind"][];
  metrics: (ops: StaffOpsMobileOps) => RoleModuleMetric[];
  links: RoleModuleLink[];
};

const ROLE_MODULE_CONFIG: Record<RoleModuleId, RoleModuleConfig> = {
  kitchen: {
    title: "Bếp",
    description: "Hàng chờ món và tiến độ chế biến trong ca của bạn.",
    kinds: ["kitchen_order"],
    metrics: (ops) => [
      { label: "Đang nấu", value: ops.cookingOrders },
      { label: "Chờ nhận", value: ops.pendingOrders }
    ],
    links: [
      { label: "Màn hình bếp", href: "/dashboard/kitchen" },
      { label: "Kho nguyên liệu", href: "/dashboard/inventory" }
    ]
  },
  cashier: {
    title: "Thu ngân",
    description: "Xác nhận thanh toán và đóng bàn trong ca.",
    kinds: ["payment_waiting"],
    metrics: (ops) => [
      { label: "Chờ thu", value: ops.waitingPayments },
      { label: "Việc khẩn", value: ops.urgentCount }
    ],
    links: [
      { label: "Thanh toán", href: "/dashboard/payments" },
      { label: "Bàn", href: "/dashboard/tables" }
    ]
  },
  service: {
    title: "Phục vụ",
    description: "Bàn được giao, đơn tại chỗ và yêu cầu của khách.",
    kinds: ["order_pending", "service_request"],
    metrics: (ops) => [
      { label: "Đơn chờ", value: ops.pendingOrders },
      { label: "Yêu cầu bàn", value: ops.serviceRequests }
    ],
    links: [
      { label: "Đơn hàng", href: "/dashboard/orders" },
      { label: "Bàn", href: "/dashboard/tables" },
      { label: "Đặt bàn", href: "/dashboard/reservations" }
    ]
  },
  delivery: {
    title: "Giao hàng",
    description: "Đơn online và trạng thái giao trong ca.",
    kinds: ["order_pending"],
    metrics: (ops) => [
      { label: "Đơn chờ", value: ops.pendingOrders },
      { label: "Việc khẩn", value: ops.urgentCount }
    ],
    links: [
      { label: "Đơn online", href: "/dashboard/online" },
      { label: "Đơn hàng", href: "/dashboard/orders" }
    ]
  },
  accounting: {
    title: "Kế toán",
    description: "Đối soát dòng tiền, báo cáo cuối ca và nhật ký.",
    kinds: [],
    metrics: (ops) => [{ label: "Chờ thu", value: ops.waitingPayments }],
    links: [
      { label: "Thanh toán", href: "/dashboard/payments" },
      { label: "Báo cáo", href: "/dashboard/analytics" }
    ]
  },
  marketing: {
    title: "Marketing",
    description: "Khuyến mãi, kênh online và hiệu quả bán.",
    kinds: [],
    metrics: () => [],
    links: [
      { label: "Khuyến mãi", href: "/dashboard/promotions" },
      { label: "Kênh online", href: "/dashboard/online" },
      { label: "Báo cáo", href: "/dashboard/analytics" }
    ]
  },
  ops: {
    title: "Điều hành",
    description: "Duyệt yêu cầu, phân ca và theo dõi đội ngũ trong ca.",
    kinds: ["order_pending", "kitchen_order", "payment_waiting", "service_request"],
    metrics: (ops) => [
      { label: "Việc khẩn", value: ops.urgentCount },
      { label: "Chờ thu", value: ops.waitingPayments }
    ],
    links: [
      { label: "Nhân sự", href: "/dashboard/staff" },
      { label: "Đơn hàng", href: "/dashboard/orders" },
      { label: "Báo cáo", href: "/dashboard/analytics" }
    ]
  }
};

function RoleModuleTab({
  moduleId,
  ops,
  workItems,
  processingKey,
  onRunWorkItem
}: {
  moduleId: RoleModuleId;
  ops: StaffOpsMobileOps;
  workItems: StaffOpsMobileWorkItem[];
  processingKey: string | null;
  onRunWorkItem: (item: StaffOpsMobileWorkItem) => void;
  restaurantSlug: string;
}) {
  const config = ROLE_MODULE_CONFIG[moduleId];
  const relevantItems = config.kinds.length ? workItems.filter((item) => config.kinds.includes(item.kind)) : [];
  const metrics = config.metrics(ops);

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-[#E5DDD2] bg-[#FFFDF8] p-4">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Khu vực vận hành</p>
        <h1 className="mt-1 text-xl font-black leading-tight text-[#2B2B2B]">{config.title}</h1>
        <p className="mt-1.5 text-sm font-semibold text-[#5E5A54]">{config.description}</p>
      </section>

      {metrics.length ? (
        <div className="grid grid-cols-2 gap-2">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-xl border border-[#E5DDD2] bg-[#F5F8F1] p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#5E5A54]">{metric.label}</p>
              <p className="mt-1 text-2xl font-black text-[#2B2B2B]">{metric.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {config.kinds.length ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-black uppercase tracking-[0.12em] text-[#5E5A54]">Việc cần xử lý</h2>
            <StatusPill tone={relevantItems.length ? "warning" : "success"}>{relevantItems.length || "0"}</StatusPill>
          </div>
          {relevantItems.length ? relevantItems.map((item) => (
            <AppCard key={item.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#2B2B2B]">{item.title}</p>
                  <p className="mt-1 line-clamp-1 text-xs font-semibold text-[#5E5A54]">{item.subtitle}</p>
                </div>
                <StatusPill tone={item.priority === "high" ? "danger" : item.priority === "medium" ? "warning" : "neutral"}>{item.priority === "high" ? "Gấp" : item.priority === "medium" ? "Vừa" : "Thấp"}</StatusPill>
              </div>
              {item.action ? <ShellButton onClick={() => onRunWorkItem(item)} disabled={processingKey === item.id} className="mt-3 min-h-11 w-full text-sm">{processingKey === item.id ? "Đang xử lý..." : item.actionLabel ?? "Xử lý"}</ShellButton> : null}
            </AppCard>
          )) : <AppCard className="grid min-h-20 place-items-center p-4 text-center"><div><Check className="mx-auto text-[#0F4D3A]" size={19} /><p className="mt-2 text-sm font-black">Không có việc đang chờ</p></div></AppCard>}
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-xs font-black uppercase tracking-[0.12em] text-[#5E5A54]">Mở màn hình quản lý</h2>
        <div className="grid gap-2">
          {config.links.map((link) => (
            <a key={link.href} href={link.href} className="flex min-h-12 items-center justify-between rounded-xl border border-[#E5DDD2] bg-[#FFFDF8] px-4 text-sm font-bold text-[#2B2B2B] transition active:scale-[0.99]">
              <span>{link.label}</span>
              <ChevronRight size={18} className="text-[#5E5A54]" />
            </a>
          ))}
        </div>
        <p className="px-1 text-xs font-semibold text-[#5E5A54]">Quyền truy cập từng màn hình vẫn được kiểm soát theo phân quyền của bạn.</p>
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

function RequestsTab({ draft, onDraftChange, recentRequests, assignments, onSubmit, submitting }: { draft: RequestDraft; onDraftChange: (patch: Partial<RequestDraft>) => void; recentRequests: StaffOpsApprovalItem[]; assignments: StaffOpsShiftAssignment[]; onSubmit: () => void; submitting: boolean }) {
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const visibleRequests = recentRequests.filter((request) => request.status === statusFilter);
  const cannotSubmitShiftSwap = draft.kind === "shift_swap" && !assignments.length;
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto">{(["pending", "approved", "rejected"] as const).map((status) => <button key={status} type="button" onClick={() => setStatusFilter(status)} className={cn("min-h-11 rounded-xl px-4 text-sm font-black", statusFilter === status ? "bg-[#0F4D3A] text-white" : "bg-[#ECE9E3] text-[#4B4945]")}>{status === "pending" ? "Chờ" : status === "approved" ? "Duyệt" : "Từ chối"}</button>)}</div>
      <AppCard className="p-4"><h1 className="text-xl font-black text-[#2B2B2B]">Tạo yêu cầu</h1><div className="mt-4 grid gap-3"><select value={draft.kind} onChange={(event) => onDraftChange({ kind: event.target.value as RequestDraft["kind"] })} className="staff-redesign-input"><option value="leave_request">Nghỉ phép</option><option value="shift_swap">Đổi ca</option><option value="overtime">Tăng ca</option></select>{draft.kind === "shift_swap" ? assignments.length ? <select value={draft.shiftAssignmentId || assignments[0]?.id || ""} onChange={(event) => onDraftChange({ shiftAssignmentId: event.target.value })} className="staff-redesign-input">{assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.shiftName} · {assignment.scheduledDate}</option>)}</select> : <InlineEmptyState title="Chưa có ca để đổi" text="Cần một ca thật đã được gán." /> : <div className="grid grid-cols-2 gap-3"><input type="date" value={draft.fromDate} onChange={(event) => onDraftChange({ fromDate: event.target.value })} className="staff-redesign-input" /><input type="date" value={draft.toDate} onChange={(event) => onDraftChange({ toDate: event.target.value })} className="staff-redesign-input" /></div>}{draft.kind === "overtime" ? <input type="number" value={draft.overtimeMinutes} onChange={(event) => onDraftChange({ overtimeMinutes: Number(event.target.value) })} className="staff-redesign-input" min={15} max={720} /> : null}<textarea value={draft.reason} onChange={(event) => onDraftChange({ reason: event.target.value })} className="min-h-24 rounded-xl border border-[#D8D1C7] bg-white p-4 text-sm font-semibold outline-none" placeholder="Lý do" /><ShellButton onClick={onSubmit} disabled={submitting || cannotSubmitShiftSwap}><Send size={18} /> {submitting ? "Đang gửi..." : `Gửi ${requestTypeLabel(draft.kind).toLowerCase()}`}</ShellButton></div></AppCard>
      <div className="space-y-3">{visibleRequests.map((request) => <AppCard key={request.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-base font-black text-[#2B2B2B]">{requestTypeLabel(request.requestType)}</p><p className="mt-1 line-clamp-2 text-sm font-medium text-[#5E5A54]">{request.reason ?? "Không có ghi chú"}</p></div><StatusPill tone={request.status === "approved" ? "success" : request.status === "rejected" ? "danger" : "neutral"}>{request.status === "pending" ? "Chờ" : request.status === "approved" ? "Duyệt" : "Từ chối"}</StatusPill></div></AppCard>)}{!visibleRequests.length ? <InlineEmptyState title="Không có yêu cầu" text="Chưa có đơn trong trạng thái này." /> : null}</div>
    </div>
  );
}

function ProfileTab({ staff, bundle, payrollSelf, payrollDataError, profileDraft, incidentDraft, onProfileDraftChange, onIncidentDraftChange, onAvatarFile, onSubmitProfile, onSubmitIncident, savingProfile, uploadingAvatar, submittingIncident }: { staff: StaffOperationsBundle["members"][number]; bundle: StaffOperationsBundle; payrollSelf: StaffPayrollSelfView | null; payrollDataError: string | null; profileDraft: ProfileDraft; incidentDraft: IncidentDraft; onProfileDraftChange: (patch: Partial<ProfileDraft>) => void; onIncidentDraftChange: (patch: Partial<IncidentDraft>) => void; onAvatarFile: (file: File | null) => void; onSubmitProfile: () => void; onSubmitIncident: () => void; savingProfile: boolean; uploadingAvatar: boolean; submittingIncident: boolean }) {
  const timesheet = bundle.timesheets.find((item) => item.staffMemberId === staff.id);
  const attendanceCount = timesheet?.attendanceCount ?? 0;
  const score = timesheet?.attendanceScore ?? 100;
  const overtime = timesheet?.overtimeMinutes ?? 0;
  const attendanceRows = bundle.attendanceFeed.filter((item) => item.staffMemberId === staff.id).slice(0, 7).reverse();
  const incidents = bundle.incidents.filter((item) => item.staffMemberId === staff.id).slice(0, 4);
  const maxMinutes = Math.max(...attendanceRows.map(attendanceWorkMinutes), 1);
  const payProfile = payrollSelf?.profile ?? null;
  const paySummary = payProfile
    ? summarizePayroll({
        grossMonthlySalary: payProfile.baseSalary,
        baseSalary: payProfile.baseSalary,
        dependentCount: payProfile.dependentCount,
        enrolledInInsurance: payProfile.enrolledInInsurance,
        applyPersonalIncomeTax: payProfile.applyPersonalIncomeTax,
        insuranceBaseAmount: payProfile.insuranceBaseAmount,
        deductions: payrollSelf?.deductions ?? DEFAULT_PAYROLL_DEDUCTIONS
      })
    : null;
  const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}₫`;
  return (
    <div className="space-y-4">
      <AppCard className="p-4">
        <div className="flex items-center gap-4">
          {staff.avatarUrl ? <Image src={staff.avatarUrl} alt="" width={56} height={56} unoptimized className="h-14 w-14 rounded-full border border-[#D8D1C7] object-cover" /> : <span className="grid h-14 w-14 place-items-center rounded-full bg-[#E5EEE2] text-base font-black text-[#0F4D3A]">{initials(staff.fullName)}</span>}
          <div className="min-w-0">
            <p className="truncate text-lg font-black text-[#2B2B2B]">{staff.fullName}</p>
            <p className="mt-1 text-xs font-bold text-[#5E5A54]">{staff.employeeCode ?? "Chưa có mã"} · {staff.roleTitle}</p>
          </div>
        </div>
      </AppCard>

      <details className="staff-brand-panel p-4">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 text-base font-black text-[#2B2B2B]"><span className="flex items-center gap-2"><Wallet size={18} /> Lương của tôi</span><ChevronDown size={18} className="text-[#0F4D3A]" /></summary>
        {payrollDataError ? (
          <div className="mt-3 flex items-start gap-3 rounded-xl border border-[#F6D2C9] bg-[#FFF1EC] p-4">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#B94724]" />
            <div>
              <p className="text-sm font-black text-[#B94724]">Không tải được dữ liệu lương thật</p>
              <p className="mt-1 text-xs font-semibold text-[#5E5A54]">{payrollDataError}</p>
            </div>
          </div>
        ) : paySummary && payProfile ? (
          <div className="mt-3 grid gap-2">
            <div className="flex items-center justify-between rounded-xl bg-[#F5F8F1] px-4 py-3"><span className="text-sm font-bold text-[#5E5A54]">Lương cơ bản</span><span className="text-base font-black text-[#2B2B2B]">{vnd(payProfile.baseSalary)}</span></div>
            <div className="flex items-center justify-between px-4 py-1.5 text-sm"><span className="font-semibold text-[#5E5A54]">Bảo hiểm (NV đóng)</span><span className="font-bold text-[#A33D10]">−{vnd(paySummary.totalEmployeeInsurance)}</span></div>
            <div className="flex items-center justify-between px-4 py-1.5 text-sm"><span className="font-semibold text-[#5E5A54]">Thuế TNCN</span><span className="font-bold text-[#A33D10]">−{vnd(paySummary.personalIncomeTax)}</span></div>
            <div className="flex items-center justify-between rounded-xl bg-[#DDF8E9] px-4 py-3"><span className="text-sm font-black text-[#0F4D3A]">Thực nhận (ước tính)</span><span className="text-lg font-black text-[#0F4D3A]">{vnd(paySummary.netIncome)}</span></div>
            <p className="px-1 text-[11px] font-semibold text-[#8A867E]">Số liệu chỉ để tham khảo theo cấu hình hiện tại, chưa gồm thưởng/phụ cấp/tăng ca thực tế.</p>
          </div>
        ) : (
          <p className="mt-3 text-sm font-semibold text-[#5E5A54]">Chưa có hồ sơ lương. Liên hệ quản lý để được thiết lập.</p>
        )}
      </details>

      <details className="staff-brand-panel p-4">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 text-base font-black text-[#2B2B2B]"><span className="flex items-center gap-2"><UserRound size={18} /> Cập nhật hồ sơ</span><ChevronDown size={18} className="text-[#0F4D3A]" /></summary>
        <div className="mt-3 grid gap-3">
          <input value={profileDraft.fullName} onChange={(event) => onProfileDraftChange({ fullName: event.target.value })} className="staff-redesign-input" placeholder="Họ tên" />
          <input value={profileDraft.phone ?? ""} onChange={(event) => onProfileDraftChange({ phone: event.target.value })} className="staff-redesign-input" placeholder="Số điện thoại" />
          <div className="grid grid-cols-2 gap-3"><input type="date" value={profileDraft.dateOfBirth ?? ""} onChange={(event) => onProfileDraftChange({ dateOfBirth: event.target.value })} className="staff-redesign-input" /><input value={profileDraft.hometown ?? ""} onChange={(event) => onProfileDraftChange({ hometown: event.target.value })} className="staff-redesign-input" placeholder="Quê quán" /></div>
          <label className="grid min-h-14 cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-[#D8D1C7] bg-white px-4 text-sm font-black text-[#2B2B2B] active:scale-[0.99]">
            <Camera className="text-[#0F4D3A]" size={18} />
            <span className="min-w-0 truncate">{uploadingAvatar ? "Đang tải ảnh..." : profileDraft.avatarUrl ? "Đổi ảnh đại diện" : "Tải ảnh đại diện"}</span>
            <span className="rounded-full bg-[#E5EEE2] px-2 py-1 text-[11px] text-[#0F4D3A]">JPG/PNG</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={uploadingAvatar}
              onChange={(event) => {
                onAvatarFile(event.currentTarget.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <ShellButton onClick={onSubmitProfile} disabled={savingProfile} className="text-sm"><Check size={18} /> {savingProfile ? "Đang lưu..." : "Lưu hồ sơ"}</ShellButton>
          <ShellButton variant="secondary" onClick={() => { window.location.assign(`/staff/change-password?next=${encodeURIComponent("/dashboard/staff/mobile?tab=reports")}`); }}><LockKeyhole size={18} /> Đổi mật khẩu app</ShellButton>
        </div>
      </details>

      <details className="staff-brand-panel p-4">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 text-base font-black text-[#2B2B2B]"><span className="flex items-center gap-2"><Send size={18} /> Báo cáo sự cố</span><ChevronDown size={18} className="text-[#0F4D3A]" /></summary>
        <div className="mt-3 grid gap-3">
          <input value={incidentDraft.title} onChange={(event) => onIncidentDraftChange({ title: event.target.value })} className="staff-redesign-input" placeholder="Tiêu đề sự cố" />
          <select value={incidentDraft.severity} onChange={(event) => onIncidentDraftChange({ severity: event.target.value as IncidentDraft["severity"] })} className="staff-redesign-input"><option value="low">Thấp</option><option value="normal">Bình thường</option><option value="high">Cao</option><option value="urgent">Khẩn cấp</option></select>
          <textarea value={incidentDraft.description} onChange={(event) => onIncidentDraftChange({ description: event.target.value })} className="min-h-24 rounded-xl border border-[#D8D1C7] bg-white p-4 text-sm font-semibold outline-none" placeholder="Mô tả để quản lý xử lý" />
          <ShellButton onClick={onSubmitIncident} disabled={submittingIncident} className="text-sm"><Send size={18} /> {submittingIncident ? "Đang gửi..." : "Gửi cho quản lý"}</ShellButton>
        </div>
        {incidents.length ? (
          <div className="mt-4 space-y-2 border-t border-[#E5DDD2] pt-4">
            {incidents.map((incident) => (
              <div key={incident.id} className="rounded-xl border border-[#E5DDD2] bg-[#FFFDF8] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#2B2B2B]">{incident.title}</p>
                    <p className="mt-1 text-xs font-semibold text-[#5E5A54]">{formatDateTime(incident.createdAt)}</p>
                  </div>
                  <StatusPill tone={incident.status === "resolved" ? "success" : incident.status === "dismissed" ? "neutral" : incident.severity === "urgent" || incident.severity === "high" ? "danger" : "neutral"}>{incident.status === "open" ? "Mới" : incident.status === "reviewing" ? "Đang xử lý" : incident.status === "resolved" ? "Đã xử lý" : "Bỏ qua"}</StatusPill>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </details>

      <details className="rounded-2xl border border-[#D8D1C7] bg-[#FFFDF8] p-4">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 text-sm font-black text-[#0F4D3A]"><span>Công cá nhân</span><ChevronDown size={18} /></summary>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <MiniStat label="Ca" value={attendanceCount} />
          <MiniStat label="Điểm" value={score} />
          <MiniStat label="OT" value={`${Math.round(overtime / 60)}h`} />
        </div>
        <div className="mt-4">
          <h2 className="flex items-center gap-2 text-sm font-black"><BarChart3 size={18} /> Giờ công gần đây</h2>
          {attendanceRows.length ? <div className="mt-4 flex h-36 items-end gap-2 border-b border-[#D8D1C7]">{attendanceRows.map((item) => { const minutes = attendanceWorkMinutes(item); return <span key={item.id} className="flex flex-1 flex-col items-center justify-end gap-2"><span className="w-full rounded-t-lg bg-[#0F4D3A]" style={{ height: `${Math.max(8, Math.round((minutes / maxMinutes) * 100))}%` }} /><span className="text-[11px] font-black text-[#5E5A54]">{new Date(item.clockInAt).getDate()}</span></span>; })}</div> : <InlineEmptyState title="Chưa có log công" text="Dữ liệu xuất hiện sau khi chấm công." />}
        </div>
      </details>
    </div>
  );
}

function attendanceWorkMinutes(item: StaffOperationsBundle["attendanceFeed"][number]) {
  if (!item.clockInAt || !item.clockOutAt) return 0;
  const diff = new Date(item.clockOutAt).getTime() - new Date(item.clockInAt).getTime();
  return Number.isFinite(diff) && diff > 0 ? Math.round(diff / 60_000) : 0;
}

function InlineEmptyState({ title, text }: { title: string; text: string }) {
  return <div className="mt-4 grid min-h-28 place-items-center rounded-xl border border-dashed border-[#D8D1C7] bg-[#FFFDF8] p-4 text-center"><div><p className="text-base font-black text-[#2B2B2B]">{title}</p><p className="mt-1 text-xs font-semibold text-[#5E5A54]">{text}</p></div></div>;
}
