/* AuroraBackground — fixed, code-driven brand backdrop. Replaces the
 * heavy full-page PNG. Three drifting blurred blobs in brand tones,
 * a faint top grid, and a soft grain overlay. All animation is CSS
 * (GPU transform only) and disabled under reduced-motion. */
export function AuroraBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <div className="v3-aurora v3-grain h-full w-full">
        <div className="v3-aurora__grid" />
        <div className="v3-aurora__blob v3-aurora__blob--1" />
        <div className="v3-aurora__blob v3-aurora__blob--2" />
        <div className="v3-aurora__blob v3-aurora__blob--3" />
        {/* readability veil — keeps foreground copy crisp */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 90% 70% at 50% 30%, transparent 0%, rgba(252,250,244,0.35) 70%, rgba(252,250,244,0.6) 100%)"
          }}
        />
      </div>
    </div>
  );
}
