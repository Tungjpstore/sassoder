"use client";

import Link from "next/link";
import { AlertTriangle, ChevronDown, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type DashboardSubscriptionNoticeProps = {
  kind: "warning" | "danger" | "blocked";
  message: string;
  planName?: string | null;
  daysLeft?: number | null;
  actionHref?: string;
  actionLabel?: string;
};

export function DashboardSubscriptionNotice({
  kind,
  message,
  planName,
  daysLeft,
  actionHref = "/dashboard/settings?section=billing",
  actionLabel = "Gia hạn gói"
}: DashboardSubscriptionNoticeProps) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(kind === "blocked");
  const canDismiss = kind !== "blocked";

  function dismiss() {
    if (!canDismiss) return;
    setDismissed(true);
  }

  if (dismissed) return null;

  const isBlocked = kind === "blocked";
  const isDanger = kind === "danger" || isBlocked;
  const meta = planName ? `${planName}${typeof daysLeft === "number" ? ` · ${Math.max(0, daysLeft)} ngày còn lại` : ""}` : null;

  return (
    <section
      className={cn(
        "dashboard-subscription-notice mb-2 rounded-lg border px-2 py-1.5 text-sm shadow-[0_6px_18px_rgba(24,35,28,0.04)] sm:px-2.5",
        isDanger
          ? "border-[#F1B9A4] bg-[#FFF3ED] text-[#9B3A16]"
          : "border-[var(--accent)]/22 bg-[var(--accent-soft)] text-[var(--accent-strong)]"
      )}
      aria-label="Trạng thái gói LogiVN"
    >
      <div className="flex items-center gap-1.5 sm:gap-2">
        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md sm:h-8 sm:w-8", isDanger ? "bg-[#FFE1D2]" : "bg-white/70")}>
          <AlertTriangle size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold leading-5 sm:text-sm">{message}</p>
          {expanded && meta ? <p className="mt-0.5 text-xs font-semibold opacity-80">{meta}</p> : null}
        </div>
        <Link
          href={actionHref}
          className={cn(
            "hidden min-h-9 shrink-0 items-center justify-center rounded-md px-3 text-xs font-black text-white transition sm:inline-flex",
            isDanger ? "bg-[#B94724] hover:bg-[#9B3A16]" : "bg-[var(--primary)] hover:bg-[var(--primary-strong)]"
          )}
        >
          {actionLabel}
        </Link>
        <button
          type="button"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-current/10 bg-white/60 transition hover:bg-white"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={expanded ? "Thu gọn nhắc gói" : "Mở nhắc gói"}
        >
          <ChevronDown className={cn("transition", expanded && "rotate-180")} size={16} aria-hidden="true" />
        </button>
        {canDismiss ? (
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-current/10 bg-white/60 transition hover:bg-white"
            onClick={dismiss}
            aria-label="Đóng nhắc gói"
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {expanded ? (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-current/10 pt-1.5 text-xs font-semibold leading-5 opacity-85">
          <span>{isBlocked ? "Hoàn tất thanh toán hoặc liên hệ hỗ trợ để mở lại quyền." : "Tạo VietQR gia hạn để ca bán không bị ngắt khi sang chu kỳ mới."}</span>
          <Link
            href={actionHref}
            className={cn(
              "inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-xs font-black text-white sm:hidden",
              isDanger ? "bg-[#B94724]" : "bg-[var(--primary)]"
            )}
          >
            {actionLabel}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
