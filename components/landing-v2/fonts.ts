import { Sora, Inter, JetBrains_Mono } from "next/font/google";

/* Fonts for the v2 landing tree. Loaded via next/font so they are
 * self-hosted, preloaded and FOUT-free. Exposed as CSS variables. */

export const fontDisplay = Sora({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-v2-display",
  display: "swap"
});

export const fontSans = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-v2-sans",
  display: "swap"
});

export const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-v2-mono",
  display: "swap"
});

export const fontVars = `${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`;
