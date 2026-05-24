const baseUrl = normalizeBaseUrl(
  process.env.PRODUCTION_SMOKE_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://logivn.com"
);
const restaurantSlug = process.env.PRODUCTION_SMOKE_RESTAURANT_SLUG || "demo-pho";
const timeoutMs = Number(process.env.PRODUCTION_SMOKE_TIMEOUT_MS || 15_000);

const checks = [];

function normalizeBaseUrl(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function absoluteUrl(pathOrUrl) {
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
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
      redirect: "manual",
      ...init,
      headers: {
        "user-agent": "LogiVN-production-smoke/1.0",
        accept: "text/html,application/json",
        ...(init.headers || {})
      },
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
    throw new Error(`Expected JSON but received: ${text.slice(0, 160)}`);
  }
}

async function check(name, fn) {
  const startedAt = performance.now();
  try {
    await fn();
    checks.push({ name, ok: true, ms: Math.round(performance.now() - startedAt) });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      ms: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function expectStatus(response, expected, label) {
  const expectedList = Array.isArray(expected) ? expected : [expected];
  assert(
    expectedList.includes(response.status),
    `${label} expected ${expectedList.join("/")} but received ${response.status}`
  );
}

await check("public landing page", async () => {
  const response = await fetchWithTimeout("/");
  expectStatus(response, 200, "GET /");
  const html = await response.text();
  assert(html.includes("LogiVN"), "Landing page did not include LogiVN brand text");
});

await check("pricing page", async () => {
  const response = await fetchWithTimeout("/pricing");
  expectStatus(response, 200, "GET /pricing");
  const html = await response.text();
  assert(html.includes("LogiVN"), "Pricing page did not include LogiVN brand text");
});

await check("dashboard login page", async () => {
  const response = await fetchWithTimeout("/dashboard/login");
  expectStatus(response, 200, "GET /dashboard/login");
  const html = await response.text();
  assert(html.includes("Đăng nhập"), "Login page did not render the login surface");
});

await check("unauthenticated dashboard redirects to login", async () => {
  const response = await fetchWithTimeout("/dashboard");
  expectStatus(response, [302, 303, 307, 308], "GET /dashboard");
  const location = response.headers.get("location") || "";
  assert(location.includes("/dashboard/login"), `Dashboard redirect target was ${location || "(empty)"}`);
});

await check("unauthenticated billing settings redirects to login", async () => {
  const response = await fetchWithTimeout("/dashboard/settings?section=billing&gate=subscription");
  expectStatus(response, [302, 303, 307, 308], "GET /dashboard/settings?section=billing");
  const location = response.headers.get("location") || "";
  assert(location.includes("/dashboard/login"), `Billing redirect target was ${location || "(empty)"}`);
});

await check("health endpoint reaches Supabase", async () => {
  const response = await fetchWithTimeout("/api/health", {
    headers: { accept: "application/json" }
  });
  expectStatus(response, 200, "GET /api/health");
  const json = await readJson(response);
  assert(json.ok === true, "Health endpoint did not return ok=true");
  assert(json.supabase === "connected", "Health endpoint did not report Supabase connected");
});

await check("admin action center is auth guarded", async () => {
  const response = await fetchWithTimeout("/api/admin/action-center", {
    headers: { accept: "application/json" }
  });
  expectStatus(response, 401, "GET /api/admin/action-center");
  const json = await readJson(response);
  assert(json.ok === false, "Action center guard did not return ok=false");
});

await check("admin orders API is auth guarded", async () => {
  const response = await fetchWithTimeout("/api/admin/orders", {
    headers: { accept: "application/json" }
  });
  expectStatus(response, 401, "GET /api/admin/orders");
  const json = await readJson(response);
  assert(json.ok === false, "Orders guard did not return ok=false");
});

await check("admin reservations API is auth guarded", async () => {
  const response = await fetchWithTimeout("/api/admin/reservations", {
    headers: { accept: "application/json" }
  });
  expectStatus(response, 401, "GET /api/admin/reservations");
  const json = await readJson(response);
  assert(json.ok === false, "Reservations guard did not return ok=false");
});

await check("customer online ordering page", async () => {
  const response = await fetchWithTimeout(`/r/${restaurantSlug}`);
  expectStatus(response, 200, `GET /r/${restaurantSlug}`);
  const html = await response.text();
  assert(html.includes("LogiVN") || html.includes("Demo Pho"), "Customer ordering page did not render expected content");
});

await check("customer reservation page", async () => {
  const response = await fetchWithTimeout(`/r/${restaurantSlug}/reserve`);
  expectStatus(response, 200, `GET /r/${restaurantSlug}/reserve`);
  const html = await response.text();
  assert(html.includes("LogiVN") || html.includes("đặt bàn") || html.includes("Đặt bàn"), "Reservation page did not render expected content");
});

await check("order API validates bad payload", async () => {
  const response = await fetchWithTimeout("/api/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json"
    },
    body: "{}"
  });
  expectStatus(response, 422, "POST /api/orders");
  const json = await readJson(response);
  assert(json.ok === false, "Order validation did not return ok=false");
  assert(json.details?.fieldErrors?.restaurantSlug, "Order validation did not mention restaurantSlug");
});

