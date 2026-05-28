"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bot, Command, CreditCard, ListRestart, RefreshCw, RotateCcw, Search, ServerCog, Sparkles, X } from "lucide-react";
import { refreshPlatformAdminAction, requestPlatformOperationAction, runPlatformCronJobAction } from "@/features/platform-admin/actions";
import { platformAdminQuickActions } from "@/features/platform-admin/navigation";

function matches(value: string, query: string) {
  if (!query.trim()) return true;
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const actions = useMemo(() => platformAdminQuickActions.filter((action) => matches(action.label, query)), [query]);
  const operationActions = useMemo(
    () =>
      [
        { label: "Chạy AI vận hành", shortcut: "A R", icon: Bot, kind: "cron", jobKey: "ai-ops" },
        { label: "Đối soát thanh toán", shortcut: "P R", icon: CreditCard, kind: "cron", jobKey: "subscriptions" },
        { label: "Làm mới snapshot", shortcut: "R", icon: RefreshCw, kind: "refresh" },
        { label: "Replay hàng đợi AI", shortcut: "Q R", icon: ListRestart, kind: "operation", operation: "replay_queue", targetType: "queue", targetId: "ai-ops" },
        { label: "Dọn cache platform", shortcut: "C C", icon: RotateCcw, kind: "operation", operation: "clear_cache", targetType: "redis", targetId: "platform:snapshot" },
        { label: "Yêu cầu restart workers", shortcut: "W R", icon: ServerCog, kind: "operation", operation: "restart_workers", targetType: "worker_pool", targetId: "platform" },
        { label: "Tạo tóm tắt AI cảnh báo", shortcut: "A S", icon: Sparkles, kind: "operation", operation: "create_ai_summary", targetType: "alerts", targetId: "open" }
      ].filter((action) => matches(action.label, query)),
    [query]
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isCommandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isCommandK) {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-10 w-[9.5rem] items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-300 transition hover:bg-white/[0.08] xl:flex"
      >
        <span className="flex items-center gap-2">
          <Search size={15} />
          Lệnh
        </span>
        <kbd className="rounded-md border border-white/10 bg-black/20 px-1.5 py-1 text-[10px] font-semibold text-slate-400">⌘K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-sky-400/30 hover:bg-sky-400/10 xl:hidden"
        aria-label="Mở command palette"
      >
        <Command size={16} />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[120] bg-black/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <button className="absolute inset-0 h-full w-full cursor-default" aria-label="Đóng command palette" onClick={() => setOpen(false)} type="button" />
          <div className="relative mx-auto mt-[12vh] max-w-2xl overflow-hidden rounded-xl border border-white/12 bg-[#0B1020]/95 shadow-[0_28px_90px_rgba(0,0,0,0.55)]">
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
              <Search size={18} className="text-sky-300" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nhập lệnh"
                className="h-10 flex-1 border-0 bg-transparent text-sm font-medium text-slate-100 outline-none placeholder:text-slate-600"
              />
              <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-400 hover:bg-white/10" aria-label="Đóng">
                <X size={15} />
              </button>
            </div>
            <div className="grid max-h-[26rem] gap-1 overflow-y-auto p-2">
              {operationActions.map((action) => {
                const Icon = action.icon;
                const content = (
                  <button
                    type="submit"
                    onClick={() => setOpen(false)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-300 transition hover:bg-sky-400/10 hover:text-white"
                  >
                    <span className="flex items-center gap-3">
                      <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-sky-200">
                        <Icon size={15} />
                      </span>
                      {action.label}
                    </span>
                    <kbd className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-semibold text-slate-500">{action.shortcut}</kbd>
                  </button>
                );

                if (action.kind === "cron") {
                  return (
                    <form key={action.label} action={runPlatformCronJobAction}>
                      <input type="hidden" name="jobKey" value={action.jobKey} />
                      {content}
                    </form>
                  );
                }

                if (action.kind === "refresh") {
                  return <form key={action.label} action={refreshPlatformAdminAction}>{content}</form>;
                }

                return (
                  <form key={action.label} action={requestPlatformOperationAction}>
                    <input type="hidden" name="operation" value={action.operation} />
                    <input type="hidden" name="targetType" value={action.targetType} />
                    <input type="hidden" name="targetId" value={action.targetId} />
                    {content}
                  </form>
                );
              })}
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 transition hover:bg-sky-400/10 hover:text-white"
                  >
                    <span className="flex items-center gap-3">
                      <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-sky-200">
                        <Icon size={15} />
                      </span>
                      {action.label}
                    </span>
                    <kbd className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-semibold text-slate-500">{action.shortcut}</kbd>
                  </Link>
                );
              })}
              {!actions.length && !operationActions.length ? <p className="px-3 py-8 text-center text-sm text-slate-500">Không có lệnh phù hợp.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
