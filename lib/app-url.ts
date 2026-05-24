export const PRODUCTION_APP_URL = "https://logivn.com";

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function normalizePath(path = "/") {
  return path.startsWith("/") ? path : `/${path}`;
}

export function getAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  const url = configured || PRODUCTION_APP_URL;
  return normalizeBaseUrl(url);
}

export function getSeoUrl() {
  const configured = process.env.SEO_SITE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const url = configured || PRODUCTION_APP_URL;
  return normalizeBaseUrl(url);
}

export function buildAppUrl(path = "/") {
  return `${getAppUrl()}${normalizePath(path)}`;
}

export function buildSeoUrl(path = "/") {
  return `${getSeoUrl()}${normalizePath(path)}`;
}
