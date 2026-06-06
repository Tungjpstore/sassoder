import type { MetadataRoute } from "next";

const iconSizes = [72, 96, 128, 144, 152, 180, 192, 384, 512] as const;

type RichManifest = MetadataRoute.Manifest & {
  display_override?: Array<"window-controls-overlay" | "standalone" | "minimal-ui" | "browser">;
  launch_handler?: {
    client_mode: "navigate-existing" | "focus-existing" | "auto";
  };
  screenshots?: Array<{
    src: string;
    sizes: string;
    type: string;
    form_factor?: "narrow" | "wide";
    label?: string;
  }>;
};

export default function manifest(): MetadataRoute.Manifest {
  const appManifest: RichManifest = {
    name: "LogiVN",
    short_name: "LogiVN",
    description: "Nền tảng vận hành quán cafe và nhà hàng thông minh.",
    start_url: "/dashboard/login?source=pwa_launch",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "minimal-ui", "browser"],
    orientation: "portrait-primary",
    background_color: "#FFF7EB",
    theme_color: "#0F4D3A",
    categories: ["business", "productivity", "food"],
    lang: "vi-VN",
    dir: "ltr",
    id: "/dashboard/login",
    launch_handler: {
      client_mode: "navigate-existing"
    },
    shortcuts: [
      {
        name: "Đăng nhập LogiVN",
        short_name: "Đăng nhập",
        description: "Mở vùng đăng nhập và OAuth của LogiVN.",
        url: "/dashboard/login?source=pwa_shortcut",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" }]
      },
      {
        name: "Xem demo",
        short_name: "Demo",
        description: "Xem flow QR ordering, VietQR và AI vận hành.",
        url: "/demo?source=pwa_shortcut",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" }]
      },
      {
        name: "Cài trên thiết bị khác",
        short_name: "Cài app",
        description: "Mở trung tâm cài đặt PWA LogiVN.",
        url: "/download?source=pwa_shortcut",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" }]
      }
    ],
    screenshots: [
      {
        src: "/brand/logivn/02-banner-owner-dashboard.png",
        sizes: "1600x900",
        type: "image/png",
        form_factor: "wide",
        label: "Dashboard vận hành LogiVN"
      },
      {
        src: "/brand/logivn/03-banner-customer-qr-ordering.png",
        sizes: "1600x900",
        type: "image/png",
        form_factor: "narrow",
        label: "Menu QR trên điện thoại"
      }
    ],
    icons: [
      ...iconSizes.flatMap((size) => {
        const icon = {
          src: `/icons/icon-${size}x${size}.png`,
          sizes: `${size}x${size}`,
          type: "image/png" as const
        };

        return size >= 192 ? [{ ...icon, purpose: "any" as const }, { ...icon, purpose: "maskable" as const }] : [{ ...icon, purpose: "any" as const }];
      }),
      {
        src: "/icons/monochrome.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "monochrome" as const
      }
    ]
  };

  return appManifest;
}
