import Image from "next/image";

/* PageBackground — fixed full-bleed brand backdrop for the whole
 * landing. Desktop and mobile use separate art (different aspect).
 * A soft ivory veil keeps foreground content readable while still
 * letting the artwork show through. */
export function PageBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <Image
        src="/brand/logivn/v2/bg-desktop.png"
        alt=""
        fill
        priority
        sizes="(max-width: 640px) 0px, 100vw"
        className="hidden object-cover object-center sm:block"
      />
      <Image
        src="/brand/logivn/v2/bg-mobile.png"
        alt=""
        fill
        priority
        sizes="(max-width: 640px) 100vw, 0px"
        className="block object-cover object-center sm:hidden"
      />
      {/* gentle ivory veil + jade vignette so the art shows but copy stays readable */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(252, 250, 244, 0.45) 0%, rgba(252, 250, 244, 0.62) 60%, rgba(252, 250, 244, 0.78) 100%)"
        }}
      />
    </div>
  );
}
