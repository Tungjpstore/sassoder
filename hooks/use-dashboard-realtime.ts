"use client";

/* useDashboardRealtime — hook chung cho mọi workspace v2.
 *  - Subscribe Supabase channel theo naming chuẩn `admin-{workspace}-v2:{restaurantId}`
 *  - Listen multiple table changes với cùng debounce
 *  - Tự refresh khi tab visible / online
 *  - Fallback poll mỗi 30s khi tab visible
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { RealtimeState } from "@/components/dashboard-v2/realtime";

type TableSubscription = {
  table: string;
  /* eq filter cho restaurant_id; bỏ qua nếu bảng không có cột này */
  filterByRestaurant?: boolean;
};

export function useDashboardRealtime(opts: {
  restaurantId: string;
  workspace: string;
  tables: ReadonlyArray<TableSubscription>;
  /* Khi data thay đổi: caller tự quyết refetch hoặc router.refresh.
   * Nếu không truyền, mặc định gọi router.refresh() */
  onChange?: () => void;
  /* Debounce ms — gộp nhiều event sát nhau */
  debounceMs?: number;
  /* Poll fallback ms — mặc định 30s */
  pollMs?: number;
  /* Enable hay không — cho phép tắt tạm thời */
  enabled?: boolean;
}): RealtimeState {
  const router = useRouter();
  const refreshRef = useRef<number | null>(null);
  const onChangeRef = useRef(opts.onChange);
  useEffect(() => {
    onChangeRef.current = opts.onChange;
  }, [opts.onChange]);
  const [state, setState] = useState<RealtimeState>("connecting");

  useEffect(() => {
    if (opts.enabled === false) return;
    const supabase = createBrowserSupabaseClient();
    const debounceMs = opts.debounceMs ?? 240;
    const pollMs = opts.pollMs ?? 30_000;
    const restaurantId = opts.restaurantId;

    const trigger = () => {
      if (refreshRef.current) window.clearTimeout(refreshRef.current);
      refreshRef.current = window.setTimeout(() => {
        if (onChangeRef.current) onChangeRef.current();
        else router.refresh();
      }, debounceMs);
    };

    let channel = supabase.channel(`admin-${opts.workspace}-v2:${restaurantId}`);
    for (const sub of opts.tables) {
      const filter = sub.filterByRestaurant === false ? undefined : `restaurant_id=eq.${restaurantId}`;
      channel = channel.on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        filter
          ? { event: "*", schema: "public", table: sub.table, filter }
          : { event: "*", schema: "public", table: sub.table },
        () => trigger()
      );
    }
    channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") setState("connected");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setState("error");
    });

    const onVisible = () => {
      if (document.visibilityState !== "hidden" && window.navigator.onLine) trigger();
    };
    const fallback = window.setInterval(() => onVisible(), pollMs);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      if (refreshRef.current) window.clearTimeout(refreshRef.current);
      window.clearInterval(fallback);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      supabase.removeChannel(channel);
    };
  }, [opts.restaurantId, opts.workspace, opts.tables, opts.debounceMs, opts.pollMs, opts.enabled, router]);

  return state;
}
