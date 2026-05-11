import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { invalidateRestaurantDashboardCache } from "@/services/restaurant-service";
import type { DeliveryStatus } from "@/types/domain";
import type { Json } from "@/types/supabase";

export type DeliveryTrackingSource = "admin_dashboard" | "driver_app" | "manual" | "system";
export type DeliveryCourierStatus = "offline" | "available" | "assigned" | "busy" | "paused";

export type DeliveryCourierDto = {
  id: string;
  name: string;
  phone: string | null;
  status: DeliveryCourierStatus;
  lastLocationAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type DeliveryLocationInput = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  headingDegrees?: number | null;
  speedMps?: number | null;
  source?: DeliveryTrackingSource;
  capturedAt?: string | null;
  note?: string | null;
};

type DeliveryOrderRow = {
  id: string;
  restaurant_id: string;
  fulfillment_type: string;
  status: string;
  delivery_status: DeliveryStatus;
  delivery_courier_id: string | null;
};

type DeliveryCourierRow = {
  id: string;
  name: string;
  phone: string | null;
  status: DeliveryCourierStatus;
  last_location_at: string | null;
  created_at: string;
  updated_at: string | null;
};

const deliveryCourierSelect = "id,name,phone,status,last_location_at,created_at,updated_at";

function cleanOptionalNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mapDeliveryCourier(row: DeliveryCourierRow): DeliveryCourierDto {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    status: row.status,
    lastLocationAt: row.last_location_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function cleanPhone(value: string | null | undefined) {
  const phone = value?.trim();
  return phone ? phone : null;
}

async function getDeliveryOrder(restaurantId: string, orderId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id,restaurant_id,fulfillment_type,status,delivery_status,delivery_courier_id")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .single();

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không tìm thấy đơn giao hàng", 404);

  const order = data as DeliveryOrderRow;
  if (order.fulfillment_type !== "DELIVERY") throw new AppError("Chỉ đơn giao hàng mới có tracking.", 400);
  if (order.status === "cancelled") throw new AppError("Không thể cập nhật tracking cho đơn đã huỷ.", 400);
  return order;
}

async function markCourierAvailableIfIdle(restaurantId: string, courierId: string) {
  const supabase = createAdminSupabaseClient();
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("delivery_courier_id", courierId)
    .eq("fulfillment_type", "DELIVERY")
    .in("delivery_status", ["requested", "accepted", "out_for_delivery"]);

  throwIfSupabaseError(error);
  if ((count ?? 0) > 0) return;

  const { error: updateError } = await supabase
    .from("delivery_couriers")
    .update({ status: "available" })
    .eq("id", courierId)
    .eq("restaurant_id", restaurantId)
    .in("status", ["assigned", "busy"]);

  throwIfSupabaseError(updateError);
}

export async function listDeliveryCouriers(restaurantId: string): Promise<DeliveryCourierDto[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("delivery_couriers")
    .select(deliveryCourierSelect)
    .eq("restaurant_id", restaurantId)
    .order("status", { ascending: true })
    .order("name", { ascending: true });

  throwIfSupabaseError(error);
  return ((data ?? []) as DeliveryCourierRow[]).map(mapDeliveryCourier);
}

export async function createDeliveryCourier(
  restaurantId: string,
  input: {
    name: string;
    phone?: string | null;
  }
) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("delivery_couriers")
    .insert({
      restaurant_id: restaurantId,
      name: input.name.trim(),
      phone: cleanPhone(input.phone),
      status: "available",
      metadata: {
        source: "admin_dashboard"
      } satisfies Json
    })
    .select(deliveryCourierSelect)
    .single();

  if ((error as { code?: string } | null)?.code === "23505") {
    throw new AppError("Số điện thoại shipper đã tồn tại trong quán này.", 409);
  }

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không tạo được shipper", 400);
  invalidateRestaurantDashboardCache(restaurantId);
  return mapDeliveryCourier(data as DeliveryCourierRow);
}

export async function assignDeliveryCourierToOrder({
  restaurantId,
  orderId,
  courierId,
  actorUserId
}: {
  restaurantId: string;
  orderId: string;
  courierId?: string | null;
  actorUserId?: string | null;
}) {
  const order = await getDeliveryOrder(restaurantId, orderId);
  if (order.delivery_status === "delivered" || order.delivery_status === "rejected") {
    throw new AppError("Đơn giao đã kết thúc, không thể đổi shipper.", 400);
  }

  const supabase = createAdminSupabaseClient();
  const now = new Date().toISOString();
  let courier: DeliveryCourierRow | null = null;

  if (courierId) {
    const { data, error } = await supabase
      .from("delivery_couriers")
      .select(deliveryCourierSelect)
      .eq("id", courierId)
      .eq("restaurant_id", restaurantId)
      .single();

    throwIfSupabaseError(error);
    if (!data) throw new AppError("Không tìm thấy shipper", 404);
    courier = data as DeliveryCourierRow;
    if (courier.status === "offline" || courier.status === "paused") {
      throw new AppError("Shipper đang offline hoặc tạm dừng, hãy bật lại trước khi phân công.", 400);
    }
  }

  const { data: updatedOrder, error: orderError } = await supabase
    .from("orders")
    .update({
      delivery_courier_id: courierId ?? null,
      delivery_assigned_at: courierId ? now : null,
      delivery_tracking_updated_at: now
    })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .select("id,delivery_status,delivery_courier_id,delivery_assigned_at")
    .single();

  throwIfSupabaseError(orderError);
  if (!updatedOrder) throw new AppError("Không cập nhật được phân công shipper", 400);

  const assignedCourierStatus = updatedOrder.delivery_status === "out_for_delivery" ? "busy" : "assigned";
  if (courierId) {
    const { error: courierUpdateError } = await supabase
      .from("delivery_couriers")
      .update({ status: assignedCourierStatus })
      .eq("id", courierId)
      .eq("restaurant_id", restaurantId);

    throwIfSupabaseError(courierUpdateError);
  }

  if (order.delivery_courier_id && order.delivery_courier_id !== courierId) {
    await markCourierAvailableIfIdle(restaurantId, order.delivery_courier_id);
  }

  const { error: eventError } = await supabase.from("delivery_tracking_events").insert({
    restaurant_id: restaurantId,
    order_id: orderId,
    courier_id: courierId ?? order.delivery_courier_id,
    event_type: courierId ? "assigned" : "unassigned",
    delivery_status: updatedOrder.delivery_status === "none" ? null : updatedOrder.delivery_status,
    source: "admin_dashboard",
    created_by: actorUserId ?? null,
    created_at: now,
    metadata: {
      actor: actorUserId ? "dashboard_user" : "system",
      previousCourierId: order.delivery_courier_id,
      nextCourierId: courierId ?? null
    } satisfies Json
  });

  throwIfSupabaseError(eventError);
  invalidateRestaurantDashboardCache(restaurantId);

  return {
    orderId,
    deliveryCourierId: updatedOrder.delivery_courier_id,
    deliveryAssignedAt: updatedOrder.delivery_assigned_at,
    deliveryCourier: courier ? mapDeliveryCourier({ ...courier, status: assignedCourierStatus }) : null
  };
}

