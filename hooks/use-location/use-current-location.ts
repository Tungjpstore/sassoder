"use client";

import { useState } from "react";
import type { Coordinate } from "@/services/maps/types";

export type CurrentLocation = Coordinate & {
  accuracyMeters: number | null;
};

export function useCurrentLocation() {
  const [location, setLocation] = useState<CurrentLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function requestLocation(options?: {
    onSuccess?: (location: Coordinate) => void;
    onError?: (message: string) => void;
  }) {
    if (!navigator.geolocation) {
      const message = "Trình duyệt không hỗ trợ định vị.";
      setError(message);
      options?.onError?.(message);
      return;
    }

    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null
        };
        setLocation(nextLocation);
        options?.onSuccess?.(nextLocation);
        setLoading(false);
      },
      () => {
        const message = "Không lấy được vị trí. Vui lòng bật quyền truy cập vị trí.";
        setError(message);
        options?.onError?.(message);
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 60_000
      }
    );
  }

  return {
    location,
    loading,
    error,
    requestLocation,
    setLocation,
    clearError: () => setError(null)
  };
}
