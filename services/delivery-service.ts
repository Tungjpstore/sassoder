import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { readSharedCache, writeSharedCache } from "@/services/maps/cache-service";
import { buildDistanceEstimate, calculateDistance } from "@/services/maps/distance-service";
import { resolveRestaurantAvailability, type RestaurantAvailability } from "@/services/delivery/availability-engine";
import { resolveDeliveryStoreAvailability, type DeliveryStoreAvailabilityMetadata } from "@/services/delivery/branch-availability-engine";
import { evaluateDeliveryZone, type DeliveryExclusionZone, type DeliveryZoneEvaluation, type DeliveryZonePoint } from "@/services/delivery/delivery-zone-service";
import { quoteDeliveryPricing, type DeliveryPricingQuote } from "@/services/delivery/pricing-engine";
import { resolveDeliveryQuoteEtaMinutes } from "@/services/delivery/quote-eta-service";
import { getAcceptedDeliveryQuoteSafetyIssues } from "@/services/delivery/quote-safety-service";
import { listActiveStoreBranches } from "@/services/branch-service";
import { analyzeVietnameseDeliveryAddress, type AddressQualitySnapshot } from "@/services/maps/address-quality-service";
import { findNearestStore } from "@/services/maps/nearby-store-service";
import { resolveDistanceAndEta, searchAddress } from "@/services/maps/provider-service";
import { isPublicTenantActive } from "@/services/tenant-status-guard";
import type { Coordinate, GeocodingProvider, MapRequestContext, NearbyStoreCandidate, ResolvedRouteResult, RouteConfidence, RouteGeometry, RoutingProvider } from "@/services/maps/types";
import type { Database, Json } from "@/types/supabase";

type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"];
type StoreBranchRow = Database["public"]["Tables"]["store_branches"]["Row"];

export type OrderingSettings = Pick<
  RestaurantRow,
  | "id"
  | "name"
  | "slug"
  | "platform_status"
  | "deleted_at"
  | "address"
  | "opening_time"
  | "closing_time"
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
  | "map_provider"
  | "map_geocoding_provider"
  | "map_routing_provider"
  | "map_default_zoom"
  | "map_display_style"
  | "show_store_marker_on_ordering"
  | "show_customer_distance"
  | "delivery_area_mode"
  | "delivery_area_name"
  | "delivery_area_note"
  | "delivery_area_polygon"
  | "delivery_area_ward_count"
  | "delivery_exclusion_zones"
  | "delivery_fee_enabled"
  | "delivery_fee_tiers"
  | "service_fee_enabled"
  | "service_fee_type"
  | "service_fee_percent"
  | "service_fee_min"
  | "service_fee_max"
  | "allow_outside_delivery_area"
  | "show_delivery_eta"
  | "require_outside_area_confirmation"
  | "auto_suggest_nearest_branch"
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
  serviceFee: number;
  etaMinutes: number;
  origin?: Coordinate | null;
  destination?: Coordinate | null;
  nearestStore?: {
    id: string;
    name: string;
    address?: string | null;
    distanceKm: number;
    durationMinutes: number;
    isPrimary?: boolean;
  } | null;
  routeGeometry?: RouteGeometry | null;
  routeDurationMinutes?: number | null;
  provider: "osrm" | "mapbox" | "vietmap" | "goong" | "nominatim" | "browser-location+haversine" | "manual";
  routeProvider?: "osrm" | "mapbox" | "vietmap" | "goong" | "haversine";
  confidence?: RouteConfidence;
  isEstimated?: boolean;
  fallbackChain?: Array<"osrm" | "mapbox" | "vietmap" | "goong" | "haversine">;
  quoteVersion?: string;
  pricingSnapshot?: DeliveryPricingSnapshot;
  deliveryAreaSnapshot?: DeliveryAreaSnapshot;
  addressQualitySnapshot?: AddressQualitySnapshot;
  availabilitySnapshot?: RestaurantAvailability;
};

export type DeliveryPricingSnapshot = {
  pricingVersion: DeliveryPricingQuote["pricingVersion"];
  deliveryFeeEnabled: boolean;
  freeShippingApplied: boolean;
  freeShippingThreshold: number | null;
  freeDeliveryRadiusKm: number;
  deliveryBaseFee: number;
  deliveryFeePerKm: number;
  deliveryRadiusKm: number;
  minOrderForDelivery: number;
  matchedTierLabel?: string;
  multipliers: DeliveryPricingQuote["multipliers"];
  serviceFeeEnabled: boolean;
  serviceFeeType: string;
  serviceFeePercent: number;
  serviceFeeMin: number;
  serviceFeeMax: number | null;
  feeTiers: DeliveryFeeTierSetting[];
};

export type DeliveryAreaSnapshot = {
  mode: string;
  name: string | null;
  allowOutsideDeliveryArea: boolean;
  requireOutsideAreaConfirmation: boolean;
  polygonPoints: number;
  exclusionZoneCount: number;
  status?: DeliveryZoneEvaluation["status"];
  outsideCustomArea?: boolean;
  matchedExclusionName?: string | null;
};

export const DELIVERY_QUOTE_VERSION = "delivery-quote-v2";

const orderingSelect =
  "id,name,slug,platform_status,deleted_at,address,opening_time,closing_time,bank_code,bank_account,bank_account_name,online_ordering_enabled,pickup_enabled,delivery_enabled,store_lat,store_lng,delivery_radius_km,free_delivery_radius_km,delivery_base_fee,delivery_fee_per_km,min_order_for_delivery,pickup_eta_minutes,delivery_eta_minutes,online_payment_mode,delivery_tracking_enabled,map_provider,map_geocoding_provider,map_routing_provider,map_default_zoom,map_display_style,show_store_marker_on_ordering,show_customer_distance,delivery_area_mode,delivery_area_name,delivery_area_note,delivery_area_polygon,delivery_area_ward_count,delivery_exclusion_zones,delivery_fee_enabled,delivery_fee_tiers,service_fee_enabled,service_fee_type,service_fee_percent,service_fee_min,service_fee_max,allow_outside_delivery_area,show_delivery_eta,require_outside_area_confirmation,auto_suggest_nearest_branch";

