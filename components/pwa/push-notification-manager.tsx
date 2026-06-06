"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, BellRing, CheckCircle2, Loader2, Send, X } from "lucide-react";
import { resolvePwaPushNotificationUi, type PwaPushLoadState, type PwaPushNotice, type PwaPushPermission } from "@/lib/pwa/push-notification-ui";

type PushConfigResponse = {
  configured: boolean;
  publicKey: string;
  activeCount: number;
  subscriptions: Array<{ id: string; enabled: boolean }>;
};

type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

type PushSendSummary = {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
  disabled: number;
};

const DISMISS_KEY = "logivn:pwa-push-dismissed";

export function PushNotificationManager() {
  const pathname = usePathname();
  const inDashboard = pathname?.startsWith("/dashboard") ?? false;
  const isSettings = pathname === "/dashboard/settings";
  const [supported] = useState(() => isPushSupported());
  const [loadState, setLoadState] = useState<PwaPushLoadState>(() => {
    if (process.env.NODE_ENV !== "production") return "development";
    return isPushSupported() ? "loading" : "ready";
  });
  const [config, setConfig] = useState<PushConfigResponse | null>(null);
  const [permission, setPermission] = useState<PwaPushPermission>(() => (isPushSupported() ? window.Notification.permission : "unsupported"));
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState<"subscribe" | "test" | "unsubscribe" | null>(null);
  const [notice, setNotice] = useState<PwaPushNotice | null>(null);
  const [dismissed, setDismissed] = useState(() => (typeof window === "undefined" ? false : window.localStorage.getItem(DISMISS_KEY) === "1"));

  const ui = useMemo(
    () =>
      resolvePwaPushNotificationUi({
        inDashboard,
        isSettings,
        supported,
        configured: Boolean(config?.configured),
        hasPublicKey: Boolean(config?.publicKey),
        permission,
        currentSubscribed: subscribed,
        activeCount: config?.activeCount ?? 0,
        dismissed,
        loadState,
        notice
      }),
    [config?.activeCount, config?.configured, config?.publicKey, dismissed, inDashboard, isSettings, loadState, notice, permission, subscribed, supported]
  );

  useEffect(() => {
    if (!inDashboard) return;
    if (process.env.NODE_ENV !== "production") return;
    if (!supported) return;

    let cancelled = false;
    fetch("/api/admin/push-subscriptions", { cache: "no-store" })
      .then((response) => response.json() as Promise<ApiResponse<PushConfigResponse>>)
      .then(async (payload) => {
        if (cancelled) return;
        if (!payload.ok || !payload.data) {
          setLoadState("error");
          return;
        }

        const nextConfig = payload.data;
        setConfig(nextConfig);
        const currentPermission = window.Notification.permission;
        setPermission(currentPermission);
        const existing = await getCurrentPushSubscription();
        if (cancelled) return;

        if (existing && nextConfig.configured && nextConfig.publicKey) {
          try {
            await savePushSubscription(existing, currentPermission);
            if (cancelled) return;
            setConfig({ ...nextConfig, activeCount: Math.max(1, nextConfig.activeCount) });
            setSubscribed(true);
          } catch {
            setSubscribed(false);
          }
        } else {
          setSubscribed(false);
        }
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [inDashboard, supported]);

  if (!ui.shouldRender) return null;

  async function enablePush() {
    if (!config?.publicKey) return;
    setBusy("subscribe");
    setNotice(null);

    try {
      const nextPermission = await window.Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        setNotice({ tone: "warning", text: "Trình duyệt chưa cho phép thông báo." });
        return;
      }

      const registration = await ensurePushRegistration();
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.publicKey)
        }));

      await savePushSubscription(subscription, nextPermission);

      setSubscribed(true);
      setDismissed(false);
      window.localStorage.removeItem(DISMISS_KEY);
      setConfig((current) => (current ? { ...current, activeCount: Math.max(1, current.activeCount + 1) } : current));
      setNotice({ tone: "success", text: "Đã bật thông báo trên thiết bị này." });
      await clearAppBadge();
    } catch (error) {
      setNotice({ tone: "warning", text: error instanceof Error ? error.message : "Không bật được thông báo." });
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy("test");
    setNotice(null);
    try {
      const result = await postJson<PushSendSummary>("/api/admin/push-subscriptions/test", {});
      if (!result?.sent) {
        if ((result?.disabled ?? 0) > 0 || (result?.scanned ?? 0) === 0) {
          setSubscribed(false);
          setConfig((current) => (current ? { ...current, activeCount: Math.max(0, current.activeCount - (result?.disabled ?? 0)) } : current));
        }
        setNotice({
          tone: "warning",
          text: result?.failed ? "Thiết bị đã đăng ký nhưng Web Push trả lỗi. Tắt rồi bật lại thông báo." : "Chưa có thiết bị nhận Web Push. Hãy bấm Bật trên máy này."
        });
        return;
      }
      setNotice({ tone: "success", text: "Đã gửi thông báo thử tới thiết bị." });
    } catch (error) {
      setNotice({ tone: "warning", text: error instanceof Error ? error.message : "Không gửi được thông báo thử." });
    } finally {
      setBusy(null);
    }
  }

  async function disablePush() {
    setBusy("unsubscribe");
    setNotice(null);
    try {
      const subscription = await getCurrentPushSubscription();
      if (!subscription) {
        setSubscribed(false);
        setNotice({ tone: "warning", text: "Máy này chưa có endpoint Web Push để tắt." });
        return;
      }
      await postJson("/api/admin/push-subscriptions", { endpoint: subscription.endpoint }, "DELETE");
      await subscription?.unsubscribe();
      setSubscribed(false);
      setConfig((current) => (current ? { ...current, activeCount: Math.max(0, current.activeCount - 1) } : current));
      setNotice({ tone: "success", text: "Đã tắt thông báo trên thiết bị này." });
    } catch (error) {
      setNotice({ tone: "warning", text: error instanceof Error ? error.message : "Không tắt được thông báo." });
    } finally {
      setBusy(null);
    }
  }

  function dismissPrompt() {
    if (isSettings) return;
    window.localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  const isLoading = loadState === "loading" && !notice;

  return (
    <div className="fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[var(--z-dashboard-toast)] mx-auto max-w-md sm:inset-x-auto sm:right-4 sm:max-w-sm">
      <div className="rounded-lg border border-[var(--primary)]/20 bg-[var(--surface)] p-3 text-[var(--foreground)] shadow-[var(--shadow-soft)]">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${ui.tone === "warning" ? "bg-[var(--warning-soft)] text-[var(--warning)]" : ui.tone === "success" ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "bg-[var(--surface-container)] text-[var(--muted-foreground)]"}`}>
            {isLoading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : ui.tone === "success" ? <CheckCircle2 size={18} aria-hidden="true" /> : ui.tone === "warning" ? <AlertTriangle size={18} aria-hidden="true" /> : <BellRing size={18} aria-hidden="true" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-5">{ui.title}</p>
            {ui.detail ? <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{ui.detail}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {ui.canEnable ? (
                <button type="button" onClick={enablePush} disabled={Boolean(busy)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--primary)] px-3 text-sm font-semibold text-[#FFF7EB]">
                  {busy === "subscribe" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <BellRing size={16} aria-hidden="true" />}
                  Bật
                </button>
              ) : null}
              {ui.canSendTest ? (
                <button type="button" onClick={sendTest} disabled={Boolean(busy)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--foreground)]">
                  {busy === "test" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
                  Gửi thử
                </button>
              ) : null}
              {ui.canDisable ? (
                <button type="button" onClick={disablePush} disabled={Boolean(busy)} className="inline-flex min-h-10 items-center rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-3 text-sm font-semibold text-[var(--muted-foreground)]">
                  Tắt
                </button>
              ) : null}
            </div>
          </div>
          {ui.showClose ? (
            <button type="button" onClick={notice ? () => setNotice(null) : dismissPrompt} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--muted-foreground)]" aria-label="Ẩn thông báo PWA">
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function isPushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;
}

async function ensurePushRegistration() {
  const current = await navigator.serviceWorker.getRegistration("/");
  if (current) return current;
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

async function getCurrentPushSubscription() {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration?.pushManager.getSubscription() ?? null;
}

async function savePushSubscription(subscription: PushSubscription, permissionState: NotificationPermission) {
  await postJson("/api/admin/push-subscriptions", {
    subscription: subscription.toJSON(),
    device: {
      appSurface: "dashboard",
      permissionState,
      platform: navigator.platform || null,
      userAgent: navigator.userAgent || null,
      deviceLabel: browserDeviceLabel()
    }
  });
}

async function postJson<T>(url: string, payload: unknown, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload)
  });
  const body = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!response.ok || body?.ok !== true) {
    throw new Error(body?.error || "Không thể xử lý yêu cầu thông báo.");
  }
  return body.data as T;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function browserDeviceLabel() {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS PWA";
  if (/android/i.test(ua)) return "Android PWA";
  if (/edg/i.test(ua)) return "Edge PWA";
  if (/chrome|crios/i.test(ua)) return "Chrome PWA";
  if (/safari/i.test(ua)) return "Safari PWA";
  return "LogiVN PWA";
}

async function clearAppBadge() {
  try {
    if ("clearAppBadge" in navigator) await navigator.clearAppBadge();
  } catch {
    // Badge support varies by browser and install mode.
  }
}
