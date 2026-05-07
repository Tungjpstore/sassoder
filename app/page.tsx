import { LogiVNLanding } from "@/components/landing/logivn-landing";
import { getPlatformSiteConfig } from "@/services/platform-public-service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const siteConfig = await getPlatformSiteConfig();
  return <LogiVNLanding siteConfig={siteConfig} />;
}
