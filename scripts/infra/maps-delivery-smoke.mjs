const baseUrl = normalizeBaseUrl(
  process.env.MAPS_DELIVERY_SMOKE_BASE_URL ||
    process.env.PRODUCTION_SMOKE_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://127.0.0.1:3000"
);
const timeoutMs = Number(process.env.MAPS_DELIVERY_SMOKE_TIMEOUT_MS || 15_000);
const restaurantSlug = (process.env.MAPS_DELIVERY_SMOKE_RESTAURANT_SLUG || "").trim();
const addressQuery = process.env.MAPS_DELIVERY_SMOKE_ADDRESS_QUERY || "12 Nguyen Hue, Quan 1, TP.HCM";
const quoteAddress = process.env.MAPS_DELIVERY_SMOKE_QUOTE_ADDRESS || addressQuery;
const quoteSubtotal = numberEnv("MAPS_DELIVERY_SMOKE_QUOTE_SUBTOTAL", 150_000);
const origin = {
  lat: numberEnv("MAPS_DELIVERY_SMOKE_ORIGIN_LAT", 10.7769),
  lng: numberEnv("MAPS_DELIVERY_SMOKE_ORIGIN_LNG", 106.7009)
};
const destination = {
  lat: numberEnv("MAPS_DELIVERY_SMOKE_DESTINATION_LAT", 10.79),
  lng: numberEnv("MAPS_DELIVERY_SMOKE_DESTINATION_LNG", 106.71)
};
const deliveryDestination = {
  lat: numberEnv("MAPS_DELIVERY_SMOKE_DELIVERY_LAT", destination.lat),
  lng: numberEnv("MAPS_DELIVERY_SMOKE_DELIVERY_LNG", destination.lng)
};
const requireGeocodeResult = booleanEnv("MAPS_DELIVERY_SMOKE_REQUIRE_GEOCODE_RESULT");
const requireDeliveryQuote = booleanEnv("MAPS_DELIVERY_SMOKE_REQUIRE_DELIVERY_QUOTE");
const requireNearestStore = booleanEnv("MAPS_DELIVERY_SMOKE_REQUIRE_NEAREST_STORE");
const requireGoongRoute = booleanEnv("MAPS_DELIVERY_SMOKE_REQUIRE_GOONG_ROUTE");
const requireMapboxRoute = booleanEnv("MAPS_DELIVERY_SMOKE_REQUIRE_MAPBOX_ROUTE");
const requireFailedGeocoding = booleanEnv("MAPS_DELIVERY_SMOKE_REQUIRE_FAILED_GEOCODING");
const requireInvalidQuoteCoordinates = booleanEnv("MAPS_DELIVERY_SMOKE_REQUIRE_INVALID_QUOTE_COORDINATES");
const checks = [];

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function booleanEnv(name) {
  return /^(1|true|yes)$/i.test(process.env[name] || "");
}

function absoluteUrl(pathOrUrl) {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  return `${baseUrl}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchWithTimeout(pathOrUrl, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(absoluteUrl(pathOrUrl), {
      ...init,
      headers: {
        "user-agent": "LogiVN-maps-delivery-smoke/1.0",
        accept: "application/json",
        ...(init.headers || {})
      },
      cache: "no-store",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON but received: ${text.slice(0, 180)}`);
  }
}