function hasCoordinate(lat?: number | null, lng?: number | null) {
  return typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng);
}

function deliveryQuoteProviderToAddressQualityProvider(
  provider: DeliveryQuote["provider"]
): GeocodingProvider | "browser-location" | "manual" | null {
  if (provider === "browser-location+haversine") return "browser-location";
  if (provider === "mapbox" || provider === "nominatim" || provider === "vietmap" || provider === "goong") return provider;
  if (provider === "manual") return "manual";
  return null;
}

function getMapboxAccessToken() {
  return process.env.MAPBOX_ACCESS_TOKEN?.trim() || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || "";
}

export function isMapboxDeliveryProviderReady() {
  return Boolean(
    getMapboxAccessToken() ||
      process.env.GOONG_API_KEY?.trim() ||
      process.env.VIETMAP_API_KEY?.trim() ||
      process.env.MAPS_OSRM_URL?.trim() ||
      process.env.MAPS_NOMINATIM_URL?.trim()
  );
}

export async function geocodeAddressWithMapbox(address: string, provider?: GeocodingProvider, context?: MapRequestContext) {
  const result = await searchAddress(address, { limit: 1, provider, context });
  const first = result[0];
  return first ? { lat: first.lat, lng: first.lng, address: first.address, provider: first.provider } : null;
}

type DeliveryAreaPoint = DeliveryZonePoint;

type DeliveryFeeTierSetting = {
  id?: string;
  label?: string;
  upToKm: number | null;
  fee: number | null;
  contact?: boolean;
};

type DeliveryExclusionZoneSetting = DeliveryExclusionZone & {
  id?: string;
  name?: string;
  areaKm2?: number;
  polygon?: DeliveryAreaPoint[];
};

function jsonArray(value: Json | null | undefined) {
  return Array.isArray(value) ? value : [];
}

function normalizePolygon(value: Json | null | undefined): DeliveryAreaPoint[] {
  return jsonArray(value)
    .map((point) => {
      if (!point || typeof point !== "object" || Array.isArray(point)) return null;
      const candidate = point as { lat?: unknown; lng?: unknown };
      const lat = Number(candidate.lat);
      const lng = Number(candidate.lng);
      return hasCoordinate(lat, lng) ? { lat, lng } : null;
    })
    .filter((point): point is DeliveryAreaPoint => Boolean(point));
}

function normalizeFeeTiers(value: Json | null | undefined): DeliveryFeeTierSetting[] {
  return jsonArray(value)
    .map((tier) => {
      if (!tier || typeof tier !== "object" || Array.isArray(tier)) return null;
      const candidate = tier as { id?: unknown; label?: unknown; upToKm?: unknown; fee?: unknown; contact?: unknown };
      const upToKm = candidate.upToKm === null || candidate.upToKm === "" ? null : Number(candidate.upToKm);
      const fee = candidate.fee === null || candidate.fee === "" ? null : Number(candidate.fee);
      const normalized: DeliveryFeeTierSetting = {
        id: typeof candidate.id === "string" ? candidate.id : undefined,
        label: typeof candidate.label === "string" ? candidate.label : undefined,
        upToKm: upToKm === null || Number.isFinite(upToKm) ? upToKm : null,
        fee: fee === null || Number.isFinite(fee) ? fee : null,
        contact: Boolean(candidate.contact)
      };
      if (!normalized.contact && normalized.fee === null) return null;
      return normalized;
    })
    .filter((tier): tier is DeliveryFeeTierSetting => Boolean(tier))
    .sort((a, b) => {
      if (a.upToKm === null && b.upToKm === null) return 0;
      if (a.upToKm === null) return 1;
      if (b.upToKm === null) return -1;
      return a.upToKm - b.upToKm;
    });
}

function normalizeExclusionZones(value: Json | null | undefined): DeliveryExclusionZoneSetting[] {
  return jsonArray(value)
    .map((zone) => {
      if (!zone || typeof zone !== "object" || Array.isArray(zone)) return null;
      const candidate = zone as { id?: unknown; name?: unknown; areaKm2?: unknown; polygon?: unknown };
      const polygon = Array.isArray(candidate.polygon)
        ? normalizePolygon(candidate.polygon as Json)
        : [];
      const normalized: DeliveryExclusionZoneSetting = {
        id: typeof candidate.id === "string" ? candidate.id : undefined,
        name: typeof candidate.name === "string" ? candidate.name : undefined,
        areaKm2: Number.isFinite(Number(candidate.areaKm2)) ? Number(candidate.areaKm2) : 0,
        polygon
      };
      return normalized;
    })
    .filter((zone): zone is DeliveryExclusionZoneSetting => zone !== null);
}

export function calculateServiceFee(settings: OrderingSettings, subtotal: number) {
  if (!settings.service_fee_enabled || settings.service_fee_percent <= 0) return 0;
  const rawFee = Math.round((subtotal * Number(settings.service_fee_percent)) / 100);
  const minimum = Number(settings.service_fee_min) || 0;
  const maximum = settings.service_fee_max === null ? null : Number(settings.service_fee_max);
  const withMinimum = Math.max(rawFee, minimum);
  return maximum === null ? withMinimum : Math.min(withMinimum, maximum);
}

