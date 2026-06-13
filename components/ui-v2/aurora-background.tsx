"use client";

/* AuroraBackground — code-driven brand backdrop that replaces the
 * heavy fixed PNG. Layered radial "aurora" blobs in brand jade/orange/
 * sage drift slowly, over a fine grain + subtle grid. Far cheaper than
 * a full-bleed image, fully on-brand, and crisp at any DPR.
 *
 * All motion is pure CSS (transform/opacity) so it stays at 60fps and
 * is automatically frozen under prefers-reduced-motion. */
export function AuroraBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* base wash */}
      <div className="absolute inset-0 bg-[var(--bg)]" />

      {/* drifting aurora blobs */}
      <div className="v2-aurora-blob absolute -left-[12%] -top-[14%] h-[42rem] w-[42rem] rounded-full opacity-[0.55] blur-[100px]"
        style={{ background: "radial-gradient(circle at 50% 50%, rgba(169,197,161,0.55), transparent 64%)", animationDelay: "0s" }} />
      <div className="v2-aurora-blob absolute right-[-14%] top-[2%] h-[40rem] w-[40rem] rounded-full opacity-[0.5] blur-[110px]"
        style={{ background: "radial-gradient(circle at 50% 50%, rgba(242,140,40,0.30), transparent 66%)", animationDelay: "-7s" }} />
      <div className="v2-aurora-blob absolute left-[18%] top-[42%] h-[44rem] w-[44rem] rounded-full opacity-[0.4] blur-[120px]"
        style={{ background: "radial-gradient(circle at 50% 50%, rgba(15,77,58,0.22), transparent 68%)", animationDelay: "-14s" }} />
      <div className="v2-aurora-blob absolute right-[6%] bottom-[-12%] h-[38rem] w-[38rem] rounded-full opacity-[0.45] blur-[110px]"
        style={{ background: "radial-gradient(circle at 50% 50%, rgba(169,197,161,0.5), transparent 66%)", animationDelay: "-20s" }} />

      {/* faint brand grid */}
      <div
        className="absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(15,77,58,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,77,58,0.05) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 90% 70% at 50% 30%, #000 35%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 70% at 50% 30%, #000 35%, transparent 100%)"
        }}
      />

      {/* grain */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"
        }}
      />

      {/* readability veil — keeps foreground copy crisp */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(252,250,244,0.20) 0%, rgba(252,250,244,0.55) 55%, rgba(252,250,244,0.72) 100%)"
        }}
      />

      <style>{`
        .v2-aurora-blob { will-change: transform; animation: v2-aurora 32s var(--ease-in-out) infinite; }
        @media (prefers-reduced-motion: reduce) {
          .v2-aurora-blob { animation: none; }
        }
      `}</style>
    </div>
  );
}
