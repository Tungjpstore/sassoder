"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Command, Search, X } from "lucide-react";
import { platformAdminQuickActions } from "@/features/platform-admin/navigation";

function matches(value: string, query: string) {
  if (!query.trim()) return true;
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const actions = useMemo(() => platformAdminQuickActions.filter((action) => matches(action.label, query)), [query]);

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
        className="hidden h-10 min-w-[18rem] items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-500 transition hover:border-sky-400/30 hover:bg-sky-400/10 xl:flex"
      >
        <span className="flex items-center gap-2">
          <Search size={15} />
          Tìm kiếm hoặc chạy lệnh...
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
                placeholder="Nhập lệnh: retry failed jobs, rollback deploy, mở tenant..."
                className="h-10 flex-1 border-0 bg-transparent text-sm font-medium text-slate-100 outline-none placeholder:text-slate-600"
              />
              <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-400 hover:bg-white/10" aria-label="Đóng">
                <X size={15} />
              </button>
            </div>
            <div className="grid max-h-[26rem] gap-1 overflow-y-auto p-2">
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
              {!actions.length ? <p className="px-3 py-8 text-center text-sm text-slate-500">Không có lệnh phù hợp.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
