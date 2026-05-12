"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, CheckCircle2, ChefHat, Filter, LocateFixed, MapPinned, MoreVertical, Navigation, RadioTower, ReceiptText, RefreshCw, Search, TimerReset, Trash2, Truck, UserPlus, XCircle } from "lucide-react";
import { buildDirectionsUrl, RouteMiniMap } from "@/components/customer/route-mini-map";
import { useConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deliveryStatusLabel, orderStatusLabel, paymentMethodLabel, paymentStatusLabel } from "@/lib/labels";
import { formatVnd } from "@/lib/money";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { OrderDto } from "@/types/domain";

function statusTone(status: string): "neutral" | "green" | "yellow" | "blue" | "red" {
  if (status === "paid") return "green";
  if (status === "completed") return "blue";
  if (status === "waiting_confirm") return "yellow";
  if (status === "waiting_payment") return "blue";
  if (status === "ordering") return "green";
  if (status === "cancelled") return "red";
  return "neutral";
}

function paymentTone(status: string | null | undefined): "neutral" | "green" | "yellow" | "blue" | "red" {
  if (status === "paid") return "green";
  if (status === "waiting_confirm") return "yellow";
  if (status === "waiting_payment") return "blue";
  if (status === "failed" || status === "refunded") return "red";
  return "neutral";
}

type RealtimeState = "connecting" | "connected" | "error";
type OrderFilter = "all" | "pending" | "ordering" | "completed" | "waiting_payment" | "waiting_confirm" | "paid" | "cancelled" | "history";
type ChannelFilter = "all" | "DINE_IN" | "PICKUP" | "DELIVERY";
type CourierLiveLocation = {
  lat: number;
  lng: number;
  accuracyMeters?: number | null;
  headingDegrees?: number | null;
  speedMps?: number | null;
  capturedAt?: string | null;
};
type DeliveryCourier = {
  id: string;
  name: string;
  phone: string | null;
  status: "offline" | "available" | "assigned" | "busy" | "paused";
  lastLocationAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

const orderFilters: Array<{ label: string; value: OrderFilter }> = [
  { label: "Tất cả", value: "all" },
  { label: "Chờ xử lý", value: "pending" },
  { label: "Đang phục vụ", value: "ordering" },
  { label: "Hoàn tất", value: "completed" },
  { label: "Chờ thanh toán", value: "waiting_payment" },
  { label: "Chờ xác nhận", value: "waiting_confirm" },
  { label: "Đã thanh toán", value: "paid" },
  { label: "Đã huỷ", value: "cancelled" },
  { label: "Lịch sử", value: "history" }
];

function readOrderFilter(value: string | null): OrderFilter {
  return orderFilters.some((item) => item.value === value) ? (value as OrderFilter) : "all";
}

function readChannelFilter(value: string | null): ChannelFilter {
  return value === "DINE_IN" || value === "PICKUP" || value === "DELIVERY" ? value : "all";
}

function realtimeLabel(status: RealtimeState) {
  if (status === "connected") return "Cập nhật tức thời đang bật";
  if (status === "error") return "Kết nối bị gián đoạn";
  return "Đang kết nối dữ liệu";
}

function courierStatusLabel(status: DeliveryCourier["status"]) {
  if (status === "available") return "Sẵn sàng";
  if (status === "assigned") return "Đã phân công";
  if (status === "busy") return "Đang giao";
  if (status === "paused") return "Tạm dừng";
  return "Offline";
}

function courierStatusTone(status: DeliveryCourier["status"]): "neutral" | "green" | "yellow" | "blue" | "red" {
  if (status === "available") return "green";
  if (status === "assigned") return "yellow";
  if (status === "busy") return "blue";
  if (status === "paused") return "yellow";
  return "neutral";
}

function formatOrderTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

function formatTrackingTime(value?: string | null) {
  if (!value) return "Chưa cập nhật";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

function minutesSince(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
}

function minutesUntil(value?: string | null) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 60000);
}

function isServiceOverdue(order: OrderDto) {
  const dueIn = minutesUntil(order.serviceDueAt);
  return ["pending", "ordering"].includes(order.status) && dueIn !== null && dueIn < 0;
}

function orderLocationLabel(order: OrderDto) {
  if (order.fulfillmentType === "DELIVERY") return "Giao hàng";
  if (order.fulfillmentType === "PICKUP") return "Đến lấy";
  return order.table?.name ?? "Không rõ bàn";
}

function orderChannelLabel(order: OrderDto) {
  if (order.fulfillmentType === "DELIVERY") return "Online giao hàng";
  if (order.fulfillmentType === "PICKUP") return "Online đến lấy";
  return "QR tại bàn";
}

function canDeleteTestOrder(order: OrderDto) {
  if (order.status === "paid" || order.status === "waiting_confirm") return false;
  if (order.paymentStatus === "paid" || order.paymentStatus === "waiting_confirm") return false;
  if (order.paidAt || order.bill?.status === "paid" || order.bill?.status === "waiting_confirm") return false;
  if (order.deliveryStatus === "out_for_delivery" || order.deliveryStatus === "delivered") return false;
  return ["pending", "ordering", "completed", "waiting_payment", "cancelled"].includes(order.status);
}

type BillGroup = {
  id: string;
  bill: OrderDto["bill"];
  orders: OrderDto[];
  tableName: string;
  total: number;
  status: OrderDto["status"];
  paymentMethod: OrderDto["paymentMethod"];
  latestAt: string;
  paymentOrder: OrderDto | null;
  overdueCount: number;
};

function deriveBillStatus(orders: OrderDto[], bill: OrderDto["bill"]): OrderDto["status"] {
  if (bill?.status === "paid") return "paid";
  if (bill?.status === "cancelled") return "cancelled";
  if (bill?.status === "waiting_confirm") return "waiting_confirm";
  if (bill?.status === "waiting_payment") return "waiting_payment";
  if (orders.some((order) => order.status === "pending")) return "pending";
  if (orders.some((order) => order.status === "ordering")) return "ordering";
  if (orders.some((order) => order.status === "completed")) return "completed";
  return orders[0]?.status ?? "pending";
}

