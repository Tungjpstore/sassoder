"use client";

import type { ReactNode } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const mapCanvasBaseClass =
  "h-full w-full bg-[radial-gradient(circle_at_top,rgba(15,77,58,0.09),transparent_42%),linear-gradient(180deg,rgba(255,247,235,0.8),rgba(248,242,232,0.95))]";

export const MapCanvas = forwardRef<HTMLDivElement, { className?: string; children?: ReactNode }>(
  function MapCanvas({ className, children }, ref) {
    return (
      <div ref={ref} className={cn(mapCanvasBaseClass, className)}>
        {children}
      </div>
    );
  }
);
