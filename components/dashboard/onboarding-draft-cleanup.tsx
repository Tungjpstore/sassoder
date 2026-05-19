"use client";

import { useEffect } from "react";

export function OnboardingDraftCleanup() {
  useEffect(() => {
    try {
      const keysToRemove: string[] = [];
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith("logivn:onboarding:")) keysToRemove.push(key);
      }
      keysToRemove.forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // Draft cleanup is best-effort; dashboard data is already persisted server-side.
    }

    const url = new URL(window.location.href);
    if (url.searchParams.has("onboarded")) {
      url.searchParams.delete("onboarded");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  return null;
}