function buildBillGroups(orders: OrderDto[]): BillGroup[] {
  const byBill = new Map<string, OrderDto[]>();

  for (const order of orders) {
    const key = order.bill?.id ?? order.id;
    const group = byBill.get(key);
    if (group) {
      group.push(order);
    } else {
      byBill.set(key, [order]);
    }
  }

  return [...byBill.entries()]
    .map(([id, billOrders]) => {
      const sortedOrders = [...billOrders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const bill = sortedOrders.find((order) => order.bill)?.bill ?? null;
      const paymentOrder =
        sortedOrders.find((order) => order.paymentStatus === "waiting_confirm") ??
        sortedOrders.find((order) => order.paymentStatus === "waiting_payment") ??
        sortedOrders.find((order) => order.status === "waiting_confirm") ??
        sortedOrders.find((order) => order.status === "waiting_payment") ??
        null;

      return {
        id,
        bill,
        orders: sortedOrders,
        tableName: orderLocationLabel(sortedOrders[0]),
        total: bill?.total ?? sortedOrders.reduce((sum, order) => sum + order.total, 0),
        status: deriveBillStatus(sortedOrders, bill),
        paymentMethod: bill?.paymentMethod ?? sortedOrders.find((order) => order.paymentMethod)?.paymentMethod ?? null,
        latestAt: sortedOrders[0]?.createdAt ?? new Date(0).toISOString(),
        paymentOrder,
        overdueCount: sortedOrders.filter(isServiceOverdue).length
      };
    })
    .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());
}

function applyOptimisticOrderAction(
  orders: OrderDto[],
  orderId: string,
  action: "accept" | "confirm-payment" | "complete" | "cancel" | "delete-test" | "timer" | "delivery-status",
  body?: unknown
) {
  if (action === "delete-test") {
    return orders.filter((order) => order.id !== orderId);
  }

  const now = new Date();
  const targetOrder = orders.find((order) => order.id === orderId);
  const targetBillId = targetOrder?.bill?.id ?? null;
  const minutes = typeof body === "object" && body !== null && "minutes" in body && typeof body.minutes === "number" ? body.minutes : 10;
  const nextDue = new Date(now.getTime() + minutes * 60_000).toISOString();

  return orders.map((order) => {
      const sameOrder = order.id === orderId;
      const sameBill = Boolean(targetBillId && order.bill?.id === targetBillId);

      if (action === "confirm-payment" && (sameOrder || sameBill)) {
        const shouldReturnToKitchen = order.fulfillmentType !== "DINE_IN" && (order.status === "waiting_confirm" || order.status === "waiting_payment");
        return {
          ...order,
          status: shouldReturnToKitchen ? ("pending" as const) : ("paid" as const),
          paymentStatus: "paid" as const,
          paidAt: now.toISOString(),
          bill: order.bill ? { ...order.bill, status: "paid" as const, paidAt: now.toISOString() } : order.bill
        };
      }

      if (!sameOrder) return order;

      if (action === "accept") {
        return {
          ...order,
          status: "ordering" as const,
          acceptedAt: now.toISOString(),
          serviceDueAt: nextDue
        };
      }

      if (action === "complete") {
        return {
          ...order,
          status: "completed" as const,
          servedAt: now.toISOString()
        };
      }

      if (action === "timer") {
        return {
          ...order,
          serviceDueAt: nextDue
        };
      }

      if (action === "delivery-status" && typeof body === "object" && body !== null && "status" in body) {
        const deliveryStatus = body.status as OrderDto["deliveryStatus"];
        return {
          ...order,
          status: deliveryStatus === "delivered" && order.status === "ordering" ? ("completed" as const) : order.status,
          deliveryStatus,
          deliveryTrackingUpdatedAt: now.toISOString(),
          servedAt: deliveryStatus === "delivered" ? now.toISOString() : order.servedAt
        };
      }

      if (action === "cancel") {
        return {
          ...order,
          status: "cancelled" as const
        };
      }

      return order;
    });
}

function groupMatches(group: BillGroup, filter: OrderFilter, keyword: string, locationFilter: string, channelFilter: ChannelFilter) {
  const matchesFilter =
    filter === "all" ||
    (filter === "history" && (group.status === "paid" || group.status === "cancelled" || group.orders.some((order) => order.status === "paid" || order.status === "cancelled"))) ||
    group.status === filter ||
    group.orders.some((order) => order.status === filter);
  const matchesLocation = locationFilter === "all" || group.tableName === locationFilter;
  const matchesChannel = channelFilter === "all" || group.orders.some((order) => order.fulfillmentType === channelFilter);
  const matchesKeyword =
    !keyword ||
    group.id.toLowerCase().includes(keyword) ||
    group.tableName.toLowerCase().includes(keyword) ||
    group.orders.some((order) =>
      order.id.toLowerCase().includes(keyword) ||
      orderLocationLabel(order).toLowerCase().includes(keyword) ||
      (order.customerName ?? "").toLowerCase().includes(keyword) ||
      (order.customerPhone ?? "").toLowerCase().includes(keyword) ||
      (order.deliveryAddress ?? "").toLowerCase().includes(keyword) ||
      order.items.some((item) => item.menuItem?.name?.toLowerCase().includes(keyword))
    );

  return matchesFilter && matchesLocation && matchesChannel && matchesKeyword;
}

