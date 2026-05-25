"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BellRing, CalendarClock, CheckCircle2, Copy, CreditCard, PackageSearch, RefreshCw, RotateCcw, Send, ShieldCheck, TimerReset, Unlink } from "lucide-react";
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
    setNotice(`Đã đưa thông báo test ${testKindLabel(kind)} vào queue Telegram.`);
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
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("failed");
    }
  }

  const activeConnections = status?.connections.filter((connection) => connection.status === "active") ?? [];
  const failedCount = status?.failedNotificationCount ?? 0;
  const queue = status?.queue ?? null;
  const queueJobs = queue ? [...queue.deadLetterJobs, ...queue.failedJobs].slice(0, 3) : [];
  const bot = status?.bot ?? null;
  const setup = status?.setup ?? null;

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-container)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
              <Send size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--foreground)]">Telegram Ops Center</p>
              <p className="text-xs font-medium text-[var(--muted-foreground)]">{activeConnections.length} kết nối hoạt động</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => retryFailedNotifications()} disabled={failedCount === 0 || retryState === "loading"}>
            {retryState === "loading" && !retryingNotificationId ? <RefreshCw size={15} className="animate-spin" /> : <RotateCcw size={15} />}
            Retry lỗi
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => refreshStatus()}>
            <RefreshCw size={15} />
            Làm mới
          </Button>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex h-7 items-center rounded-md px-2 text-xs font-semibold", setupToneClass(setup?.state))}>
                {setupLabel(setup?.state)}
              </span>
              <span className="text-xs font-semibold text-[var(--muted-foreground)]">
                {bot?.username ?? "Bot chưa cấu hình"} · bot LogiVN
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">Cấu hình tích hợp bot cho chủ quán</p>
            <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">
              LogiVN cấp bot vận hành sẵn; chủ quán chỉ tạo link bảo mật, mở Telegram và xác thực tài khoản.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {bot?.startUrl ? (
              <a href={bot.startUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-3 text-sm font-semibold text-[var(--foreground)]">
                <Send size={15} />
                Mở bot
              </a>
            ) : null}
            <Button type="button" onClick={generateToken} disabled={requestState === "loading" || bot?.configured === false} size="sm">
              {requestState === "loading" ? <RefreshCw size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
              Tạo link tích hợp
            </Button>
          </div>
        </div>
        {setup?.steps?.length ? (
          <div className="mt-3 grid gap-2 md:grid-cols-5">
            {setup.steps.map((step) => (
              <div key={step.key} className="rounded-md border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", stepDotClass(step.status))} />
                  <span className="truncate text-xs font-semibold text-[var(--foreground)]">{step.label}</span>
                </div>
                <p className="mt-1 truncate text-[11px] font-medium text-[var(--muted-foreground)]">{step.detail}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <StatusTile label="Kết nối" value={activeConnections.length || "0"} tone={activeConnections.length > 0 ? "success" : "neutral"} />
            <StatusTile label="Lỗi gửi" value={failedCount} tone={failedCount > 0 ? "warning" : "success"} />
        <StatusTile
          label="Queue"
          value={queue?.available ? queue.backlog : "off"}
          tone={!queue || !queue.available ? "warning" : queue.backlog > 25 ? "warning" : "success"}
        />
        <StatusTile
          label="DLQ"
          value={queue?.available ? queue.deadLetters : "off"}
          tone={!queue || !queue.available ? "warning" : queue.deadLetters > 0 ? "warning" : "success"}
        />
        <StatusTile label="Callback" value="Signed" tone="success" />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="grid gap-2 text-sm font-semibold">
          Phạm vi chi nhánh
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
        <Button type="button" onClick={generateToken} disabled={requestState === "loading" || bot?.configured === false} className="self-end">
          {requestState === "loading" ? <RefreshCw size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          Tạo link tích hợp
        </Button>
      </div>

      {token ? (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-mono text-xs font-semibold text-[var(--foreground)]">{token.startUrl ?? `/start ${token.token}`}</p>
              <p className="mt-1 break-all text-xs font-medium text-[var(--muted-foreground)]">Trong Telegram bấm Start. Nếu chưa phản hồi, dán lệnh: {token.startCommand}</p>
              <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">Hết hạn {formatDateTime(token.expiresAt)}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="secondary" size="icon" aria-label="Copy link Telegram" onClick={() => copyConnectValue()}>
                <Copy size={16} />
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={copyStartCommand}>
                <Copy size={15} />
                Copy /start
              </Button>
              {token.startUrl ? (
                <a href={token.startUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-[#FFF7EB]">
                  <Send size={16} />
                  Mở
                </a>
              ) : null}
            </div>
          </div>
          {copyState === "copied" ? <p className="mt-2 text-xs font-semibold text-[var(--primary)]">Đã copy.</p> : null}
          {copyState === "failed" ? <p className="mt-2 text-xs font-semibold text-[var(--accent-strong)]">Không copy được, dùng chuỗi trên màn hình.</p> : null}
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">Kiểm thử nhanh</p>
            <p className="text-xs font-medium text-[var(--muted-foreground)]">{activeConnections.length > 0 ? "Queue Telegram thật đã sẵn sàng" : "Chưa có kết nối hoạt động"}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            {TELEGRAM_TEST_ACTIONS.map(({ kind, label, Icon }) => (
              <Button
                key={kind}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => sendTestNotification(kind)}
                disabled={activeConnections.length === 0 || testState === "loading"}
              >
                {testingKind === kind ? <RefreshCw size={15} className="animate-spin" /> : <Icon size={15} />}
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-4 flex gap-2 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] p-3 text-sm font-semibold text-[var(--accent-strong)]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {notice ? (
        <div className="mt-4 flex gap-2 rounded-xl border border-[var(--primary)]/20 bg-[var(--primary-soft)] p-3 text-sm font-semibold text-[var(--primary)]">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>{notice}</span>
        </div>
      ) : null}

      {queue && !queue.available ? (
        <div className="mt-4 flex gap-2 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] p-3 text-sm font-semibold text-[var(--accent-strong)]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>Gateway queue chưa sẵn sàng: {formatQueueReason(queue.reason)}</span>
        </div>
      ) : null}

      {activeConnections.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {activeConnections.map((connection) => (
            <div key={connection.id} className="grid gap-1 border-b border-[var(--border)] px-3 py-2 text-sm last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-[var(--foreground)]">
                  {connection.displayName}{connection.username ? ` @${connection.username}` : ""}
                </span>
                <span className="block text-xs font-medium text-[var(--muted-foreground)]">{connection.role} · {formatDateTime(connection.lastSeenAt ?? connection.connectedAt)}</span>
              </span>
              <span className="inline-flex items-center justify-end gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)]">
                  <CheckCircle2 size={14} />
                  active
                </span>
                <button
                  type="button"
                  aria-label="Ngắt kết nối Telegram"
                  onClick={() => revokeConnection(connection.id)}
                  disabled={revokingConnectionId === connection.id}
                  className="inline-grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] text-[var(--accent-strong)] transition hover:bg-[var(--accent-soft)] disabled:opacity-50"
                >
                  {revokingConnectionId === connection.id ? <RefreshCw size={13} className="animate-spin" /> : <Unlink size={13} />}
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {status?.recentNotifications?.length ? (
        <div className="mt-4 grid gap-2">
          {status.recentNotifications.slice(0, 3).map((notification) => (
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
        <div className="mt-4 grid gap-2">
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
    </section>
  );
}

function isRetryableStatus(status: string) {
  return status === "failed" || status === "rate_limited";
}

function testKindLabel(kind: TelegramTestKind) {
  const action = TELEGRAM_TEST_ACTIONS.find((item) => item.kind === kind);
  return action?.label ?? "Telegram";
}

function setupLabel(state?: TelegramStatus["setup"]["state"]) {
  if (state === "ready") return "Sẵn sàng";
  if (state === "connected") return "Đã kết nối";
  if (state === "ready_to_connect") return "Chờ xác thực";
  return "Cần cấu hình";
}

function setupToneClass(state?: TelegramStatus["setup"]["state"]) {
  if (state === "ready" || state === "connected") return "bg-[var(--primary-soft)] text-[var(--primary)]";
  if (state === "ready_to_connect") return "bg-[var(--soft-surface)] text-[var(--foreground)]";
  return "bg-[var(--accent-soft)] text-[var(--accent-strong)]";
}

function stepDotClass(status: "done" | "pending" | "warning") {
  if (status === "done") return "bg-[var(--primary)]";
  if (status === "warning") return "bg-[var(--accent-strong)]";
  return "bg-[var(--muted-foreground)]";
}

function StatusTile({ label, value, tone }: { label: string; value: string | number; tone: "success" | "warning" | "neutral" }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2", tone === "success" && "border-[var(--primary)]/20 bg-[var(--primary-soft)]", tone === "warning" && "border-[var(--accent)]/25 bg-[var(--accent-soft)]", tone === "neutral" && "border-[var(--border)] bg-[var(--soft-surface)]")}>
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
