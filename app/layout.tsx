import type { Metadata } from "next";
import { headers } from "next/headers";
import { SiteJsonLd } from "@/components/seo/site-json-ld";
import { isPlatformAdminHost } from "@/lib/platform-admin-url";
import { defaultSeoMetadata } from "@/lib/seo/metadata";
import "./globals.css";

export const preferredRegion = "sin1";

export const metadata: Metadata = defaultSeoMetadata;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const isAdminHost = isPlatformAdminHost(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"));

  return (
    <html lang="vi" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {!isAdminHost ? <link rel="alternate" type="application/rss+xml" title="Blog LogiVN RSS" href="/feed.xml" /> : null}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("admin-theme")==="dark")document.documentElement.classList.add("dark-admin")}catch(e){}`
          }}
        />
        {!isAdminHost ? <SiteJsonLd /> : null}
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Bỏ qua điều hướng
        </a>
        <div id="main-content" className="app-main-content" tabIndex={-1}>
          {children}
        </div>
      </body>
    </html>
  );
}
