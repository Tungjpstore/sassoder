import { LogiVNLandingV2 } from "@/components/landing-v2/logivn-landing-v2";
import { SEO_HOME_DESCRIPTION, SEO_HOME_TITLE } from "@/lib/seo/config";
import { createSeoMetadata } from "@/lib/seo/metadata";
import { getPlatformSiteConfig } from "@/services/platform-public-service";
import "@/app/styles/design-tokens-v2.css";

export const revalidate = 3600;

export async function generateMetadata() {
  const siteConfig = await getPlatformSiteConfig();
  return createSeoMetadata({
    title: SEO_HOME_TITLE,
    description: SEO_HOME_DESCRIPTION,
    path: "/",
    image: siteConfig.landing.bannerUrl
  });
}

export default async function HomePage() {
  const siteConfig = await getPlatformSiteConfig();
  return <LogiVNLandingV2 siteConfig={siteConfig} />;
}
