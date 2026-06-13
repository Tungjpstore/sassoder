"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* Marquee — infinite horizontal track. Content is duplicated once so
 * a -50% translate loops seamlessly. Pauses on hover. Edges fade out
 * via a mask. CSS animation lives in design-tokens-v3.css. */
export function Marquee({
  children,
  reverse = false,
  durationSec = 40,
  className
}: {
  children: React.ReactNode;
  reverse?: boolean;
  durationSec?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("v3-marquee-group relative w-full overflow-hidden", className)}
      style={{
        maskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
        WebkitMaskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)"
      }}
    >
      <div
        className={cn("v3-marquee", reverse && "v3-marquee--reverse")}
        style={{ ["--marquee-dur" as string]: `${durationSec}s` }}
      >
        <div className="flex shrink-0 items-stretch gap-[var(--s-4)] pr-[var(--s-4)]">{children}</div>
        <div aria-hidden className="flex shrink-0 items-stretch gap-[var(--s-4)] pr-[var(--s-4)]">
          {children}
        </div>
      </div>
    </div>
  );
}
