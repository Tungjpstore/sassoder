"use client";

import Image from "next/image";
import { CheckCircle2, Truck, UserRound } from "lucide-react";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { paymentMethodLabel } from "@/lib/labels";
import { formatVnd } from "@/lib/money";
import type { OrderDto } from "@/types/domain";

function formatTime(value: string | null | undefined) {
  if (!value) return "Chưa cập nhật";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function invoiceCode(orderId: string) {
  return `HD-${orderId.slice(0, 8).toUpperCase()}`;
}

export function RemotePaymentReceipt({
  restaurant,
  order,
  payment
}: {
  restaurant: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    hotline: string | null;
    contactEmail: string | null;
    receiptFooter: string | null;
    receiptShowQr: boolean;
  };
  order: OrderDto;
  payment?: {
    method: "QR" | "CASH";
    amount: number;
    url?: string;
  } | null;
}) {
  const serviceFee = order.serviceFee ?? 0;
  const subtotal = Math.max(
    0,
    (order.subtotal ?? order.total + (order.discountAmount ?? 0)) - (order.deliveryFee ?? 0) - serviceFee
  );
  const discount = order.discountAmount ?? 0;
  const deliveryFee = order.deliveryFee ?? 0;
  const paidAt = order.paidAt ?? order.bill?.paidAt ?? order.updatedAt ?? order.createdAt;
  const paymentLabel = paymentMethodLabel(order.paymentMethod);
  const locationLabel = order.fulfillmentType === "DELIVERY" ? "Giao hàng" : "Đến lấy";

  return (
    <section className="logivn-receipt w-full max-w-full rounded-[22px] p-2.5 sm:rounded-[28px] sm:p-5">
      <div className="receipt-border min-w-0 rounded-[18px] p-3 sm:rounded-[22px] sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="grid content-start gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {restaurant.logoUrl ? (
                <Image src={restaurant.logoUrl} alt={`Logo ${restaurant.name}`} width={96} height={96} className="h-11 w-11 shrink-0 rounded-xl object-cover sm:h-14 sm:w-14 sm:rounded-2xl" />
              ) : (
                <LogiVNLogo className="h-10 shrink-0 sm:h-14" priority />
              )}
              <div className="min-w-0">
                <p className="break-words text-lg font-black leading-tight text-[var(--primary)] sm:text-xl">{restaurant.name}</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)] sm:text-xs sm:tracking-[0.18em]">Smart ordering. Better service.</p>
              </div>
            </div>
            <div className="receipt-info-card grid gap-2 rounded-2xl p-3 text-xs sm:p-4 sm:text-sm">
              <p className="receipt-row"><span>Tên quán</span><strong>{restaurant.name}</strong></p>
              <p className="receipt-row"><span>Địa chỉ</span><strong>{restaurant.address || "Chưa cấu hình"}</strong></p>
              <p className="receipt-row"><span>Hotline</span><strong>{restaurant.hotline || "Chưa cấu hình"}</strong></p>
              <p className="receipt-row"><span>Email</span><strong>{restaurant.contactEmail || "Chưa cấu hình"}</strong></p>
            </div>
          </div>

          <div className="min-w-0">
            <h2 className="text-center text-2xl font-black leading-tight text-[var(--primary)] sm:text-4xl">HÓA ĐƠN ONLINE</h2>
            <div className="receipt-info-card mt-3 grid gap-2 rounded-2xl p-3 text-xs sm:mt-4 sm:p-4 sm:text-sm">
              <p className="receipt-row"><span>Mã hóa đơn</span><strong className="font-mono text-[var(--accent)]">{invoiceCode(order.bill?.id ?? order.id)}</strong></p>
              <p className="receipt-row"><span>Ngày giờ</span><strong>{formatTime(paidAt)}</strong></p>
              <p className="receipt-row"><span>Hình thức</span><strong>{locationLabel}</strong></p>
              <p className="receipt-row"><span>Thanh toán</span><strong>{paymentLabel}</strong></p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:mt-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="grid gap-3">
            <div className="receipt-info-card rounded-2xl p-3 text-sm sm:p-4">
              <p className="text-xs font-black uppercase text-[var(--primary)]">Khách nhận đơn</p>
              <p className="mt-2 flex items-center gap-2 font-black text-[var(--foreground)]">
                <UserRound size={17} />
                {order.customerName || "Khách online"}
              </p>
              <p className="mt-2 font-semibold text-[var(--muted-foreground)]">{order.customerPhone || "Chưa có số điện thoại"}</p>
              {order.fulfillmentType === "DELIVERY" && order.deliveryAddress ? (
                <p className="mt-2 flex items-start gap-2 font-semibold text-[var(--muted-foreground)]">
                  <Truck size={16} className="mt-0.5 shrink-0" />
                  <span>{order.deliveryAddress}</span>
                </p>
              ) : null}
            </div>

            <div className="receipt-info-card rounded-2xl p-3 text-sm sm:p-4">
              <p className="text-xs font-black uppercase text-[var(--primary)]">Thanh toán</p>
              <p className="mt-2 font-black">{paymentLabel}</p>
              <p className="mt-2 flex items-center gap-2 font-bold text-[var(--primary)]"><CheckCircle2 size={17} /> Đã thanh toán</p>
            </div>

            {restaurant.receiptShowQr && payment?.method === "QR" && payment.url ? (
              <div className="receipt-info-card rounded-2xl p-3 text-center sm:p-4">
                <p className="text-xs font-black uppercase text-[var(--primary)]">Mã QR thanh toán</p>
                <Image src={payment.url} alt="QR thanh toán" width={128} height={128} unoptimized className="mx-auto mt-3 h-28 w-28 rounded-xl bg-white p-2 sm:h-32 sm:w-32" />
              </div>
            ) : null}
          </div>

          <div className="receipt-info-card min-w-0 rounded-2xl p-3 sm:p-4">
            <div className="grid gap-3 text-sm">
              <div className="min-w-0 overflow-hidden rounded-2xl border border-[rgba(15,77,58,0.34)]">
                <div className="grid grid-cols-[minmax(0,1fr)_38px_84px] gap-2 bg-[var(--primary)] px-3 py-3 text-[11px] font-black uppercase text-[#FFF7EB] sm:text-xs">
                  <span>Món</span>
                  <span className="text-center">SL</span>
                  <span className="text-right">T.Tiền</span>
                </div>
                <div className="divide-y divide-[rgba(169,197,161,0.45)] bg-white/58">
                  {order.items.map((item, index) => (
                    <div key={`${item.menuItem?.id ?? item.menuItem?.name ?? "item"}-${index}`} className="grid grid-cols-[minmax(0,1fr)_38px_84px] items-start gap-2 px-3 py-3 text-xs sm:text-sm">
                      <span className="min-w-0 break-words font-semibold">{item.menuItem?.name ?? "Món đã gọi"}</span>
                      <span className="text-center font-bold tabular-nums">{item.quantity}</span>
                      <span className="text-right font-bold tabular-nums">{formatVnd(item.quantity * item.price)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="receipt-row"><span>Tạm tính</span><strong>{formatVnd(subtotal)}</strong></p>
              <p className="receipt-row"><span>Giảm giá</span><strong className="text-[var(--accent)]">-{formatVnd(discount)}</strong></p>
              <p className="receipt-row"><span>Phí giao hàng</span><strong>{formatVnd(deliveryFee)}</strong></p>
              {serviceFee > 0 ? <p className="receipt-row"><span>Phí dịch vụ</span><strong>{formatVnd(serviceFee)}</strong></p> : null}
              <p className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-[rgba(242,140,40,0.34)] bg-[#FFF7EB] px-3 py-3 font-black sm:mt-2 sm:px-4">
                <span>TỔNG CỘNG</span>
                <span className="whitespace-nowrap text-xl text-[var(--accent)] sm:text-2xl">{formatVnd(order.total)}</span>
              </p>
            </div>
          </div>
        </div>

        <p className="mt-5 text-center text-sm font-semibold text-[var(--primary)]">
          {restaurant.receiptFooter || "Cảm ơn quý khách đã đặt món cùng LogiVN. Hẹn gặp lại quý khách."}
        </p>
      </div>
    </section>
  );
}
