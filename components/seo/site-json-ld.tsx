import { JsonLdScript } from "next-seo";
import { buildOrganizationSchema, buildSoftwareApplicationSchema, buildWebSiteSchema } from "@/lib/seo/schema";

export function SiteJsonLd() {
  return (
    <>
      <JsonLdScript data={buildOrganizationSchema()} scriptKey="logivn-organization" id="logivn-organization-jsonld" />
      <JsonLdScript data={buildWebSiteSchema()} scriptKey="logivn-website" id="logivn-website-jsonld" />
      <JsonLdScript data={buildSoftwareApplicationSchema()} scriptKey="logivn-software" id="logivn-software-jsonld" />
    </>
  );
}