await check("reservation API validates bad payload", async () => {
  const response = await fetchWithTimeout("/api/reservations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json"
    },
    body: "{}"
  });
  expectStatus(response, 422, "POST /api/reservations");
  const json = await readJson(response);
  assert(json.ok === false, "Reservation validation did not return ok=false");
  assert(json.details?.fieldErrors?.restaurantSlug, "Reservation validation did not mention restaurantSlug");
});

await check("Google OAuth redirect contract", async () => {
  const startResponse = await fetchWithTimeout("/auth/google");
  expectStatus(startResponse, [302, 303, 307, 308], "GET /auth/google");
  assert(startResponse.headers.get("cache-control") === "no-store", "OAuth start redirect must be no-store");

  const cleanLocation = startResponse.headers.get("location") || "";
  assert(cleanLocation.startsWith(`${baseUrl}/auth/google`), `OAuth clean redirect target was ${cleanLocation || "(empty)"}`);
  assert(cleanLocation.includes("_oauth_clean=1"), "OAuth clean redirect did not include _oauth_clean=1");
  assert(cleanLocation.includes("oauthKey="), "OAuth clean redirect did not include oauthKey");

  const cleanResponse = await fetchWithTimeout(cleanLocation);
  expectStatus(cleanResponse, [302, 303, 307, 308], "GET cleaned /auth/google");
  const providerLocation = cleanResponse.headers.get("location") || "";
  const providerUrl = new URL(providerLocation);
  assert(providerUrl.hostname.endsWith(".supabase.co"), `OAuth provider host was ${providerUrl.hostname}`);
  assert(providerUrl.pathname === "/auth/v1/authorize", `OAuth provider path was ${providerUrl.pathname}`);
  assert(providerUrl.searchParams.get("provider") === "google", "OAuth provider parameter was not google");
  const redirectTo = providerUrl.searchParams.get("redirect_to") || "";
  assert(redirectTo.startsWith(`${baseUrl}/auth/callback`), `OAuth redirect_to was ${redirectTo || "(empty)"}`);
  assert(cleanResponse.headers.get("set-cookie")?.includes("code-verifier"), "OAuth clean redirect did not set PKCE code verifier cookie");
});

const failed = checks.filter((item) => !item.ok);

console.log(`\nLogiVN production smoke: ${baseUrl}`);
console.table(
  checks.map((item) => ({
    check: item.name,
    status: item.ok ? "PASS" : "FAIL",
    ms: item.ms,
    error: item.error || ""
  }))
);

if (failed.length > 0) {
  console.error(`\n${failed.length} production smoke check(s) failed.`);
  process.exit(1);
}

console.log("\nAll production smoke checks passed.");
