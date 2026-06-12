import { LogiVNLandingV2 } from "@/components/landing-v2/logivn-landing-v2";
import { getPlatformSiteConfig } from "@/services/platform-public-service";
import "@/app/styles/design-tokens-v2.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Preview · Landing v2",
  robots: { index: false, follow: false }
};

export default async function LandingV2PreviewPage() {
  const siteConfig = await getPlatformSiteConfig();
  return <LogiVNLandingV2 siteConfig={siteConfig} />;
}
