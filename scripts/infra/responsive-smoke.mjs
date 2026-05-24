import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import chromeLauncher from "chrome-launcher";

const root = process.cwd();
const reportsDir = path.join(root, "reports", "responsive");
const defaultRoutes = ["/", "/pricing", "/blog", "/dashboard/login", "/dashboard/register"];
const defaultViewports = [
  { name: "mobile-390", width: 390, height: 844, deviceScaleFactor: 3 },
  { name: "mobile-414", width: 414, height: 896, deviceScaleFactor: 3 },
  { name: "mobile-430", width: 430, height: 932, deviceScaleFactor: 3 },
  { name: "tablet-768", width: 768, height: 1024, deviceScaleFactor: 2 },
  { name: "desktop-1024", width: 1024, height: 768, deviceScaleFactor: 1 }
];

const chromeCandidates = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean);

const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const baseUrl = normalizeBaseUrl(process.env.RESPONSIVE_SMOKE_BASE_URL ?? process.argv.find((arg) => arg.startsWith("http")) ?? "http://127.0.0.1:3000");
const routes = parseCsv(process.env.RESPONSIVE_SMOKE_ROUTES, defaultRoutes);
const viewports = parseViewports(process.env.RESPONSIVE_SMOKE_VIEWPORTS) ?? defaultViewports;
const dashboardSmokeAuth = process.env.RESPONSIVE_SMOKE_AUTH_SECRET
  ? {
      cookieName: process.env.RESPONSIVE_SMOKE_AUTH_COOKIE_NAME || "logivn-dashboard-smoke",
      restaurantSlug: process.env.RESPONSIVE_SMOKE_AUTH_RESTAURANT_SLUG || "demo-pho",
      secret: process.env.RESPONSIVE_SMOKE_AUTH_SECRET
    }
  : null;
const publicDashboardRoutes = new Set([
  "/dashboard/login",
  "/dashboard/register",
  "/dashboard/forgot-password",
  "/dashboard/reset-password",
  "/dashboard/verify-email"
]);

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function parseCsv(value, fallback) {
  if (!value) return fallback;
  const parsed = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

function parseViewports(value) {
  if (!value) return null;
  const parsed = value
    .split(",")
    .map((item) => {
      const [name, size] = item.includes(":") ? item.split(":") : [item, item];
      const [width, height] = size.split("x").map((part) => Number(part));
      if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
      return {
        name: name.trim() || `${width}x${height}`,
        width,
        height,
        deviceScaleFactor: width < 768 ? 3 : 1
      };
    })
    .filter(Boolean);
  return parsed.length ? parsed : null;
}

function urlForRoute(route) {
  if (/^https?:\/\//.test(route)) return route;
  return `${baseUrl}${route.startsWith("/") ? route : `/${route}`}`;
}

function routePath(routeOrUrl) {
  if (/^https?:\/\//.test(routeOrUrl)) return new URL(routeOrUrl).pathname;
  return routeOrUrl.startsWith("/") ? routeOrUrl : `/${routeOrUrl}`;
}

function isProtectedDashboardRoute(routeOrUrl) {
  const path = routePath(routeOrUrl);
  return path.startsWith("/dashboard") && !publicDashboardRoutes.has(path);
}

async function applyDashboardSmokeAuth(page) {
  if (!dashboardSmokeAuth) return;

  await page.send("Network.enable");
  await page.send("Network.setCookie", {
    url: baseUrl,
    name: dashboardSmokeAuth.cookieName,
    value: `${dashboardSmokeAuth.restaurantSlug}:${dashboardSmokeAuth.secret}`,
    path: "/",
    httpOnly: true,
    secure: baseUrl.startsWith("https:"),
    sameSite: "Lax"
  });
}

function inspectPage() {
  const isVisible = (element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const labelFor = (element) =>
    (element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80);
  const rectFor = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName.toLowerCase(),
      label: labelFor(element),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      left: Math.round(rect.left),
      right: Math.round(rect.right)
    };
  };

  const doc = document.documentElement;
  const body = document.body;
  const scrollWidth = Math.max(doc.scrollWidth, body?.scrollWidth ?? 0);
  const overflowX = Math.max(0, scrollWidth - window.innerWidth);
  const interactive = Array.from(
    document.querySelectorAll("button,a,input,select,textarea,[role='button'],[role='link']")
  ).filter(isVisible);
  const smallTouchTargets = interactive
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44;
    })
    .map(rectFor);
  const horizontalOverflow = Array.from(document.body.querySelectorAll("*"))
    .filter(isVisible)
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.right > window.innerWidth + 2 || rect.left < -2;
    })
    .slice(0, 8)
    .map(rectFor);

  return {
    url: window.location.href,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    scrollWidth,
    overflowX,
    smallTouchTargetCount: smallTouchTargets.length,
    smallTouchTargetSamples: smallTouchTargets.slice(0, 8),
    horizontalOverflowSamples: horizontalOverflow
  };
}

