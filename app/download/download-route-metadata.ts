import { createSeoMetadata } from "@/lib/seo/metadata";
import { type InstallPlatformSlug, getInstallPlatformGuide } from "@/lib/pwa/install-platform";

export const downloadPageDescription =
  "Biến LogiVN thành ứng dụng trên điện thoại, máy tính bảng và máy tính của bạn chỉ trong vài giây.";

export function createDownloadMetadata(platform?: InstallPlatformSlug) {
  if (!platform) {
    return createSeoMetadata({
      title: "Tải ứng dụng LogiVN",
      description: downloadPageDescription,
      path: "/download",
      image: "/brand/logivn/02-banner-owner-dashboard.png"
    });
  }

  const guide = getInstallPlatformGuide(platform);

  return createSeoMetadata({
    title: `${guide.title} - Tải ứng dụng LogiVN`,
    description: guide.summary,
    path: guide.path,
    image: "/brand/logivn/02-banner-owner-dashboard.png"
  });
}