function buildPricingSnapshot(
  settings: OrderingSettings,
  metadata: StoreCandidate["metadata"] | undefined,
  deliveryRadiusKm: number,
  feeTiers: DeliveryFeeTierSetting[],
  pricing?: DeliveryPricingQuote
): DeliveryPricingSnapshot {
  return {
    pricingVersion: pricing?.pricingVersion ?? "delivery-pricing-v1",
    deliveryFeeEnabled: settings.delivery_fee_enabled !== false,
    freeShippingApplied: pricing?.freeShippingApplied ?? false,
    freeShippingThreshold: metadata?.freeShippingThreshold ?? null,
    freeDeliveryRadiusKm: metadata?.freeDeliveryRadiusKm ?? Number(settings.free_delivery_radius_km),
    deliveryBaseFee: metadata?.deliveryBaseFee ?? Number(settings.delivery_base_fee),
    deliveryFeePerKm: metadata?.deliveryFeePerKm ?? Number(settings.delivery_fee_per_km),
    deliveryRadiusKm,
    minOrderForDelivery: Number(settings.min_order_for_delivery),
    matchedTierLabel: pricing?.matchedTierLabel,
    multipliers: pricing?.multipliers ?? { peakHour: 1, weather: 1, effective: 1 },
    serviceFeeEnabled: Boolean(settings.service_fee_enabled),
    serviceFeeType: settings.service_fee_type,
    serviceFeePercent: Number(settings.service_fee_percent),
    serviceFeeMin: Number(settings.service_fee_min),
    serviceFeeMax: settings.service_fee_max === null ? null : Number(settings.service_fee_max),
    feeTiers
  };
}

function buildDeliveryAreaSnapshot(
  settings: OrderingSettings,
  deliveryAreaPolygon: DeliveryAreaPoint[],
  exclusionZones: DeliveryExclusionZoneSetting[],
  evaluation?: DeliveryZoneEvaluation
): DeliveryAreaSnapshot {
  return {
    mode: settings.delivery_area_mode,
    name: settings.delivery_area_name,
    allowOutsideDeliveryArea: Boolean(settings.allow_outside_delivery_area),
    requireOutsideAreaConfirmation: Boolean(settings.require_outside_area_confirmation),
    polygonPoints: deliveryAreaPolygon.length,
    exclusionZoneCount: exclusionZones.length,
    status: evaluation?.status,
    outsideCustomArea: evaluation?.outsideCustomArea,
    matchedExclusionName: evaluation?.matchedExclusionName ?? null
  };
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
  const settings = data as OrderingSettings | null;
  return isPublicTenantActive(settings) ? settings : null;
}

type StoreCandidate = NearbyStoreCandidate<{
  deliveryRadiusKm: number;
  freeDeliveryRadiusKm: number;
  deliveryBaseFee: number;
  deliveryFeePerKm: number;
  freeShippingThreshold?: number | null;
  peakHourMultiplier?: number;
  weatherMultiplier?: number;
  pickupEtaMinutes: number;
  deliveryEtaMinutes: number;
  branchId?: string;
  source?: "primary" | "branch";
  approxDistanceKm?: number;
} & DeliveryStoreAvailabilityMetadata>;

type SpatialStoreCandidateRow = {
  id: string;
  restaurant_id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  is_primary: boolean;
  source: "primary" | "branch";
  delivery_radius_km: number;
  free_delivery_radius_km: number;
  delivery_base_fee: number;
  delivery_fee_per_km: number;
  pickup_eta_minutes: number;
  delivery_eta_minutes: number;
  metadata: Json;
  approx_distance_km: number;
};

function restaurantToStoreCandidate(settings: OrderingSettings): StoreCandidate | null {
  if (!hasCoordinate(settings.store_lat, settings.store_lng)) return null;
  return buildPrimaryStoreCandidate(settings, {
    lat: Number(settings.store_lat),
    lng: Number(settings.store_lng)
  });
}

function buildPrimaryStoreCandidate(settings: OrderingSettings, origin: Coordinate, address = settings.address): StoreCandidate {
  return {
    id: settings.id,
    name: settings.name,
    address,
    lat: origin.lat,
    lng: origin.lng,
    isPrimary: true,
    metadata: {
      deliveryRadiusKm: Number(settings.delivery_radius_km),
      freeDeliveryRadiusKm: Number(settings.free_delivery_radius_km),
      deliveryBaseFee: Number(settings.delivery_base_fee),
      deliveryFeePerKm: Number(settings.delivery_fee_per_km),
      pickupEtaMinutes: Number(settings.pickup_eta_minutes),
      deliveryEtaMinutes: Number(settings.delivery_eta_minutes),
      openingTime: settings.opening_time,
      closingTime: settings.closing_time
    }
  };
}

async function backfillRestaurantStoreCoordinate(restaurantId: string, origin: Coordinate) {
  try {
    await createAdminSupabaseClient()
      .from("restaurants")
      .update({
        store_lat: origin.lat,
        store_lng: origin.lng
      })
      .eq("id", restaurantId);
  } catch {
    // Quote UX must not fail because a best-effort coordinate repair could not be persisted.
  }
}

function shouldAttemptStoreCoordinateRepair(settings: OrderingSettings, origin: Coordinate, destination?: Coordinate | null) {
  if (!destination || !settings.address?.trim()) return false;
  const distanceKm = calculateDistance(origin, destination);
  const configuredTrigger = Number(process.env.MAPS_STORE_COORDINATE_REPAIR_TRIGGER_KM ?? "");
  const triggerKm = Number.isFinite(configuredTrigger) && configuredTrigger > 0
    ? configuredTrigger
    : Math.max(30, Math.min(120, Number(settings.delivery_radius_km) * 6 || 50));
  return distanceKm >= triggerKm;
}

async function repairConfiguredOriginIfNeeded(
  settings: OrderingSettings,
  configuredOrigin: StoreCandidate,
  destination?: Coordinate | null,
  context?: MapRequestContext
) {
  if (!shouldAttemptStoreCoordinateRepair(settings, configuredOrigin, destination)) return configuredOrigin;

  const geocodedOrigin = await geocodeAddressWithMapbox(
    settings.address ?? "",
    settings.map_geocoding_provider as GeocodingProvider,
    context
  );
  if (!geocodedOrigin || !destination) return configuredOrigin;

  const configuredDistanceKm = calculateDistance(configuredOrigin, destination);
  const repairedDistanceKm = calculateDistance(geocodedOrigin, destination);
  const originDriftKm = calculateDistance(configuredOrigin, geocodedOrigin);
  const materiallyBetter = configuredDistanceKm - repairedDistanceKm >= 20 || repairedDistanceKm <= configuredDistanceKm * 0.5;

  if (originDriftKm < 5 || !materiallyBetter) return configuredOrigin;

  const repairedOrigin = buildPrimaryStoreCandidate(
    settings,
    { lat: geocodedOrigin.lat, lng: geocodedOrigin.lng },
    geocodedOrigin.address || settings.address
  );

  void backfillRestaurantStoreCoordinate(settings.id, { lat: repairedOrigin.lat, lng: repairedOrigin.lng });
  return repairedOrigin;
}

