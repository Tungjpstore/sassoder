import { JsonLdScript } from "next-seo";
import { buildFaqSchema } from "@/lib/seo/schema";
import { MarketingFunnelTracker } from "@/components/marketing/funnel-tracker";
import { fontVars } from "./fonts";
import { PageBackground } from "./visuals/page-background";
import { LandingFooter, LandingHeader } from "./shell";
import { Hero } from "./sections/hero";
import { Showcase } from "./sections/showcase";
import { Capabilities } from "./sections/capabilities";
import { Steps } from "./sections/steps";
import { Pricing } from "./sections/pricing";
import { Testimonials } from "./sections/testimonials";
import { FAQ } from "./sections/faq";
import { FinalCTA } from "./sections/final-cta";
import { faqs } from "./data";

type SiteConfigLike = {
  brand: { companyName: string; logoUrl: string };
  landing: { bannerUrl?: string; heroTitle?: string };
};

export function LogiVNLandingV2({ siteConfig }: { siteConfig: SiteConfigLike }) {
  const { brand } = siteConfig;
  const faqSchema = faqs.map((item) => ({ question: item.q, answer: item.a }));

  return (
    <div data-ds="v2" className={`${fontVars} relative min-h-screen text-[var(--text)]`}>
      <PageBackground />
      <div className="relative z-10">
        <MarketingFunnelTracker page="/" source="homepage-v2" />
        <JsonLdScript id="logivn-v2-faq-jsonld" scriptKey="logivn-v2-faq" data={buildFaqSchema(faqSchema)} />

        <LandingHeader logoUrl={brand.logoUrl} label={brand.companyName} />
        <main>
          <Hero />
          <div id="features">
            <Showcase />
          </div>
          <Capabilities />
          <div id="how">
            <Steps />
          </div>
          <Pricing />
          <Testimonials />
          <FAQ />
          <FinalCTA />
        </main>
        <LandingFooter logoUrl={brand.logoUrl} label={brand.companyName} />
      </div>
    </div>
  );
}
