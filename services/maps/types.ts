export type MapProvider = "nominatim" | "mapbox" | "vietmap" | "goong" | "osrm" | "haversine";
export type GeocodingProvider = Extract<MapProvider, "nominatim" | "mapbox" | "vietmap" | "goong">;
export type RoutingProvider = Extract<MapProvider, "mapbox" | "vietmap" | "goong" | "osrm">;
export type RouteConfidence = "high" | "medium" | "low";

export type MapRequestContext = {
  restaurantId?: string | null;
  restaurantSlug?: string | null;
  source?: "public_map_api" | "delivery_quote" | "admin_geocode" | "background";
};

export type Coordinate = {
  lat: number;
  lng: number;
};

export type GeocodingResult = Coordinate & {
  id: string;
  label: string;
  shortLabel: string;
  address: string;
  provider: GeocodingProvider;
  countryCode?: string | null;
};

export type AddressAutocompletePrediction = Partial<Coordinate> & {
  id: string;
  placeId?: string | null;
  reference?: string | null;
  label: string;
  shortLabel: string;
  secondaryLabel?: string | null;
  address: string;
  provider: GeocodingProvider;
  source: "places" | "geocode";
  countryCode?: string | null;
  hasChildren?: boolean;
  score?: number | null;
};

export type RouteGeometry = {
  type: "LineString";
  coordinates: number[][];
};

export type RouteResult = {
  distanceKm: number;
  durationMinutes: number | null;
  geometry: RouteGeometry | null;
  provider: RoutingProvider;
  confidence: Exclude<RouteConfidence, "low">;
  isEstimated: false;
  fallbackChain: RoutingProvider[];
};

export type ResolvedRouteResult = Omit<RouteResult, "provider" | "confidence" | "isEstimated" | "fallbackChain"> & {
  provider: RoutingProvider | "haversine";
  confidence: RouteConfidence;
  isEstimated: boolean;
  fallbackChain: Array<RoutingProvider | "haversine">;
};

export type DeliveryPricingTier = {
  upToKm: number;
  fee: number;
  label?: string;
};

export type DeliveryPricingConfig = {
  freeRadiusKm?: number;
  baseFee?: number;
  feePerKm?: number;
  customThresholdKm?: number;
  minimumOrder?: number;
  tiers?: DeliveryPricingTier[];
};

export type DistanceEstimate = {
  distanceKm: number;
  durationMinutes: number;
};

export type NearbyStoreCandidate<TMeta = Record<string, unknown>> = Coordinate & {
  id: string;
  name: string;
  address?: string | null;
  isPrimary?: boolean;
  metadata?: TMeta;
};

export type NearbyStoreResult<TMeta = Record<string, unknown>> = {
  store: NearbyStoreCandidate<TMeta>;
  distanceKm: number;
  durationMinutes: number;
};

export type MapRuntimeConfig = {
  mapStyleUrl: string | null;
  geocodingProvider: GeocodingProvider;
  routingProvider: RoutingProvider;
  tileAttribution: string;
  supportsTypeahead: boolean;
  devFallbackTiles: boolean;
};
