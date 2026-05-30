"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clockInAttendance, clockOutAttendance, isStaffOperationsNetworkError } from "@/features/staff/api/client";

type OfflineAttendanceAction = "clock_in" | "clock_out";
type OfflineAttendanceSource = "gps";
type AttendanceQueueAttemptSource = OfflineAttendanceSource | "qr" | "wifi";

export type OfflineAttendanceQueueItem = {
  id: string;
  action: OfflineAttendanceAction;
  branchId?: string;
  attendanceLogId?: string;
  source: OfflineAttendanceSource;
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
  capturedAt: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
  nextRetryAt?: string;
  deviceInfo?: Record<string, unknown>;
};

type EnqueueOfflineAttendanceInput = Omit<OfflineAttendanceQueueItem, "id" | "createdAt" | "attempts" | "lastError" | "nextRetryAt">;
type EnqueueOfflineAttendanceResult =
  | { item: OfflineAttendanceQueueItem; error?: undefined }
  | { item: null; error: string };

const maxOfflineQueueItems = 12;

function storageKey(restaurantId: string, userId: string) {
  return `logivn:staff-attendance-offline:v1:${restaurantId}:${userId}`;
}

function isQueueItem(value: unknown): value is OfflineAttendanceQueueItem {
  if (!value || typeof value !== "object") return false;
  const item = value as OfflineAttendanceQueueItem;
  return (
    typeof item.id === "string" &&
    (item.action === "clock_in" || item.action === "clock_out") &&
    item.source === "gps" &&
    typeof item.capturedAt === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.attempts === "number"
  );
}

function readQueue(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isQueueItem).slice(0, maxOfflineQueueItems) : [];
  } catch {
    return [];
  }
}

function writeQueue(key: string, queue: OfflineAttendanceQueueItem[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(queue));
    return true;
  } catch {
    return false;
  }
}

function createQueueId(action: OfflineAttendanceAction) {
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `offline:${action}:${Date.now()}:${randomId}`.slice(0, 120);
}

function retryDelayMs(attempts: number) {
  return Math.min(5 * 60_000, 20_000 * Math.max(1, attempts));
}

function duplicateClockOutSynced(error: unknown) {
  return error instanceof Error && error.message.includes("đã kết ca");
}

export function shouldQueueAttendanceOffline({
  error,
  isPremium,
  isOnline,
  source
}: {
  error: unknown;
  isPremium: boolean;
  isOnline: boolean;
  source: AttendanceQueueAttemptSource;
}) {
  return source === "gps" && isPremium && (!isOnline || isStaffOperationsNetworkError(error));
}

