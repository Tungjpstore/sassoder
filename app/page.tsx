import { LogiVNLanding } from "@/components/landing/logivn-landing";
import { SEO_HOME_DESCRIPTION, SEO_HOME_TITLE } from "@/lib/seo/config";
import { createSeoMetadata } from "@/lib/seo/metadata";
import { getPlatformSiteConfig } from "@/services/platform-public-service";

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
  return <LogiVNLanding siteConfig={siteConfig} />;
}
