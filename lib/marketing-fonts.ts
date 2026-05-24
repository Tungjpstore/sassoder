import { Cormorant_Garamond } from "next/font/google";

export const marketingDisplay = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  variable: "--font-marketing-display",
  display: "swap",
  weight: ["500", "600", "700"]
});
