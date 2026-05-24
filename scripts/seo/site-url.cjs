const PRODUCTION_SITE_URL = "https://logivn.com";

function normalizeSiteUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "");
}

function isLocalSiteUrl(url) {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(url);
}

function resolveSeoSiteUrl() {
  const configured = process.env.SEO_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || PRODUCTION_SITE_URL;
  return normalizeSiteUrl(configured);
}

function assertProductionSeoSiteUrl(siteUrl) {
  if (isLocalSiteUrl(siteUrl) && process.env.SEO_ALLOW_LOCAL_SITEMAP !== "1") {
    throw new Error("SEO_SITE_URL must not be localhost unless SEO_ALLOW_LOCAL_SITEMAP=1 is set.");
  }
}

module.exports = {
  PRODUCTION_SITE_URL,
  assertProductionSeoSiteUrl,
  isLocalSiteUrl,
  resolveSeoSiteUrl
};