async function resolveRestaurantOriginCandidate(settings: OrderingSettings, context?: MapRequestContext, destination?: Coordinate | null) {
  const configuredOrigin = restaurantToStoreCandidate(settings);
  if (configuredOrigin) return repairConfiguredOriginIfNeeded(settings, configuredOrigin, destination, context);
  if (!settings.address?.trim()) return null;

  const geocodedOrigin = await geocodeAddressWithMapbox(
    settings.address,
    settings.map_geocoding_provider as GeocodingProvider,
    context
  );
  if (!geocodedOrigin) return null;

  const origin = buildPrimaryStoreCandidate(settings, geocodedOrigin, geocodedOrigin.address || settings.address);

  void backfillRestaurantStoreCoordinate(settings.id, { lat: origin.lat, lng: origin.lng });
  return origin;
}

function mergeFallbackOriginCandidate(candidates: StoreCandidate[], fallbackOrigin: StoreCandidate | null) {
  if (!fallbackOrigin) return candidates;
  const hasSameCandidate = candidates.some(
    (candidate) =>
      candidate.id === fallbackOrigin.id ||
      (Math.abs(candidate.lat - fallbackOrigin.lat) < 0.00001 && Math.abs(candidate.lng - fallbackOrigin.lng) < 0.00001)
  );
  return hasSameCandidate ? candidates : [...candidates, fallbackOrigin];
}

function jsonObject(value: Json | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Json | undefined> : {};
}

function stringMetadata(value: Json | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberMetadata(value: Json | undefined) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function availabilityMetadata(value: Json | null | undefined): DeliveryStoreAvailabilityMetadata {
  const metadata = jsonObject(value);
  return {
    acceptingDelivery: typeof metadata.acceptingDelivery === "boolean" ? metadata.acceptingDelivery : undefined,
    deliveryPaused: metadata.deliveryPaused === true,
    temporarilyClosed: metadata.temporarilyClosed === true,
    openingTime: stringMetadata(metadata.openingTime),
    closingTime: stringMetadata(metadata.closingTime),
    availabilityNote: stringMetadata(metadata.availabilityNote)
  };
}

function branchAvailabilityMetadata(branch: StoreBranchRow): DeliveryStoreAvailabilityMetadata {
  const metadata = availabilityMetadata(branch.metadata);
  return {
    ...metadata,
    acceptingDelivery: branch.accepting_delivery,
    deliveryPaused: branch.delivery_paused,
    temporarilyClosed: branch.temporarily_closed,
    openingTime: branch.delivery_opening_time ?? metadata.openingTime,
    closingTime: branch.delivery_closing_time ?? metadata.closingTime,
    availabilityNote: branch.delivery_availability_note ?? metadata.availabilityNote
  };
}

function pricingMetadata(value: Json | null | undefined) {
  const metadata = jsonObject(value);
  return {
    freeShippingThreshold: numberMetadata(metadata.freeShippingThreshold) ?? null,
    peakHourMultiplier: numberMetadata(metadata.peakHourMultiplier),
    weatherMultiplier: numberMetadata(metadata.weatherMultiplier)
  };
}

function coordinateNumber(value: number | null | undefined) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function branchToStoreCandidate(branch: StoreBranchRow): StoreCandidate | null {
  const lat = coordinateNumber(branch.latitude);
  const lng = coordinateNumber(branch.longitude);
  if (lat === null || lng === null) return null;

  return {
    id: branch.id,
    name: branch.name,
    address: branch.address,
    lat,
    lng,
    isPrimary: branch.is_primary,
    metadata: {
      deliveryRadiusKm: Number(branch.delivery_radius_km),
      freeDeliveryRadiusKm: Number(branch.free_delivery_radius_km),
      deliveryBaseFee: Number(branch.delivery_base_fee),
      deliveryFeePerKm: Number(branch.delivery_fee_per_km),
      pickupEtaMinutes: Number(branch.pickup_eta_minutes),
      deliveryEtaMinutes: Number(branch.delivery_eta_minutes),
      branchId: branch.id,
      ...pricingMetadata(branch.metadata),
      ...branchAvailabilityMetadata(branch)
    }
  };
}

function spatialRowToStoreCandidate(row: SpatialStoreCandidateRow): StoreCandidate {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    lat: Number(row.latitude),
    lng: Number(row.longitude),
    isPrimary: row.is_primary,
    metadata: {
      deliveryRadiusKm: Number(row.delivery_radius_km),
      freeDeliveryRadiusKm: Number(row.free_delivery_radius_km),
      deliveryBaseFee: Number(row.delivery_base_fee),
      deliveryFeePerKm: Number(row.delivery_fee_per_km),
      pickupEtaMinutes: Number(row.pickup_eta_minutes),
      deliveryEtaMinutes: Number(row.delivery_eta_minutes),
      branchId: row.source === "branch" ? row.id : undefined,
      source: row.source,
      approxDistanceKm: Number(row.approx_distance_km),
      ...pricingMetadata(row.metadata),
      ...availabilityMetadata(row.metadata)
    }
  };
}

function spatialLookupEnabled() {
  return process.env.DELIVERY_SPATIAL_LOOKUP_ENABLED !== "false";
}

function spatialLookupCacheTtlMs() {
  const value = Number(process.env.DELIVERY_SPATIAL_CACHE_TTL_MS ?? 30_000);
  return Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 0), 300_000) : 30_000;
}

function getSpatialPrefilterLimit() {
  const value = Number(process.env.DELIVERY_SPATIAL_PREFILTER_LIMIT ?? 6);
  return Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 1), 20) : 6;
}

