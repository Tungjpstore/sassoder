"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Menu, X } from "lucide-react";
import { ButtonV2 } from "@/components/ui-v2/button-v2";
import { Container } from "@/components/ui-v2/primitives";

const nav = [
  { label: "Tính năng", href: "#features" },
  { label: "Cách dùng", href: "#how" },
  { label: "Bảng giá", href: "#pricing" },
  { label: "Câu hỏi", href: "#faq" }
];

export function LandingHeader({ logoUrl, label }: { logoUrl: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={[
        "sticky top-0 z-[var(--z-sticky,200)] transition-colors duration-[var(--dur)]",
        scrolled ? "border-b border-[var(--line)] bg-[var(--bg)]/85 backdrop-blur-md" : "border-b border-transparent"
      ].join(" ")}
    >
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label={label} className="inline-flex items-center">
          <Image src={logoUrl} alt={label} width={132} height={34} priority style={{ height: "auto", width: "auto" }} className="h-8 w-auto object-contain" />
        </Link>

        <nav aria-label="Điều hướng" className="hidden items-center gap-1 lg:flex">
          {nav.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="inline-flex h-10 items-center rounded-[var(--r-pill)] px-3.5 text-[length:var(--fs-sm)] font-semibold text-[var(--text-muted)] transition hover:bg-[var(--primary-soft)] hover:text-[var(--jade)]"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <ButtonV2 as="link" href="/dashboard/login" variant="ghost" size="md">
            Đăng nhập
          </ButtonV2>
          <ButtonV2 as="link" href="/dashboard/register?plan=pro" variant="primary" size="md">
            Dùng thử
            <ArrowRight size={14} />
          </ButtonV2>
        </div>

        <button
          type="button"
          aria-label={open ? "Đóng menu" : "Mở menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid h-11 w-11 place-items-center rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text)] lg:hidden"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </Container>

      {open ? (
        <div className="border-t border-[var(--line)] bg-[var(--surface)] lg:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {nav.map((n) => (
              <a
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="rounded-[var(--r-md)] px-3 py-3 text-[length:var(--fs-body)] font-semibold text-[var(--text)] hover:bg-[var(--primary-soft)]"
              >
                {n.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2">
              <ButtonV2 as="link" href="/dashboard/login" variant="secondary" size="lg" className="w-full">
                Đăng nhập
              </ButtonV2>
              <ButtonV2 as="link" href="/dashboard/register?plan=pro" variant="primary" size="lg" className="w-full">
                Tạo quán dùng thử
                <ArrowRight size={16} />
              </ButtonV2>
            </div>
          </Container>
        </div>
      ) : null}
    </header>
  );
}

const footerColumns: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Sản phẩm",
    links: [
      { label: "Gọi món QR", href: "#features" },
      { label: "Thanh toán VietQR", href: "#features" },
      { label: "Quản lý kho", href: "#capabilities" },
      { label: "Trợ lý AI", href: "#capabilities" },
      { label: "Báo cáo & analytics", href: "#capabilities" }
    ]
  },
  {
    title: "Công ty",
    links: [
      { label: "Bảng giá", href: "/pricing" },
      { label: "Giải pháp F&B", href: "/giai-phap" },
      { label: "Demo vận hành", href: "/demo" },
      { label: "Blog & cẩm nang", href: "/blog" }
    ]
  },
  {
    title: "Hỗ trợ",
    links: [
      { label: "Câu hỏi thường gặp", href: "#faq" },
      { label: "Hướng dẫn triển khai", href: "#how" },
      { label: "Đăng nhập", href: "/dashboard/login" },
      { label: "Tạo quán mới", href: "/dashboard/register?plan=pro" }
    ]
  }
];

export function LandingFooter({ logoUrl, label }: { logoUrl: string; label: string }) {
  return (
    <footer className="relative border-t border-[var(--line)] bg-[var(--surface)]">
      {/* top accent hairline */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--jade)]/30 to-transparent" />

      <Container className="grid gap-[var(--s-12)] py-[var(--s-20)] lg:grid-cols-[1.4fr_2fr]">
        {/* Brand block */}
        <div className="flex flex-col gap-[var(--s-5)]">
          <Image src={logoUrl} alt={label} width={132} height={34} style={{ height: "auto", width: "auto" }} className="h-8 w-auto object-contain" />
          <p className="max-w-xs text-[length:var(--fs-sm)] leading-[var(--lh-body)] text-[var(--text-muted)]">
            Nền tảng vận hành F&amp;B cho quán Việt: gọi món QR, thanh toán VietQR, kho, nhân sự và trợ lý AI trong một bảng quản lý duy nhất.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-[var(--r-pill)] bg-[var(--primary-soft)] px-3 py-1.5 text-[length:var(--fs-xs)] font-semibold text-[var(--jade)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok-fg)]" />
              5.000+ quán đang dùng
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-[var(--r-pill)] bg-[var(--accent-soft)] px-3 py-1.5 text-[length:var(--fs-xs)] font-semibold text-[var(--orange-600)]">
              Made in Vietnam 🇻🇳
            </span>
          </div>
        </div>

        {/* Link columns */}
        <div className="grid grid-cols-2 gap-[var(--s-8)] sm:grid-cols-3">
          {footerColumns.map((col) => (
            <nav key={col.title} aria-label={col.title} className="flex flex-col gap-[var(--s-4)]">
              <span className="text-[length:var(--fs-xs)] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-faint)]">
                {col.title}
              </span>
              <ul className="flex flex-col gap-[var(--s-3)]">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-[length:var(--fs-sm)] text-[var(--text-muted)] transition-colors hover:text-[var(--jade)]"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </Container>

      {/* Legal bar */}
      <div className="border-t border-[var(--line)] bg-[var(--surface-2)]/60">
        <Container className="flex flex-col items-center justify-between gap-3 py-[var(--s-6)] md:flex-row">
          <span className="text-[length:var(--fs-xs)] text-[var(--text-faint)]">
            © {new Date().getFullYear()} {label}. Mọi quyền được bảo lưu.
          </span>
          <nav aria-label="Pháp lý" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[length:var(--fs-xs)] font-medium text-[var(--text-muted)]">
            <Link href="/terms" className="hover:text-[var(--jade)]">Điều khoản</Link>
            <Link href="/privacy" className="hover:text-[var(--jade)]">Bảo mật</Link>
            <Link href="/contact" className="hover:text-[var(--jade)]">Liên hệ</Link>
          </nav>
        </Container>
      </div>
    </footer>
  );
}
