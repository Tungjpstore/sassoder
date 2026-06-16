"use client";

/* useStaffRealtime — hook realtime dùng chung cho HR_Workspace (admin) và
 * PWA_Staff_App. Subscribe các bảng nhân sự, debounce refresh, theo dõi
 * lastSyncedAt + cờ "pending" (chưa đồng bộ) và reconcile khi reconnect (Req 6). */
import { useCallback, useEffect, useRef, useState } from "react";
import { STAFF_OPERATIONS_REALTIME_TABLES, staffOperationsChannelName } from "@/features/staff/realtime/channels";
import type { StaffOpsRealtimeState } from "@/features/staff/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export type UseStaffRealtimeResult = {
  state: StaffOpsRealtimeState;
  lastSyncedAt: Date | null;
  pending: boolean;
};

export function useStaffRealtime({
  restaurantId,
  scope = "admin",
  onChange
}: {
  restaurantId: string;
  scope?: "admin" | "self";
  onChange: () => Promise<void> | void;
}): UseStaffRealtimeResult {
  const [state, setState] = useState<StaffOpsRealtimeState>("connecting");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [pending, setPending] = useState(false);
  const timerRef = useRef<number | null>(null);
  const changeRef = useRef(onChange);
  const sawErrorRef = useRef(false);

  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);

  const flush = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      await changeRef.current();
      setLastSyncedAt(new Date());
      setPending(false);
    }, 360);
  }, []);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let channel = supabase.channel(`${staffOperationsChannelName(restaurantId)}:${scope}`);
    STAFF_OPERATIONS_REALTIME_TABLES.forEach((table) => {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `restaurant_id=eq.${restaurantId}` },
        flush
      );
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setState("connected");
        // Reconnect → reconcile mọi thay đổi đang chờ và xoá chỉ báo chưa đồng bộ (Req 6.8).
        if (sawErrorRef.current) {
          sawErrorRef.current = false;
          flush();
        }
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        sawErrorRef.current = true;
        setState("error");
        setPending(true); // chỉ báo "chưa đồng bộ", giữ dữ liệu cũ (Req 6.7).
      }
    });

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [restaurantId, scope, flush]);

  return { state, lastSyncedAt, pending };
}
