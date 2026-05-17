import "server-only";

import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { isCoordinate } from "@/services/maps/distance-service";
import { rankDispatchCandidates, type DispatchCourierCandidate } from "@/services/delivery/dispatch-ranking-engine";
import type { Coordinate, RoutingProvider } from "@/services/maps/types";
import type { DeliveryCourierStatus } from "@/services/delivery-tracking-service";

type DispatchOrderRow = {
  id: string;
  restaurant_id: string;
  branch_id: string | null;
  fulfillment_type: string;
  status: string;
  delivery_status: string;
  delivery_lat: number | null;
  delivery_lng: number | null;
  restaurant: { store_lat: number | null; store_lng: number | null; map_routing_provider: RoutingProvider | null } | null;
};

type CourierRow = {
  id: string;
  name: string;
  phone: string | null;
  status: DeliveryCourierStatus;
  last_location_at: string | null;
};

type CourierLocationRow = {
  courier_id: string | null;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  captured_at: string;
};

type BranchRow = {
  latitude: number;
  longitude: number;
};

function toCoordinate(lat: number | null | undefined, lng: number | null | undefined): Coordinate | null {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
  const coordinate = { lat: Number(lat), lng: Number(lng) };
  return isCoordinate(coordinate) ? coordinate : null;
}

async function getOrderDispatchJob(restaurantId: string, orderId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id,restaurant_id,branch_id,fulfillment_type,status,delivery_status,delivery_lat,delivery_lng,restaurant:restaurants(store_lat,store_lng,map_routing_provider)")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .single();

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không tìm thấy đơn giao hàng", 404);

  const order = data as unknown as DispatchOrderRow;
  if (order.fulfillment_type !== "DELIVERY") throw new AppError("Chỉ hỗ trợ gợi ý shipper cho đơn giao hàng.", 400);
  if (order.status === "cancelled" || order.delivery_status === "delivered" || order.delivery_status === "rejected") {
    throw new AppError("Đơn giao đã kết thúc, không thể gợi ý shipper.", 400);
  }

  let pickup = toCoordinate(order.restaurant?.store_lat, order.restaurant?.store_lng);
  if (order.branch_id) {
    const { data: branch, error: branchError } = await supabase
      .from("store_branches")
      .select("latitude,longitude")
      .eq("id", order.branch_id)
      .eq("restaurant_id", restaurantId)
      .single();
    throwIfSupabaseError(branchError);
    pickup = toCoordinate((branch as BranchRow | null)?.latitude, (branch as BranchRow | null)?.longitude) ?? pickup;
  }

  const dropoff = toCoordinate(order.delivery_lat, order.delivery_lng);
  if (!pickup) throw new AppError("Quán hoặc chi nhánh chưa có tọa độ pickup.", 400);
  if (!dropoff) throw new AppError("Đơn giao hàng chưa có tọa độ khách.", 400);

  return {
    job: { pickup, dropoff },
    provider: order.restaurant?.map_routing_provider ?? "goong"
  };
}

async function getActiveOrderCounts(restaurantId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("orders")
    .select("delivery_courier_id")
    .eq("restaurant_id", restaurantId)
    .eq("fulfillment_type", "DELIVERY")
    .in("delivery_status", ["requested", "accepted", "out_for_delivery"])
    .not("delivery_courier_id", "is", null)
    .limit(1000);

  throwIfSupabaseError(error);
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ delivery_courier_id: string | null }>) {
    if (row.delivery_courier_id) counts.set(row.delivery_courier_id, (counts.get(row.delivery_courier_id) ?? 0) + 1);
  }
  return counts;
}

async function getCourierCandidates(restaurantId: string): Promise<DispatchCourierCandidate[]> {
  const supabase = createAdminSupabaseClient();
  const { data: couriers, error } = await supabase
    .from("delivery_couriers")
    .select("id,name,phone,status,last_location_at")
    .eq("restaurant_id", restaurantId)
    .order("status", { ascending: true })
    .order("name", { ascending: true });

  throwIfSupabaseError(error);
  const courierRows = (couriers ?? []) as CourierRow[];
  if (courierRows.length === 0) return [];

  const courierIds = courierRows.map((courier) => courier.id);
  const [counts, locationResult] = await Promise.all([
    getActiveOrderCounts(restaurantId),
    supabase
      .from("courier_locations")
      .select("courier_id,latitude,longitude,accuracy_meters,captured_at")
      .eq("restaurant_id", restaurantId)
      .in("courier_id", courierIds)
      .order("captured_at", { ascending: false })
      .limit(Math.min(courierIds.length * 4, 400))
  ]);

  throwIfSupabaseError(locationResult.error);
  const latestLocations = new Map<string, CourierLocationRow>();
  for (const location of (locationResult.data ?? []) as CourierLocationRow[]) {
    if (location.courier_id && !latestLocations.has(location.courier_id)) latestLocations.set(location.courier_id, location);
  }

  return courierRows.map((courier) => {
    const location = latestLocations.get(courier.id);
    return {
      id: courier.id,
      name: courier.name,
      phone: courier.phone,
      status: courier.status,
      lastLocationAt: courier.last_location_at,
      activeOrderCount: counts.get(courier.id) ?? 0,
      location: location
        ? {
            lat: location.latitude,
            lng: location.longitude,
            accuracyMeters: location.accuracy_meters,
            capturedAt: location.captured_at
          }
        : null
    };
  });
}

export async function getDeliveryDispatchCandidates(restaurantId: string, orderId: string) {
  const [{ job, provider }, candidates] = await Promise.all([
    getOrderDispatchJob(restaurantId, orderId),
    getCourierCandidates(restaurantId)
  ]);

  return rankDispatchCandidates(job, candidates, {
    provider,
    context: { restaurantId, source: "background" },
    maxRoutedCouriers: 8
  });
}
