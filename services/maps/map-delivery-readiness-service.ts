import { getEnv } from "@/services/maps/provider-runtime";

export type MapDeliveryReadinessItem = {
  key: "geocoding" | "routing" | "cache" | "rate_limit" | "tiles" | "observability";
  label: string;
  ready: boolean;
  severity: "info" | "warning" | "critical";
  detail: string;
};

function hasAnyEnv(names: string[]) {
  return names.some((name) => Boolean(getEnv(name)));
}

export function getMapDeliveryReadiness() {
  const hasGoong = Boolean(getEnv("GOONG_API_KEY"));
  const hasVietmap = Boolean(getEnv("VIETMAP_API_KEY"));
  const hasMapbox = hasAnyEnv(["MAPBOX_ACCESS_TOKEN", "NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN"]);
  const hasOsrm = Boolean(getEnv("MAPS_OSRM_URL")) || true;
  const hasRedis = hasAnyEnv(["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"]) && hasAnyEnv(["UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN"]);
  const hasTiles = hasAnyEnv(["NEXT_PUBLIC_MAP_STYLE_URL", "NEXT_PUBLIC_GOONG_MAPTILES_KEY"]);
  const telemetryEnabled = getEnv("MAPS_DB_TELEMETRY_ENABLED") !== "false";

  const items: MapDeliveryReadinessItem[] = [
    {
      key: "geocoding",
      label: "Geocoding Việt Nam",
      ready: hasGoong || hasVietmap || hasMapbox,
      severity: hasGoong ? "info" : hasVietmap || hasMapbox ? "warning" : "critical",
      detail: hasGoong
        ? "Goong đã sẵn sàng làm primary geocoder."
        : hasVietmap || hasMapbox
          ? "Có fallback geocoder, nhưng nên cấu hình Goong cho địa chỉ Việt Nam."
          : "Thiếu GOONG_API_KEY/VIETMAP_API_KEY/MAPBOX_ACCESS_TOKEN."
    },
    {
      key: "routing",
      label: "Routing/ETA",
      ready: hasGoong || hasVietmap || hasMapbox || hasOsrm,
      severity: hasGoong || hasVietmap ? "info" : "warning",
      detail: hasGoong || hasVietmap ? "Routing provider thương mại đã sẵn sàng." : "Đang dựa vào OSRM/public fallback, nên cache mạnh khi volume tăng."
    },
    {
      key: "cache",
      label: "Shared cache",
      ready: hasRedis,
      severity: hasRedis ? "info" : "warning",
      detail: hasRedis ? "Redis REST đã cấu hình cho cache cross-instance." : "Chưa có Redis REST, cache chỉ còn memory theo từng instance."
    },
    {
      key: "rate_limit",
      label: "Distributed rate limit",
      ready: hasRedis && getEnv("MAPS_RATE_LIMIT_REDIS_ENABLED") !== "false",
      severity: hasRedis ? "info" : "warning",
      detail: hasRedis ? "Rate limit có thể đồng bộ qua Redis." : "Rate limit fallback memory, đủ dev nhưng yếu khi scale nhiều instance."
    },
    {
      key: "tiles",
      label: "Map tiles/style",
      ready: hasTiles,
      severity: hasTiles ? "info" : "warning",
      detail: hasTiles ? "Client map style/tile key đã cấu hình." : "Thiếu style/tile key, client dùng raster fallback."
    },
    {
      key: "observability",
      label: "Map observability",
      ready: telemetryEnabled,
      severity: telemetryEnabled ? "info" : "warning",
      detail: telemetryEnabled ? "DB telemetry đang bật cho provider/cache/quote metrics." : "DB telemetry đang tắt, dashboard ops sẽ thiếu dữ liệu."
    }
  ];

  const critical = items.filter((item) => item.severity === "critical" && !item.ready).length;
  const warnings = items.filter((item) => item.severity === "warning" && !item.ready).length;

  return {
    status: critical > 0 ? "critical" : warnings > 0 ? "warning" : "ready",
    readyCount: items.filter((item) => item.ready).length,
    totalCount: items.length,
    items
  };
}