class CdpSession {
  constructor(webSocketDebuggerUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.eventHandlers = new Map();
    this.socket = new WebSocket(webSocketDebuggerUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => this.handleMessage(event));
  }

  handleMessage(event) {
    const rawData = typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8");
    const payload = JSON.parse(rawData);
    if (payload.id && this.pending.has(payload.id)) {
      const { resolve, reject } = this.pending.get(payload.id);
      this.pending.delete(payload.id);
      if (payload.error) reject(new Error(payload.error.message));
      else resolve(payload.result ?? {});
      return;
    }

    if (!payload.method) return;
    const handlers = this.eventHandlers.get(payload.method) ?? [];
    for (const handler of handlers) handler(payload.params ?? {});
  }

  async send(method, params = {}, timeoutMs = 60_000) {
    await this.ready;
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timeout = windowlessTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  once(method, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      const handlers = this.eventHandlers.get(method) ?? [];
      const timeout = windowlessTimeout(() => {
        this.eventHandlers.set(
          method,
          (this.eventHandlers.get(method) ?? []).filter((handler) => handler !== onEvent)
        );
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      const onEvent = (params) => {
        clearTimeout(timeout);
        this.eventHandlers.set(
          method,
          (this.eventHandlers.get(method) ?? []).filter((handler) => handler !== onEvent)
        );
        resolve(params);
      };
      this.eventHandlers.set(method, [...handlers, onEvent]);
    });
  }

  close() {
    this.socket.close();
  }
}

function windowlessTimeout(callback, timeoutMs) {
  return setTimeout(callback, timeoutMs);
}

async function createTarget(port) {
  const endpoint = `http://127.0.0.1:${port}/json/new?${encodeURIComponent("about:blank")}`;
  let response = await fetch(endpoint, { method: "PUT" });
  if (!response.ok) response = await fetch(endpoint);
  if (!response.ok) throw new Error(`Cannot create Chrome target: ${response.status}`);
  return response.json();
}

async function inspectUrl({ chrome, route, url, viewport }) {
  const target = await createTarget(chrome.port);
  const page = new CdpSession(target.webSocketDebuggerUrl);
  try {
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await applyDashboardSmokeAuth(page);
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor,
      mobile: viewport.width < 768
    });
    const loaded = page.once("Page.loadEventFired", 20_000).catch(() => null);
    await page.send("Page.navigate", { url });
    await loaded;
    await page.send("Runtime.evaluate", {
      expression: "new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 180)))",
      awaitPromise: true
    });
    const evaluation = await page.send("Runtime.evaluate", {
      expression: `(${inspectPage.toString()})()`,
      returnByValue: true,
      awaitPromise: true
    });
    const value = evaluation.result?.value;
    const finalPath = value?.url ? new URL(value.url).pathname : "";
    const overflowFailure = (value?.overflowX ?? 0) > 2;
    const authRedirectFailure =
      Boolean(dashboardSmokeAuth) &&
      isProtectedDashboardRoute(route) &&
      ["/dashboard/login", "/dashboard/onboarding"].includes(finalPath);
    const statusReason = overflowFailure ? "horizontal-overflow" : authRedirectFailure ? "auth-redirect" : "pass";

    return {
      ...value,
      route: new URL(url).pathname,
      finalPath,
      viewport: viewport.name,
      viewportSize: value?.viewport,
      statusReason,
      status: statusReason === "pass" ? "pass" : "fail"
    };
  } finally {
    page.close();
    await fetch(`http://127.0.0.1:${chrome.port}/json/close/${target.id}`).catch(() => null);
  }
}