function getSpatialPrefilterRadiusKm() {
  const value = Number(process.env.DELIVERY_SPATIAL_PREFILTER_RADIUS_KM ?? 50);
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 200) : 50;
}

function roundCoordinateForCache(value: number) {
  return Number(value.toFixed(4));
}

async function getSpatialStoreCandidates(
  restaurantSlug: string,
  destination: Coordinate,
  options?: { limit?: number; maxRadiusKm?: number }
) {
  if (!spatialLookupEnabled()) return null;

  const limit = options?.limit ?? getSpatialPrefilterLimit();
  const maxRadiusKm = options?.maxRadiusKm ?? getSpatialPrefilterRadiusKm();
  const cacheKey = JSON.stringify({
    restaurantSlug,
    lat: roundCoordinateForCache(destination.lat),
    lng: roundCoordinateForCache(destination.lng),
    limit,
    maxRadiusKm
  });
  const cached = await readSharedCache<StoreCandidate[]>("delivery_spatial_candidates", cacheKey);
  if (cached.hit) return cached.value;

  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase.rpc("find_nearest_delivery_stores", {
      p_restaurant_slug: restaurantSlug,
      p_lat: destination.lat,
      p_lng: destination.lng,
      p_limit: limit,
      p_max_radius_km: maxRadiusKm
    });

    throwIfSupabaseError(error);
    const candidates = ((data ?? []) as SpatialStoreCandidateRow[]).map(spatialRowToStoreCandidate);
    await writeSharedCache("delivery_spatial_candidates", cacheKey, candidates, spatialLookupCacheTtlMs());
    return candidates;
  } catch {
    return null;
  }
}

export async function getPublicRestaurantStoreCandidates(restaurantSlug: string) {
  const settings = await getPublicOrderingSettingsBySlug(restaurantSlug);
  if (!settings) return [];

  const branches = await listActiveStoreBranches(settings.id);
  const candidates = branches
    .map((branch) => branchToStoreCandidate(branch as StoreBranchRow))
    .filter((candidate): candidate is StoreCandidate => Boolean(candidate));
  if (candidates.length > 0) return candidates;

  const primary = restaurantToStoreCandidate(settings);
  if (primary) candidates.unshift(primary);
  return candidates;
}

export async function getPublicRestaurantStoreCandidatesNear(
  restaurantSlug: string,
  destination: Coordinate,
  options?: { limit?: number; maxRadiusKm?: number }
) {
  const spatialCandidates = await getSpatialStoreCandidates(restaurantSlug, destination, options);
  if (spatialCandidates !== null) return spatialCandidates;

  const fallbackCandidates = await getPublicRestaurantStoreCandidates(restaurantSlug);
  return rankStoresByApproxDistance(destination, fallbackCandidates)
    .slice(0, options?.limit ?? getSpatialPrefilterLimit())
    .map((candidate) => candidate.store);
}

export function resolveNearestStoreForRestaurant(origin: Coordinate, stores: StoreCandidate[]) {
  const nearest = findNearestStore(origin, stores);
  if (!nearest) return null;
  return {
    id: nearest.store.id,
    name: nearest.store.name,
    address: nearest.store.address ?? null,
    distanceKm: nearest.distanceKm,
    durationMinutes: nearest.durationMinutes,
    isPrimary: nearest.store.isPrimary ?? false,
    metadata: nearest.store.metadata
  };
}

export async function resolveNearestStoreForRestaurantSlug(restaurantSlug: string, origin: Coordinate) {
  const settings = await getPublicOrderingSettingsBySlug(restaurantSlug);
  if (!settings) return null;

  const stores = await getPublicRestaurantStoreCandidatesNear(restaurantSlug, origin, {
    limit: getSpatialPrefilterLimit(),
    maxRadiusKm: getSpatialPrefilterRadiusKm()
  });
  const availableStores = availableStoreCandidates(stores);
  if (availableStores.length === 0) return null;

  const ranked = rankStoresByApproxDistance(origin, availableStores);
  const primaryOrigin = ranked[0]?.store ?? restaurantToStoreCandidate(settings);
  if (!primaryOrigin) return null;

  const routedStore = await resolveBestStoreRoute(origin, availableStores, {
    autoSuggestNearestBranch: true,
    primaryOrigin,
    routingProvider: settings.map_routing_provider as RoutingProvider,
    context: {
      restaurantId: settings.id,
      restaurantSlug: settings.slug,
      source: "public_map_api"
    }
  });

  if (!routedStore.nearestStore) return resolveNearestStoreForRestaurant(origin, stores);
  return {
    ...routedStore.nearestStore,
    routeProvider: routedStore.route.provider,
    confidence: routedStore.route.confidence,
    isEstimated: routedStore.route.isEstimated,
    fallbackChain: routedStore.route.fallbackChain
  };
}

function getBranchRouteTopN() {
  const value = Number(process.env.DELIVERY_BRANCH_ROUTE_TOP_N ?? 2);
  return Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 1), 4) : 2;
}

function rankStoresByApproxDistance(destination: Coordinate, stores: StoreCandidate[]) {
  return stores
    .map((store) => ({
      store,
      estimate: buildDistanceEstimate({ lat: store.lat, lng: store.lng }, destination)
    }))
    .sort((a, b) => {
      if (a.estimate.distanceKm !== b.estimate.distanceKm) return a.estimate.distanceKm - b.estimate.distanceKm;
      if (a.store.isPrimary && !b.store.isPrimary) return -1;
      if (!a.store.isPrimary && b.store.isPrimary) return 1;
      return 0;
    });
}

function availableStoreCandidates(stores: StoreCandidate[]) {
  return stores.filter((store) => resolveDeliveryStoreAvailability(store.name, store.metadata).isAvailable);
}

function shouldRouteOnlyClosestBranch(ranked: ReturnType<typeof rankStoresByApproxDistance>) {
  const closest = ranked[0];
  const second = ranked[1];
  if (!closest || !second) return true;
  return second.estimate.distanceKm - closest.estimate.distanceKm >= 1.5 || second.estimate.distanceKm >= closest.estimate.distanceKm * 1.45;
}

