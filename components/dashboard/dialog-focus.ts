"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    if (element.hasAttribute("disabled")) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;
    return element.offsetParent !== null || element === document.activeElement;
  });
}

export function useDialogFocusTrap({
  containerRef,
  onClose,
  open
}: {
  containerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  open: boolean;
}) {
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  const handleDialogKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const panel = containerRef.current;
      if (!panel) return;

      const focusableElements = getFocusableElements(panel);
      if (focusableElements.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus({ preventScroll: true });
      }

      if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus({ preventScroll: true });
      }
    },
    [containerRef, onClose]
  );

  useEffect(() => {
    if (!open) return;

    previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;

    document.addEventListener("keydown", handleDialogKeyDown);
    document.body.style.overflow = "hidden";

    window.requestAnimationFrame(() => {
      const panel = containerRef.current;
      if (!panel) return;
      const firstFocusableElement = getFocusableElements(panel)[0];
      (firstFocusableElement ?? panel).focus({ preventScroll: true });
    });

    return () => {
      document.removeEventListener("keydown", handleDialogKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedElementRef.current?.focus({ preventScroll: true });
    };
  }, [containerRef, handleDialogKeyDown, open]);
}
