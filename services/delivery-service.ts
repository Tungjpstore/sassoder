import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"];

export type OrderingSettings = Pick<
  RestaurantRow,
  | "id"
  | "name"
  | "slug"
  | "address"
  | "bank_code"
  | "bank_account"
  | "bank_account_name"
  | "online_ordering_enabled"
  | "pickup_enabled"
  | "delivery_enabled"
  | "store_lat"
  | "store_lng"
  | "delivery_radius_km"
  | "free_delivery_radius_km"
  | "delivery_base_fee"
  | "delivery_fee_per_km"
  | "min_order_for_delivery"
  | "pickup_eta_minutes"
  | "delivery_eta_minutes"
  | "online_payment_mode"
  | "delivery_tracking_enabled"
>;

export type DeliveryQuoteInput = {
  subtotal: number;
  deliveryAddress?: string;
  deliveryLat?: number;
  deliveryLng?: number;
};

export type DeliveryQuote = {
  accepted: boolean;
  reason?: string;
  distanceKm: number | null;
  fee: number;
  etaMinutes: number;
  origin?: Coordinate | null;
  destination?: Coordinate | null;
  routeGeometry?: RouteGeometry | null;
  routeDurationMinutes?: number | null;
  provider: "mapbox-directions" | "mapbox-geocode+haversine" | "browser-location+haversine" | "manual";
};

const orderingSelect =
  "id,name,slug,address,bank_code,bank_account,bank_account_name,online_ordering_enabled,pickup_enabled,delivery_enabled,store_lat,store_lng,delivery_radius_km,free_delivery_radius_km,delivery_base_fee,delivery_fee_per_km,min_order_for_delivery,pickup_eta_minutes,delivery_eta_minutes,online_payment_mode,delivery_tracking_enabled";

type Coordinate = { lat: number; lng: number };
type RouteGeometry = {
  type: "LineString";
  coordinates: number[][];
};

function hasCoordinate(lat?: number | null, lng?: number | null) {
  return typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng);
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineKm(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }) {
  const earthRadiusKm = 6371;
  const latDelta = toRadians(destination.lat - origin.lat);
  const lngDelta = toRadians(destination.lng - origin.lng);
  const originLat = toRadians(origin.lat);
  const destinationLat = toRadians(destination.lat);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(originLat) * Math.cos(destinationLat) * Math.sin(lngDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusKm * c * 100) / 100;
}

function calculateDeliveryFee(settings: OrderingSettings, distanceKm: number) {
  if (distanceKm <= Number(settings.free_delivery_radius_km)) return 0;
  const paidDistance = Math.max(0, distanceKm - Number(settings.free_delivery_radius_km));
  return Number(settings.delivery_base_fee) + Math.ceil(paidDistance) * Number(settings.delivery_fee_per_km);
}

function getMapboxAccessToken() {
  return process.env.MAPBOX_ACCESS_TOKEN?.trim() || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || "";
}

export function isMapboxDeliveryProviderReady() {
  return Boolean(getMapboxAccessToken());
}

