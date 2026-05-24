import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

type LogiVNLogoProps = {
  href?: string;
  className?: string;
  priority?: boolean;
  label?: string;
};

export function LogiVNLogo({ href, className, priority = false, label = "LogiVN" }: LogiVNLogoProps) {
  const logo = (
    <Image
      src="/brand/logivn/logo-horizontal-nav.png"
      alt={label}
      width={154}
      height={40}
      priority={priority}
      className={cn("h-auto w-auto object-contain", className)}
    />
  );

  if (!href) return logo;

  return (
    <Link href={href} aria-label={label} className="inline-flex min-h-12 shrink-0 items-center">
      {logo}
    </Link>
  );
}