async function resolveBestStoreRoute(
  destination: Coordinate,
  stores: StoreCandidate[],
  options: {
    autoSuggestNearestBranch: boolean;
    primaryOrigin: StoreCandidate;
    routingProvider: RoutingProvider;
    context?: MapRequestContext;
  }
) {
  const fallbackEstimate = buildDistanceEstimate(
    { lat: options.primaryOrigin.lat, lng: options.primaryOrigin.lng },
    destination
  );
  const ranked = options.autoSuggestNearestBranch
    ? rankStoresByApproxDistance(destination, stores)
    : [{ store: options.primaryOrigin, estimate: fallbackEstimate }];
  const safeRanked = ranked.length > 0 ? ranked : [{ store: options.primaryOrigin, estimate: fallbackEstimate }];
  const candidates = shouldRouteOnlyClosestBranch(safeRanked) ? safeRanked.slice(0, 1) : safeRanked.slice(0, getBranchRouteTopN());

  const routeCandidates = await Promise.all(
    candidates.map(async (candidate) => {
      const origin = { lat: candidate.store.lat, lng: candidate.store.lng };
      const route = await resolveDistanceAndEta(origin, destination, { provider: options.routingProvider, context: options.context });
      return {
        ...candidate,
        origin,
        route
      };
    })
  );

  const best = routeCandidates.sort((a, b) => {
    if (a.route.distanceKm !== b.route.distanceKm) return a.route.distanceKm - b.route.distanceKm;
    return (a.route.durationMinutes ?? a.estimate.durationMinutes) - (b.route.durationMinutes ?? b.estimate.durationMinutes);
  })[0];

  const nearestStore = best
    ? {
        id: best.store.id,
        name: best.store.name,
        address: best.store.address ?? null,
        distanceKm: best.route.distanceKm,
        durationMinutes: best.route.durationMinutes ?? best.estimate.durationMinutes,
        isPrimary: best.store.isPrimary ?? false,
        metadata: best.store.metadata
      }
    : null;

  return {
    activeStore: best?.store ?? options.primaryOrigin,
    origin: best?.origin ?? { lat: options.primaryOrigin.lat, lng: options.primaryOrigin.lng },
    route: best?.route ?? ({
      provider: "haversine",
      distanceKm: safeRanked[0]?.estimate.distanceKm ?? fallbackEstimate.distanceKm,
      durationMinutes: safeRanked[0]?.estimate.durationMinutes ?? Number(options.primaryOrigin.metadata?.deliveryEtaMinutes ?? 30),
      geometry: null,
      confidence: "low",
      isEstimated: true,
      fallbackChain: ["haversine"]
    } satisfies ResolvedRouteResult),
    nearestStore
  };
}

