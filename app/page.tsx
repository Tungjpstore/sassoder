import { LogiVNLanding } from "@/components/landing/logivn-landing";
import { createSeoMetadata } from "@/lib/seo/metadata";
import { getPlatformSiteConfig } from "@/services/platform-public-service";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const siteConfig = await getPlatformSiteConfig();
  return createSeoMetadata({
    title: siteConfig.landing.heroTitle,
    description: siteConfig.landing.heroSubtitle,
    path: "/",
    image: siteConfig.landing.bannerUrl
  });
}

export default async function HomePage() {
  const siteConfig = await getPlatformSiteConfig();
  return <LogiVNLanding siteConfig={siteConfig} />;
}
