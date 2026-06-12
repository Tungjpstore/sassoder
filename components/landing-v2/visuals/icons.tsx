import * as React from "react";

/* Custom SVG icon set for LogiVN landing v2.
 * Each icon is line-based (stroke = currentColor) at 24×24 viewBox,
 * tuned for the jade brand and richer than generic Lucide glyphs. */

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 22, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/* Vận hành tại quán — storefront with QR table */
export function IconStorefront(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 9.2 5 4.2a1 1 0 0 1 1-.7h12a1 1 0 0 1 1 .7l1.5 5" />
      <path d="M3.5 9.2v1a2.4 2.4 0 0 0 4.8 0 2.4 2.4 0 0 0 4.8 0 2.4 2.4 0 0 0 4.8 0 2.4 2.4 0 0 0 2.6.3" />
      <path d="M4.7 11.4V20h14.6v-8.6" />
      <rect x="9.3" y="14" width="5.4" height="6" rx=".7" />
    </Svg>
  );
}

/* Thanh toán & đặt chỗ — QR pay code */
export function IconQrPay(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.2" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1.2" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1.2" />
      <path d="M6.2 6.2h1.1v1.1H6.2zM6.2 16.7h1.1v1.1H6.2zM16.7 6.2h1.1v1.1h-1.1z" />
      <path d="M14 14v2.3M14 19.3v1.2M17.3 14v3.4M20.5 14v6.5M17.3 20.5h3.2" />
    </Svg>
  );
}

/* Tồn kho & giá vốn — stacked inventory boxes */
export function IconInventory(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.2 4 7v10l8 3.8 8-3.8V7l-8-3.8Z" />
      <path d="M4 7l8 3.8L20 7" />
      <path d="M12 10.8V20.8" />
      <path d="M8 5.1 16 8.9" />
    </Svg>
  );
}

/* Trợ lý AI — spark / neural node */
export function IconAiSpark(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5c.6 2.7 1.8 3.9 4.5 4.5-2.7.6-3.9 1.8-4.5 4.5-.6-2.7-1.8-3.9-4.5-4.5 2.7-.6 3.9-1.8 4.5-4.5Z" />
      <path d="M18 14c.3 1.3.9 1.9 2.2 2.2-1.3.3-1.9.9-2.2 2.2-.3-1.3-.9-1.9-2.2-2.2 1.3-.3 1.9-.9 2.2-2.2Z" />
      <path d="M6.5 14.5c.25 1 .7 1.45 1.7 1.7-1 .25-1.45.7-1.7 1.7-.25-1-.7-1.45-1.7-1.7 1-.25 1.45-.7 1.7-1.7Z" />
    </Svg>
  );
}

/* Báo cáo & tăng trưởng — chart with rising trend */
export function IconAnalytics(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4v15a1 1 0 0 0 1 1h15" />
      <path d="M7.5 16.5V13M11.5 16.5v-6M15.5 16.5V8" />
      <path d="M6.5 9.5 11 5.8l3 2.2 4.8-4.2" />
      <path d="M19.5 3.8h-2.2M19.5 3.8V6" />
    </Svg>
  );
}

/* Thương hiệu & tự động hóa — palette with automation gear */
export function IconBrandAuto(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-1 2-2 0-.7-.3-1.1-.3-1.7 0-.8.6-1.3 1.4-1.3H17a3.5 3.5 0 0 0 3.5-3.5C20.5 7.2 16.7 3.5 12 3.5Z" />
      <circle cx="8" cy="9" r="1" />
      <circle cx="12" cy="7" r="1" />
      <circle cx="15.8" cy="9.2" r="1" />
    </Svg>
  );
}

/* Map keyed by capability group id for clean wiring */
export const capabilityIcons = {
  storefront: IconStorefront,
  payment: IconQrPay,
  inventory: IconInventory,
  ai: IconAiSpark,
  analytics: IconAnalytics,
  brand: IconBrandAuto
} as const;

export type CapabilityIconKey = keyof typeof capabilityIcons;
