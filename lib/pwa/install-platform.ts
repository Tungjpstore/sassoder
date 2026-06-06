export const INSTALL_PLATFORM_SLUGS = ["android", "ios", "windows", "mac"] as const;

export type InstallPlatformSlug = (typeof INSTALL_PLATFORM_SLUGS)[number];
export type InstallPlatform = InstallPlatformSlug | "desktop";

export type InstallPlatformGuide = {
  label: string;
  shortLabel: string;
  path: string;
  eyebrow: string;
  title: string;
  summary: string;
  browserNote: string;
  ctaLabel: string;
  manualCtaLabel: string;
  steps: string[];
  caveat: string;
};

export const INSTALL_PLATFORM_GUIDES: Record<InstallPlatformSlug, InstallPlatformGuide> = {
  android: {
    label: "Android",
    shortLabel: "Android",
    path: "/download/android",
    eyebrow: "Điện thoại Android",
    title: "Cài LogiVN trên Android",
    summary: "Phù hợp cho chủ quán và nhân viên muốn mở dashboard, đơn mới và menu QR như một ứng dụng trên màn hình chính.",
    browserNote: "Hoạt động tốt nhất trên Chrome hoặc Edge. Một số trình duyệt chỉ hiện lựa chọn Thêm vào màn hình chính trong menu.",
    ctaLabel: "Cài LogiVN trên Android",
    manualCtaLabel: "Xem các bước Android",
    steps: [
      "Mở LogiVN bằng Chrome hoặc Edge trên Android.",
      "Nếu nút cài tự động hiện sáng, chạm Cài LogiVN.",
      "Nếu không thấy nút, mở menu trình duyệt rồi chọn Cài đặt ứng dụng hoặc Thêm vào màn hình chính.",
      "Xác nhận tên LogiVN và mở lại từ biểu tượng trên màn hình chính."
    ],
    caveat: "Chrome chỉ phát sự kiện cài đặt khi website đủ điều kiện và người dùng chưa cài app trước đó."
  },
  ios: {
    label: "iPhone & iPad",
    shortLabel: "iOS",
    path: "/download/ios",
    eyebrow: "Safari trên iOS/iPadOS",
    title: "Thêm LogiVN vào Home Screen",
    summary: "iOS không dùng prompt cài tự động như Chrome. Cách đúng là mở bằng Safari và thêm LogiVN vào Home Screen.",
    browserNote: "Dùng Safari để có lựa chọn Add to Home Screen. Chrome/Edge trên iOS thường không hiện đủ bước này.",
    ctaLabel: "Xem cách thêm vào Home Screen",
    manualCtaLabel: "Xem các bước iOS",
    steps: [
      "Mở LogiVN bằng Safari trên iPhone hoặc iPad.",
      "Chạm nút Share trên thanh công cụ của Safari.",
      "Chọn Add to Home Screen hoặc Thêm vào Màn hình chính.",
      "Giữ tên LogiVN, chạm Add, rồi mở app từ biểu tượng mới."
    ],
    caveat: "Không hiển thị prompt giả trên iOS. Nếu không thấy Add to Home Screen, hãy kiểm tra lại trình duyệt đang dùng là Safari."
  },
  windows: {
    label: "Windows",
    shortLabel: "Windows",
    path: "/download/windows",
    eyebrow: "Chrome hoặc Microsoft Edge",
    title: "Cài LogiVN trên Windows",
    summary: "Biến LogiVN thành app desktop riêng để mở dashboard, đơn hàng và báo cáo nhanh hơn trong ca bán.",
    browserNote: "Chrome và Edge hỗ trợ cài PWA tốt nhất trên Windows. Icon cài có thể nằm cạnh thanh địa chỉ hoặc trong menu.",
    ctaLabel: "Cài LogiVN trên Windows",
    manualCtaLabel: "Xem các bước Windows",
    steps: [
      "Mở LogiVN bằng Chrome hoặc Microsoft Edge trên Windows.",
      "Chọn biểu tượng cài đặt ở thanh địa chỉ nếu trình duyệt hiển thị.",
      "Nếu không thấy, mở menu trình duyệt rồi chọn Apps hoặc Install LogiVN.",
      "Ghim LogiVN vào Start Menu hoặc taskbar để mở nhanh trong ca vận hành."
    ],
    caveat: "Nếu máy công ty chặn cài app từ trình duyệt, vẫn có thể dùng LogiVN trực tiếp trên web."
  },
  mac: {
    label: "macOS",
    shortLabel: "Mac",
    path: "/download/mac",
    eyebrow: "MacBook, iMac, Mac mini",
    title: "Cài LogiVN trên macOS",
    summary: "Dùng LogiVN như một app riêng trên Mac để tách vận hành quán khỏi các tab làm việc khác.",
    browserNote: "Chrome và Edge có nút cài PWA rõ nhất. Safari mới có thể thêm website vào Dock, tùy phiên bản macOS.",
    ctaLabel: "Cài LogiVN trên Mac",
    manualCtaLabel: "Xem các bước macOS",
    steps: [
      "Mở LogiVN bằng Chrome hoặc Edge trên macOS.",
      "Chọn biểu tượng cài ở thanh địa chỉ hoặc vào menu Apps rồi chọn Install LogiVN.",
      "Nếu dùng Safari có hỗ trợ, chọn File rồi Add to Dock.",
      "Mở LogiVN từ Dock hoặc Launchpad để chạy như app riêng."
    ],
    caveat: "Safari và Chromium có cách cài khác nhau trên macOS; LogiVN không giả lập prompt nếu trình duyệt chưa hỗ trợ."
  }
};

export function normalizeInstallPlatform(value: string | null | undefined): InstallPlatformSlug | null {
  if (!value) return null;
  return INSTALL_PLATFORM_SLUGS.find((platform) => platform === value.toLowerCase()) ?? null;
}

export function getInstallPlatformGuide(platform: InstallPlatformSlug) {
  return INSTALL_PLATFORM_GUIDES[platform];
}

export function isInstallPlatformSlug(value: string): value is InstallPlatformSlug {
  return INSTALL_PLATFORM_SLUGS.includes(value as InstallPlatformSlug);
}

export function detectInstallPlatformFromUserAgent(
  userAgent: string,
  hints: { maxTouchPoints?: number; platform?: string } = {}
): InstallPlatform {
  const ua = userAgent || "";
  const platform = hints.platform || "";
  const maxTouchPoints = hints.maxTouchPoints ?? 0;

  if (/iPad|iPhone|iPod/i.test(ua)) return "ios";
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows NT|Win32|Win64|WOW64/i.test(ua) || /^Win/i.test(platform)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua) || /^Mac/i.test(platform)) return "mac";

  return "desktop";
}

export function getInstallPlatformPath(platform: InstallPlatformSlug) {
  return INSTALL_PLATFORM_GUIDES[platform].path;
}

