import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SiteJsonLd } from "@/components/seo/site-json-ld";
import { defaultSeoMetadata } from "@/lib/seo/metadata";
import "./globals.css";

export const preferredRegion = "sin1";

const inter = Inter({
  subsets: ["vietnamese", "latin"],
  variable: "--font-inter",
  display: "swap"
});

export const metadata: Metadata = defaultSeoMetadata;

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
      <body className={inter.variable}>
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