async function fetchMapboxJson(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseMapboxCoordinate(value: unknown): Coordinate | null {
  if (!value || typeof value !== "object") return null;
  const root = value as {
    features?: Array<{
      geometry?: { coordinates?: number[] };
      center?: number[];
      properties?: {
        coordinates?: {
          latitude?: number;
          longitude?: number;
        };
      };
    }>;
  };

  const feature = root.features?.[0];
  const lngLat =
    feature?.properties?.coordinates?.longitude !== undefined &&
    feature.properties.coordinates.latitude !== undefined
      ? [feature.properties.coordinates.longitude, feature.properties.coordinates.latitude]
      : feature?.geometry?.coordinates ?? feature?.center;

  const lng = Array.isArray(lngLat) ? Number(lngLat[0]) : undefined;
  const lat = Array.isArray(lngLat) ? Number(lngLat[1]) : undefined;
  if (!hasCoordinate(lat, lng)) return null;
  return { lat: Number(lat), lng: Number(lng) };
}

export async function geocodeAddressWithMapbox(address: string) {
  const accessToken = getMapboxAccessToken();
  if (!accessToken || !address.trim()) return null;

  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", address.trim());
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("country", "vn");
  url.searchParams.set("language", "vi");
  url.searchParams.set("limit", "1");

  return parseMapboxCoordinate(await fetchMapboxJson(url));
}

function parseMapboxRoute(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const root = value as {
    routes?: Array<{
      distance?: number;
      duration?: number;
      geometry?: RouteGeometry;
    }>;
  };
  const route = root.routes?.[0];
  const meters = route?.distance;
  if (typeof meters !== "number" || !Number.isFinite(meters)) return null;

  const geometry =
    route?.geometry?.type === "LineString" && Array.isArray(route.geometry.coordinates)
      ? route.geometry
      : null;

  return {
    distanceKm: Math.round((meters / 1000) * 100) / 100,
    durationMinutes:
      typeof route?.duration === "number" && Number.isFinite(route.duration)
        ? Math.max(1, Math.round(route.duration / 60))
        : null,
    geometry
  };
}

async function distanceWithMapboxDirections(origin: Coordinate, destination: Coordinate) {
  const accessToken = getMapboxAccessToken();
  if (!accessToken) return null;

  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("alternatives", "false");
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("language", "vi");

  return parseMapboxRoute(await fetchMapboxJson(url));
}

export async function getRestaurantOrderingSettings(restaurantId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("restaurants")
    .select(orderingSelect)
    .eq("id", restaurantId)
    .single();

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không tìm thấy quán", 404);
  return data as OrderingSettings;
}

export async function getPublicOrderingSettingsBySlug(slug: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("restaurants")
    .select(orderingSelect)
    .eq("slug", slug)
    .maybeSingle();

  throwIfSupabaseError(error);
  return data as OrderingSettings | null;
}

export async function updateRestaurantOrderingSettings(
  restaurantId: string,
  input: {
    onlineOrderingEnabled?: boolean;
    pickupEnabled?: boolean;
    deliveryEnabled?: boolean;
    storeLat?: number;
    storeLng?: number;
    deliveryRadiusKm: number;
    freeDeliveryRadiusKm: number;
    deliveryBaseFee: number;
    deliveryFeePerKm: number;
    minOrderForDelivery: number;
    pickupEtaMinutes: number;
    deliveryEtaMinutes: number;
    onlinePaymentMode: "PAY_AFTER" | "QR_PREPAID";
    deliveryTrackingEnabled?: boolean;
  }
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("restaurants")
    .update({
      online_ordering_enabled: input.onlineOrderingEnabled ?? false,
      pickup_enabled: input.pickupEnabled ?? false,
      delivery_enabled: input.deliveryEnabled ?? false,
      online_payment_mode: input.onlinePaymentMode,
      delivery_tracking_enabled: input.deliveryTrackingEnabled ?? false,
      store_lat: input.storeLat ?? null,
      store_lng: input.storeLng ?? null,
      delivery_radius_km: input.deliveryRadiusKm,
      free_delivery_radius_km: input.freeDeliveryRadiusKm,
      delivery_base_fee: input.deliveryBaseFee,
      delivery_fee_per_km: input.deliveryFeePerKm,
      min_order_for_delivery: input.minOrderForDelivery,
      pickup_eta_minutes: input.pickupEtaMinutes,
      delivery_eta_minutes: input.deliveryEtaMinutes
    })
    .eq("id", restaurantId)
    .select(orderingSelect)
    .single();

  throwIfSupabaseError(error);
  return data as OrderingSettings;
}

export async function quoteDeliveryForRestaurant(
  settings: OrderingSettings,
  input: DeliveryQuoteInput
): Promise<DeliveryQuote> {
  if (!settings.online_ordering_enabled || !settings.delivery_enabled) {
    return {
      accepted: false,
      reason: "Quán chưa bật nhận đơn giao hàng.",
      distanceKm: null,
      fee: 0,
      etaMinutes: Number(settings.delivery_eta_minutes),
      provider: "manual"
    };
  }

  if (input.subtotal < Number(settings.min_order_for_delivery)) {
    return {
      accepted: false,
      reason: `Đơn giao hàng tối thiểu ${Number(settings.min_order_for_delivery).toLocaleString("vi-VN")}đ.`,
      distanceKm: null,
      fee: 0,
      etaMinutes: Number(settings.delivery_eta_minutes),
      provider: "manual"
    };
  }

  if (!hasCoordinate(settings.store_lat, settings.store_lng)) {
    return {
      accepted: false,
      reason: "Quán chưa cấu hình tọa độ cửa hàng để đo khoảng cách.",
      distanceKm: null,
      fee: 0,
      etaMinutes: Number(settings.delivery_eta_minutes),
      provider: "manual"
    };
  }

  const origin = { lat: Number(settings.store_lat), lng: Number(settings.store_lng) };
  let provider: DeliveryQuote["provider"] = "browser-location+haversine";
  let destination = hasCoordinate(input.deliveryLat, input.deliveryLng)
    ? { lat: Number(input.deliveryLat), lng: Number(input.deliveryLng) }
    : null;

  if (!destination && input.deliveryAddress) {
    destination = await geocodeAddressWithMapbox(input.deliveryAddress);
    if (destination) provider = "mapbox-geocode+haversine";
  }

  if (!destination) {
    return {
      accepted: false,
      reason: isMapboxDeliveryProviderReady()
        ? "Không định vị được địa chỉ này. Vui lòng nhập rõ số nhà, đường, phường/xã, quận/huyện."
        : "Vui lòng cho phép lấy vị trí hoặc cấu hình MAPBOX_ACCESS_TOKEN để định vị địa chỉ tự động.",
      distanceKm: null,
      fee: 0,
      etaMinutes: Number(settings.delivery_eta_minutes),
      provider: "manual"
    };
  }

  const route = await distanceWithMapboxDirections(origin, destination);
  const distanceKm = route?.distanceKm ?? haversineKm(origin, destination);
  if (route) provider = "mapbox-directions";

  if (distanceKm > Number(settings.delivery_radius_km)) {
    return {
      accepted: false,
      reason: `Địa chỉ cách quán khoảng ${distanceKm}km, vượt bán kính nhận đơn ${Number(settings.delivery_radius_km)}km.`,
      distanceKm,
      fee: 0,
      etaMinutes: Number(settings.delivery_eta_minutes),
      origin,
      destination,
      routeGeometry: route?.geometry ?? null,
      routeDurationMinutes: route?.durationMinutes ?? null,
      provider
    };
  }

  return {
    accepted: true,
    distanceKm,
    fee: calculateDeliveryFee(settings, distanceKm),
    etaMinutes: route?.durationMinutes ?? Number(settings.delivery_eta_minutes),
    origin,
    destination,
    routeGeometry: route?.geometry ?? null,
    routeDurationMinutes: route?.durationMinutes ?? null,
    provider
  };
}
