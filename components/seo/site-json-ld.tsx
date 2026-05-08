import { JsonLdScript, OrganizationJsonLd, SoftwareApplicationJsonLd } from "next-seo";
import { absoluteAssetUrl, absoluteSeoUrl, SEO_BRAND_LOGO_PATH, SEO_COMPANY_NAME, SEO_DEFAULT_DESCRIPTION, SEO_DEFAULT_IMAGE_PATH, SEO_SITE_NAME } from "@/lib/seo/config";
import { buildWebSiteSchema } from "@/lib/seo/schema";

export function SiteJsonLd() {
  return (
    <>
      <OrganizationJsonLd
        scriptId="logivn-organization-jsonld"
        scriptKey="logivn-organization"
        name={SEO_COMPANY_NAME}
        legalName={SEO_COMPANY_NAME}
        url={absoluteSeoUrl("/")}
        logo={absoluteAssetUrl(SEO_BRAND_LOGO_PATH)}
        description={SEO_DEFAULT_DESCRIPTION}
        email="support@logivn.com"
        telephone="1900 633 876"
        contactPoint={[
          {
            contactType: "customer support",
            email: "support@logivn.com",
            telephone: "1900 633 876"
          }
        ]}
      />
      <JsonLdScript data={buildWebSiteSchema()} scriptKey="logivn-website" id="logivn-website-jsonld" />
      <SoftwareApplicationJsonLd
        scriptId="logivn-software-jsonld"
        scriptKey="logivn-software"
        name={SEO_SITE_NAME}
        description={SEO_DEFAULT_DESCRIPTION}
        url={absoluteSeoUrl("/")}
        image={absoluteAssetUrl(SEO_DEFAULT_IMAGE_PATH)}
        applicationCategory="BusinessApplication"
        operatingSystem="Web"
        offers={[
          {
            price: 99000,
            priceCurrency: "VND",
            availability: "https://schema.org/InStock",
            url: absoluteSeoUrl("/pricing")
          },
          {
            price: 199000,
            priceCurrency: "VND",
            availability: "https://schema.org/InStock",
            url: absoluteSeoUrl("/pricing")
          }
        ]}
        featureList={[
          "Gọi món bằng QR theo bàn",
          "Quản lý đơn realtime",
          "Thanh toán VietQR và tiền mặt",
          "Đặt món online và đặt bàn trước",
          "AI hỗ trợ vận hành quán"
        ]}
      />
    </>
  );
}

