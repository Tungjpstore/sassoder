import type {
  AddressAutocompletePrediction,
  Coordinate,
  GeocodingProvider,
  GeocodingResult,
  MapRequestContext,
  RouteResult,
  RoutingProvider
} from "@/services/maps/types";

export type GeocoderAutocompleteOptions = {
  limit: number;
  sessionToken?: string | null;
  location?: Coordinate | null;
  context?: MapRequestContext;
};

export type PlaceDetailOptions = {
  sessionToken?: string | null;
  context?: MapRequestContext;
};

export type GeocoderProviderClient = {
  id: GeocodingProvider;
  search: (query: string, limit: number, context?: MapRequestContext) => Promise<GeocodingResult[]>;
  reverse: (point: Coordinate, context?: MapRequestContext) => Promise<GeocodingResult | null>;
  autocomplete?: (query: string, options: GeocoderAutocompleteOptions) => Promise<AddressAutocompletePrediction[]>;
  placeDetail?: (placeId: string, options?: PlaceDetailOptions) => Promise<GeocodingResult | null>;
};

export type RoutingProviderClient = {
  id: RoutingProvider;
  route: (origin: Coordinate, destination: Coordinate, context?: MapRequestContext) => Promise<RouteResult | null>;
};
