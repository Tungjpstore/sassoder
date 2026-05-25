"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  MoreHorizontal,
  PackageSearch,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  TimerReset,
  Unlink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TelegramBranchOption = {
  id: string;
  name: string;
  isPrimary: boolean;
  isActive: boolean;
};

type TelegramConnectionView = {
  id: string;
  branchId: string | null;
  username: string | null;
  displayName: string;
  role: "ADMIN" | "STAFF";
  status: string;
  connectedAt: string;
  lastSeenAt: string | null;
};

type TelegramNotificationView = {
  id: string;
  eventType: string;
  status: string;
  title: string;
  sentAt: string | null;
  failedAt: string | null;
  lastError: string | null;
  createdAt: string;
};

type TelegramQueueCounts = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  paused: number;
};

type TelegramQueueJobView = {
  id: string | null;
  name: string | null;
  attemptsMade: number;
  failedReason: string | null;
  failedAt: string | null;
  processedAt: string | null;
  createdAt: string | null;
};

type TelegramQueueStatus = {
  available: boolean;
  reason?: string;
  queueName: string;
  dlqName: string;
  counts: TelegramQueueCounts | null;
  deadLetterCounts: TelegramQueueCounts | null;
  backlog: number;
  deadLetters: number;
  failedJobs: TelegramQueueJobView[];
  deadLetterJobs: TelegramQueueJobView[];
};

type TelegramStatus = {
  connected: boolean;
  activeConnectionCount: number;
  failedNotificationCount: number;
  bot: {
    mode: "logivn_managed_bot";
    configured: boolean;
    username: string | null;
    startUrl: string | null;
    connectTtlSeconds: number;
    canCreateBotAutomatically: boolean;
  };
  setup: {
    state: "ready" | "connected" | "ready_to_connect" | "needs_attention";
    steps: Array<{
      key: string;
      label: string;
      status: "done" | "pending" | "warning";
      detail: string;
    }>;
  };
  queue: TelegramQueueStatus;
  connections: TelegramConnectionView[];
  recentNotifications: TelegramNotificationView[];
};

type GeneratedToken = {
  token: string;
  expiresAt: string;
  startUrl: string | null;
  startCommand: string;
};

type RequestState = "idle" | "loading" | "success" | "error";
type TelegramTestKind = "order" | "payment" | "reservation" | "inventory" | "sla";

const TELEGRAM_TEST_ACTIONS: Array<{ kind: TelegramTestKind; label: string; Icon: typeof BellRing }> = [
  { kind: "order", label: "Đơn", Icon: BellRing },
  { kind: "payment", label: "VietQR", Icon: CreditCard },
  { kind: "reservation", label: "Đặt bàn", Icon: CalendarClock },
  { kind: "inventory", label: "Kho", Icon: PackageSearch },
  { kind: "sla", label: "SLA", Icon: TimerReset }
];

const TELEGRAM_SETUP_STEPS = [
  {
    key: "secure-link",
    title: "Tạo link",
    description: "Chọn phạm vi nhận cảnh báo rồi tạo link riêng cho tài khoản của bạn.",
    image: "/brand/logivn/telegram-setup/secure-link.png"
  },
  {
    key: "telegram-start",
    title: "Bấm Start",
    description: "Mở Telegram, bấm Start hoặc dán lệnh dự phòng nếu máy không tự gửi.",
    image: "/brand/logivn/telegram-setup/telegram-start.png"
  },
  {
    key: "ops-command",
    title: "Điều hành",
    description: "Nhận đơn, VietQR, đặt bàn và cảnh báo quan trọng ngay trong Telegram.",
    image: "/brand/logivn/telegram-setup/ops-command.png"
  }
];

