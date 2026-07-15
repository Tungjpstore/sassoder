"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createCustomerSessionId,
  dineInCustomerSessionStorageKey,
  resolveOrCreateCustomerSessionId,
  writeCustomerSessionId
} from "@/lib/customer/customer-session-storage";

/**
 * Bootstraps and persists the dine-in customer session for a restaurant table.
 */
export function useDineInCustomerSession(restaurantId: string, tableId: string) {
  const sessionKey = useMemo(() => dineInCustomerSessionStorageKey(restaurantId, tableId), [restaurantId, tableId]);
  const [customerSessionId, setCustomerSessionId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCustomerSessionId(resolveOrCreateCustomerSessionId(sessionKey));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [sessionKey]);

  const ensureSessionId = useCallback(() => {
    if (customerSessionId) return customerSessionId;
    const id = createCustomerSessionId();
    writeCustomerSessionId(sessionKey, id);
    setCustomerSessionId(id);
    return id;
  }, [customerSessionId, sessionKey]);

  return {
    customerSessionId,
    ensureSessionId,
    sessionKey,
    isSessionReady: Boolean(customerSessionId)
  };
}