export function OrdersBoard({
  initialOrders,
  restaurantId,
  canManageTestOrders = false
}: {
  initialOrders: OrderDto[];
  restaurantId: string;
  canManageTestOrders?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState(initialOrders);
  const [loading, setLoading] = useState(false);
  const [mutatingOrderId, setMutatingOrderId] = useState<string | null>(null);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [courierLocations, setCourierLocations] = useState<Record<string, CourierLiveLocation>>({});
  const [couriers, setCouriers] = useState<DeliveryCourier[]>([]);
  const [couriersLoading, setCouriersLoading] = useState(false);
  const [courierMutationOrderId, setCourierMutationOrderId] = useState<string | null>(null);
  const [newCourierName, setNewCourierName] = useState("");
  const [newCourierPhone, setNewCourierPhone] = useState("");
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("connecting");
  const [selectedGroupId, setSelectedGroupIdValue] = useState<string | null>(searchParams.get("order"));
  const { confirm, confirmDialog } = useConfirmDialog();
  const refreshTimerRef = useRef<number | null>(null);
  const inFlightRefreshRef = useRef(false);
  const queuedRefreshRef = useRef(false);
  const loadOrdersRef = useRef<({ silent }?: { silent?: boolean }) => Promise<void>>(async () => undefined);
  const [filter, setFilterValue] = useState<OrderFilter>(() => readOrderFilter(searchParams.get("status")));
  const [query, setQueryValue] = useState(searchParams.get("q") ?? "");
  const [locationFilter, setLocationFilterValue] = useState(searchParams.get("source") ?? "all");
  const [channelFilter, setChannelFilterValue] = useState<ChannelFilter>(() => readChannelFilter(searchParams.get("channel")));
  const [error, setError] = useState<string | null>(null);

  function replaceUrlState(updates: {
    channel?: ChannelFilter;
    order?: string | null;
    q?: string;
    source?: string;
    status?: OrderFilter;
  }) {
    const params = new URLSearchParams(searchParams.toString());

    if (updates.status !== undefined) {
      if (updates.status === "all") params.delete("status");
      else params.set("status", updates.status);
    }
    if (updates.q !== undefined) {
      const trimmedQuery = updates.q.trim();
      if (trimmedQuery) params.set("q", trimmedQuery);
      else params.delete("q");
    }
    if (updates.source !== undefined) {
      if (updates.source === "all") params.delete("source");
      else params.set("source", updates.source);
    }
    if (updates.channel !== undefined) {
      if (updates.channel === "all") params.delete("channel");
      else params.set("channel", updates.channel);
    }
    if (updates.order !== undefined) {
      if (updates.order) params.set("order", updates.order);
      else params.delete("order");
    }

    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  function setFilter(nextFilter: OrderFilter) {
    setFilterValue(nextFilter);
    replaceUrlState({ status: nextFilter });
  }

  function setQuery(nextQuery: string) {
    setQueryValue(nextQuery);
    replaceUrlState({ q: nextQuery });
  }

  function setLocationFilter(nextLocationFilter: string) {
    setLocationFilterValue(nextLocationFilter);
    replaceUrlState({ source: nextLocationFilter });
  }

  function setChannelFilter(nextChannelFilter: ChannelFilter) {
    setChannelFilterValue(nextChannelFilter);
    replaceUrlState({ channel: nextChannelFilter });
  }

  function setSelectedGroupId(nextGroupId: string | null) {
    setSelectedGroupIdValue(nextGroupId);
    replaceUrlState({ order: nextGroupId });
  }

  useEffect(() => {
    const syncFiltersFromHistory = () => {
      const params = new URLSearchParams(window.location.search);
      setFilterValue(readOrderFilter(params.get("status")));
      setQueryValue(params.get("q") ?? "");
      setLocationFilterValue(params.get("source") ?? "all");
      setChannelFilterValue(readChannelFilter(params.get("channel")));
      setSelectedGroupIdValue(params.get("order"));
    };

    window.addEventListener("popstate", syncFiltersFromHistory);
    return () => window.removeEventListener("popstate", syncFiltersFromHistory);
  }, []);

  async function loadOrders({ silent = false }: { silent?: boolean } = {}) {
    if (inFlightRefreshRef.current) {
      queuedRefreshRef.current = true;
      return;
    }

    inFlightRefreshRef.current = true;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/orders?history=true", { cache: "no-store" });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tải được đơn hàng");
      setOrders(json.data as OrderDto[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được đơn hàng");
    } finally {
      inFlightRefreshRef.current = false;
      if (!silent) setLoading(false);

      if (queuedRefreshRef.current) {
        queuedRefreshRef.current = false;
        refreshTimerRef.current = window.setTimeout(() => void loadOrdersRef.current({ silent: true }), 180);
      }
    }
  }

  async function loadCouriers({ silent = false }: { silent?: boolean } = {}) {
    if (!silent) setCouriersLoading(true);
    try {
      const response = await fetch("/api/admin/delivery/couriers", { cache: "no-store" });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tải được danh sách shipper");
      setCouriers(json.data as DeliveryCourier[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách shipper");
    } finally {
      if (!silent) setCouriersLoading(false);
    }
  }

  useEffect(() => {
    loadOrdersRef.current = loadOrders;
  });

  useEffect(() => {
    let cancelled = false;

    async function hydrateCouriers() {
      try {
        const response = await fetch("/api/admin/delivery/couriers", { cache: "no-store" });
        const json = await response.json();
        if (!json.ok) throw new Error(json.error ?? "Không tải được danh sách shipper");
        if (!cancelled) setCouriers(json.data as DeliveryCourier[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Không tải được danh sách shipper");
      }
    }

    void hydrateCouriers();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  function scheduleRefresh(delay = 300) {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => void loadOrdersRef.current({ silent: true }), delay);
  }

  async function mutateOrder(orderId: string, action: "accept" | "confirm-payment" | "complete" | "cancel" | "delete-test" | "timer" | "delivery-status", body?: unknown) {
    if (action === "cancel") {
      const confirmed = await confirm({
        title: "Huỷ đơn",
        description: "Đơn sẽ được chuyển sang trạng thái huỷ. Hệ thống vẫn giữ lịch sử và log thanh toán nếu có.",
        confirmLabel: "Huỷ đơn"
      });
      if (!confirmed) return;
    }
    if (action === "delete-test") {
      if (!canManageTestOrders) {
        setError("Chỉ tài khoản quản trị mới được xoá đơn test.");
        return;
      }
      const confirmed = await confirm({
        title: "Xoá cứng đơn test",
        description: "Đơn test chưa thanh toán sẽ bị xoá khỏi hệ thống. Chỉ dùng thao tác này để dọn dữ liệu demo hoặc test.",
        confirmLabel: "Xoá test",
        confirmationText: "XOA TEST"
      });
      if (!confirmed) return;
    }

    const previousOrders = orders;
    setMutatingOrderId(orderId);
    setError(null);
    setOrders((current) => applyOptimisticOrderAction(current, orderId, action, body));

    try {
      const response = await fetch(`/api/admin/orders/${orderId}/${action}`, {
        method: "POST",
        ...(body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body)
            }
          : {})
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Thao tác thất bại");
      scheduleRefresh(80);
    } catch (err) {
      setOrders(previousOrders);
      setError(err instanceof Error ? err.message : "Thao tác thất bại");
    } finally {
      setMutatingOrderId(null);
    }
  }

  async function cleanupVisibleTestOrders() {
    if (!canManageTestOrders) {
      setError("Chỉ tài khoản quản trị mới được dọn đơn test.");
      return;
    }
    const confirmed = await confirm({
      title: "Dọn đơn test",
      description: "Tối đa 100 đơn test chưa thanh toán hoặc chưa chờ xác nhận chuyển khoản sẽ bị xoá cứng.",
      confirmLabel: "Dọn đơn test",
      confirmationText: "XOA TEST"
    });
    if (!confirmed) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/orders/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "delete_test",
          statuses: ["pending", "ordering", "completed", "waiting_payment", "cancelled"],
          olderThanMinutes: 0,
          limit: 100
        })
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không dọn được đơn test");
      const result = json.data as { deleted: number; skipped: number };
      setError(`Đã xoá ${result.deleted} đơn test. Bỏ qua ${result.skipped} đơn có rủi ro thanh toán.`);
      await loadOrders({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không dọn được đơn test");
    } finally {
      setLoading(false);
    }
  }

  async function captureDeliveryLocation(orderId: string) {
    if (!("geolocation" in navigator)) {
      setError("Thiết bị này chưa hỗ trợ lấy vị trí GPS.");
      return;
    }

    setTrackingOrderId(orderId);
    setError(null);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12_000,
          maximumAge: 10_000
        });
      });

      const response = await fetch(`/api/admin/orders/${orderId}/delivery-location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          headingDegrees: Number.isFinite(position.coords.heading) ? position.coords.heading : undefined,
          speedMps: Number.isFinite(position.coords.speed) ? position.coords.speed : undefined
        })
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không cập nhật được vị trí giao hàng");
      const location = json.data as {
        orderId: string;
        latitude: number;
        longitude: number;
        accuracyMeters?: number | null;
        headingDegrees?: number | null;
        speedMps?: number | null;
        capturedAt?: string | null;
      };
      setCourierLocations((current) => ({
        ...current,
        [location.orderId]: {
          lat: location.latitude,
          lng: location.longitude,
          accuracyMeters: location.accuracyMeters ?? null,
          headingDegrees: location.headingDegrees ?? null,
          speedMps: location.speedMps ?? null,
          capturedAt: location.capturedAt ?? null
        }
      }));
      setOrders((current) =>
        current.map((order) =>
          order.id === location.orderId
            ? {
                ...order,
                deliveryTrackingUpdatedAt: location.capturedAt ?? order.deliveryTrackingUpdatedAt
              }
            : order
        )
      );
    } catch (err) {
      const geoError = err as { code?: number; PERMISSION_DENIED?: number } | null;
      if (geoError && typeof geoError === "object" && "code" in geoError) {
        setError(geoError.code === 1 || geoError.code === geoError.PERMISSION_DENIED ? "Bạn cần cho phép trình duyệt dùng vị trí để gửi GPS giao hàng." : "Không lấy được vị trí hiện tại. Vui lòng thử lại gần khu vực giao.");
      } else {
        setError(err instanceof Error ? err.message : "Không cập nhật được vị trí giao hàng");
      }
    } finally {
      setTrackingOrderId(null);
    }
  }

  async function createCourier() {
    const name = newCourierName.trim();
    if (name.length < 2) {
      setError("Tên shipper cần ít nhất 2 ký tự.");
      return;
    }

    setCouriersLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/delivery/couriers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone: newCourierPhone.trim() || undefined
        })
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tạo được shipper");
      const courier = json.data as DeliveryCourier;
      setCouriers((current) => [...current.filter((item) => item.id !== courier.id), courier]);
      setNewCourierName("");
      setNewCourierPhone("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được shipper");
    } finally {
      setCouriersLoading(false);
    }
  }

  async function assignCourier(orderId: string, courierId: string | null) {
    const previousOrders = orders;
    const optimisticCourier = courierId ? couriers.find((courier) => courier.id === courierId) ?? null : null;
    const now = new Date().toISOString();

    setCourierMutationOrderId(orderId);
    setError(null);
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? {
              ...order,
              deliveryCourierId: courierId,
              deliveryAssignedAt: courierId ? now : null,
              deliveryTrackingUpdatedAt: now,
              deliveryCourier: optimisticCourier
                ? {
                    id: optimisticCourier.id,
                    name: optimisticCourier.name,
                    phone: optimisticCourier.phone,
                    status: optimisticCourier.status
                  }
                : null
            }
          : order
      )
    );

    try {
      const response = await fetch(`/api/admin/orders/${orderId}/delivery-courier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courierId })
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không phân công được shipper");
      const assignment = json.data as {
        orderId: string;
        deliveryCourierId: string | null;
        deliveryAssignedAt: string | null;
        deliveryCourier: DeliveryCourier | null;
      };

      setOrders((current) =>
        current.map((order) =>
          order.id === assignment.orderId
            ? {
                ...order,
                deliveryCourierId: assignment.deliveryCourierId,
                deliveryAssignedAt: assignment.deliveryAssignedAt,
                deliveryTrackingUpdatedAt: now,
                deliveryCourier: assignment.deliveryCourier
                  ? {
                      id: assignment.deliveryCourier.id,
                      name: assignment.deliveryCourier.name,
                      phone: assignment.deliveryCourier.phone,
                      status: assignment.deliveryCourier.status
                    }
                  : null
              }
            : order
        )
      );
      if (assignment.deliveryCourier) {
        setCouriers((current) =>
          current.map((courier) =>
            courier.id === assignment.deliveryCourier?.id
              ? {
                  ...courier,
                  status: assignment.deliveryCourier.status,
                  lastLocationAt: assignment.deliveryCourier.lastLocationAt
                }
              : courier
          )
        );
      }
      scheduleRefresh(120);
      void loadCouriers({ silent: true });
    } catch (err) {
      setOrders(previousOrders);
      setError(err instanceof Error ? err.message : "Không phân công được shipper");
    } finally {
      setCourierMutationOrderId(null);
    }
  }

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const scheduleRealtimeRefresh = () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => void loadOrdersRef.current({ silent: true }), 320);
    };

    const channel = supabase
      .channel(`admin-orders:${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        scheduleRealtimeRefresh
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "delivery_tracking_events", filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          const event = payload.new as {
            order_id?: string;
            event_type?: string;
            latitude?: number | null;
            longitude?: number | null;
            accuracy_meters?: number | null;
            heading_degrees?: number | null;
            speed_mps?: number | null;
            created_at?: string | null;
          };
          if (event.event_type === "location_ping" && event.order_id && typeof event.latitude === "number" && typeof event.longitude === "number") {
            setCourierLocations((current) => ({
              ...current,
              [event.order_id!]: {
                lat: event.latitude!,
                lng: event.longitude!,
                accuracyMeters: event.accuracy_meters ?? null,
                headingDegrees: event.heading_degrees ?? null,
                speedMps: event.speed_mps ?? null,
                capturedAt: event.created_at ?? null
              }
            }));
          }
          scheduleRealtimeRefresh();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeState("connected");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRealtimeState("error");
        }
      });

    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  const billGroups = useMemo(() => buildBillGroups(orders), [orders]);
  const activeTotal = useMemo(
    () => billGroups.filter((group) => group.status !== "paid" && group.status !== "cancelled").reduce((sum, group) => sum + group.total, 0),
    [billGroups]
  );
  const statusCounts = useMemo(() => {
    return orders.reduce(
      (acc, order) => {
        acc.all += 1;
        acc[order.status] += 1;
        if (order.status === "paid" || order.status === "cancelled") acc.history += 1;
        return acc;
      },
      { all: 0, pending: 0, ordering: 0, completed: 0, waiting_payment: 0, waiting_confirm: 0, paid: 0, cancelled: 0, history: 0 } satisfies Record<OrderFilter, number>
    );
  }, [orders]);
  const locationOptions = useMemo(() => {
    return ["all", ...Array.from(new Set(billGroups.map((group) => group.tableName)))];
  }, [billGroups]);
  const visibleBillGroups = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return billGroups.filter((group) => groupMatches(group, filter, keyword, locationFilter, channelFilter));
  }, [billGroups, channelFilter, filter, locationFilter, query]);
  const selectedGroup = selectedGroupId ? billGroups.find((group) => group.id === selectedGroupId) ?? null : null;
  const selectedOrder = selectedGroup?.orders[0] ?? null;
  const selectedDeliveryFee = selectedOrder?.deliveryFee ?? 0;
  const selectedPendingOrders = selectedGroup?.orders.filter((order) => order.status === "pending") ?? [];
  const selectedServingOrders = selectedGroup?.orders.filter((order) => order.status === "ordering") ?? [];
  const selectedCompletedUnpaidOrders =
    selectedGroup?.orders.filter((order) => order.status === "completed" && order.paymentStatus !== "paid") ?? [];
  const selectedPaymentOrder =
    selectedGroup?.paymentOrder ??
    selectedGroup?.orders.find((order) => order.paymentStatus === "waiting_confirm" || order.paymentStatus === "waiting_payment") ??
    (selectedGroup && (selectedGroup.status === "waiting_confirm" || selectedGroup.status === "waiting_payment") ? selectedGroup.orders[0] : null);
  const selectedDeliveryOrder = selectedGroup?.orders.find((order) => order.fulfillmentType === "DELIVERY") ?? null;
  const selectedCourierLocation = selectedDeliveryOrder
    ? courierLocations[selectedDeliveryOrder.id] ?? selectedDeliveryOrder.deliveryCourierLocation ?? null
    : null;
  const selectedDeliveryMapUrl = selectedDeliveryOrder
    ? buildDirectionsUrl(
        {
          lat: selectedDeliveryOrder.restaurant?.storeLat,
          lng: selectedDeliveryOrder.restaurant?.storeLng
        },
        {
          lat: selectedDeliveryOrder.deliveryLat,
          lng: selectedDeliveryOrder.deliveryLng
        }
      )
    : null;

  return (
    <div className="grid gap-3">
      {confirmDialog}
      {error && <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] p-3 text-sm font-semibold text-[var(--accent-strong)]">{error}</div>}

      <section className="dashboard-panel p-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {[
              { label: "Chờ nhận", value: statusCounts.pending, icon: TimerReset },
              { label: "Đang ra món", value: statusCounts.ordering, icon: ChefHat },
              { label: "Chờ thanh toán", value: statusCounts.waiting_payment + statusCounts.waiting_confirm, icon: ReceiptText },
              { label: "Lịch sử", value: statusCounts.history, icon: CheckCircle2 }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    if (item.label === "Chờ nhận") setFilter("pending");
                    if (item.label === "Đang ra món") setFilter("ordering");
                    if (item.label === "Chờ thanh toán") setFilter("waiting_confirm");
                    if (item.label === "Lịch sử") setFilter("history");
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                >
                  <Icon size={15} className="text-[var(--primary)]" />
                  {item.label}
                  <span className="metric-number rounded-md bg-[var(--soft-surface)] px-2 py-0.5 text-xs">{item.value}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={realtimeState === "connected" ? "green" : realtimeState === "error" ? "red" : "yellow"}>
              <RadioTower size={13} />
              {realtimeLabel(realtimeState)}
            </Badge>
            <span className="metric-number hidden rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] md:inline-flex">
              Đang mở: {formatVnd(activeTotal)}
            </span>
          </div>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[168px_168px_168px_minmax(0,1fr)_110px]">
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
            Trạng thái
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as OrderFilter)}
              className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold normal-case tracking-normal text-[var(--foreground)] outline-none"
            >
              {orderFilters.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
            Nguồn
            <select
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value)}
              className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold normal-case tracking-normal text-[var(--foreground)] outline-none"
            >
              {locationOptions.map((location) => (
                <option key={location} value={location}>{location === "all" ? "Tất cả bàn/kênh" : location}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
            Kênh
            <select
              value={channelFilter}
              onChange={(event) => setChannelFilter(event.target.value as ChannelFilter)}
              className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold normal-case tracking-normal text-[var(--foreground)] outline-none"
            >
              <option value="all">Tất cả kênh</option>
              <option value="DINE_IN">QR tại bàn</option>
              <option value="PICKUP">Khách đến lấy</option>
              <option value="DELIVERY">Giao hàng</option>
            </select>
          </label>
          <label className="relative block self-end">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--outline)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm mã đơn, bàn, khách, món..."
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-10 pr-3 text-sm font-medium outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => void loadOrders()}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm font-semibold text-[var(--primary)]"
          >
            {loading ? <RefreshCw className="animate-spin" size={16} /> : <Filter size={16} />}
            Làm mới
          </button>
        </div>

        {canManageTestOrders ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2">
            <p className="text-xs font-semibold text-[var(--muted-foreground)]">
              Chế độ test: chỉ xoá cứng đơn chưa thanh toán, không xoá đơn đã/chờ xác nhận chuyển khoản.
            </p>
            <button
              type="button"
              onClick={() => void cleanupVisibleTestOrders()}
              disabled={loading}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-xs font-black text-red-700 transition hover:border-red-300 disabled:opacity-60"
            >
              <Trash2 size={14} />
              Dọn đơn test
            </button>
          </div>
        ) : null}

        <div className="mt-3 flex gap-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-1.5">
          {orderFilters.map((item) => (
            <button
              key={item.value}
              onClick={() => setFilter(item.value)}
              className={`h-9 shrink-0 rounded-lg px-3 text-sm font-semibold transition ${
                filter === item.value
                  ? "bg-[var(--surface)] text-[var(--primary)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--surface)]"
              }`}
            >
              {item.label} ({statusCounts[item.value]})
            </button>
          ))}
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="dashboard-data-header grid grid-cols-[1.2fr_0.9fr_1.5fr_0.9fr_1fr_112px] gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-[0.06em]">
            <span>Mã đơn</span>
            <span>Nguồn</span>
            <span>Món / lượt gọi</span>
            <span>Thời gian</span>
            <span>Trạng thái</span>
            <span className="text-right">Tổng tiền</span>
          </div>
          <div className="dashboard-data-list">
            {visibleBillGroups.length === 0 && (
              <div className="grid min-h-40 place-items-center px-5 py-8 text-sm font-semibold text-[var(--muted-foreground)]">
                Không có đơn phù hợp.
              </div>
            )}
            {visibleBillGroups.map((group) => {
              const mainOrder = group.orders[0];
              const itemPreview = group.orders
                .flatMap((order) => order.items.map((item) => `${item.quantity}x ${item.menuItem?.name ?? "Món"}`))
                .slice(0, 3)
                .join(", ");
              return (
                <article
                  key={group.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedGroupId(group.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setSelectedGroupId(group.id);
                  }}
                  className={`dashboard-data-row dashboard-selectable-row grid cursor-pointer gap-3 px-4 py-3 lg:grid-cols-[1.2fr_0.9fr_1.5fr_0.9fr_1fr_112px] ${
                    selectedGroup?.id === group.id ? "dashboard-selected-row" : ""
                  }`}
                >
                  <span className="dashboard-data-field min-w-0" data-label="Mã đơn">
                    <span className="block font-mono text-sm font-semibold">#{group.id.slice(0, 10).toUpperCase()}</span>
                    <span className="mt-1 block truncate text-xs font-medium text-[var(--muted-foreground)]">{orderChannelLabel(mainOrder)}</span>
                  </span>
                  <span className="dashboard-data-field text-sm font-semibold" data-label="Nguồn">{group.tableName}</span>
                  <span className="dashboard-data-field min-w-0" data-label="Món / lượt gọi">
                    <span className="block truncate text-sm font-semibold">{itemPreview || "Chưa có món"}</span>
                    <span className="mt-1 block text-xs font-medium text-[var(--muted-foreground)]">{group.orders.length} lượt gọi · {group.orders.reduce((sum, order) => sum + order.items.length, 0)} dòng món</span>
                  </span>
                  <span className="dashboard-data-field text-sm font-semibold text-[var(--muted-foreground)]" data-label="Thời gian">
                    {formatOrderTime(group.latestAt)}
                    <span className="block text-xs font-medium">{minutesSince(group.latestAt)} phút trước</span>
                  </span>
                  <span className="dashboard-data-field dashboard-data-badges flex flex-wrap items-center gap-2" data-label="Trạng thái">
                    <Badge tone={statusTone(group.status)}>{orderStatusLabel(group.status)}</Badge>
                    {mainOrder.paymentStatus !== "unpaid" && (
                      <Badge tone={paymentTone(mainOrder.paymentStatus)}>{paymentStatusLabel(mainOrder.paymentStatus)}</Badge>
                    )}
                    {mainOrder.fulfillmentType === "DELIVERY" && mainOrder.deliveryStatus !== "none" && (
                      <Badge tone={mainOrder.deliveryStatus === "delivered" ? "green" : mainOrder.deliveryStatus === "out_for_delivery" ? "blue" : "yellow"}>
                        {deliveryStatusLabel(mainOrder.deliveryStatus)}
                      </Badge>
                    )}
                    {group.overdueCount > 0 && <Badge tone="red">{group.overdueCount} quá giờ</Badge>}
                  </span>
                  <span className="dashboard-data-field dashboard-data-row-actions flex items-center justify-between gap-3 lg:justify-end" data-label="Tổng tiền">
                    <span className="metric-number font-semibold">{formatVnd(group.total)}</span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedGroupId(group.id);
                      }}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] lg:hidden"
                      aria-label="Mở chi tiết đơn"
                    >
                      <MoreVertical size={16} />
                    </button>
                  </span>
                </article>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[var(--muted-foreground)]">
            <span>Đang hiển thị {visibleBillGroups.length} / {billGroups.length} hóa đơn</span>
            <button
              type="button"
              onClick={() => {
                setFilter("all");
                setLocationFilter("all");
                setChannelFilter("all");
                setQuery("");
              }}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-semibold text-[var(--primary)]"
            >
              Xoá bộ lọc
            </button>
          </div>
        </div>
      </section>

      {selectedGroup ? (
        <div className="fixed inset-0 z-[var(--z-dashboard-drawer)] overflow-hidden overscroll-contain">
          <button type="button" className="drawer-backdrop absolute inset-0 z-0" aria-label="Đóng chi tiết đơn" onClick={() => setSelectedGroupId(null)} />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-detail-drawer-title"
            className="drawer-panel absolute inset-y-0 right-0 z-[1] flex h-dvh max-h-dvh w-full max-w-[520px] flex-col border-l border-[var(--border)] bg-[var(--surface)]"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5 sm:py-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Chi tiết hóa đơn</p>
                <h2 id="order-detail-drawer-title" className="mt-1 truncate text-xl font-semibold text-[var(--foreground)]">#{selectedGroup.id.slice(0, 10).toUpperCase()}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone={statusTone(selectedGroup.status)}>{orderStatusLabel(selectedGroup.status)}</Badge>
                  {selectedGroup.overdueCount > 0 && <Badge tone="yellow">{selectedGroup.overdueCount} đơn quá giờ</Badge>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGroupId(null)}
                className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]"
                aria-label="Đóng chi tiết đơn"
              >
                <XCircle size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-5">
              <div className="grid grid-cols-3 gap-2 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-sm">
                <div>
                  <p className="font-semibold text-[var(--foreground)]">{selectedGroup.tableName}</p>
                  <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">{selectedOrder?.fulfillmentType === "DINE_IN" ? "Tại quán" : "Online"}</p>
                </div>
                <div>
                  <p className="font-semibold text-[var(--foreground)]">{selectedOrder ? orderChannelLabel(selectedOrder) : "QR Menu"}</p>
                  <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">Kênh gọi món</p>
                </div>
                <div>
                  <p className="font-semibold text-[var(--foreground)]">{formatOrderTime(selectedGroup.latestAt)}</p>
                  <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">Cập nhật</p>
                </div>
              </div>

              {selectedOrder && selectedOrder.fulfillmentType !== "DINE_IN" && (
                <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4 text-sm">
                  <h3 className="font-semibold text-[var(--foreground)]">Thông tin khách</h3>
                  <div className="mt-3 grid gap-2">
                    <div className="flex justify-between gap-4"><span className="text-[var(--muted-foreground)]">Khách</span><strong>{selectedOrder.customerName}</strong></div>
                    <div className="flex justify-between gap-4"><span className="text-[var(--muted-foreground)]">Điện thoại</span><strong>{selectedOrder.customerPhone}</strong></div>
                    {selectedOrder.deliveryAddress && (
                      <div className="grid gap-1"><span className="text-[var(--muted-foreground)]">Địa chỉ</span><strong>{selectedOrder.deliveryAddress}</strong></div>
                    )}
                    {selectedOrder.deliveryDistanceKm !== null && selectedOrder.deliveryDistanceKm !== undefined && (
                      <div className="flex justify-between gap-4"><span className="text-[var(--muted-foreground)]">Khoảng cách</span><strong>{selectedOrder.deliveryDistanceKm} km</strong></div>
                    )}
                  </div>
                </div>
              )}

              {selectedOrder && (
                <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
                  <div>
                    <p className="font-semibold text-[var(--foreground)]">{paymentStatusLabel(selectedOrder.paymentStatus)}</p>
                    <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">Trạng thái thanh toán</p>
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--foreground)]">{paymentMethodLabel(selectedGroup.paymentMethod)}</p>
                    <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">Phương thức</p>
                  </div>
                </div>
              )}

              {selectedDeliveryOrder ? (
                <div className="mt-4 grid gap-3">
                  <RouteMiniMap
                    origin={{
                      lat: selectedDeliveryOrder.restaurant?.storeLat,
                      lng: selectedDeliveryOrder.restaurant?.storeLng
                    }}
                    destination={{
                      lat: selectedDeliveryOrder.deliveryLat,
                      lng: selectedDeliveryOrder.deliveryLng
                    }}
                    route={selectedDeliveryOrder.deliveryRouteGeometry?.coordinates}
                    distanceKm={selectedDeliveryOrder.deliveryDistanceKm}
                    durationMinutes={selectedDeliveryOrder.deliveryRouteDurationMinutes}
                    status={selectedDeliveryOrder.deliveryStatus}
                    courierLocation={selectedCourierLocation}
                    compact
                  />
                  <div className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm shadow-[0_14px_30px_rgba(15,77,58,0.06)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 font-semibold text-[var(--foreground)]">
                          <Truck size={15} className="text-[var(--primary)]" />
                          Điều phối shipper
                        </p>
                        <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">
                          {selectedDeliveryOrder.deliveryCourier
                            ? `${selectedDeliveryOrder.deliveryCourier.name}${selectedDeliveryOrder.deliveryCourier.phone ? ` · ${selectedDeliveryOrder.deliveryCourier.phone}` : ""}`
                            : "Chưa phân công shipper cho đơn này"}
                        </p>
                      </div>
                      {selectedDeliveryOrder.deliveryCourier?.status ? (
                        <Badge tone={courierStatusTone(selectedDeliveryOrder.deliveryCourier.status)}>
                          {courierStatusLabel(selectedDeliveryOrder.deliveryCourier.status)}
                        </Badge>
                      ) : (
                        <Badge tone="yellow">Cần phân công</Badge>
                      )}
                    </div>

                    <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                      Chọn shipper
                      <select
                        value={selectedDeliveryOrder.deliveryCourierId ?? ""}
                        onChange={(event) => void assignCourier(selectedDeliveryOrder.id, event.target.value || null)}
                        disabled={courierMutationOrderId === selectedDeliveryOrder.id || couriersLoading}
                        className="h-11 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-3 text-sm font-semibold normal-case tracking-normal text-[var(--foreground)] outline-none disabled:opacity-60"
                      >
                        <option value="">Chưa phân công</option>
                        {couriers.map((courier) => (
                          <option key={courier.id} value={courier.id}>
                            {courier.name}{courier.phone ? ` · ${courier.phone}` : ""} · {courierStatusLabel(courier.status)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void createCourier();
                      }}
                      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_132px_auto]"
                    >
                      <input
                        value={newCourierName}
                        onChange={(event) => setNewCourierName(event.target.value)}
                        placeholder="Tên shipper mới"
                        className="h-11 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-3 text-sm font-semibold outline-none"
                      />
                      <input
                        value={newCourierPhone}
                        onChange={(event) => setNewCourierPhone(event.target.value)}
                        placeholder="SĐT"
                        className="h-11 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-3 text-sm font-semibold outline-none"
                      />
                      <button
                        type="submit"
                        disabled={couriersLoading || newCourierName.trim().length < 2}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--primary)] transition hover:border-[var(--primary)] disabled:pointer-events-none disabled:opacity-60"
                      >
                        {couriersLoading ? <RefreshCw size={15} className="animate-spin" /> : <UserPlus size={15} />}
                        Thêm
                      </button>
                    </form>

                    {couriers.length === 0 && !couriersLoading ? (
                      <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2 text-xs font-semibold text-[var(--muted-foreground)]">
                        Chưa có đội shipper nội bộ. Thêm một shipper để bắt đầu điều phối và theo dõi trạng thái theo từng người.
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-[var(--muted-foreground)]">ETA tuyến giao</span>
                      <strong>{selectedDeliveryOrder.deliveryRouteDurationMinutes ? `${selectedDeliveryOrder.deliveryRouteDurationMinutes} phút` : "Chưa có"}</strong>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-[var(--muted-foreground)]">Cập nhật cuối</span>
                      <strong>{formatTrackingTime(selectedDeliveryOrder.deliveryTrackingUpdatedAt)}</strong>
                    </div>
                    {selectedCourierLocation ? (
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[var(--muted-foreground)]">GPS shipper</span>
                          <strong>{formatTrackingTime(selectedCourierLocation.capturedAt)}</strong>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">
                          {selectedCourierLocation.lat.toFixed(5)}, {selectedCourierLocation.lng.toFixed(5)}
                          {selectedCourierLocation.accuracyMeters ? ` · sai số ~${Math.round(selectedCourierLocation.accuracyMeters)}m` : ""}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--muted-foreground)]">
                        Chưa có GPS shipper. Bấm gửi vị trí khi nhân viên bắt đầu giao hoặc khi cần cập nhật cho khách.
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => void captureDeliveryLocation(selectedDeliveryOrder.id)}
                      disabled={trackingOrderId === selectedDeliveryOrder.id}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,77,58,0.16)] transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60"
                    >
                      {trackingOrderId === selectedDeliveryOrder.id ? <RefreshCw size={15} className="animate-spin" /> : <LocateFixed size={15} />}
                      {trackingOrderId === selectedDeliveryOrder.id ? "Đang lấy GPS..." : "Gửi vị trí hiện tại"}
                    </button>
                    {selectedDeliveryMapUrl ? (
                      <a
                        href={selectedDeliveryMapUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--primary)]"
                      >
                        <Navigation size={15} />
                        Mở Google Maps
                      </a>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Nhận giao", status: "accepted", icon: MapPinned },
                      { label: "Đang giao", status: "out_for_delivery", icon: Navigation },
                      { label: "Đã giao", status: "delivered", icon: CheckCircle2 }
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <Button
                          key={item.status}
                          variant={selectedDeliveryOrder.deliveryStatus === item.status ? "primary" : "secondary"}
                          onClick={() => mutateOrder(selectedDeliveryOrder.id, "delivery-status", { status: item.status })}
                          disabled={mutatingOrderId === selectedDeliveryOrder.id}
                          className="min-h-11 shadow-none hover:shadow-none"
                        >
                          <Icon size={15} />
                          {item.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="mt-5 grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">Thao tác xử lý</h3>
                  <Badge tone={realtimeState === "connected" ? "green" : realtimeState === "error" ? "red" : "yellow"}>
                    <RadioTower size={13} />
                    {realtimeLabel(realtimeState)}
                  </Badge>
                </div>

                {selectedPendingOrders.length === 0 && selectedServingOrders.length === 0 && selectedCompletedUnpaidOrders.length === 0 && !selectedPaymentOrder ? (
                  <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-4 text-sm font-medium text-[var(--muted-foreground)]">
                    Hóa đơn này chưa có thao tác cần xử lý.
                  </div>
                ) : null}

                {selectedPendingOrders.map((order) => (
                  <div key={`pending-${order.id}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{order.items[0]?.menuItem?.name ?? "Đơn mới"}</p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">{order.items.length} món · {minutesSince(order.createdAt)} phút trước</p>
                      </div>
                      <Badge>Chờ nhận</Badge>
                    </div>
                    <div className={`mt-3 grid gap-2 ${canManageTestOrders && canDeleteTestOrder(order) ? "grid-cols-3" : "grid-cols-2"}`}>
                      <Button onClick={() => mutateOrder(order.id, "accept", { minutes: 15 })} disabled={mutatingOrderId === order.id} className="shadow-none hover:shadow-none">
                        <Check size={16} />
                        Nhận đơn
                      </Button>
                      <Button variant="secondary" onClick={() => mutateOrder(order.id, "cancel")} disabled={mutatingOrderId === order.id} className="shadow-none hover:shadow-none">
                        <XCircle size={16} />
                        Từ chối
                      </Button>
                      {canManageTestOrders && canDeleteTestOrder(order) ? (
                        <Button variant="secondary" onClick={() => mutateOrder(order.id, "delete-test")} disabled={mutatingOrderId === order.id} className="border-red-200 text-red-700 shadow-none hover:shadow-none">
                          <Trash2 size={16} />
                          Xoá test
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}

                {selectedServingOrders.map((order) => {
                  const dueIn = minutesUntil(order.serviceDueAt);
                  const isLate = dueIn !== null && dueIn < 0;
                  return (
                    <div key={`serving-${order.id}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{order.items[0]?.menuItem?.name ?? "Đang phục vụ"}</p>
                          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                            {order.items.length} món · {dueIn === null ? "chưa hẹn giờ" : isLate ? `trễ ${Math.abs(dueIn)} phút` : `còn ${Math.max(dueIn, 0)} phút`}
                          </p>
                        </div>
                        <Badge tone={isLate ? "red" : "green"}>{isLate ? "Quá giờ" : "Đang ra món"}</Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button onClick={() => mutateOrder(order.id, "complete")} disabled={mutatingOrderId === order.id} className="shadow-none hover:shadow-none">
                          <ChefHat size={16} />
                          Đã phục vụ
                        </Button>
                        <Button variant="secondary" onClick={() => mutateOrder(order.id, "timer", { minutes: 10 })} disabled={mutatingOrderId === order.id} className="shadow-none hover:shadow-none">
                          <TimerReset size={16} />
                          +10 phút
                        </Button>
                      </div>
                      <div className={`mt-2 grid gap-2 ${canManageTestOrders && canDeleteTestOrder(order) ? "grid-cols-2" : "grid-cols-1"}`}>
                        <Button variant="secondary" onClick={() => mutateOrder(order.id, "cancel")} disabled={mutatingOrderId === order.id} className="shadow-none hover:shadow-none">
                          <XCircle size={16} />
                          Huỷ đơn
                        </Button>
                        {canManageTestOrders && canDeleteTestOrder(order) ? (
                          <Button variant="secondary" onClick={() => mutateOrder(order.id, "delete-test")} disabled={mutatingOrderId === order.id} className="border-red-200 text-red-700 shadow-none hover:shadow-none">
                            <Trash2 size={16} />
                            Xoá test
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}

                {selectedCompletedUnpaidOrders.map((order) => (
                  <div key={`completed-unpaid-${order.id}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{order.items[0]?.menuItem?.name ?? "Đơn đã phục vụ"}</p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">{order.items.length} món · chưa thanh toán</p>
                      </div>
                      <Badge tone="blue">Đã phục vụ</Badge>
                    </div>
                    <div className={`mt-3 grid gap-2 ${canManageTestOrders && canDeleteTestOrder(order) ? "grid-cols-2" : "grid-cols-1"}`}>
                      <Button variant="secondary" onClick={() => mutateOrder(order.id, "cancel")} disabled={mutatingOrderId === order.id} className="shadow-none hover:shadow-none">
                        <XCircle size={16} />
                        Huỷ đơn
                      </Button>
                      {canManageTestOrders && canDeleteTestOrder(order) ? (
                        <Button variant="secondary" onClick={() => mutateOrder(order.id, "delete-test")} disabled={mutatingOrderId === order.id} className="border-red-200 text-red-700 shadow-none hover:shadow-none">
                          <Trash2 size={16} />
                          Xoá test
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}

                {selectedPaymentOrder ? (
                  <div className="rounded-xl border border-[var(--accent)]/28 bg-[var(--accent-soft)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--foreground)]">Thanh toán hóa đơn</p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">{paymentMethodLabel(selectedGroup.paymentMethod)} · {formatVnd(selectedGroup.total)}</p>
                      </div>
                      <Badge tone="yellow">{orderStatusLabel(selectedGroup.status)}</Badge>
                    </div>
                    <Button onClick={() => mutateOrder(selectedPaymentOrder.id, "confirm-payment")} disabled={mutatingOrderId === selectedPaymentOrder.id} className="mt-3 w-full shadow-none hover:shadow-none">
                      <CheckCircle2 size={16} />
                      Xác nhận thanh toán
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="mt-5">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">Món đã gọi</h3>
                <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                  {selectedGroup.orders.flatMap((order) =>
                    order.items.map((item, index) => (
                      <div key={`${order.id}-${index}`} className="grid grid-cols-[minmax(0,1fr)_44px_96px] items-center gap-3 border-b border-[var(--border)] px-3 py-3 last:border-b-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{item.menuItem?.name ?? "Không rõ món"}</p>
                          {item.note && <p className="mt-1 truncate text-xs font-semibold text-[var(--muted-foreground)]">{item.note}</p>}
                        </div>
                        <span className="metric-number text-center text-sm font-semibold">{item.quantity}</span>
                        <span className="metric-number text-right text-sm font-semibold">{formatVnd(item.price * item.quantity)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-[var(--muted-foreground)]">Tạm tính</span>
                  <span className="metric-number font-black">{formatVnd(Math.max(0, selectedGroup.total - selectedDeliveryFee))}</span>
                </div>
                <div className="mt-3 flex justify-between gap-4 text-sm">
                  <span className="text-[var(--muted-foreground)]">Phí giao hàng</span>
                  <span className="metric-number font-black">{formatVnd(selectedDeliveryFee)}</span>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4">
                  <span className="font-semibold text-[var(--foreground)]">Tổng tiền</span>
                  <span className="metric-number text-2xl font-semibold text-[var(--accent)]">{formatVnd(selectedGroup.total)}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
