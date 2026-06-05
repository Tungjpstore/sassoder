"use client";

import { useEffect } from "react";

let openOverlayCount = 0;

export function useDashboardOverlay(open: boolean) {
  useEffect(() => {
    if (!open) return;

    openOverlayCount += 1;
    document.documentElement.classList.add("dashboard-overlay-open");
    document.body.classList.add("dashboard-overlay-open");

    return () => {
      openOverlayCount = Math.max(0, openOverlayCount - 1);
      if (openOverlayCount === 0) {
        document.documentElement.classList.remove("dashboard-overlay-open");
        document.body.classList.remove("dashboard-overlay-open");
      }
    };
  }, [open]);

  return typeof document === "undefined" ? null : document.body;
}