async function check(name, fn) {
  const startedAt = performance.now();
  try {
    const detail = await fn();
    checks.push({ name, ok: true, ms: Math.round(performance.now() - startedAt), detail });
    return detail;
  } catch (error) {
    checks.push({
      name,
      ok: false,
      ms: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

function routeQuery(provider = "goong") {
  const params = new URLSearchParams({
    originLat: String(origin.lat),
    originLng: String(origin.lng),
    destinationLat: String(destination.lat),
    destinationLng: String(destination.lng),
    provider
  });
  if (restaurantSlug) params.set("restaurantSlug", restaurantSlug);
  return `/api/maps/route?${params.toString()}`;
}

function assertOkEnvelope(json, label) {
  assert(json?.ok === true, `${label} returned ok=false: ${json?.error || "unknown error"}`);
  return json.data;
}

function assertRouteShape(route, label, expectedProvider = null) {
  assert(route && typeof route === "object", `${label} did not return a route object`);
  assert(Number.isFinite(route.distanceKm) && route.distanceKm > 0, `${label} route distance must be positive`);
  assert(route.durationMinutes === null || (Number.isFinite(route.durationMinutes) && route.durationMinutes > 0), `${label} route ETA must be positive or null`);
  assert(["goong", "vietmap", "mapbox", "osrm", "haversine"].includes(route.provider), `${label} route provider was ${route.provider}`);
  if (expectedProvider) assert(route.provider === expectedProvider, `${label} expected provider ${expectedProvider} but received ${route.provider}`);
  assert(["high", "medium", "low"].includes(route.confidence), `${label} route confidence was ${route.confidence}`);
  assert(Array.isArray(route.fallbackChain), `${label} route fallbackChain must be an array`);
}

function assertAcceptedQuoteShape(quote) {
  assert(quote && typeof quote === "object", "Delivery quote data missing");
  assert(typeof quote.accepted === "boolean", "Delivery quote accepted flag missing");
  if (!quote.accepted) return;
  assert(Number.isFinite(quote.distanceKm) && quote.distanceKm >= 0, "Accepted quote distance must be non-negative");
  assert(Number.isFinite(quote.fee) && quote.fee >= 0, "Accepted quote fee must be non-negative");
  assert(Number.isFinite(quote.serviceFee) && quote.serviceFee >= 0, "Accepted quote serviceFee must be non-negative");
  assert(Number.isFinite(quote.etaMinutes) && quote.etaMinutes > 0, "Accepted quote ETA must be positive");
  if (quote.routeDurationMinutes !== null && quote.routeDurationMinutes !== undefined) {
    assert(Number.isFinite(quote.routeDurationMinutes) && quote.routeDurationMinutes > 0, "Accepted quote routeDurationMinutes must be positive or null");
    assert(quote.etaMinutes >= quote.routeDurationMinutes, "Accepted quote ETA must not be below routed duration");
  }
  assert(quote.origin && Number.isFinite(quote.origin.lat) && Number.isFinite(quote.origin.lng), "Accepted quote origin missing");
  assert(quote.destination && Number.isFinite(quote.destination.lat) && Number.isFinite(quote.destination.lng), "Accepted quote destination missing");
  assert(!quote.confidence || ["high", "medium", "low"].includes(quote.confidence), `Accepted quote confidence was ${quote.confidence}`);
}

await check("maps route via Goong chain", async () => {
  const response = await fetchWithTimeout(routeQuery("goong"));
  assert(response.status === 200, `Route endpoint expected 200 but received ${response.status}`);
  const route = assertOkEnvelope(await readJson(response), "Route endpoint");
  assertRouteShape(route, "Route endpoint", requireGoongRoute ? "goong" : null);
  return `${route.provider} ${route.distanceKm}km ${route.durationMinutes ?? "n/a"}m`;
});

if (requireMapboxRoute) {
  await check("maps route via Mapbox", async () => {
    const response = await fetchWithTimeout(routeQuery("mapbox"));
    assert(response.status === 200, `Mapbox route endpoint expected 200 but received ${response.status}`);
    const route = assertOkEnvelope(await readJson(response), "Mapbox route endpoint");
    assertRouteShape(route, "Mapbox route endpoint", "mapbox");
    return `${route.provider} ${route.distanceKm}km ${route.durationMinutes ?? "n/a"}m`;
  });
}

await check("maps route rejects invalid coordinates", async () => {
  const response = await fetchWithTimeout("/api/maps/route?originLat=999&originLng=106.7&destinationLat=10.79&destinationLng=106.71");
  const json = await readJson(response);
  assert(response.status === 400, `Invalid coordinate route expected 400 but received ${response.status}`);
  assert(json.ok === false, "Invalid coordinate route should return ok=false");
  return json.code || json.error;
});

await check("maps geocoding search", async () => {
  const params = new URLSearchParams({ q: addressQuery, provider: "goong", limit: "3" });
  if (restaurantSlug) params.set("restaurantSlug", restaurantSlug);
  const response = await fetchWithTimeout(`/api/maps/search?${params.toString()}`);
  assert(response.status === 200, `Search endpoint expected 200 but received ${response.status}`);
  const data = assertOkEnvelope(await readJson(response), "Search endpoint");
  assert(Array.isArray(data.results), "Search results must be an array");
  if (requireGeocodeResult) assert(data.results.length > 0, "Search result was empty");
  return `${data.results.length} result(s)`;
});

if (requireFailedGeocoding) {
  await check("failed geocoding stays non-accepted", async () => {
    assert(restaurantSlug, "MAPS_DELIVERY_SMOKE_RESTAURANT_SLUG is required for failed geocoding quote smoke");
    const response = await fetchWithTimeout(`/api/restaurants/${encodeURIComponent(restaurantSlug)}/delivery-quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subtotal: quoteSubtotal,
        deliveryAddress: "zzzzzz-not-a-real-delivery-address-000000"
      })
    });
    assert(response.status === 200, `Failed geocoding quote expected 200 blocked quote but received ${response.status}`);
    const quote = assertOkEnvelope(await readJson(response), "Failed geocoding quote endpoint");
    assert(quote.accepted === false, "Failed geocoding quote must not be accepted");
    assert(quote.fee === 0 && quote.serviceFee === 0, "Failed geocoding quote must not charge fees");
    return quote.reason || "blocked";
  });
}

await check("delivery fee endpoint", async () => {
  const response = await fetchWithTimeout("/api/delivery/fee", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      distanceKm: 2.4,
      freeRadiusKm: 1,
      baseFee: 10_000,
      feePerKm: 5_000
    })
  });
  assert(response.status === 200, `Delivery fee endpoint expected 200 but received ${response.status}`);
  const data = assertOkEnvelope(await readJson(response), "Delivery fee endpoint");
  assert(data.fee === 20_000, `Delivery fee expected 20000 but received ${data.fee}`);
  return `${data.fee} VND`;
});

let nearestStore = null;
if (restaurantSlug || requireNearestStore) {
  nearestStore = await check("nearest store branch routing", async () => {
    assert(restaurantSlug, "MAPS_DELIVERY_SMOKE_RESTAURANT_SLUG is required for nearest-store smoke");
    const params = new URLSearchParams({
      restaurantSlug,
      lat: String(deliveryDestination.lat),
      lng: String(deliveryDestination.lng)
    });
    const response = await fetchWithTimeout(`/api/location/nearest-store?${params.toString()}`);
    assert(response.status === 200, `Nearest-store endpoint expected 200 but received ${response.status}`);
    const json = await readJson(response);
    assert(json.ok === true, `Nearest-store returned ok=false: ${json.error || "unknown error"}`);
    if (requireNearestStore) assert(json.data, "Nearest-store returned null");
    if (!json.data) return "skipped: no store returned";
    assert(json.data.id && json.data.name, "Nearest-store response missing id/name");
    assert(Number.isFinite(json.data.distanceKm) && json.data.distanceKm >= 0, "Nearest-store distance must be non-negative");
    assert(Number.isFinite(json.data.durationMinutes) && json.data.durationMinutes > 0, "Nearest-store ETA must be positive");
    return json.data;
  });
}

if (requireInvalidQuoteCoordinates) {
  await check("restaurant quote rejects invalid coordinates", async () => {
    assert(restaurantSlug, "MAPS_DELIVERY_SMOKE_RESTAURANT_SLUG is required for invalid quote coordinate smoke");
    const response = await fetchWithTimeout(`/api/restaurants/${encodeURIComponent(restaurantSlug)}/delivery-quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subtotal: quoteSubtotal,
        deliveryAddress: quoteAddress,
        deliveryLat: 999,
        deliveryLng: deliveryDestination.lng
      })
    });
    const json = await readJson(response);
    assert(response.status >= 400, `Invalid quote coordinates expected 4xx but received ${response.status}`);
    assert(json.ok === false, "Invalid quote coordinates should return ok=false");
    return json.code || json.error;
  });
}

if (restaurantSlug || requireDeliveryQuote) {
  await check("restaurant delivery quote", async () => {
    assert(restaurantSlug, "MAPS_DELIVERY_SMOKE_RESTAURANT_SLUG is required for delivery quote smoke");
    const response = await fetchWithTimeout(`/api/restaurants/${encodeURIComponent(restaurantSlug)}/delivery-quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subtotal: quoteSubtotal,
        deliveryAddress: quoteAddress,
        deliveryLat: deliveryDestination.lat,
        deliveryLng: deliveryDestination.lng
      })
    });
    assert(response.status === 200, `Delivery quote endpoint expected 200 but received ${response.status}`);
    const quote = assertOkEnvelope(await readJson(response), "Delivery quote endpoint");
    assertAcceptedQuoteShape(quote);
    if (quote.accepted && nearestStore?.id && quote.nearestStore?.id) {
      assert(quote.nearestStore.id === nearestStore.id, `Quote nearestStore ${quote.nearestStore.id} differed from nearest-store ${nearestStore.id}`);
    }
    return quote.accepted ? `accepted ${quote.provider}/${quote.routeProvider ?? "n/a"} ${quote.distanceKm}km fee=${quote.fee}` : `blocked: ${quote.reason || "no reason"}`;
  });
}

const failed = checks.filter((item) => !item.ok);

console.log(`\nLogiVN maps/delivery smoke: ${baseUrl}`);
console.table(
  checks.map((item) => ({
    check: item.name,
    status: item.ok ? "PASS" : "FAIL",
    ms: item.ms,
    detail: typeof item.detail === "string" ? item.detail : item.detail?.id || "",
    error: item.error || ""
  }))
);

if (failed.length > 0) {
  console.error(`\n${failed.length} maps/delivery smoke check(s) failed.`);
  process.exit(1);
}

console.log("\nAll maps/delivery smoke checks passed.");
