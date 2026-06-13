import { JsonLdScript } from "next-seo";
import { buildFaqSchema } from "@/lib/seo/schema";
import { MarketingFunnelTracker } from "@/components/marketing/funnel-tracker";
import { fontVars } from "@/components/landing-v2/fonts";
import { faqs } from "@/components/landing-v2/data";
import { AuroraBackground } from "./visuals/aurora-background";
import { LandingFooterV3, LandingHeaderV3 } from "./shell";
import { HeroV3 } from "./sections/hero";
import { ProofBand } from "./sections/proof-band";
import { ShowcaseV3 } from "./sections/showcase";
import { CapabilitiesV3 } from "./sections/capabilities";
import { StepsV3 } from "./sections/steps";
import { PricingV3 } from "./sections/pricing";
import { TestimonialsV3 } from "./sections/testimonials";
import { FaqV3 } from "./sections/faq";
import { FinalCtaV3 } from "./sections/final-cta";

type SiteConfigLike = {
  brand: { companyName: string; logoUrl: string };
  landing: { bannerUrl?: string; heroTitle?: string };
};

export function LogiVNLandingV3({ siteConfig }: { siteConfig: SiteConfigLike }) {
  const { brand } = siteConfig;
  const faqSchema = faqs.map((item) => ({ question: item.q, answer: item.a }));

  return (
    <div data-ds="v2" className={`${fontVars} relative min-h-screen text-[var(--text)]`}>
      <AuroraBackground />
      <div className="relative z-10">
        <MarketingFunnelTracker page="/preview/landing-v3" source="homepage-v3-preview" />
        <JsonLdScript id="logivn-v3-faq-jsonld" scriptKey="logivn-v3-faq" data={buildFaqSchema(faqSchema)} />

        <LandingHeaderV3 logoUrl={brand.logoUrl} label={brand.companyName} />
        <main>
          <HeroV3 />
          <ProofBand />
          <div id="features">
            <ShowcaseV3 />
          </div>
          <CapabilitiesV3 />
          <StepsV3 />
          <PricingV3 />
          <TestimonialsV3 />
          <FaqV3 />
          <FinalCtaV3 />
        </main>
        <LandingFooterV3 logoUrl={brand.logoUrl} label={brand.companyName} />
      </div>
    </div>
  );
}
