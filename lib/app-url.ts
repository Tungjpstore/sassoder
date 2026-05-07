export const PRODUCTION_APP_URL = "https://logivn.com";

export function getAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const url = configured || PRODUCTION_APP_URL;
  return url.replace(/\/+$/, "");
}

export function buildAppUrl(path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getAppUrl()}${normalizedPath}`;
}