export async function updateRestaurantOrderingSettings(
  restaurantId: string,
  input: {
    address?: string;
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
    mapGeocodingProvider: "nominatim" | "mapbox" | "vietmap" | "goong";
    mapRoutingProvider: "osrm" | "mapbox" | "vietmap" | "goong";
    mapDefaultZoom: number;
    mapDisplayStyle: "LIGHT" | "DARK";
    showStoreMarkerOnOrdering?: boolean;
    showCustomerDistance?: boolean;
    deliveryAreaMode: "RADIUS" | "CUSTOM";
    deliveryAreaName?: string;
    deliveryAreaNote?: string;
    deliveryAreaPolygon: Array<{ lat: number; lng: number }>;
    deliveryAreaWardCount: number;
    deliveryExclusionZones: Array<{ id?: string; name: string; areaKm2?: number; polygon?: Array<{ lat: number; lng: number }> }>;
    deliveryFeeEnabled?: boolean;
    deliveryFeeTiers: Array<{ id?: string; label?: string; upToKm: number | null; fee: number | null; contact?: boolean }>;
    serviceFeeEnabled?: boolean;
    serviceFeeType: "ORDER_PERCENT";
    serviceFeePercent: number;
    serviceFeeMin: number;
    serviceFeeMax?: number;
    allowOutsideDeliveryArea?: boolean;
    showDeliveryEta?: boolean;
    requireOutsideAreaConfirmation?: boolean;
    autoSuggestNearestBranch?: boolean;
  }
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("restaurants")
    .update({
      address: input.address?.trim() || null,
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
      delivery_eta_minutes: input.deliveryEtaMinutes,
      map_provider: input.mapGeocodingProvider === "mapbox" || input.mapRoutingProvider === "mapbox" ? "mapbox" : "maplibre",
      map_geocoding_provider: input.mapGeocodingProvider,
      map_routing_provider: input.mapRoutingProvider,
      map_default_zoom: input.mapDefaultZoom,
      map_display_style: input.mapDisplayStyle,
      show_store_marker_on_ordering: input.showStoreMarkerOnOrdering ?? false,
      show_customer_distance: input.showCustomerDistance ?? false,
      delivery_area_mode: input.deliveryAreaMode,
      delivery_area_name: input.deliveryAreaName?.trim() || null,
      delivery_area_note: input.deliveryAreaNote?.trim() || null,
      delivery_area_polygon: input.deliveryAreaPolygon as Json,
      delivery_area_ward_count: input.deliveryAreaWardCount,
      delivery_exclusion_zones: input.deliveryExclusionZones as Json,
      delivery_fee_enabled: input.deliveryFeeEnabled ?? false,
      delivery_fee_tiers: input.deliveryFeeTiers as Json,
      service_fee_enabled: input.serviceFeeEnabled ?? false,
      service_fee_type: input.serviceFeeType,
      service_fee_percent: input.serviceFeePercent,
      service_fee_min: input.serviceFeeMin,
      service_fee_max: input.serviceFeeMax ?? null,
      allow_outside_delivery_area: input.allowOutsideDeliveryArea ?? false,
      show_delivery_eta: input.showDeliveryEta ?? false,
      require_outside_area_confirmation: input.requireOutsideAreaConfirmation ?? false,
      auto_suggest_nearest_branch: input.autoSuggestNearestBranch ?? false
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
  const serviceFee = calculateServiceFee(settings, input.subtotal);

  if (!settings.online_ordering_enabled || !settings.delivery_enabled) {
    return {
      accepted: false,
      reason: "Quán chưa bật nhận đơn giao hàng.",
      distanceKm: null,
      fee: 0,
      serviceFee: 0,
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
      serviceFee: 0,
      etaMinutes: Number(settings.delivery_eta_minutes),
      provider: "manual"
    };
  }

  const availability = resolveRestaurantAvailability({
    openingTime: settings.opening_time,
    closingTime: settings.closing_time
  });
  if (!availability.isOpen) {
    return {
      accepted: false,
      reason: availability.reason ?? "Quán đang ngoài giờ nhận đơn giao hàng.",
      distanceKm: null,
      fee: 0,
      serviceFee: 0,
      etaMinutes: Number(settings.delivery_eta_minutes),
      provider: "manual",
      availabilitySnapshot: availability
    };
  }

  let provider: DeliveryQuote["provider"] = "browser-location+haversine";
  let destination = hasCoordinate(input.deliveryLat, input.deliveryLng)
    ? { lat: Number(input.deliveryLat), lng: Number(input.deliveryLng) }
    : null;
  let qualityAddress = input.deliveryAddress?.trim() || null;
  const mapContext: MapRequestContext = {
    restaurantId: settings.id,
    restaurantSlug: settings.slug,
    source: "delivery_quote"
  };

  if (!destination && input.deliveryAddress) {
    const geocodedDestination = await geocodeAddressWithMapbox(input.deliveryAddress, settings.map_geocoding_provider as GeocodingProvider, mapContext);
    if (geocodedDestination) {
      destination = geocodedDestination;
      provider = geocodedDestination.provider;
      qualityAddress = geocodedDestination.address || qualityAddress;
    }
  }

  if (!destination) {
    const addressQualitySnapshot = analyzeVietnameseDeliveryAddress({
      address: qualityAddress,
      coordinate: null,
      provider: "manual"
    });
    return {
      accepted: false,
      reason: isMapboxDeliveryProviderReady()
        ? "Không định vị được địa chỉ này. Vui lòng nhập rõ số nhà, đường, phường/xã, quận/huyện."
        : "Vui lòng cho phép lấy vị trí hoặc cấu hình provider geocoding để định vị địa chỉ tự động.",
      distanceKm: null,
      fee: 0,
      serviceFee: 0,
      etaMinutes: Number(settings.delivery_eta_minutes),
      provider: "manual",
      addressQualitySnapshot
    };
  }

  const fallbackOrigin = await resolveRestaurantOriginCandidate(settings, mapContext, destination);

  const storeCandidates = await getPublicRestaurantStoreCandidatesNear(settings.slug, destination, {
    limit: getSpatialPrefilterLimit(),
    maxRadiusKm: getSpatialPrefilterRadiusKm()
  });
  const routingCandidates = mergeFallbackOriginCandidate(storeCandidates, fallbackOrigin);
  const availableRoutingCandidates = availableStoreCandidates(routingCandidates);

  if (routingCandidates.length === 0 && !fallbackOrigin) {
    return {
      accepted: false,
      reason: "Quán chưa cấu hình tọa độ cửa hàng để đo khoảng cách.",
      distanceKm: null,
      fee: 0,
      serviceFee: 0,
      etaMinutes: Number(settings.delivery_eta_minutes),
      provider: "manual"
    };
  }

  if (availableRoutingCandidates.length === 0) {
    return {
      accepted: false,
      reason: "Hiện chưa có chi nhánh nào sẵn sàng giao hàng.",
      distanceKm: null,
      fee: 0,
      serviceFee: 0,
      etaMinutes: Number(settings.delivery_eta_minutes),
      provider: "manual"
    };
  }

  const primaryOrigin = availableRoutingCandidates.find((candidate) => candidate.id === fallbackOrigin?.id) ?? availableRoutingCandidates[0] ?? null;
  if (!primaryOrigin) {
    return {
      accepted: false,
      reason: "Quán chưa có điểm bán nào sẵn sàng giao hàng.",
      distanceKm: null,
      fee: 0,
      serviceFee: 0,
      etaMinutes: Number(settings.delivery_eta_minutes),
      provider: "manual"
    };
  }

  const routedStore = await resolveBestStoreRoute(destination, availableRoutingCandidates, {
    autoSuggestNearestBranch: Boolean(settings.auto_suggest_nearest_branch),
    primaryOrigin,
    routingProvider: settings.map_routing_provider as RoutingProvider,
    context: mapContext
  });
  const nearestStore = settings.auto_suggest_nearest_branch ? routedStore.nearestStore : null;
  const activeStore = routedStore.activeStore;
  const origin = routedStore.origin;
  const activeMetadata = activeStore.metadata;
  const route = routedStore.route;
  const distanceKm = route.distanceKm;
  if (route.provider !== "haversine") provider = route.provider;
  const addressQualitySnapshot = analyzeVietnameseDeliveryAddress({
    address: qualityAddress,
    coordinate: destination,
    provider: deliveryQuoteProviderToAddressQualityProvider(provider),
    routeConfidence: route.confidence
  });

  const deliveryRadiusKm = activeMetadata?.deliveryRadiusKm ?? Number(settings.delivery_radius_km);
  const deliveryEtaMinutes = activeMetadata?.deliveryEtaMinutes ?? Number(settings.delivery_eta_minutes);
  const deliveryAreaPolygon = normalizePolygon(settings.delivery_area_polygon);
  const exclusionZones = normalizeExclusionZones(settings.delivery_exclusion_zones);
  const feeTiers = normalizeFeeTiers(settings.delivery_fee_tiers);
  let pricingSnapshot = buildPricingSnapshot(settings, activeMetadata, deliveryRadiusKm, feeTiers);
  const deliveryZoneEvaluation = evaluateDeliveryZone({
    destination,
    mode: settings.delivery_area_mode,
    polygon: deliveryAreaPolygon,
    exclusionZones,
    allowOutsideDeliveryArea: Boolean(settings.allow_outside_delivery_area),
    requireOutsideAreaConfirmation: Boolean(settings.require_outside_area_confirmation)
  });
  const deliveryAreaSnapshot = buildDeliveryAreaSnapshot(settings, deliveryAreaPolygon, exclusionZones, deliveryZoneEvaluation);
  const routeQuoteContext = {
    routeProvider: route.provider,
    confidence: route.confidence,
    isEstimated: route.isEstimated,
    fallbackChain: route.fallbackChain,
    quoteVersion: DELIVERY_QUOTE_VERSION,
    pricingSnapshot,
    deliveryAreaSnapshot,
    addressQualitySnapshot
  };

  if (!deliveryZoneEvaluation.accepted) {
    return {
      accepted: false,
      reason: deliveryZoneEvaluation.reason ?? "Địa chỉ này chưa nằm trong vùng giao hàng của quán.",
      distanceKm,
      fee: 0,
      serviceFee: 0,
      etaMinutes: deliveryEtaMinutes,
      origin,
      destination,
      nearestStore,
      routeGeometry: route.geometry ?? null,
      routeDurationMinutes: route.durationMinutes ?? null,
      ...routeQuoteContext,
      provider
    };
  }

  if (distanceKm > deliveryRadiusKm) {
    return {
      accepted: false,
      reason: `Địa chỉ cách điểm bán gần nhất khoảng ${distanceKm}km, vượt bán kính nhận đơn ${deliveryRadiusKm}km.`,
      distanceKm,
      fee: 0,
      serviceFee: 0,
      etaMinutes: deliveryEtaMinutes,
      origin,
      destination,
      nearestStore,
      routeGeometry: route.geometry ?? null,
      routeDurationMinutes: route.durationMinutes ?? null,
      ...routeQuoteContext,
      provider
    };
  }

  const deliveryPricing = quoteDeliveryPricing({
    distanceKm,
    subtotal: input.subtotal,
    deliveryFeeEnabled: settings.delivery_fee_enabled !== false,
    freeRadiusKm: activeMetadata?.freeDeliveryRadiusKm ?? Number(settings.free_delivery_radius_km),
    baseFee: activeMetadata?.deliveryBaseFee ?? Number(settings.delivery_base_fee),
    feePerKm: activeMetadata?.deliveryFeePerKm ?? Number(settings.delivery_fee_per_km),
    freeShippingThreshold: activeMetadata?.freeShippingThreshold,
    peakHourMultiplier: activeMetadata?.peakHourMultiplier,
    weatherMultiplier: activeMetadata?.weatherMultiplier,
    customThresholdKm: 5,
    tiers: feeTiers
  });
  pricingSnapshot = buildPricingSnapshot(settings, activeMetadata, deliveryRadiusKm, feeTiers, deliveryPricing);
  routeQuoteContext.pricingSnapshot = pricingSnapshot;

  if (deliveryPricing.requiresContact) {
    return {
      accepted: false,
      reason: "Khoảng cách này cần quán xác nhận phí giao hàng trước khi nhận đơn.",
      distanceKm,
      fee: 0,
      serviceFee: 0,
      etaMinutes: deliveryEtaMinutes,
      origin,
      destination,
      nearestStore,
      routeGeometry: route.geometry ?? null,
      routeDurationMinutes: route.durationMinutes ?? null,
      ...routeQuoteContext,
      provider
    };
  }
  const deliveryFee = deliveryPricing.fee;

  const acceptedQuote = {
    accepted: true,
    distanceKm,
    fee: deliveryFee,
    serviceFee,
    etaMinutes: resolveDeliveryQuoteEtaMinutes({
      showRouteEta: Boolean(settings.show_delivery_eta),
      routeDurationMinutes: route.durationMinutes,
      configuredEtaMinutes: deliveryEtaMinutes
    }),
    origin,
    destination,
    nearestStore,
    routeGeometry: route.geometry ?? null,
    routeDurationMinutes: route.durationMinutes ?? null,
    ...routeQuoteContext,
    provider
  } satisfies DeliveryQuote;

  const safetyIssues = getAcceptedDeliveryQuoteSafetyIssues(acceptedQuote);
  if (safetyIssues.length > 0) {
    return {
      ...acceptedQuote,
      accepted: false,
      reason: "Không xác minh được phí giao hàng/ETA an toàn. Vui lòng thử lại hoặc liên hệ quán.",
      fee: 0,
      serviceFee: 0,
      etaMinutes: deliveryEtaMinutes
    };
  }

  return acceptedQuote;
}

export function buildDeliveryQuoteSnapshot(settings: OrderingSettings, quote: DeliveryQuote): Json {
  return {
    quoteVersion: quote.quoteVersion ?? DELIVERY_QUOTE_VERSION,
    restaurantId: settings.id,
    restaurantSlug: settings.slug,
    accepted: quote.accepted,
    reason: quote.reason ?? null,
    provider: quote.provider,
    routeProvider: quote.routeProvider ?? null,
    confidence: quote.confidence ?? "low",
    isEstimated: quote.isEstimated ?? quote.provider === "browser-location+haversine",
    fallbackChain: quote.fallbackChain ?? [],
    distanceKm: quote.distanceKm,
    etaMinutes: quote.etaMinutes,
    routeDurationMinutes: quote.routeDurationMinutes ?? null,
    origin: quote.origin ?? null,
    destination: quote.destination ?? null,
    nearestStore: quote.nearestStore ?? null,
    pricing: {
      deliveryFee: quote.fee,
      serviceFee: quote.serviceFee,
      snapshot: quote.pricingSnapshot ?? null
    },
    deliveryArea: quote.deliveryAreaSnapshot ?? null,
    addressQuality: quote.addressQualitySnapshot ?? null,
    availability: quote.availabilitySnapshot ?? null,
    generatedAt: new Date().toISOString()
  } as Json;
}
