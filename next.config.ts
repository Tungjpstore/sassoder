import type { NextConfig } from "next";

const isVercelProduction = process.env.VERCEL_ENV === "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"} https://vercel.live`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://events.mapbox.com https://rsapi.goong.io https://tiles.goong.io https://*.goong.io https://tile.openstreetmap.org https://*.arcgisonline.com https://server.arcgisonline.com https://services.arcgisonline.com https://img.vietqr.io https://api.qrserver.com https://vercel.live",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isVercelProduction ? ["upgrade-insecure-requests"] : [])
].join("; ");

const nextConfig: NextConfig = {
  typedRoutes: false,
  experimental: {
    optimizePackageImports: ["lucide-react"],
    serverActions: {
      bodySizeLimit: "8mb"
    }
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }
        ]
      }
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "img.vietqr.io" },
      { protocol: "https", hostname: "api.qrserver.com" },
      { protocol: "https", hostname: "**.supabase.co" }
    ]
  }
};

export default nextConfig;
