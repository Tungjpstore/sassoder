"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, RefreshCw, WifiOff, X } from "lucide-react";
import { resolvePwaConnectivity } from "@/lib/pwa/network-status";

const NETWORK_PROBE_TIMEOUT_MS = 3500;
const NETWORK_RECHECK_MS = 15_000;

export function ServiceWorkerRegister() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const shouldReloadRef = useRef(false);
  const wasOfflineRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [reconnected, setReconnected] = useState(false);
  const [offlineDismissed, setOfflineDismissed] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined") return;

    let cancelled = false;
    let networkProbeVersion = 0;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current === null) return;
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    };

    const markOnline = () => {
      setOffline(false);
      setOfflineDismissed(false);
      if (wasOfflineRef.current) {
        setReconnected(true);
        wasOfflineRef.current = false;
        clearReconnectTimer();
        reconnectTimerRef.current = window.setTimeout(() => setReconnected(false), 3600);
      }
    };

    const markOffline = () => {
      setOffline(true);
      wasOfflineRef.current = true;
      setReconnected(false);
      clearReconnectTimer();
    };

    const verifyNetworkState = async () => {
      const probeVersion = (networkProbeVersion += 1);
      const browserOnline = navigator.onLine;
      if (resolvePwaConnectivity({ browserOnline }) === "online") {
        markOnline();
        return;
      }

      const sameOriginReachable = await probeSameOriginHealth();
      if (cancelled || probeVersion !== networkProbeVersion) return;

      const connectivity = resolvePwaConnectivity({ browserOnline, sameOriginReachable });
      if (connectivity === "offline") {
        markOffline();
        return;
      }

      markOnline();
    };

    const handleOnline = () => {
      networkProbeVersion += 1;
      markOnline();
    };
    const handleOffline = () => {
      void verifyNetworkState();
    };
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "hidden") return;
      void verifyNetworkState();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    const recheckInterval = window.setInterval(() => {
      if (!navigator.onLine || wasOfflineRef.current) void verifyNetworkState();
    }, NETWORK_RECHECK_MS);

    void verifyNetworkState();

    return () => {
      cancelled = true;
      window.clearInterval(recheckInterval);
      clearReconnectTimer();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    const handleControllerChange = () => {
      if (!shouldReloadRef.current) return;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (cancelled) return;
        registrationRef.current = registration;
        watchWorker(registration.installing);

        registration.addEventListener("updatefound", () => {
          watchWorker(registration.installing);
        });

        if (registration.waiting && navigator.serviceWorker.controller) {
          setUpdateReady(true);
        }
      })
      .catch(() => undefined);

    function watchWorker(worker: ServiceWorker | null) {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          setUpdateReady(true);
        }
      });
    }

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  const showOffline = offline && !offlineDismissed;
  if (!showOffline && !reconnected && !updateReady) return null;

  function applyUpdate() {
    const waitingWorker = registrationRef.current?.waiting;
    if (!waitingWorker) {
      window.location.reload();
      return;
    }

    setReloading(true);
    shouldReloadRef.current = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-[var(--z-dashboard-toast)] mx-auto flex max-w-md flex-col gap-2 pb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:right-4 sm:max-w-sm">
      {showOffline ? (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-[var(--foreground)] shadow-[var(--shadow-soft)]">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--warning-soft)] text-[var(--warning)]">
            <WifiOff size={18} aria-hidden="true" />
          </span>
          <p className="min-w-0 flex-1 text-sm font-semibold leading-5">Bạn đang ngoại tuyến. Dữ liệu có thể không phải mới nhất.</p>
          <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--muted-foreground)]" type="button" onClick={() => setOfflineDismissed(true)} aria-label="Ẩn thông báo ngoại tuyến">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {reconnected ? (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--primary)]/20 bg-[var(--surface)] p-3 text-[var(--foreground)] shadow-[var(--shadow-soft)]">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
            <CheckCircle2 size={18} aria-hidden="true" />
          </span>
          <p className="min-w-0 flex-1 text-sm font-semibold leading-5">Đã kết nối lại. LogiVN sẽ tiếp tục lấy dữ liệu mới nhất.</p>
          <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--muted-foreground)]" type="button" onClick={() => setReconnected(false)} aria-label="Ẩn thông báo đã kết nối lại">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {updateReady ? (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--primary)]/20 bg-[var(--surface)] p-3 text-[var(--foreground)] shadow-[var(--shadow-soft)]">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
            <RefreshCw size={18} aria-hidden="true" className={reloading ? "animate-spin" : undefined} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-5">Đã có bản cập nhật LogiVN.</p>
            <button className="mt-2 inline-flex min-h-10 items-center justify-center rounded-lg bg-[var(--primary)] px-3 text-sm font-semibold text-[#FFF7EB]" type="button" onClick={applyUpdate} disabled={reloading}>
              {reloading ? "Đang tải lại" : "Tải lại"}
            </button>
          </div>
          <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--muted-foreground)]" type="button" onClick={() => setUpdateReady(false)} aria-label="Ẩn thông báo cập nhật">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

async function probeSameOriginHealth() {
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timeout = controller ? window.setTimeout(() => controller.abort(), NETWORK_PROBE_TIMEOUT_MS) : null;

  try {
    await fetch(`/api/health?pwaNetworkProbe=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller?.signal
    });
    return true;
  } catch {
    return false;
  } finally {
    if (timeout !== null) window.clearTimeout(timeout);
  }
}
