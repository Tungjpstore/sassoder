"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { BellRing, CheckCircle2, Loader2, Send, X } from "lucide-react";

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

type Notice = {
  tone: "success" | "warning";
  text: string;
};

const DISMISS_KEY = "logivn:pwa-push-dismissed";

export function PushNotificationManager() {
  const pathname = usePathname();
  const inDashboard = pathname?.startsWith("/dashboard") ?? false;
  const [supported] = useState(() => isPushSupported());
  const [config, setConfig] = useState<PushConfigResponse | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => (isPushSupported() ? window.Notification.permission : "unsupported"));
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState<"subscribe" | "test" | "unsubscribe" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dismissed, setDismissed] = useState(() => (typeof window === "undefined" ? false : window.localStorage.getItem(DISMISS_KEY) === "1"));

  const canPrompt = useMemo(() => {
    if (!inDashboard || !supported || !config?.configured || !config.publicKey) return false;
    if (permission === "denied" || permission === "unsupported") return false;
    return !subscribed && !dismissed;
  }, [config, dismissed, inDashboard, permission, subscribed, supported]);

  useEffect(() => {
    if (!inDashboard) return;
    if (process.env.NODE_ENV !== "production") return;
    if (!supported) return;

    let cancelled = false;
    fetch("/api/admin/push-subscriptions", { cache: "no-store" })
      .then((response) => response.json() as Promise<ApiResponse<PushConfigResponse>>)
      .then(async (payload) => {
        if (cancelled || !payload.ok || !payload.data) return;
        setConfig(payload.data);
        const existing = await getCurrentPushSubscription();
        if (cancelled) return;
        setSubscribed(Boolean(existing) || payload.data.activeCount > 0);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [inDashboard, supported]);

  if (!inDashboard || (!canPrompt && !notice && !(subscribed && pathname === "/dashboard/settings"))) return null;

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

      await postJson("/api/admin/push-subscriptions", {
        subscription: subscription.toJSON(),
        device: {
          appSurface: "dashboard",
          permissionState: nextPermission,
          platform: navigator.platform || null,
          userAgent: navigator.userAgent || null,
          deviceLabel: browserDeviceLabel()
        }
      });

      setSubscribed(true);
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
      await postJson("/api/admin/push-subscriptions/test", {});
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
      await postJson("/api/admin/push-subscriptions", { endpoint: subscription?.endpoint ?? null }, "DELETE");
      await subscription?.unsubscribe();
      setSubscribed(false);
      setNotice({ tone: "success", text: "Đã tắt thông báo trên thiết bị này." });
    } catch (error) {
      setNotice({ tone: "warning", text: error instanceof Error ? error.message : "Không tắt được thông báo." });
    } finally {
      setBusy(null);
    }
  }

  function dismissPrompt() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  const isSettings = pathname === "/dashboard/settings";
  const showSubscribedTools = subscribed && isSettings;

  return (
    <div className="fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[var(--z-dashboard-toast)] mx-auto max-w-md sm:inset-x-auto sm:right-4 sm:max-w-sm">
      <div className="rounded-lg border border-[var(--primary)]/20 bg-[var(--surface)] p-3 text-[var(--foreground)] shadow-[var(--shadow-soft)]">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${notice?.tone === "warning" ? "bg-[var(--warning-soft)] text-[var(--warning)]" : "bg-[var(--primary-soft)] text-[var(--primary)]"}`}>
            {notice?.tone === "success" ? <CheckCircle2 size={18} aria-hidden="true" /> : <BellRing size={18} aria-hidden="true" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-5">{notice?.text || (showSubscribedTools ? "Thông báo PWA đang bật." : "Bật thông báo vận hành trên thiết bị này.")}</p>
            {canPrompt ? <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">Đơn mới, thanh toán chờ xác nhận và yêu cầu phục vụ sẽ báo như app.</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {canPrompt ? (
                <button type="button" onClick={enablePush} disabled={Boolean(busy)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--primary)] px-3 text-sm font-semibold text-[#FFF7EB]">
                  {busy === "subscribe" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <BellRing size={16} aria-hidden="true" />}
                  Bật
                </button>
              ) : null}
              {showSubscribedTools ? (
                <>
                  <button type="button" onClick={sendTest} disabled={Boolean(busy)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--foreground)]">
                    {busy === "test" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
                    Gửi thử
                  </button>
                  <button type="button" onClick={disablePush} disabled={Boolean(busy)} className="inline-flex min-h-10 items-center rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-3 text-sm font-semibold text-[var(--muted-foreground)]">
                    Tắt
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <button type="button" onClick={notice ? () => setNotice(null) : dismissPrompt} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--muted-foreground)]" aria-label="Ẩn thông báo PWA">
            <X size={16} aria-hidden="true" />
          </button>
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
