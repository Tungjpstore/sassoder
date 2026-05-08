"use client";

import { useActionState, useState } from "react";
import { Bike, CreditCard, ExternalLink, Loader2, MapPin, Navigation, Save, ShoppingBag, Sparkles } from "lucide-react";
import { updateOrderingSettingsAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatVnd } from "@/lib/money";
import type { OrderingSettings } from "@/services/delivery-service";

export function OrderingSettingsForm({
  settings,
  onlineUrl,
  compact = false
}: {
  settings: OrderingSettings;
  onlineUrl: string;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateOrderingSettingsAction, undefined);
  const [storeLat, setStoreLat] = useState(settings.store_lat?.toString() ?? "");
  const [storeLng, setStoreLng] = useState(settings.store_lng?.toString() ?? "");
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeMessage, setGeocodeMessage] = useState<string | null>(null);

  async function autofillCoordinates() {
    setGeocoding(true);
    setGeocodeMessage(null);
    try {
      const response = await fetch("/api/admin/restaurant-geocode", {
        method: "POST"
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tự lấy được tọa độ.");
      setStoreLat(String(json.data.lat));
      setStoreLng(String(json.data.lng));
      setGeocodeMessage(`Đã tự điền tọa độ từ địa chỉ quán: ${json.data.address}`);
    } catch (error) {
      setGeocodeMessage(error instanceof Error ? error.message : "Không tự lấy được tọa độ.");
    } finally {
      setGeocoding(false);
    }
  }

  return (
    <form id="online-ordering" action={formAction} className={compact ? "rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4" : "dashboard-panel p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="dashboard-stat-icon shrink-0">
            <ShoppingBag size={18} />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Đặt món online</h2>
            <p className="mt-1 text-sm font-medium leading-6 text-[var(--muted-foreground)]">
              Bật link đặt món cho khách ở xa, khách đến lấy hoặc đơn giao trong bán kính quán tự cấu hình.
            </p>
          </div>
        </div>
        <a
          href={onlineUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--primary)]"
        >
          <ExternalLink size={16} />
          Mở link đặt
        </a>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {[
          ["onlineOrderingEnabled", "Bật đặt món online", settings.online_ordering_enabled],
          ["pickupEnabled", "Cho phép đến lấy", settings.pickup_enabled],
          ["deliveryEnabled", "Cho phép giao hàng", settings.delivery_enabled]
        ].map(([name, label, checked]) => (
          <label key={String(name)} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-4 text-sm font-semibold">
            {label}
            <input type="checkbox" name={String(name)} value="true" defaultChecked={Boolean(checked)} className="h-5 w-5 accent-[var(--accent)]" />
          </label>
        ))}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
            <CreditCard size={16} className="text-[var(--primary)]" />
            Chính sách thanh toán online
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {[
              {
                value: "PAY_AFTER",
                label: "Cho thanh toán sau",
                helper: "Quán nhận đơn trước, khách thanh toán khi nhận món hoặc sau khi dùng xong."
              },
              {
                value: "QR_PREPAID",
                label: "Bắt buộc chuyển khoản",
                helper: "Khách phải chuyển khoản VietQR, quán xác nhận rồi đơn mới vào hàng chờ xử lý."
              }
            ].map((option) => (
              <label key={option.value} className="flex cursor-pointer gap-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-sm">
                <input
                  type="radio"
                  name="onlinePaymentMode"
                  value={option.value}
                  defaultChecked={(settings.online_payment_mode ?? "PAY_AFTER") === option.value}
                  className="mt-1 h-4 w-4 accent-[var(--accent)]"
                />
                <span>
                  <span className="block font-semibold text-[var(--foreground)]">{option.label}</span>
                  <span className="mt-1 block text-xs font-medium leading-5 text-[var(--muted-foreground)]">{option.helper}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <label className="flex min-h-24 items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
          <span>
            <span className="flex items-center gap-2 font-semibold text-[var(--foreground)]">
              <Navigation size={16} className="text-[var(--primary)]" />
              Theo dõi giao hàng realtime
            </span>
            <span className="mt-2 block text-xs font-medium leading-5 text-[var(--muted-foreground)]">
              Lưu tuyến đường Mapbox và hiển thị tiến trình giao cho khách lẫn quán.
            </span>
          </span>
          <input type="checkbox" name="deliveryTrackingEnabled" value="true" defaultChecked={settings.delivery_tracking_enabled} className="mt-1 h-5 w-5 accent-[var(--accent)]" />
        </label>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
        <label className="grid gap-2 text-sm font-semibold">
          Vĩ độ cửa hàng
          <Input name="storeLat" type="number" step="0.000001" value={storeLat} onChange={(event) => setStoreLat(event.target.value)} placeholder="10.775658" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Kinh độ cửa hàng
          <Input name="storeLng" type="number" step="0.000001" value={storeLng} onChange={(event) => setStoreLng(event.target.value)} placeholder="106.700424" />
        </label>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-sm font-medium text-[var(--muted-foreground)]">
          <div className="flex items-center gap-2 font-semibold text-[var(--foreground)]">
            <MapPin size={16} />
            Đo khoảng cách
          </div>
          <p className="mt-1 leading-6">
            Khi có Mapbox API, hệ thống dùng tuyến đường thật và tự định vị địa chỉ. Nếu chưa có API, app vẫn dùng tọa độ cửa hàng và vị trí khách trên trình duyệt.
          </p>
          <button
            type="button"
            onClick={autofillCoordinates}
            disabled={geocoding || !settings.address}
            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {geocoding ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            Tự lấy từ địa chỉ quán
          </button>
          <p className="mt-2 text-xs font-semibold">
            {settings.address ? `Địa chỉ hiện tại: ${settings.address}` : "Hãy cập nhật địa chỉ quán trong Cài đặt trước khi tự lấy tọa độ."}
          </p>
          {geocodeMessage ? <p className="mt-2 text-xs font-semibold text-[var(--primary)]">{geocodeMessage}</p> : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-2 text-sm font-semibold">
          Bán kính nhận đơn
          <Input name="deliveryRadiusKm" type="number" min={0} max={200} step="0.1" defaultValue={settings.delivery_radius_km} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Miễn phí trong
          <Input name="freeDeliveryRadiusKm" type="number" min={0} max={200} step="0.1" defaultValue={settings.free_delivery_radius_km} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Phí ship gốc
          <Input name="deliveryBaseFee" type="number" min={0} step={1000} defaultValue={settings.delivery_base_fee} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Phí mỗi km ngoài vùng free
          <Input name="deliveryFeePerKm" type="number" min={0} step={1000} defaultValue={settings.delivery_fee_per_km} />
        </label>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label className="grid gap-2 text-sm font-semibold">
          Đơn giao tối thiểu
          <Input name="minOrderForDelivery" type="number" min={0} step={1000} defaultValue={settings.min_order_for_delivery} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Thời gian đến lấy
          <Input name="pickupEtaMinutes" type="number" min={1} max={240} defaultValue={settings.pickup_eta_minutes} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Thời gian giao dự kiến
          <Input name="deliveryEtaMinutes" type="number" min={1} max={240} defaultValue={settings.delivery_eta_minutes} />
        </label>
      </div>

      <div className="mt-5 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4 text-sm md:grid-cols-3">
        <div>
          <p className="font-semibold text-[var(--foreground)]">{settings.delivery_radius_km} km</p>
          <p className="mt-1 font-semibold text-[var(--muted-foreground)]">Bán kính nhận giao</p>
        </div>
        <div>
          <p className="font-semibold text-[var(--foreground)]">{formatVnd(settings.delivery_base_fee)} + {formatVnd(settings.delivery_fee_per_km)}/km</p>
          <p className="mt-1 font-semibold text-[var(--muted-foreground)]">Công thức phí ship</p>
        </div>
        <div>
          <p className="font-semibold text-[var(--foreground)]">{settings.pickup_eta_minutes}p / {settings.delivery_eta_minutes}p</p>
          <p className="mt-1 font-semibold text-[var(--muted-foreground)]">ETA đến lấy / giao hàng</p>
        </div>
      </div>

      {state?.error && <p className="mt-4 text-sm font-bold text-[var(--accent-strong)]">{state.error}</p>}
      {state?.success && <p className="mt-4 text-sm font-bold text-[var(--primary-strong)]">{state.success}</p>}

      <Button className="mt-5" disabled={pending}>
        {pending ? <Bike className="animate-pulse" size={16} /> : <Save size={16} />}
        {pending ? "Đang lưu…" : "Lưu cấu hình đặt món online"}
      </Button>
    </form>
  );
}
