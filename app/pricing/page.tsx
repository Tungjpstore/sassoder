import Link from "next/link";
import { ArrowRight, Check, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { Button } from "@/components/ui/button";
import { formatVnd } from "@/lib/money";
import { createSeoMetadata } from "@/lib/seo/metadata";
import { getActivePlans } from "@/services/subscription-service";

export const dynamic = "force-dynamic";

export const metadata = createSeoMetadata({
  title: "Bảng giá LogiVN - Pro, Premium cho quán cafe và nhà hàng",
  description: "So sánh gói LogiVN Pro, Premium và Enterprise cho QR ordering, đặt món online, đặt bàn, AI vận hành và báo cáo.",
  path: "/pricing"
});

export default async function PricingPage() {
  const plans = await getActivePlans();
  const paidPlans = plans.filter((plan) => plan.monthly_price > 0);
  const premium = paidPlans.find((plan) => plan.code === "premium");

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-white/92 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-[min(1120px,calc(100%-32px))] items-center justify-between gap-4">
          <LogiVNLogo className="h-10" priority />
          <nav className="hidden items-center gap-6 text-sm font-semibold text-[var(--muted-foreground)] md:flex">
            <Link href="/">Trang chủ</Link>
            <Link href="/pricing" className="text-[var(--primary)]">Bảng giá</Link>
            <Link href="/dashboard/login">Đăng nhập</Link>
          </nav>
          <Link href="/dashboard/register?plan=pro">
            <Button className="bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]">
              Dùng thử miễn phí
              <ArrowRight size={16} />
            </Button>
          </Link>
        </div>
      </header>

      <section className="mx-auto grid w-[min(1120px,calc(100%-32px))] gap-8 py-12 lg:grid-cols-[0.9fr_1.1fr] lg:py-16">
        <div className="content-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[var(--accent)]">
            <Sparkles size={15} />
            Gói thương mại LogiVN
          </span>
          <h1 className="mt-5 max-w-2xl text-4xl font-semibold tracking-tight md:text-6xl">
            Bắt đầu bằng Pro, nâng cấp Premium khi quán cần tự động hoá sâu hơn.
          </h1>
          <p className="mt-5 max-w-xl text-base font-medium leading-8 text-[var(--muted-foreground)]">
            Mỗi quán được dùng thử 30 ngày. Khi gia hạn hoặc nâng cấp, chủ quán tạo VietQR, LogiVN xác minh thanh toán rồi mở đúng entitlement theo gói.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/dashboard/register?plan=pro">
              <Button className="bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]">
                Tạo quán dùng thử
                <ArrowRight size={16} />
              </Button>
            </Link>
            <Link href="/dashboard/login">
              <Button variant="secondary">Đã có tài khoản</Button>
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-[var(--border)] bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
            {paidPlans.map((plan) => {
              const featured = plan.code === "pro";
              return (
                <article
                  key={plan.id}
                  className={`rounded-2xl border p-5 ${featured ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border)] bg-[var(--soft-surface)]"}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className={`text-xs font-black uppercase tracking-[0.14em] ${featured ? "text-white/70" : "text-[var(--accent)]"}`}>{plan.code}</p>
                      <h2 className="mt-2 text-2xl font-semibold">{plan.name}</h2>
                    </div>
                    {featured ? <span className="rounded-full bg-white/14 px-2.5 py-1 text-xs font-black">Phổ biến</span> : null}
                  </div>
                  <p className={`mt-3 min-h-12 text-sm font-medium leading-6 ${featured ? "text-white/78" : "text-[var(--muted-foreground)]"}`}>{plan.description}</p>
                  <p className="metric-number mt-5 text-3xl font-semibold">
                    {formatVnd(plan.monthly_price)}
                    <span className={`ml-1 text-sm font-semibold ${featured ? "text-white/70" : "text-[var(--muted-foreground)]"}`}>/ tháng</span>
                  </p>
                  <p className={`mt-1 text-sm font-semibold ${featured ? "text-white/72" : "text-[var(--muted-foreground)]"}`}>
                    Dùng thử {plan.trial_days} ngày
                  </p>
                  <ul className="mt-5 grid gap-2">
                    {plan.features.slice(0, 8).map((feature) => (
                      <li key={feature} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${featured ? "bg-white/10" : "bg-white"}`}>
                        <Check size={16} className={featured ? "text-white" : "text-[var(--primary)]"} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link href={`/dashboard/register?plan=${encodeURIComponent(plan.code)}`} className="mt-5 flex">
                    <Button className={featured ? "w-full bg-white text-[var(--primary)] hover:bg-white/90" : "w-full bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]"}>
                      Dùng thử gói này
                    </Button>
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-[min(1120px,calc(100%-32px))] gap-4 pb-14 md:grid-cols-3">
        {[
          ["Trial chống lạm dụng", "Mỗi email/thiết bị/IP chỉ nhận trial hợp lệ một lần, tránh bug khuyến mãi."],
          ["Nâng cấp bằng VietQR", "Chọn gói mới, tạo mã chuyển khoản riêng, chờ LogiVN xác minh."],
          ["Entitlement theo tính năng", "Mỗi API quan trọng đều kiểm tra quyền gói trước khi xử lý."]
        ].map(([title, text]) => (
          <article key={title} className="rounded-2xl border border-[var(--border)] bg-white p-5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--soft-surface)] text-[var(--primary)]">
              {title.includes("VietQR") ? <WalletCards size={18} /> : <ShieldCheck size={18} />}
            </span>
            <h3 className="mt-4 text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-sm font-medium leading-6 text-[var(--muted-foreground)]">{text}</p>
          </article>
        ))}
      </section>

      {premium ? (
        <section className="mx-auto mb-12 flex w-[min(1120px,calc(100%-32px))] flex-wrap items-center justify-between gap-4 rounded-3xl border border-[var(--border)] bg-[var(--primary)] p-6 text-white">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white/70">Premium</p>
            <h2 className="mt-2 text-2xl font-semibold">Cần đặt bàn, nhận cọc, AI OCR menu và báo cáo nâng cao?</h2>
          </div>
          <Link href="/dashboard/register?plan=premium">
            <Button className="bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]">
              Kích hoạt dùng thử
              <ArrowRight size={16} />
            </Button>
          </Link>
        </section>
      ) : null}
    </main>
  );
}
