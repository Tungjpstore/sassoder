"use client";

import { useEffect } from "react";

const SESSION_KEY = "logivn_funnel_session";
const VARIANT_KEY = "logivn_funnel_variant";
const variants = ["direct", "pilot"] as const;

type FunnelTrackerProps = {
  page: string;
  source?: string;
};

function randomToken() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getSessionId() {
  const current = window.localStorage.getItem(SESSION_KEY);
  if (current && current.length >= 8) return current;

  const next = `lv-${Date.now().toString(36)}-${randomToken()}`;
  window.localStorage.setItem(SESSION_KEY, next);
  return next;
}

function getVariant() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("variant") || params.get("funnel_variant");
  if (requested && variants.includes(requested as (typeof variants)[number])) {
    window.localStorage.setItem(VARIANT_KEY, requested);
    return requested;
  }

  const stored = window.localStorage.getItem(VARIANT_KEY);
  if (stored && variants.includes(stored as (typeof variants)[number])) return stored;

  const next = variants[Math.floor(Math.random() * variants.length)] || "direct";
  window.localStorage.setItem(VARIANT_KEY, next);
  return next;
}

function sendEvent(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon("/api/marketing/events", blob)) return;
  }

  fetch("/api/marketing/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true
  }).catch(() => null);
}

function textForElement(element: Element) {
  return (element.getAttribute("aria-label") || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160);
}

export function MarketingFunnelTracker({ page, source = "marketing" }: FunnelTrackerProps) {
  useEffect(() => {
    const sessionId = getSessionId();
    const variant = getVariant();
    document.documentElement.dataset.funnelVariant = variant;

    sendEvent({
      sessionId,
      eventName: "page_view",
      pagePath: page,
      source,
      variant,
      metadata: {
        title: document.title,
        referrer: document.referrer || "",
        search: window.location.search
      }
    });

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href],button") : null;
      if (!target) return;

      const href = target instanceof HTMLAnchorElement ? target.href : target.getAttribute("formaction") || "";
      const url = href ? new URL(href, window.location.href) : null;
      const isConversionTarget =
        target.hasAttribute("data-funnel-event") ||
        url?.pathname.startsWith("/dashboard/register") ||
        url?.pathname === "/pricing" ||
        url?.pathname === "/demo" ||
        url?.pathname === "/waitlist";

      if (!isConversionTarget) return;

      sendEvent({
        sessionId,
        eventName: target.getAttribute("data-funnel-event") || "cta_click",
        pagePath: page,
        source,
        variant,
        targetHref: url ? `${url.pathname}${url.search}` : "",
        targetText: textForElement(target),
        planCode: url?.searchParams.get("plan") || "",
        metadata: {
          tagName: target.tagName.toLowerCase()
        }
      });
    };

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [page, source]);

  return null;
}
