"use client";

import { useEffect, type ReactNode } from "react";
import { CopilotKit } from "@copilotkit/react-core";
import "@copilotkit/react-core/v2/styles.css";

function useLogiBotViewportVars() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;
    const viewport = window.visualViewport;
    let frame = 0;

    const updateViewportVars = () => {
      if (frame) cancelAnimationFrame(frame);

      frame = window.requestAnimationFrame(() => {
        const height = viewport?.height ?? window.innerHeight;
        const width = viewport?.width ?? window.innerWidth;
        const offsetTop = viewport?.offsetTop ?? 0;
        const keyboardGap = Math.max(0, window.innerHeight - height - offsetTop);

        root.style.setProperty("--logibot-visual-height", `${height}px`);
        root.style.setProperty("--logibot-visual-width", `${width}px`);
        root.style.setProperty("--logibot-visual-offset-top", `${offsetTop}px`);
        root.toggleAttribute("data-logibot-keyboard-open", keyboardGap > 150);
      });
    };

    updateViewportVars();
    window.addEventListener("resize", updateViewportVars);
    window.addEventListener("orientationchange", updateViewportVars);
    viewport?.addEventListener("resize", updateViewportVars);
    viewport?.addEventListener("scroll", updateViewportVars);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateViewportVars);
      window.removeEventListener("orientationchange", updateViewportVars);
      viewport?.removeEventListener("resize", updateViewportVars);
      viewport?.removeEventListener("scroll", updateViewportVars);
      root.style.removeProperty("--logibot-visual-height");
      root.style.removeProperty("--logibot-visual-width");
      root.style.removeProperty("--logibot-visual-offset-top");
      root.removeAttribute("data-logibot-keyboard-open");
    };
  }, []);
}

export function LogiVNCopilotProvider({ children, threadId }: { children: ReactNode; threadId?: string }) {
  useLogiBotViewportVars();

  return (
    <CopilotKit runtimeUrl="/api/copilotkit" showDevConsole={false} enableInspector={false} threadId={threadId}>
      {children}
    </CopilotKit>
  );
}
