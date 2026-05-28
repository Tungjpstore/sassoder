"use client";

import { useEffect, useRef, useState } from "react";
import { STAFF_OPERATIONS_REALTIME_TABLES, staffOperationsChannelName } from "@/features/staff/realtime/channels";
import type { StaffOpsRealtimeState } from "@/features/staff/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function useStaffMobileRealtime({ restaurantId, onRefresh }: { restaurantId: string; onRefresh: () => Promise<void> | void }) {
  const [state, setState] = useState<StaffOpsRealtimeState>("connecting");
  const refreshTimerRef = useRef<number | null>(null);
  const refreshRef = useRef(onRefresh);

  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        void refreshRef.current();
      }, 360);
    };

    let channel = supabase.channel(`${staffOperationsChannelName(restaurantId)}:mobile`);
    STAFF_OPERATIONS_REALTIME_TABLES.forEach((table) => {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `restaurant_id=eq.${restaurantId}` },
        scheduleRefresh
      );
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setState("connected");
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setState("error");
    });

    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  return state;
}