export function TelegramConnectPanel({ branches }: { branches: TelegramBranchOption[] }) {
  const activeBranches = useMemo(() => branches.filter((branch) => branch.isActive), [branches]);
  const primaryBranch = activeBranches.find((branch) => branch.isPrimary) ?? activeBranches[0] ?? null;
  const [selectedBranchId, setSelectedBranchId] = useState<string>(primaryBranch?.id ?? "");
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [token, setToken] = useState<GeneratedToken | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [retryState, setRetryState] = useState<RequestState>("idle");
  const [testState, setTestState] = useState<RequestState>("idle");
  const [testingKind, setTestingKind] = useState<TelegramTestKind | null>(null);
  const [retryingNotificationId, setRetryingNotificationId] = useState<string | null>(null);
  const [revokingConnectionId, setRevokingConnectionId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const tokenBaselineConnectionCount = useRef(0);

  useEffect(() => {
    refreshStatus();
  }, []);

  useEffect(() => {
    if (!token) return;
    const expiresAt = new Date(token.expiresAt).getTime();
    let stopped = false;

    const interval = window.setInterval(async () => {
      if (Date.now() >= expiresAt) {
        window.clearInterval(interval);
        return;
      }

      const nextStatus = await refreshStatus({ clearNotice: false });
      if (stopped || !nextStatus) return;
      if (nextStatus.activeConnectionCount > tokenBaselineConnectionCount.current) {
        setNotice("Đã kết nối Telegram.");
        setToken(null);
        window.clearInterval(interval);
      }
    }, 4000);

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [token]);

  async function refreshStatus({ clearNotice = true }: { clearNotice?: boolean } = {}): Promise<TelegramStatus | null> {
    setError(null);
    if (clearNotice) setNotice(null);
    const response = await fetch("/api/admin/telegram/status", { credentials: "same-origin" }).catch(() => null);
    if (!response) {
      setError("Không đọc được trạng thái Telegram.");
      return null;
    }
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.ok === false) {
      setError(body?.error ?? "Không đọc được trạng thái Telegram.");
      return null;
    }
    setStatus(body.data);
    return body.data as TelegramStatus;
  }

  async function generateToken() {
    setRequestState("loading");
    setCopyState("idle");
    setError(null);
    setNotice(null);

    const response = await fetch("/api/admin/telegram/connect-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ branchId: selectedBranchId || null })
    }).catch(() => null);

    if (!response) {
      setRequestState("error");
      setError("Không tạo được link kết nối Telegram.");
      return;
    }

    const body = await response.json().catch(() => null);
    if (!response.ok || body?.ok === false) {
      setRequestState("error");
      setError(body?.error ?? "Không tạo được link kết nối Telegram.");
      return;
    }

    tokenBaselineConnectionCount.current = status?.activeConnectionCount ?? 0;
    setToken(body.data);
    setRequestState("success");
    setNotice("Link đã sẵn sàng. Mở Telegram rồi bấm Start để xác nhận kết nối.");
  }

  async function retryFailedNotifications(notificationId?: string) {
    setRetryState("loading");
    setRetryingNotificationId(notificationId ?? null);
    setError(null);
    setNotice(null);

    const response = await fetch("/api/admin/telegram/notifications/retry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(notificationId ? { notificationId, limit: 1 } : { limit: 25 })
    }).catch(() => null);

    if (!response) {
      setRetryState("error");
      setError("Không gửi được retry Telegram.");
      setRetryingNotificationId(null);
      return;
    }

    const body = await response.json().catch(() => null);
    if (!response.ok || body?.ok === false) {
      setRetryState("error");
      setError(body?.error ?? "Không gửi được retry Telegram.");
      setRetryingNotificationId(null);
      return;
    }

    setRetryState("success");
    setNotice(`Đã đưa ${body.data?.queued ?? 0} thông báo vào queue retry.`);
    setRetryingNotificationId(null);
    await refreshStatus({ clearNotice: false });
  }

  async function sendTestNotification(kind: TelegramTestKind) {
    setTestState("loading");
    setTestingKind(kind);
    setError(null);
    setNotice(null);

    const response = await fetch("/api/admin/telegram/test-notification", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ branchId: selectedBranchId || null, kind })
    }).catch(() => null);

    if (!response) {
      setTestState("error");
      setTestingKind(null);
      setError("Không gửi được thông báo test Telegram.");
      return;
    }

    const body = await response.json().catch(() => null);
    if (!response.ok || body?.ok === false) {
      setTestState("error");
      setTestingKind(null);
      setError(body?.error ?? "Không gửi được thông báo test Telegram.");
      return;
    }

    setTestState("success");
    setTestingKind(null);
    setNotice(`Đã gửi thử ${testKindLabel(kind)} qua Telegram.`);
    await refreshStatus({ clearNotice: false });
  }

  async function revokeConnection(connectionId: string) {
    if (!window.confirm("Ngắt kết nối Telegram này?")) return;
    setRevokingConnectionId(connectionId);
    setError(null);
    setNotice(null);

    const response = await fetch("/api/admin/telegram/connections/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ connectionId })
    }).catch(() => null);

    if (!response) {
      setError("Không ngắt được kết nối Telegram.");
      setRevokingConnectionId(null);
      return;
    }

    const body = await response.json().catch(() => null);
    if (!response.ok || body?.ok === false) {
      setError(body?.error ?? "Không ngắt được kết nối Telegram.");
      setRevokingConnectionId(null);
      return;
    }

    setNotice("Đã ngắt kết nối Telegram.");
    setRevokingConnectionId(null);
    await refreshStatus({ clearNotice: false });
  }

  async function copyConnectValue(value?: string | null) {
    const copyValue = value ?? token?.startUrl ?? token?.startCommand ?? token?.token;
    if (!copyValue) return;
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("failed");
    }
  }

  async function copyStartCommand() {
    const value = token?.startCommand ?? (token ? `/start ${token.token}` : null);
    if (!value) return;
    await copyConnectValue(value);
  }

  const activeConnections = status?.connections.filter((connection) => connection.status === "active") ?? [];
  const failedCount = status?.failedNotificationCount ?? 0;
  const queue = status?.queue ?? null;
  const queueJobs = queue ? [...queue.deadLetterJobs, ...queue.failedJobs].slice(0, 3) : [];
  const bot = status?.bot ?? null;
  const connected = activeConnections.length > 0;
  const primaryConnection = activeConnections[0] ?? null;

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="grid gap-4 border-b border-[var(--border)] p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
              <Send size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold text-[var(--foreground)]">Telegram cho chủ quán</p>
              <p className="mt-0.5 text-sm font-medium text-[var(--muted-foreground)]">
                {connected ? `${activeConnections.length} tài khoản đang nhận cảnh báo` : "Kết nối một lần, nhận cảnh báo và thao tác nhanh trên điện thoại."}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={cn("inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold", connected ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "bg-[var(--soft-surface)] text-[var(--muted-foreground)]")}>
            {connected ? <CheckCircle2 size={15} /> : <ShieldCheck size={15} />}
            {connected ? "Đã kết nối" : status ? "Chưa kết nối" : "Đang kiểm tra"}
          </span>
          <Button type="button" variant="secondary" size="icon" aria-label="Làm mới Telegram" onClick={() => refreshStatus()}>
            <RefreshCw size={15} />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 p-4">
        {!connected ? (
          <SetupFlow
            activeBranches={activeBranches}
            selectedBranchId={selectedBranchId}
            setSelectedBranchId={setSelectedBranchId}
            generateToken={generateToken}
            requestState={requestState}
            botConfigured={bot?.configured !== false}
          />
        ) : (
          <ConnectedFlow
            botStartUrl={bot?.startUrl ?? null}
            primaryConnection={primaryConnection}
            activeConnectionCount={activeConnections.length}
            sendTestNotification={sendTestNotification}
            testState={testState}
            testingKind={testingKind}
          />
        )}

        {token ? (
          <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary-soft)] p-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--primary)]">Link đã tạo</p>
                <p className="mt-1 text-sm font-medium text-[var(--foreground)]">Mở Telegram rồi bấm Start. Nếu không thấy phản hồi, copy lệnh dự phòng và dán vào bot.</p>
                <p className="mt-2 break-all font-mono text-xs font-semibold text-[var(--muted-foreground)]">{token.startCommand}</p>
                <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">Hết hạn {formatDateTime(token.expiresAt)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={copyStartCommand}>
                  <Copy size={15} />
                  Copy /start
                </Button>
                {token.startUrl ? (
                  <a href={token.startUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-[#FFF7EB]">
                    <Send size={16} />
                    Mở Telegram
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <InlineMessage kind="error" message={error} />
        <InlineMessage kind="success" message={notice} />
        {copyState === "copied" ? <InlineMessage kind="success" message="Đã copy." /> : null}
        {copyState === "failed" ? <InlineMessage kind="error" message="Không copy được. Hãy copy thủ công lệnh /start." /> : null}

        <AdvancedTelegramPanel
          activeConnections={activeConnections}
          failedCount={failedCount}
          queue={queue}
          queueJobs={queueJobs}
          recentNotifications={status?.recentNotifications ?? []}
          retryState={retryState}
          retryingNotificationId={retryingNotificationId}
          revokeConnection={revokeConnection}
          revokingConnectionId={revokingConnectionId}
          retryFailedNotifications={retryFailedNotifications}
        />
      </div>
    </section>
  );
}

function SetupFlow({
  activeBranches,
  selectedBranchId,
  setSelectedBranchId,
  generateToken,
  requestState,
  botConfigured
}: {
  activeBranches: TelegramBranchOption[];
  selectedBranchId: string;
  setSelectedBranchId: (value: string) => void;
  generateToken: () => void;
  requestState: RequestState;
  botConfigured: boolean;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px_auto] lg:items-end">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">Bắt đầu trong 30 giây</p>
          <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Tạo link riêng cho tài khoản đang đăng nhập. Link có hạn và chỉ dùng một lần.</p>
        </div>
        <label className="grid gap-2 text-sm font-semibold">
          Phạm vi
          <select
            value={selectedBranchId}
            onChange={(event) => setSelectedBranchId(event.target.value)}
            className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
          >
            <option value="">Toàn quán</option>
            {activeBranches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" onClick={generateToken} disabled={requestState === "loading" || !botConfigured} className="h-11">
          {requestState === "loading" ? <RefreshCw size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          Tạo link
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {TELEGRAM_SETUP_STEPS.map((step, index) => (
          <div key={step.key} className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--soft-surface)]">
            <img src={step.image} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
            <div className="p-3">
              <p className="text-xs font-semibold text-[var(--muted-foreground)]">Bước {index + 1}</p>
              <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{step.title}</p>
              <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectedFlow({
  botStartUrl,
  primaryConnection,
  activeConnectionCount,
  sendTestNotification,
  testState,
  testingKind
}: {
  botStartUrl: string | null;
  primaryConnection: TelegramConnectionView | null;
  activeConnectionCount: number;
  sendTestNotification: (kind: TelegramTestKind) => void;
  testState: RequestState;
  testingKind: TelegramTestKind | null;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="rounded-lg border border-[var(--primary)]/20 bg-[var(--primary-soft)] p-4">
        <p className="text-sm font-semibold text-[var(--primary)]">Đang hoạt động</p>
        <p className="mt-2 text-xl font-semibold text-[var(--foreground)]">{activeConnectionCount} kết nối Telegram</p>
        <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">
          {primaryConnection ? `${primaryConnection.displayName}${primaryConnection.username ? ` @${primaryConnection.username}` : ""}` : "Sẵn sàng nhận cảnh báo"}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {botStartUrl ? (
            <a href={botStartUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--foreground)]">
              <ExternalLink size={15} />
              Mở bot
            </a>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-4">
        <p className="text-sm font-semibold text-[var(--foreground)]">Gửi thử một tín hiệu</p>
        <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Chọn đúng loại cảnh báo mà chủ quán sẽ nhận trong giờ vận hành.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {TELEGRAM_TEST_ACTIONS.map(({ kind, label, Icon }) => (
            <Button
              key={kind}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => sendTestNotification(kind)}
              disabled={testState === "loading"}
            >
              {testingKind === kind ? <RefreshCw size={15} className="animate-spin" /> : <Icon size={15} />}
              {label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdvancedTelegramPanel({
  activeConnections,
  failedCount,
  queue,
  queueJobs,
  recentNotifications,
  retryState,
  retryingNotificationId,
  revokeConnection,
  revokingConnectionId,
  retryFailedNotifications
}: {
  activeConnections: TelegramConnectionView[];
  failedCount: number;
  queue: TelegramQueueStatus | null;
  queueJobs: TelegramQueueJobView[];
  recentNotifications: TelegramNotificationView[];
  retryState: RequestState;
  retryingNotificationId: string | null;
  revokeConnection: (connectionId: string) => void;
  revokingConnectionId: string | null;
  retryFailedNotifications: (notificationId?: string) => void;
}) {
  return (
    <details className="rounded-lg border border-[var(--border)] bg-[var(--soft-surface)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-sm font-semibold text-[var(--foreground)]">
        <span className="inline-flex items-center gap-2">
          <MoreHorizontal size={16} />
          Nâng cao
        </span>
        <span className="text-xs font-medium text-[var(--muted-foreground)]">Queue, retry, kết nối</span>
      </summary>

      <div className="grid gap-3 border-t border-[var(--border)] p-3">
        <div className="grid gap-2 md:grid-cols-4">
          <StatusTile label="Kết nối" value={activeConnections.length || "0"} tone={activeConnections.length > 0 ? "success" : "neutral"} />
          <StatusTile label="Lỗi gửi" value={failedCount} tone={failedCount > 0 ? "warning" : "success"} />
          <StatusTile label="Queue" value={queue?.available ? queue.backlog : "off"} tone={!queue || !queue.available ? "warning" : queue.backlog > 25 ? "warning" : "success"} />
          <StatusTile label="DLQ" value={queue?.available ? queue.deadLetters : "off"} tone={!queue || !queue.available ? "warning" : queue.deadLetters > 0 ? "warning" : "success"} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => retryFailedNotifications()} disabled={failedCount === 0 || retryState === "loading"}>
            {retryState === "loading" && !retryingNotificationId ? <RefreshCw size={15} className="animate-spin" /> : <RotateCcw size={15} />}
            Retry lỗi
          </Button>
        </div>

        {queue && !queue.available ? (
          <InlineMessage kind="error" message={`Gateway queue chưa sẵn sàng: ${formatQueueReason(queue.reason)}`} />
        ) : null}

        {activeConnections.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            {activeConnections.map((connection) => (
              <div key={connection.id} className="grid gap-1 border-b border-[var(--border)] px-3 py-2 text-sm last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-[var(--foreground)]">
                    {connection.displayName}
                    {connection.username ? ` @${connection.username}` : ""}
                  </span>
                  <span className="block text-xs font-medium text-[var(--muted-foreground)]">{connection.role} · {formatDateTime(connection.lastSeenAt ?? connection.connectedAt)}</span>
                </span>
                <button
                  type="button"
                  aria-label="Ngắt kết nối Telegram"
                  onClick={() => revokeConnection(connection.id)}
                  disabled={revokingConnectionId === connection.id}
                  className="inline-grid h-8 w-8 place-items-center rounded-md border border-[var(--border)] text-[var(--accent-strong)] transition hover:bg-[var(--accent-soft)] disabled:opacity-50"
                >
                  {revokingConnectionId === connection.id ? <RefreshCw size={14} className="animate-spin" /> : <Unlink size={14} />}
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {recentNotifications.length ? (
          <div className="grid gap-2">
            {recentNotifications.slice(0, 3).map((notification) => (
              <div key={notification.id} className="grid gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <span className="truncate font-semibold text-[var(--foreground)]">{notification.title}</span>
                  <span className={cn("shrink-0 font-semibold", notification.status === "sent" ? "text-[var(--primary)]" : "text-[var(--accent-strong)]")}>{notification.status}</span>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-[var(--muted-foreground)]">{notification.eventType} · {formatDateTime(notification.sentAt ?? notification.failedAt ?? notification.createdAt)}</span>
                  {isRetryableStatus(notification.status) ? (
                    <button
                      type="button"
                      aria-label="Retry Telegram notification"
                      onClick={() => retryFailedNotifications(notification.id)}
                      disabled={retryState === "loading"}
                      className="inline-grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[var(--border)] text-[var(--primary)] transition hover:bg-[var(--primary-soft)] disabled:opacity-50"
                    >
                      {retryingNotificationId === notification.id ? <RefreshCw size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {queueJobs.length > 0 ? (
          <div className="grid gap-2">
            {queueJobs.map((job, index) => (
              <div key={`${job.id ?? "job"}-${index}`} className="grid gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <span className="truncate font-semibold text-[var(--foreground)]">{job.name ?? "telegram job"}</span>
                  <span className="shrink-0 font-semibold text-[var(--accent-strong)]">{job.attemptsMade} lần</span>
                </div>
                <span className="truncate text-[var(--muted-foreground)]">
                  {job.failedReason ?? "Không có lỗi chi tiết"} · {formatDateTime(job.failedAt ?? job.processedAt ?? job.createdAt)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function InlineMessage({ kind, message }: { kind: "success" | "error"; message: string | null }) {
  if (!message) return null;
  const success = kind === "success";
  return (
    <div className={cn("flex gap-2 rounded-lg border p-3 text-sm font-semibold", success ? "border-[var(--primary)]/20 bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent-strong)]")}>
      {success ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
      <span>{message}</span>
    </div>
  );
}

function isRetryableStatus(status: string) {
  return status === "failed" || status === "rate_limited";
}

function testKindLabel(kind: TelegramTestKind) {
  const action = TELEGRAM_TEST_ACTIONS.find((item) => item.kind === kind);
  return action?.label ?? "Telegram";
}

function StatusTile({ label, value, tone }: { label: string; value: string | number; tone: "success" | "warning" | "neutral" }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2", tone === "success" && "border-[var(--primary)]/20 bg-[var(--primary-soft)]", tone === "warning" && "border-[var(--accent)]/25 bg-[var(--accent-soft)]", tone === "neutral" && "border-[var(--border)] bg-[var(--surface)]")}>
      <p className="text-xs font-semibold text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-1 metric-number text-xl font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function formatQueueReason(reason?: string) {
  if (!reason) return "gateway_unavailable";
  if (reason === "missing_gateway_config") return "thiếu LOGIVN_API_INTERNAL_URL hoặc LOGIVN_INTERNAL_API_KEY";
  return reason;
}

function formatDateTime(value: string | null) {
  if (!value) return "chưa có";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}
