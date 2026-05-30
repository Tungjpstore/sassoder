"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Fingerprint, MapPin, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { shouldQueueAttendanceOffline, useOfflineAttendanceQueue } from "@/features/attendance/hooks/use-offline-attendance-queue";
import {
  clockInAttendance,
  clockOutAttendance,
  createStaffRequest,
  fetchStaffOperationsBundle,
  markStaffNotificationRead,
  runStaffMobileQuickAction,
  sendStaffSessionHeartbeat
} from "@/features/staff/api/client";
import type { StaffRequestCreatePayload, StaffSessionHeartbeatResult } from "@/features/staff/api/client";
import { buildStaffAttendanceMachine } from "@/features/staff/components/mobile/staff-attendance-machine";
import { StaffInboxPanel } from "@/features/staff/components/mobile/staff-inbox-panel";
import { StaffMobileShell } from "@/features/staff/components/mobile/staff-mobile-shell";
import { StaffPrimaryButton, StaffSecondaryButton, StaffStatusPill } from "@/features/staff/components/mobile/staff-mobile-primitives";
import {
  activeAttendanceForMember,
  clampNumber,
  durationBetween,
  normalizeStaffMobileTab,
  priorityRank,
  relativeTime,
  removeWorkItem,
  staffRequestLabel,
  todayInputValue,
  workItemKey,
  type StaffMobileTab
} from "@/features/staff/components/mobile/staff-mobile-utils";
import { StaffRequestsPanel, type StaffRequestDraft } from "@/features/staff/components/mobile/staff-requests-panel";
import { StaffTodayPanel } from "@/features/staff/components/mobile/staff-today-panel";
import { StaffWorkPanel } from "@/features/staff/components/mobile/staff-work-panel";
import { useStaffMobileRealtime } from "@/features/staff/components/mobile/use-staff-mobile-realtime";
import type { StaffOperationsBundle, StaffOpsMobileWorkItem } from "@/features/staff/types";
import { cn } from "@/lib/utils";

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

function initialTab() {
  if (typeof window === "undefined") return "today";
  return normalizeStaffMobileTab(new URL(window.location.href).searchParams.get("tab") ?? "today");
}

function writeTabToUrl(tab: StaffMobileTab) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  window.history.replaceState(null, "", url);
}

function initialRequestDraft(): StaffRequestDraft {
  const today = todayInputValue();
  return {
    kind: "leave_request",
    reason: "",
    fromDate: today,
    toDate: today,
    leaveType: "unpaid",
    overtimeMinutes: 60,
    shiftAssignmentId: "",
    targetStaffMemberId: ""
  };
}

