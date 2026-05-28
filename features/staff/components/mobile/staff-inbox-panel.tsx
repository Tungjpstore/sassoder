"use client";

import { Bell, CheckCircle2, ChevronRight } from "lucide-react";
import type { StaffOpsNotification, StaffOpsRealtimeState } from "@/features/staff/types";
import { cn } from "@/lib/utils";
import { StaffMobileEmptyState, StaffMobilePanel, StaffMobileSectionHeader, StaffSecondaryButton, StaffStatusPill } from "./staff-mobile-primitives";
import { relativeTime } from "./staff-mobile-utils";

function realtimeLabel(state: StaffOpsRealtimeState) {
  if (state === "connected") return "Đang live";
  if (state === "connecting") return "Đang kết nối";
  if (state === "error") return "Cần làm mới";
  return "Tạm ngắt";
}

export function StaffInboxPanel({
  notifications,
  unreadCount,
  realtimeState,
  markingRead,
  onMarkRead,
  onMarkAllRead
}: {
  notifications: StaffOpsNotification[];
  unreadCount: number;
  realtimeState: StaffOpsRealtimeState;
  markingRead: boolean;
  onMarkRead: (notificationId: string) => void;
  onMarkAllRead: () => void;
}) {
  return (
    <>
      <StaffMobilePanel>
        <StaffMobileSectionHeader
          title="Thông báo"
          action={<StaffStatusPill tone={unreadCount ? "warning" : "success"}>{unreadCount ? `${unreadCount} mới` : realtimeLabel(realtimeState)}</StaffStatusPill>}
        />
        {unreadCount ? (
          <StaffSecondaryButton onClick={onMarkAllRead} disabled={markingRead} className="mt-3 w-full">
            <CheckCircle2 size={16} aria-hidden="true" />
            Đánh dấu đã đọc
          </StaffSecondaryButton>
        ) : null}
      </StaffMobilePanel>

      <StaffMobilePanel>
        <StaffMobileSectionHeader title="Mới nhất" />
        <div className="grid gap-2">
          {notifications.map((notification) => {
            const unread = notification.status === "unread";
            return (
              <article key={notification.id} className={cn("rounded-xl border p-3", unread ? "border-[var(--accent)]/25 bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--soft-surface)]")}>
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3">
                  <span className={cn("grid h-10 w-10 place-items-center rounded-xl border", unread ? "border-[var(--accent)]/25 bg-[var(--surface)] text-[var(--accent-strong)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]")}>
                    <Bell size={17} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-semibold text-[var(--foreground)]">{notification.title}</p>
                    {notification.body ? <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{notification.body}</p> : null}
                    <p className="mt-1 text-[11px] font-semibold text-[var(--muted-foreground)]">{relativeTime(notification.createdAt)}</p>
                  </div>
                  {notification.actionUrl ? (
                    <a href={notification.actionUrl} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]" aria-label="Mở thông báo">
                      <ChevronRight size={16} aria-hidden="true" />
                    </a>
                  ) : unread ? (
                    <button type="button" disabled={markingRead} onClick={() => onMarkRead(notification.id)} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]" aria-label="Đánh dấu đã đọc">
                      <CheckCircle2 size={16} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
          {!notifications.length ? <StaffMobileEmptyState icon={<Bell size={18} aria-hidden="true" />} title="Chưa có thông báo" /> : null}
        </div>
      </StaffMobilePanel>
    </>
  );
}
