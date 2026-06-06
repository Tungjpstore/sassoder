import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { SiteJsonLd } from "@/components/seo/site-json-ld";
import { defaultSeoMetadata } from "@/lib/seo/metadata";
import "./globals.css";

export const preferredRegion = "sin1";

export const metadata: Metadata = defaultSeoMetadata;

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#0F4D3A"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <link rel="alternate" type="application/rss+xml" title="Blog LogiVN RSS" href="/feed.xml" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("admin-theme")==="dark")document.documentElement.classList.add("dark-admin")}catch(e){}`
          }}
        />
        <SiteJsonLd />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Bỏ qua điều hướng
        </a>
        <div id="main-content" className="app-main-content" tabIndex={-1}>
          {children}
        </div>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