export function StaffMobileWorkspace({ initialBundle, restaurantId, restaurantName, userId }: StaffMobileWorkspaceProps) {
  const [bundle, setBundle] = useState(initialBundle);
  const [selectedBranchId, setSelectedBranchId] = useState(initialBundle.members[0]?.primaryBranchId ?? initialBundle.branches[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<StaffMobileTab>(initialTab);
  const [message, setMessage] = useState<{ tone: "success" | "warning" | "neutral"; text: string } | null>(null);
  const [processingWorkItemKey, setProcessingWorkItemKey] = useState<string | null>(null);
  const [requestDraft, setRequestDraft] = useState<StaffRequestDraft>(initialRequestDraft);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [qrToken, setQrToken] = useState("");
  const [deviceFingerprint, setDeviceFingerprint] = useState("");
  const [deviceTrust, setDeviceTrust] = useState<StaffSessionHeartbeatResult["deviceTrust"] | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [processingAttendance, setProcessingAttendance] = useState(false);

  const staff = bundle.members[0] ?? null;
  const today = todayInputValue();
  const activeAttendance = staff ? activeAttendanceForMember(bundle.attendanceFeed, staff.id) : null;
  const latestAttendance = staff ? bundle.attendanceFeed.find((item) => item.staffMemberId === staff.id) ?? null : null;
  const selectedBranchName = bundle.branches.find((branch) => branch.id === selectedBranchId)?.name ?? staff?.primaryBranchName ?? "Chưa chọn";
  const qrReady = Boolean(qrToken.trim());

  const refreshBundle = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await fetchStaffOperationsBundle("self");
      setBundle(next);
      const nextBranchId = next.members[0]?.primaryBranchId ?? next.branches[0]?.id ?? "";
      setSelectedBranchId((current) => current || nextBranchId);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const offlineQueue = useOfflineAttendanceQueue({
    restaurantId,
    userId,
    onSynced: refreshBundle
  });

  const realtimeState = useStaffMobileRealtime({ restaurantId, onRefresh: refreshBundle });

  const todayAssignments = useMemo(
    () => bundle.shiftAssignments.filter((assignment) => assignment.scheduledDate === today && assignment.status !== "cancelled" && (!staff || assignment.staffMemberId === staff.id)),
    [bundle.shiftAssignments, staff, today]
  );

  const upcomingAssignments = useMemo(
    () =>
      staff
        ? bundle.shiftAssignments
            .filter((assignment) => assignment.status !== "cancelled" && assignment.staffMemberId === staff.id && assignment.scheduledDate >= today)
            .sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate))
            .slice(0, 4)
        : [],
    [bundle.shiftAssignments, staff, today]
  );

  const sortedWorkItems = useMemo(
    () => [...bundle.mobileOps.workItems].sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    [bundle.mobileOps.workItems]
  );

  const recentAttendance = useMemo(
    () =>
      staff
        ? bundle.attendanceFeed
            .filter((item) => item.staffMemberId === staff.id)
            .sort((left, right) => new Date(right.clockInAt).getTime() - new Date(left.clockInAt).getTime())
            .slice(0, 3)
        : [],
    [bundle.attendanceFeed, staff]
  );

  const recentRequests = useMemo(
    () =>
      staff
        ? bundle.approvals
            .filter((approval) => approval.staffMemberId === staff.id && ["leave_request", "shift_swap", "overtime"].includes(approval.requestType))
            .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
            .slice(0, 6)
        : [],
    [bundle.approvals, staff]
  );

  const machine = buildStaffAttendanceMachine({
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
  });

  const activeDuration = durationBetween(activeAttendance?.clockInAt, activeAttendance?.clockOutAt, nowMs);
  const currentShift = todayAssignments[0] ?? upcomingAssignments[0] ?? null;
  const pendingRequestCount = recentRequests.filter((request) => request.status === "pending").length;
  const normalizedOvertimeMinutes = clampNumber(requestDraft.overtimeMinutes || 15, 15, 720);
  const requestShiftAssignmentIdForSubmit = requestDraft.shiftAssignmentId || upcomingAssignments[0]?.id || "";
  const leaveDateInvalid = requestDraft.kind === "leave_request" && requestDraft.toDate < requestDraft.fromDate;
  const requestBlockedReason = leaveDateInvalid
    ? "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu."
    : requestDraft.kind === "shift_swap" && !requestShiftAssignmentIdForSubmit
      ? "Bạn chưa có ca sắp tới để xin đổi."
      : requestDraft.kind === "overtime" && (requestDraft.overtimeMinutes < 15 || requestDraft.overtimeMinutes > 720)
        ? "OT hợp lệ từ 15 đến 720 phút."
        : null;

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
        setActiveTab("today");
        writeTabToUrl("today");
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
        metadata: { screen: "staff_mobile" }
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

  async function runClockAction(source: "gps" | "qr" | "wifi") {
    if (!staff || processingAttendance) return;
    if (!selectedBranchId) {
      setMessage({ tone: "warning", text: "Bạn cần chọn chi nhánh trước khi chấm công." });
      return;
    }
    if (source === "qr" && !qrToken.trim()) {
      setMessage({ tone: "warning", text: "Bạn cần quét QR tại quán trước khi chấm công." });
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
    const deviceInfo = {
      userAgent: navigator.userAgent,
      mode: "mobile_pwa",
      deviceFingerprint: fingerprint,
      deviceTrustStatus: deviceTrust?.status ?? null
    };

    try {
      if (source === "gps") gps = await readGpsPosition();

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
      }

      setMessage({ tone: "success", text: action === "clock_in" ? "Đã check-in." : "Đã kết ca." });
      await refreshBundle();
    } catch (error) {
      const canQueue = shouldQueueAttendanceOffline({
        error,
        isPremium: bundle.premium.gpsAttendance,
        isOnline: offlineQueue.isOnline,
        source
      });

      if (canQueue && source === "gps" && gps) {
        const queued = offlineQueue.enqueue({
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
        setMessage({ tone: "warning", text: queued.error ?? "Mạng yếu. LogiVN đã đưa thao tác vào hàng đợi offline." });
      } else {
        setMessage({ tone: "warning", text: error instanceof Error ? error.message : "Không thể xử lý chấm công lúc này." });
      }
    } finally {
      setProcessingAttendance(false);
    }
  }

  function runWorkItemAction(item: StaffOpsMobileWorkItem) {
    const action = item.action;
    if (!action) return;
    const key = workItemKey(item);
    const previousBundle = bundle;
    setProcessingWorkItemKey(key);
    setMessage({ tone: "neutral", text: `Đang xử lý: ${item.title}.` });
    setBundle((current) => ({ ...current, mobileOps: removeWorkItem(current.mobileOps, item) }));

    void (async () => {
      try {
        await runStaffMobileQuickAction(action, item.id);
        setMessage({ tone: "success", text: `Đã xử lý: ${item.title}.` });
        await refreshBundle();
      } catch (error) {
        setBundle(previousBundle);
        setMessage({ tone: "warning", text: error instanceof Error ? error.message : "Không thể xử lý việc trong ca." });
      } finally {
        setProcessingWorkItemKey(null);
      }
    })();
  }

  function runRequestAction() {
    if (!staff) return;
    if (requestBlockedReason) {
      setMessage({ tone: "warning", text: requestBlockedReason });
      return;
    }

    const payload: StaffRequestCreatePayload = {
      requestType: requestDraft.kind,
      staffMemberId: staff.id,
      branchId: selectedBranchId,
      reason: requestDraft.reason.trim() || undefined
    };

    if (requestDraft.kind === "leave_request") {
      payload.leaveType = requestDraft.leaveType;
      payload.fromDate = requestDraft.fromDate;
      payload.toDate = requestDraft.toDate;
    }
    if (requestDraft.kind === "shift_swap") {
      payload.shiftAssignmentId = requestShiftAssignmentIdForSubmit;
      payload.targetStaffMemberId = requestDraft.targetStaffMemberId || undefined;
    }
    if (requestDraft.kind === "overtime") {
      payload.fromDate = requestDraft.fromDate;
      payload.overtimeMinutes = normalizedOvertimeMinutes;
    }

    setSubmittingRequest(true);
    setMessage({ tone: "neutral", text: "Đang gửi yêu cầu cho quản lý." });
    void (async () => {
      try {
        await createStaffRequest(payload);
        setMessage({ tone: "success", text: `Đã gửi yêu cầu ${staffRequestLabel(requestDraft.kind).toLowerCase()}.` });
        setRequestDraft((current) => ({ ...current, reason: "" }));
        await refreshBundle();
      } catch (error) {
        setMessage({ tone: "warning", text: error instanceof Error ? error.message : "Không thể gửi yêu cầu lúc này." });
      } finally {
        setSubmittingRequest(false);
      }
    })();
  }

  function markNotificationRead(notificationId?: string) {
    setMarkingRead(true);
    void (async () => {
      try {
        await markStaffNotificationRead(notificationId ? { notificationId } : { all: true });
        setBundle((current) => ({
          ...current,
          notifications: current.notifications.map((notification) =>
            !notificationId || notification.id === notificationId ? { ...notification, status: "read" } : notification
          ),
          unreadNotificationCount: notificationId ? Math.max(0, current.unreadNotificationCount - 1) : 0
        }));
        await refreshBundle();
      } catch (error) {
        setMessage({ tone: "warning", text: error instanceof Error ? error.message : "Không thể cập nhật thông báo." });
      } finally {
        setMarkingRead(false);
      }
    })();
  }

  if (!staff) {
    return (
      <main className="stitch-admin grid min-h-screen place-items-center bg-[var(--background)] p-4 text-[var(--foreground)]">
        <div className="max-w-sm rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-5 text-center shadow-[var(--shadow-soft)]">
          <AlertTriangle className="mx-auto text-[var(--accent)]" aria-hidden="true" />
          <h1 className="mt-3 text-xl font-semibold">Chưa có hồ sơ nhân sự</h1>
          <p className="mt-2 text-sm font-medium text-[var(--muted-foreground)]">Vui lòng liên hệ quản lý để gán hồ sơ và chi nhánh.</p>
        </div>
      </main>
    );
  }

  const bottomDock = (
    <section className="sticky bottom-0 z-50 mt-3 -mx-3 border-t border-[var(--border)] bg-[rgba(255,254,251,0.86)] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-14px_34px_rgba(24,33,29,0.12)] backdrop-blur-xl sm:-mx-4 sm:px-4 lg:mx-0 lg:rounded-[14px] lg:border lg:px-3">
      {message ? (
        <div
          aria-live="polite"
          className={cn(
            "mb-2 rounded-xl border px-3 py-2 text-xs font-semibold",
            message.tone === "success"
              ? "border-[var(--primary)]/20 bg-[var(--success-soft)] text-[var(--primary)]"
              : message.tone === "neutral"
                ? "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]"
                : "border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent-strong)]"
          )}
        >
          {message.text}
        </div>
      ) : null}
      <div className="grid gap-2">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <label className="min-w-0">
            <span className="sr-only">Chi nhánh</span>
            <select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)} className="h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--foreground)] outline-none">
              {!bundle.branches.length ? <option value="">Chưa có chi nhánh</option> : null}
              {bundle.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <StaffStatusPill tone={offlineQueue.queue.length > 0 || !offlineQueue.isOnline ? "warning" : "success"} className="min-h-12">
            {offlineQueue.isOnline ? <Wifi size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}
            {machine.shortSourceLabel}
          </StaffStatusPill>
        </div>

        <StaffPrimaryButton onClick={() => void runClockAction(machine.source)} disabled={!machine.canSubmit || processingAttendance} tone={activeAttendance ? "danger" : "primary"}>
          {machine.source === "wifi" ? <Wifi size={18} aria-hidden="true" /> : machine.source === "qr" ? <Fingerprint size={18} aria-hidden="true" /> : <MapPin size={18} aria-hidden="true" />}
          {machine.primaryLabel}
        </StaffPrimaryButton>
        <div className="grid grid-cols-2 gap-2">
          <StaffSecondaryButton onClick={() => void runClockAction("wifi")} disabled={!selectedBranchId || !offlineQueue.isOnline || processingAttendance}>
            <Wifi size={17} aria-hidden="true" />
            WiFi quán
          </StaffSecondaryButton>
          <StaffSecondaryButton onClick={() => void runClockAction("qr")} disabled={!selectedBranchId || !qrReady || processingAttendance}>
            <Fingerprint size={17} aria-hidden="true" />
            QR
          </StaffSecondaryButton>
        </div>
        {offlineQueue.queue.length ? (
          <StaffSecondaryButton onClick={() => void offlineQueue.syncQueue({ force: true })} disabled={offlineQueue.syncing}>
            <RefreshCw size={16} className={offlineQueue.syncing ? "animate-spin" : undefined} aria-hidden="true" />
            Đồng bộ {offlineQueue.queue.length} thao tác
          </StaffSecondaryButton>
        ) : null}
      </div>
    </section>
  );

  return (
    <StaffMobileShell
      activeTab={activeTab}
      onTabChange={(tab) => {
        setActiveTab(tab);
        writeTabToUrl(tab);
      }}
      restaurantName={restaurantName}
      staffName={staff.fullName}
      roleTitle={staff.roleTitle}
      branchName={selectedBranchName}
      unreadCount={bundle.unreadNotificationCount}
      workCount={sortedWorkItems.length}
      requestCount={pendingRequestCount}
      todayMeta={activeAttendance ? activeDuration : String(todayAssignments.length || "--")}
      realtimeState={realtimeState}
      lastRefreshedLabel={relativeTime(bundle.generatedAt)}
      refreshing={refreshing}
      onRefresh={() => void refreshBundle()}
      bottomDock={bottomDock}
    >
      {activeTab === "today" ? (
        <StaffTodayPanel
          staff={staff}
          machine={machine}
          activeAttendance={activeAttendance}
          latestAttendance={latestAttendance}
          currentShift={currentShift}
          todayAssignments={todayAssignments}
          recentAttendance={recentAttendance}
          activeDuration={activeDuration}
        />
      ) : null}
      {activeTab === "work" ? (
        <StaffWorkPanel
          mobileOps={bundle.mobileOps}
          sortedWorkItems={sortedWorkItems}
          processingWorkItemKey={processingWorkItemKey}
          onRunWorkItem={runWorkItemAction}
        />
      ) : null}
      {activeTab === "requests" ? (
        <StaffRequestsPanel
          draft={requestDraft}
          onDraftChange={(patch) => setRequestDraft((current) => ({ ...current, ...patch }))}
          upcomingAssignments={upcomingAssignments}
          shiftSwapCandidates={bundle.mobileOps.shiftSwapCandidates}
          recentRequests={recentRequests}
          requestBlockedReason={requestBlockedReason}
          submitting={submittingRequest}
          submitLabel={submittingRequest ? "Đang gửi..." : `Gửi ${staffRequestLabel(requestDraft.kind).toLowerCase()}`}
          onSubmit={runRequestAction}
        />
      ) : null}
      {activeTab === "inbox" ? (
        <StaffInboxPanel
          notifications={bundle.notifications.slice(0, 12)}
          unreadCount={bundle.unreadNotificationCount}
          realtimeState={realtimeState}
          markingRead={markingRead}
          onMarkRead={(notificationId) => markNotificationRead(notificationId)}
          onMarkAllRead={() => markNotificationRead()}
        />
      ) : null}
    </StaffMobileShell>
  );
}