export function useOfflineAttendanceQueue({
  restaurantId,
  userId,
  onSynced
}: {
  restaurantId: string;
  userId: string;
  onSynced?: () => Promise<void> | void;
}) {
  const key = useMemo(() => storageKey(restaurantId, userId), [restaurantId, userId]);
  const [queue, setQueue] = useState<OfflineAttendanceQueueItem[]>(() => (typeof window === "undefined" ? [] : readQueue(key)));
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  const replaceQueue = useCallback(
    (nextQueue: OfflineAttendanceQueueItem[]) => {
      writeQueue(key, nextQueue);
      setQueue(nextQueue);
    },
    [key]
  );

  const updateQueue = useCallback(
    (updater: (currentQueue: OfflineAttendanceQueueItem[]) => OfflineAttendanceQueueItem[]) => {
      setQueue((currentQueue) => {
        const nextQueue = updater(currentQueue).slice(0, maxOfflineQueueItems);
        writeQueue(key, nextQueue);
        return nextQueue;
      });
    },
    [key]
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const enqueue = useCallback(
    (input: EnqueueOfflineAttendanceInput): EnqueueOfflineAttendanceResult => {
      const currentQueue = readQueue(key);
      if (currentQueue.length >= maxOfflineQueueItems) {
        return { item: null, error: "Hàng đợi offline đã đầy. Vui lòng online để đồng bộ trước khi chấm công tiếp." };
      }

      const hasPendingClockIn = currentQueue.some((item) => item.action === "clock_in");
      if (input.action === "clock_in" && hasPendingClockIn) {
        return { item: null, error: "Đã có một lần check-in offline đang chờ đồng bộ." };
      }
      if (input.action === "clock_out" && hasPendingClockIn) {
        return { item: null, error: "Cần đồng bộ lần check-in offline trước khi kết ca." };
      }
      if (input.action === "clock_out") {
        const duplicateClockOut = currentQueue.some((item) => item.action === "clock_out" && item.attendanceLogId === input.attendanceLogId);
        if (duplicateClockOut) return { item: null, error: "Lần kết ca này đã nằm trong hàng đợi offline." };
      }

      const item: OfflineAttendanceQueueItem = {
        ...input,
        id: createQueueId(input.action),
        createdAt: new Date().toISOString(),
        attempts: 0
      };
      const nextQueue = [item, ...currentQueue];
      if (!writeQueue(key, nextQueue)) {
        return { item: null, error: "Không thể lưu chấm công offline trên thiết bị này." };
      }
      setQueue(nextQueue);
      return { item };
    },
    [key]
  );

  const remove = useCallback(
    (itemId: string) => {
      updateQueue((currentQueue) => currentQueue.filter((item) => item.id !== itemId));
    },
    [updateQueue]
  );

  const syncQueue = useCallback(
    async (options?: { force?: boolean }) => {
      if (syncing || queue.length === 0 || (!isOnline && !options?.force)) return { synced: 0, failed: 0 };

      const now = Date.now();
      const readyItems = options?.force
        ? queue
        : queue.filter((item) => !item.nextRetryAt || new Date(item.nextRetryAt).getTime() <= now);
      if (readyItems.length === 0) return { synced: 0, failed: 0 };

      setSyncing(true);
      let workingQueue = queue;
      let synced = 0;
      let failed = 0;

      try {
        for (const item of readyItems.slice().reverse()) {
          try {
            const deviceInfo = {
              ...(item.deviceInfo ?? {}),
              offlineQueuedAt: item.createdAt,
              offlineOriginalSource: item.source
            };

            if (item.action === "clock_in") {
              await clockInAttendance({
                branchId: item.branchId,
                source: "offline_sync",
                offlineQueueKey: item.id,
                lat: item.lat,
                lng: item.lng,
                accuracyMeters: item.accuracyMeters,
                capturedAt: item.capturedAt,
                deviceInfo
              });
            } else {
              await clockOutAttendance({
                attendanceLogId: item.attendanceLogId,
                branchId: item.branchId,
                source: "offline_sync",
                lat: item.lat,
                lng: item.lng,
                accuracyMeters: item.accuracyMeters,
                capturedAt: item.capturedAt,
                deviceInfo
              });
            }

            synced += 1;
            workingQueue = workingQueue.filter((queuedItem) => queuedItem.id !== item.id);
            replaceQueue(workingQueue);
          } catch (error) {
            if (item.action === "clock_out" && duplicateClockOutSynced(error)) {
              synced += 1;
              workingQueue = workingQueue.filter((queuedItem) => queuedItem.id !== item.id);
              replaceQueue(workingQueue);
              continue;
            }

            failed += 1;
            const attempts = item.attempts + 1;
            const nextRetryAt = new Date(Date.now() + retryDelayMs(attempts)).toISOString();
            workingQueue = workingQueue.map((queuedItem) =>
              queuedItem.id === item.id
                ? {
                    ...queuedItem,
                    attempts,
                    lastError: error instanceof Error ? error.message : "Không thể đồng bộ chấm công offline.",
                    nextRetryAt
                  }
                : queuedItem
            );
            replaceQueue(workingQueue);
            break;
          }
        }

        if (synced > 0) await onSynced?.();
        return { synced, failed };
      } finally {
        setSyncing(false);
      }
    },
    [isOnline, onSynced, queue, replaceQueue, syncing]
  );

  useEffect(() => {
    const hasReadyItem = queue.some((item) => !item.nextRetryAt || new Date(item.nextRetryAt).getTime() <= Date.now());
    if (!isOnline || !hasReadyItem) return undefined;
    const timer = window.setTimeout(() => void syncQueue(), 0);
    return () => window.clearTimeout(timer);
  }, [isOnline, queue, syncQueue]);

  return {
    queue,
    enqueue,
    remove,
    syncQueue,
    syncing,
    isOnline
  };
}
