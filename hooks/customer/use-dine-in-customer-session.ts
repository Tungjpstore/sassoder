"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createCustomerSessionId,
  dineInCustomerSessionStorageKey,
  resolveOrCreateDineInCustomerSession,
  resolveOrCreateCustomerSessionId,
  writeCustomerSessionId
} from "@/lib/customer/customer-session-storage";

/**
 * Bootstraps and persists the dine-in customer session for a restaurant table.
 */
export function useDineInCustomerSession(
  restaurantId: string,
  tableId: string,
  restaurantSlug?: string,
  tableAccessToken?: string | null
) {
  const sessionKey = useMemo(() => dineInCustomerSessionStorageKey(restaurantId, tableId), [restaurantId, tableId]);
  const [customerSessionId, setCustomerSessionId] = useState<string | null>(null);
  const [customerSessionToken, setCustomerSessionToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const legacyId = resolveOrCreateCustomerSessionId(sessionKey);
      setCustomerSessionId(legacyId);
      if (!restaurantSlug) return;
      void resolveOrCreateDineInCustomerSession(restaurantId, restaurantSlug, tableId, tableAccessToken)
        .then((session) => {
          if (cancelled) return;
          setCustomerSessionId(session.id);
          setCustomerSessionToken(session.token);
        })
        .catch(() => {
          // Order creation can still use the raw session while the signed
          // history session retries on demand.
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [restaurantId, restaurantSlug, sessionKey, tableAccessToken, tableId]);

  const ensureSessionId = useCallback(() => {
    if (customerSessionId) return customerSessionId;
    const id = createCustomerSessionId();
    writeCustomerSessionId(sessionKey, id);
    setCustomerSessionId(id);
    return id;
  }, [customerSessionId, sessionKey]);

  return {
    customerSessionId,
    customerSessionToken,
    ensureSessionId,
    sessionKey,
    isSessionReady: Boolean(customerSessionId)
  };
}
