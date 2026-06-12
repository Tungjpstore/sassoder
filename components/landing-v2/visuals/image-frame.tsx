import Image from "next/image";
import { cn } from "@/lib/utils";

/* ImageFrame — real product screenshot inside a soft browser frame.
 * Aspect ratio matches the source so nothing gets cropped or stretched.
 * Common source ratios in /public/brand/logivn:
 *   01-banner-overview-hero-v2.png   → 1314 × 1197 (≈ 1.10)
 *   02..04 banners                   → 1916 × 821  (≈ 2.33)
 *   staff illustration               → 1536 × 1024 (= 1.50)
 */
export function ImageFrame({
  src,
  alt,
  width,
  height,
  priority = false,
  className,
  glow = "jade",
  withChrome = true
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  className?: string;
  glow?: "jade" | "orange" | "none";
  withChrome?: boolean;
}) {
  const aspect = `${width} / ${height}`;
  return (
    <div className={cn("relative", className)}>
      {glow !== "none" ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 origin-center scale-[1.08] rounded-[var(--r-xl)] opacity-60 blur-3xl"
          style={{
            background:
              glow === "orange"
                ? "radial-gradient(circle at 50% 40%, var(--accent-soft), transparent 70%)"
                : "radial-gradient(circle at 50% 40%, var(--primary-soft), transparent 70%)"
          }}
        />
      ) : null}
      <div className="overflow-hidden rounded-[var(--r-xl)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--sh-xl)]">
        {withChrome ? (
          <div className="flex items-center gap-1.5 border-b border-[var(--line)] bg-[var(--surface-2)] px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--orange)]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--sage)]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--line-strong)]" />
            <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--surface)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-faint)]">
              app.logivn.com
            </span>
          </div>
        ) : null}
        <div className="relative w-full bg-[var(--surface-2)]" style={{ aspectRatio: aspect }}>
          <Image src={src} alt={alt} fill priority={priority} sizes="(max-width: 1024px) 100vw, 56vw" className="object-contain" />
        </div>
      </div>
    </div>
  );
}