export async function recordDeliveryStatusTrackingEvent({
  restaurantId,
  orderId,
  deliveryStatus,
  actorUserId
}: {
  restaurantId: string;
  orderId: string;
  deliveryStatus: Exclude<DeliveryStatus, "none" | "requested">;
  actorUserId?: string | null;
}) {
  const order = await getDeliveryOrder(restaurantId, orderId);
  if (order.delivery_status === "delivered" || order.delivery_status === "rejected") {
    throw new AppError("Đơn giao đã kết thúc, không thể gửi thêm vị trí.", 400);
  }

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from("delivery_tracking_events").insert({
    restaurant_id: restaurantId,
    order_id: orderId,
    courier_id: order.delivery_courier_id,
    event_type: "status_changed",
    delivery_status: deliveryStatus,
    source: "admin_dashboard",
    created_by: actorUserId ?? null,
    metadata: {
      actor: actorUserId ? "dashboard_user" : "system"
    } satisfies Json
  });

  throwIfSupabaseError(error);

  if (order.delivery_courier_id) {
    if (deliveryStatus === "delivered" || deliveryStatus === "rejected") {
      await markCourierAvailableIfIdle(restaurantId, order.delivery_courier_id);
      return;
    }

    const courierStatus = deliveryStatus === "out_for_delivery" ? "busy" : "assigned";
    const { error: courierError } = await supabase
      .from("delivery_couriers")
      .update({ status: courierStatus })
      .eq("id", order.delivery_courier_id)
      .eq("restaurant_id", restaurantId);

    throwIfSupabaseError(courierError);
  }
}

export async function recordOrderDeliveryLocation({
  restaurantId,
  orderId,
  input,
  actorUserId
}: {
  restaurantId: string;
  orderId: string;
  input: DeliveryLocationInput;
  actorUserId?: string | null;
}) {
  const order = await getDeliveryOrder(restaurantId, orderId);
  const supabase = createAdminSupabaseClient();
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const source = input.source ?? "admin_dashboard";
  const accuracyMeters = cleanOptionalNumber(input.accuracyMeters);
  const headingDegrees = cleanOptionalNumber(input.headingDegrees);
  const speedMps = cleanOptionalNumber(input.speedMps);

  const { data: location, error: locationError } = await supabase
    .from("courier_locations")
    .insert({
      restaurant_id: restaurantId,
      order_id: orderId,
      courier_id: order.delivery_courier_id,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy_meters: accuracyMeters,
      heading_degrees: headingDegrees,
      speed_mps: speedMps,
      source,
      captured_at: capturedAt,
      metadata: {
        actor: actorUserId ? "dashboard_user" : "system"
      } satisfies Json
    })
    .select("id,captured_at")
    .single();

  throwIfSupabaseError(locationError);

  const { error: eventError } = await supabase.from("delivery_tracking_events").insert({
    restaurant_id: restaurantId,
    order_id: orderId,
    courier_id: order.delivery_courier_id,
    event_type: "location_ping",
    delivery_status: order.delivery_status === "none" ? null : order.delivery_status,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy_meters: accuracyMeters,
    heading_degrees: headingDegrees,
    speed_mps: speedMps,
    source,
    note: input.note?.trim() || null,
    created_by: actorUserId ?? null,
    created_at: capturedAt,
    metadata: {
      courierLocationId: location?.id ?? null
    } satisfies Json
  });

  throwIfSupabaseError(eventError);

  if (order.delivery_courier_id) {
    const nextCourierStatus = order.delivery_status === "out_for_delivery" ? "busy" : "assigned";
    const { error: courierError } = await supabase
      .from("delivery_couriers")
      .update({
        status: nextCourierStatus,
        last_location_at: capturedAt
      })
      .eq("id", order.delivery_courier_id)
      .eq("restaurant_id", restaurantId);

    throwIfSupabaseError(courierError);
  }

  const { error: orderError } = await supabase
    .from("orders")
    .update({ delivery_tracking_updated_at: capturedAt })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId);

  throwIfSupabaseError(orderError);
  invalidateRestaurantDashboardCache(restaurantId);

  return {
    id: location?.id ?? null,
    orderId,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracyMeters,
    headingDegrees,
    speedMps,
    source,
    capturedAt
  };
}
