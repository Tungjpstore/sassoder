import { LogiVNLandingV3 } from "@/components/landing-v3/logivn-landing-v3";
import { getPlatformSiteConfig } from "@/services/platform-public-service";
import "@/app/styles/design-tokens-v2.css";
import "@/app/styles/design-tokens-v3.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Preview · Landing v3",
  robots: { index: false, follow: false }
};

export default async function LandingV3PreviewPage() {
  const siteConfig = await getPlatformSiteConfig();
  return <LogiVNLandingV3 siteConfig={siteConfig} />;
}
