"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Download, Info, RefreshCw, X } from "lucide-react";
import {
  INSTALL_PLATFORM_GUIDES,
  type InstallPlatform,
  type InstallPlatformSlug,
  detectInstallPlatformFromUserAgent,
  getInstallPlatformGuide
} from "@/lib/pwa/install-platform";

type BeforeInstallPromptChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<BeforeInstallPromptChoice>;
};

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

const dismissalStorageKey = "logivn:pwa-install-dismissed";

export function InstallActionPanel({ selectedPlatform }: { selectedPlatform?: InstallPlatformSlug }) {
  const promptEventRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [detectedPlatform, setDetectedPlatform] = useState<InstallPlatform>(selectedPlatform ?? "desktop");
  const [installed, setInstalled] = useState(false);
  const [promptReady, setPromptReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [browserLabel, setBrowserLabel] = useState("trình duyệt hiện tại");
  const [installing, setInstalling] = useState(false);

  const activePlatform = selectedPlatform ?? (detectedPlatform === "desktop" ? "windows" : detectedPlatform);
  const guide = getInstallPlatformGuide(activePlatform);
  const detectedGuide = detectedPlatform === "desktop" ? null : INSTALL_PLATFORM_GUIDES[detectedPlatform];
  const canUsePrompt = promptReady && !installed && !dismissed && activePlatform !== "ios";

  const status = useMemo(() => {
    if (installed) {
      return {
        tone: "ready",
        title: "LogiVN đang chạy như ứng dụng",
        text: "Thiết bị này đã ở chế độ standalone hoặc đã cài LogiVN."
      };
    }

    if (dismissed) {
      return {
        tone: "muted",
        title: "Bạn đã ẩn lời nhắc cài đặt",
        text: "LogiVN vẫn giữ hướng dẫn thủ công bên dưới nếu bạn muốn cài sau."
      };
    }

    if (canUsePrompt) {
      return {
        tone: "ready",
        title: "Thiết bị sẵn sàng cài LogiVN",
        text: "Trình duyệt đã cấp nút cài tự động cho phiên này."
      };
    }

    if (activePlatform === "ios") {
      return {
        tone: "manual",
        title: "iOS cần thêm bằng Safari",
        text: "Apple không dùng prompt cài tự động cho flow này. Dùng Share rồi Add to Home Screen."
      };
    }

    return {
      tone: "manual",
      title: "Dùng hướng dẫn thủ công nếu nút cài chưa hiện",
      text: "Một số trình duyệt chỉ hiện tùy chọn cài trong menu sau khi trang tải đủ điều kiện."
    };
  }, [activePlatform, canUsePrompt, dismissed, installed]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;

    const media = window.matchMedia("(display-mode: standalone)");
    const clientInitTimer = window.setTimeout(() => {
      setDetectedPlatform(
        detectInstallPlatformFromUserAgent(navigator.userAgent, {
          maxTouchPoints: navigator.maxTouchPoints,
          platform: navigator.platform
        })
      );
      setBrowserLabel(readBrowserLabel(navigator.userAgent));
      try {
        setDismissed(localStorage.getItem(dismissalStorageKey) === "1");
      } catch {
        setDismissed(false);
      }
      setInstalled(media.matches || Boolean((navigator as NavigatorWithStandalone).standalone));
    }, 0);

    const updateInstalledState = () => {
      setInstalled(media.matches || Boolean((navigator as NavigatorWithStandalone).standalone));
    };
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      promptEventRef.current = event as BeforeInstallPromptEvent;
      setPromptReady(true);
    };
    const handleInstalled = () => {
      promptEventRef.current = null;
      setPromptReady(false);
      setInstalled(true);
      try {
        localStorage.removeItem(dismissalStorageKey);
      } catch {
        // Ignore private browsing storage failures.
      }
    };

    media.addEventListener("change", updateInstalledState);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.clearTimeout(clientInitTimer);
      media.removeEventListener("change", updateInstalledState);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function handlePrimaryAction() {
    if (installed) {
      window.location.assign("/dashboard/login?source=pwa_installed_open");
      return;
    }

    if (dismissed) {
      resetDismissal();
      return;
    }

    if (!canUsePrompt || !promptEventRef.current) {
      scrollToInstallSteps();
      return;
    }

    setInstalling(true);
    const promptEvent = promptEventRef.current;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    promptEventRef.current = null;
    setPromptReady(false);
    setInstalling(false);

    if (choice.outcome === "dismissed") {
      dismissPrompt();
    }
  }

  function dismissPrompt() {
    setDismissed(true);
    try {
      localStorage.setItem(dismissalStorageKey, "1");
    } catch {
      // The in-page state still prevents repeated prompts in this session.
    }
  }

  function resetDismissal() {
    setDismissed(false);
    try {
      localStorage.removeItem(dismissalStorageKey);
    } catch {
      // Ignore private browsing storage failures.
    }
  }

  function scrollToInstallSteps() {
    document.getElementById("install-steps")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <aside className="download-install-panel" aria-label="Trạng thái cài đặt LogiVN">
      <div className="download-panel-label">
        <Download size={17} aria-hidden="true" />
        <span>Cài đặt ứng dụng</span>
      </div>

      <div className="download-device-line">
        <span>Nền tảng đang xem</span>
        <strong>{selectedPlatform ? guide.shortLabel : detectedGuide?.shortLabel ?? "Tự chọn"}</strong>
      </div>

      <div className={`download-install-status is-${status.tone}`} aria-live="polite">
        <CheckCircle2 size={19} aria-hidden="true" />
        <div>
          <strong>{status.title}</strong>
          <p>{status.text}</p>
        </div>
      </div>

      <button className="download-primary-action" type="button" onClick={() => void handlePrimaryAction()} disabled={installing}>
        {installing ? <RefreshCw className="download-spin" size={17} aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
        <span>{installed ? "Mở LogiVN" : dismissed ? "Hiện lại lời nhắc" : canUsePrompt ? guide.ctaLabel : guide.manualCtaLabel}</span>
      </button>

      {!installed && !dismissed ? (
        <button className="download-dismiss-action" type="button" onClick={dismissPrompt}>
          <X size={16} aria-hidden="true" />
          <span>Ẩn lời nhắc trên thiết bị này</span>
        </button>
      ) : null}

      <div className="download-browser-note">
        <Info size={16} aria-hidden="true" />
        <p>
          Đang dùng <strong>{browserLabel}</strong>. {guide.browserNote}
        </p>
      </div>
    </aside>
  );
}

function readBrowserLabel(userAgent: string) {
  if (/Edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/CriOS\//i.test(userAgent)) return "Chrome trên iOS";
  if (/FxiOS\//i.test(userAgent)) return "Firefox trên iOS";
  if (/Chrome\//i.test(userAgent)) return "Google Chrome";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/Safari\//i.test(userAgent)) return "Safari";
  return "trình duyệt hiện tại";
}