async function assertBaseUrlReachable() {
  try {
    const response = await fetch(baseUrl, { method: "GET" });
    if (response.ok || response.status < 500) return;
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`Cannot reach ${baseUrl}. Start the app first, or set RESPONSIVE_SMOKE_BASE_URL. ${error instanceof Error ? error.message : ""}`.trim());
  }
}

function markdownReport(summary) {
  const lines = [
    "# Responsive Smoke Report",
    "",
    `Generated: ${summary.generatedAt}`,
    `Base URL: ${summary.baseUrl}`,
    `Routes: ${summary.routes.join(", ")}`,
    `Viewports: ${summary.viewports.map((viewport) => `${viewport.name} ${viewport.width}x${viewport.height}`).join(", ")}`,
    `Dashboard auth: ${summary.dashboardSmokeAuth?.enabled ? `enabled for ${summary.dashboardSmokeAuth.restaurantSlug}` : "disabled"}`,
    `Failures: ${summary.failureCount}`,
    "",
    "| Route | Viewport | Final Path | Status | Reason | Overflow X | Small Targets |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...summary.results.map((result) => {
      return `| ${result.route} | ${result.viewport} | ${result.finalPath || result.route} | ${result.status} | ${result.statusReason || "pass"} | ${result.overflowX}px | ${result.smallTouchTargetCount} |`;
    }),
    ""
  ];

  const failures = summary.results.filter((result) => result.status === "fail");
  if (failures.length) {
    lines.push("## Failure Samples", "");
    for (const failure of failures) {
      lines.push(`### ${failure.route} ${failure.viewport}`, "", `Reason: ${failure.statusReason || "unknown"}`, "");
      if (failure.statusReason === "auth-redirect") {
        lines.push(`- Final path: ${failure.finalPath || "unknown"}`, "");
        continue;
      }
      for (const sample of failure.horizontalOverflowSamples ?? []) {
        lines.push(`- ${sample.tag} "${sample.label}" left=${sample.left} right=${sample.right} width=${sample.width}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        baseUrl,
        routes,
        viewports,
        dashboardSmokeAuth: dashboardSmokeAuth
          ? {
              enabled: true,
              cookieName: dashboardSmokeAuth.cookieName,
              restaurantSlug: dashboardSmokeAuth.restaurantSlug
            }
          : { enabled: false }
      },
      null,
      2
    )
  );
  process.exit(0);
}

if (!chromePath) {
  console.error("Khong tim thay Chrome/Chromium de chay responsive smoke.");
  console.error("Cai Google Chrome hoac set CHROME_PATH truoc khi chay npm run responsive:smoke.");
  process.exit(1);
}

await assertBaseUrlReachable();

const chrome = await chromeLauncher.launch({
  chromePath,
  chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"]
});

try {
  const results = [];
  for (const route of routes) {
    for (const viewport of viewports) {
      const result = await inspectUrl({ chrome, route, url: urlForRoute(route), viewport });
      results.push(result);
      console.log(
        `${result.status.toUpperCase()} ${result.route} ${result.viewport} final=${result.finalPath || result.route} reason=${result.statusReason} overflow=${result.overflowX}px smallTargets=${result.smallTouchTargetCount}`
      );
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    routes,
    viewports,
    dashboardSmokeAuth: dashboardSmokeAuth
      ? {
          enabled: true,
          cookieName: dashboardSmokeAuth.cookieName,
          restaurantSlug: dashboardSmokeAuth.restaurantSlug
        }
      : { enabled: false },
    failureCount: results.filter((result) => result.status === "fail").length,
    results
  };

  await mkdir(reportsDir, { recursive: true });
  await writeFile(path.join(reportsDir, "responsive-smoke.json"), `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(path.join(reportsDir, "RESPONSIVE-SMOKE-REPORT.md"), markdownReport(summary));

  if (summary.failureCount > 0) {
    console.error(`Responsive smoke failed with ${summary.failureCount} horizontal overflow issue(s).`);
    process.exit(1);
  }
} finally {
  await chrome.kill();
}
