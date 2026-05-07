import type { Metadata } from "next";
import { Be_Vietnam_Pro, Inter, Lexend, Sora } from "next/font/google";
import { getAppUrl } from "@/lib/app-url";
import "@copilotkit/react-core/v2/styles.css";
import "./globals.css";

export const preferredRegion = "sin1";

const beVietnam = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-be-vietnam",
  display: "swap"
});

const lexend = Lexend({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "600", "700", "900"],
  variable: "--font-lexend",
  display: "swap"
});

const sora = Sora({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sora",
  display: "swap"
});

const inter = Inter({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap"
});

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  title: "LogiVN - Gọi món QR cho quán Việt",
  description: "Menu QR, quản lý bàn, nhận đơn realtime và thanh toán tiền mặt/chuyển khoản cho nhà hàng, quán cà phê.",
  openGraph: {
    title: "LogiVN - Gọi món QR cho quán Việt",
    description: "Menu QR, quản lý bàn, nhận đơn realtime và thanh toán tiền mặt/chuyển khoản cho nhà hàng, quán cà phê.",
    url: getAppUrl(),
    siteName: "LogiVN",
    locale: "vi_VN",
    type: "website"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("admin-theme")==="dark")document.documentElement.classList.add("dark-admin")}catch(e){}`
          }}
        />
      </head>
      <body className={`${beVietnam.variable} ${lexend.variable} ${sora.variable} ${inter.variable}`}>{children}</body>
    </html>
  );
}
