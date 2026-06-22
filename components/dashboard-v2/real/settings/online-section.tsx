"use client";

/* OnlineSectionV2 — section "Đặt món online" trong /dashboard/settings.
 *  - V2 token thuần, không hex hard-code.
 *  - Map = hero element (h=380px desktop, h=260px mobile), nằm ngay đầu.
 *  - 3 panel có thứ tự công việc rõ: Bật & link → Vùng & phí → Nâng cao (collapsed).
 *  - Server action giữ 1:1: updateOrderingSettingsAction nhận đầy đủ 38 field name.
 *  - BranchDeliveryControls / MapOperationalMetricsPanel embed thành 2 details
 *    riêng cho người cần — không nhồi vào layout chính.
 */

import { useActionState, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Bike,
  Building2,
  Check,
  Copy,
  ExternalLink,
  Eye,
  LocateFixed,
  MapPin,
  QrCode,
  RotateCcw,
  Save,
  Settings2,
  Truck
} from "lucide-react";
import { updateOrderingSettingsAction } from "@/app/dashboard/actions";
import {
  estimateDeliveryAreaStats,
  makeDefaultDeliveryPolygon,
  type DeliveryAreaPoint
} from "@/components/maps/delivery-area-editor";
import { StoreLocationPicker } from "@/components/maps/store-location-picker";
import { BranchDeliveryControls, MapOperationalMetricsPanel } from "@/components/dashboard-v2/real/settings/adapters/settings-legacy-adapters";
import { useToast } from "@/components/dashboard-v2/adapters/dashboard-shared";
import { Badge, Panel, SwitchControl } from "@/components/dashboard-v2/primitives";
import { Button } from "@/components/dashboard-v2/button";
import { formatVnd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { OrderingSettings } from "@/services/delivery-service";
import type { BranchDeliverySettings } from "@/services/delivery/branch-delivery-settings-service";
import type { getMapOperationalMetrics } from "@/services/map-ops-service";
import type { Json } from "@/types/supabase";

type GeocodingProvider = OrderingSettings["map_geocoding_provider"];
type RoutingProvider = OrderingSettings["map_routing_provider"];
type FeeTier = { id: string; label: string; upToKm: string; fee: string; contact: boolean };
type ExclusionZone = { id: string; name: string; areaKm2: string; polygon: DeliveryAreaPoint[] };

const DEFAULT_FEE_TIERS: FeeTier[] = [
  { id: "under-2", label: "Dưới 2 km", upToKm: "2", fee: "15000", contact: false },
  { id: "2-to-5", label: "Từ 2 km đến 5 km", upToKm: "5", fee: "25000", contact: false },
  { id: "5-to-8", label: "Từ 5 km đến 8 km", upToKm: "8", fee: "35000", contact: false },
  { id: "over-8", label: "Trên 8 km", upToKm: "", fee: "", contact: true }
];

function jsonArr(value: Json | null | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

function pointFromJson(p: Json): DeliveryAreaPoint | null {
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const c = p as { lat?: unknown; lng?: unknown };
  const lat = Number(c.lat);
  const lng = Number(c.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function readPolygon(value: Json | null | undefined, lat: number, lng: number): DeliveryAreaPoint[] {
  const pts = jsonArr(value).map(pointFromJson).filter((p): p is DeliveryAreaPoint => Boolean(p));
  return pts.length >= 3 ? pts : makeDefaultDeliveryPolygon(lat, lng);
}

function readFeeTiers(value: Json | null | undefined): FeeTier[] {
  const list = jsonArr(value)
    .map((t, i) => {
      if (!t || typeof t !== "object" || Array.isArray(t)) return null;
      const c = t as { id?: unknown; label?: unknown; upToKm?: unknown; fee?: unknown; contact?: unknown };
      return {
        id: typeof c.id === "string" && c.id ? c.id : `tier-${i + 1}`,
        label: typeof c.label === "string" && c.label ? c.label : `Mức ${i + 1}`,
        upToKm: c.upToKm == null ? "" : String(c.upToKm),
        fee: c.fee == null ? "" : String(c.fee),
        contact: Boolean(c.contact)
      } as FeeTier;
    })
    .filter((x): x is FeeTier => Boolean(x));
  return list.length ? list : DEFAULT_FEE_TIERS;
}

function readExclusionZones(value: Json | null | undefined): ExclusionZone[] {
  return jsonArr(value)
    .map((z, i) => {
      if (!z || typeof z !== "object" || Array.isArray(z)) return null;
      const c = z as { id?: unknown; name?: unknown; areaKm2?: unknown; polygon?: unknown };
      const polygon = Array.isArray(c.polygon)
        ? (c.polygon as Json[]).map(pointFromJson).filter((p): p is DeliveryAreaPoint => Boolean(p))
        : [];
      return {
        id: typeof c.id === "string" && c.id ? c.id : `zone-${i + 1}`,
        name: typeof c.name === "string" ? c.name : "",
        areaKm2: c.areaKm2 == null ? "0" : String(c.areaKm2),
        polygon
      } as ExclusionZone;
    })
    .filter((x): x is ExclusionZone => x !== null && x.name.trim().length > 0);
}

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

type Props = {
  settings: OrderingSettings;
  onlineUrl: string;
  branchDeliverySettings: BranchDeliverySettings[];
  mapOperationalMetrics: Awaited<ReturnType<typeof getMapOperationalMetrics>> | null;
};

export function OnlineSectionV2({ settings, onlineUrl, branchDeliverySettings, mapOperationalMetrics }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState(updateOrderingSettingsAction, undefined);
  const refreshedSuccessRef = useRef<string | null>(null);
  const reportedErrorRef = useRef<string | null>(null);

  const initialLat = Number(settings.store_lat ?? 10.7769);
  const initialLng = Number(settings.store_lng ?? 106.7009);
  const [storeLat, setStoreLat] = useState(settings.store_lat?.toString() ?? "");
  const [storeLng, setStoreLng] = useState(settings.store_lng?.toString() ?? "");
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(settings.address ?? null);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeMessage, setGeocodeMessage] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [mapGeocodingProvider, setMapGeocodingProvider] = useState<GeocodingProvider>(settings.map_geocoding_provider ?? "goong");
  const [mapRoutingProvider, setMapRoutingProvider] = useState<RoutingProvider>(settings.map_routing_provider ?? "goong");
  const [feeTiers, setFeeTiers] = useState<FeeTier[]>(() => readFeeTiers(settings.delivery_fee_tiers));
  const [exclusionZones, setExclusionZones] = useState<ExclusionZone[]>(() => readExclusionZones(settings.delivery_exclusion_zones));
  const [deliveryPolygon, setDeliveryPolygon] = useState<DeliveryAreaPoint[]>(() => readPolygon(settings.delivery_area_polygon, initialLat, initialLng));

  const centerLat = Number(storeLat) || initialLat;
  const centerLng = Number(storeLng) || initialLng;
  const center = useMemo(() => ({ lat: centerLat, lng: centerLng }), [centerLat, centerLng]);
  const areaStats = useMemo(() => estimateDeliveryAreaStats(deliveryPolygon, center), [deliveryPolygon, center]);
  const pinned = Number.isFinite(centerLat) && Number.isFinite(centerLng) && Math.abs(centerLat) > 0.1;

  const serializedFeeTiers = JSON.stringify(
    feeTiers.map((t) => ({
      id: t.id,
      label: t.label.trim(),
      upToKm: t.upToKm === "" ? null : Number(t.upToKm),
      fee: t.fee === "" ? null : Number(t.fee),
      contact: t.contact
    }))
  );
  const serializedExclusions = JSON.stringify(
    exclusionZones
      .filter((z) => z.name.trim().length > 0)
      .map((z) => ({ id: z.id, name: z.name.trim(), areaKm2: Number(z.areaKm2) || 0, polygon: z.polygon }))
  );

  async function autofillFromAddress() {
    setGeocoding(true);
    setGeocodeMessage(null);
    try {
      const res = await fetch("/api/admin/restaurant-geocode", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Không tự lấy được tọa độ.");
      setStoreLat(String(json.data.lat));
      setStoreLng(String(json.data.lng));
      setResolvedAddress(json.data.address);
      setGeocodeMessage(`Đã ghim từ địa chỉ: ${json.data.address}`);
    } catch (e) {
      setGeocodeMessage(e instanceof Error ? e.message : "Không tự lấy được tọa độ.");
    } finally {
      setGeocoding(false);
    }
  }

  function useGps() {
    if (!navigator.geolocation) {
      setGeocodeMessage("Trình duyệt không hỗ trợ GPS.");
      return;
    }
    setGeocodeMessage(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setStoreLat(p.coords.latitude.toFixed(6));
        setStoreLng(p.coords.longitude.toFixed(6));
        setGeocodeMessage("Đã cập nhật vị trí thiết bị hiện tại.");
      },
      () => setGeocodeMessage("Không lấy được GPS. Cấp quyền vị trí cho trình duyệt."),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(onlineUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      /* fallback: user copy thủ công */
    }
  }

  useEffect(() => {
    if (!state?.success || refreshedSuccessRef.current === state.success) return;
    refreshedSuccessRef.current = state.success;
    toast.success({
      title: "Đã lưu cấu hình online",
      message: "Trang đặt món, phí giao hàng và trạng thái nhận đơn đã được đồng bộ."
    });
    router.refresh();
  }, [router, state?.success, toast]);

  useEffect(() => {
    if (!state?.error || reportedErrorRef.current === state.error) return;
    reportedErrorRef.current = state.error;
    toast.error({
      title: "Không lưu được cấu hình online",
      message: state.error
    });
  }, [state?.error, toast]);

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <form action={formAction} className="flex flex-col gap-[var(--d-s-4)]">
      {/* Hidden inputs giữ contract backend */}
      <input type="hidden" name="address" value={resolvedAddress ?? settings.address ?? ""} readOnly />
      <input type="hidden" name="storeLat" value={storeLat} readOnly />
      <input type="hidden" name="storeLng" value={storeLng} readOnly />
      <input type="hidden" name="deliveryFeeTiers" value={serializedFeeTiers} readOnly />
      <input type="hidden" name="deliveryAreaPolygon" value={JSON.stringify(deliveryPolygon)} readOnly />
      <input type="hidden" name="deliveryExclusionZones" value={serializedExclusions} readOnly />

      {state?.error ? (
        <div className="flex items-start gap-2 rounded-[var(--d-r-md)] border border-[var(--d-danger-fg)]/30 bg-[var(--d-danger-bg)] px-[var(--d-s-4)] py-2.5 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-danger-fg)]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}
      {state?.success ? (
        <div className="flex items-start gap-2 rounded-[var(--d-r-md)] border border-[var(--d-jade)]/30 bg-[var(--d-primary-soft)] px-[var(--d-s-4)] py-2.5 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-primary)]">
          <Check size={15} className="mt-0.5 shrink-0" />
          <span>{state.success}</span>
        </div>
      ) : null}

      {/* HERO MAP — chiếm trọn phần đầu */}
      <Panel className="overflow-hidden p-0">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--d-line)] px-[var(--d-s-5)] py-[var(--d-s-4)]">
          <div className="min-w-0">
            <p className="d-eyebrow text-[var(--d-orange-600)]">Vị trí quán</p>
            <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Ghim trên bản đồ</h3>
            <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Khách dùng vị trí này để tính khoảng cách, ETA và phí ship.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={pinned ? "ok" : "orange"}>
              <MapPin size={11} className="mr-1 inline" />
              {pinned ? "Đã ghim" : "Chưa ghim"}
            </Badge>
            <Button type="button" variant="secondary" size="sm" onClick={() => void autofillFromAddress()} disabled={geocoding}>
              {geocoding ? "Đang lấy…" : <><RotateCcw size={13} /> Lấy từ địa chỉ</>}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={useGps}>
              <LocateFixed size={13} /> Dùng GPS
            </Button>
          </div>
        </header>

        <div className="relative h-[260px] sm:h-[340px] xl:h-[420px]">
          <StoreLocationPicker
            seedAddress={settings.address ?? ""}
            latitude={storeLat}
            longitude={storeLng}
            onLatitudeChange={(value) => setStoreLat(value)}
            onLongitudeChange={(value) => setStoreLng(value)}
            onResolvedAddress={(value) => setResolvedAddress(value)}
            compact
          />
        </div>

        {(geocodeMessage || (resolvedAddress && resolvedAddress !== settings.address)) ? (
          <div className="border-t border-[var(--d-line)] bg-[var(--d-surface-2)] px-[var(--d-s-5)] py-2.5">
            <p className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">
              {geocodeMessage ?? `Địa chỉ mới: ${resolvedAddress}`}
            </p>
          </div>
        ) : null}
      </Panel>

      {/* PANEL 1 — Bật & Link */}
      <Panel className="p-[var(--d-s-5)]">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="d-eyebrow">Trạng thái bán online</p>
            <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Bật, link &amp; QR chia sẻ</h3>
            <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Tắt ở đây = link public dừng nhận đơn từ xa.</p>
          </div>
        </header>

        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <ToggleCard name="onlineOrderingEnabled" defaultChecked={settings.online_ordering_enabled ?? false} icon={<Bike size={16} />} label="Nhận đặt online" hint="Công tắc tổng cho kênh online." />
          <ToggleCard name="pickupEnabled" defaultChecked={settings.pickup_enabled ?? true} icon={<Building2 size={16} />} label="Khách đến lấy" hint="Pickup tại quán theo ETA." />
          <ToggleCard name="deliveryEnabled" defaultChecked={settings.delivery_enabled ?? false} icon={<Truck size={16} />} label="Giao hàng" hint="Cần ghim toạ độ để tính phí." />
          <ToggleCard name="deliveryTrackingEnabled" defaultChecked={settings.delivery_tracking_enabled ?? false} icon={<MapPin size={16} />} label="Tracking realtime" hint="Hiện vị trí/ETA cho khách." />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <Field label="Luồng thanh toán online">
            <select
              name="onlinePaymentMode"
              defaultValue={settings.online_payment_mode ?? "PAY_AFTER"}
              className="h-10 w-full rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold outline-none focus:border-[var(--d-jade)]"
            >
              <option value="PAY_AFTER">Thanh toán sau / khi nhận hàng</option>
              <option value="QR_PREPAID">Bắt buộc VietQR trước khi nhận đơn</option>
            </select>
          </Field>

          <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-3)]">
            <p className="d-eyebrow">Link đặt online</p>
            <code className="mt-2 block overflow-x-auto rounded-[var(--d-r-sm)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-[length:var(--d-fs-xs)] font-mono font-bold text-[var(--d-text)]">
              {onlineUrl}
            </code>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={copyLink}>
                <Copy size={13} /> {linkCopied ? "Đã sao chép" : "Sao chép link"}
              </Button>
              <a
                href={onlineUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-primary)] transition hover:border-[var(--d-jade)]"
              >
                <ExternalLink size={13} /> Mở trang khách
              </a>
              <a
                href={`/api/admin/online-qr`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-primary)] transition hover:border-[var(--d-jade)]"
              >
                <QrCode size={13} /> Tải QR
              </a>
            </div>
          </div>
        </div>
      </Panel>

      {/* PANEL 2 — Vùng giao & phí */}
      <Panel className="p-[var(--d-s-5)]">
        <header>
          <p className="d-eyebrow">Vùng giao &amp; phí ship</p>
          <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Bán kính, ETA và bậc phí</h3>
          <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Áp dụng khi bật giao hàng. Bậc phí gửi cùng JSON về backend.</p>
        </header>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Bán kính nhận đơn (km)">
            <input name="deliveryRadiusKm" type="number" min={0} max={200} step="0.1" defaultValue={settings.delivery_radius_km ?? 5} className={inputCls} />
          </Field>
          <Field label="Miễn phí ship (km)">
            <input name="freeDeliveryRadiusKm" type="number" min={0} max={200} step="0.1" defaultValue={settings.free_delivery_radius_km ?? 1} className={inputCls} />
          </Field>
          <Field label="Phí cơ bản (₫)">
            <input name="deliveryBaseFee" type="number" min={0} step={1000} defaultValue={settings.delivery_base_fee ?? 15000} className={inputCls} />
          </Field>
          <Field label="Phí mỗi km (₫)">
            <input name="deliveryFeePerKm" type="number" min={0} step={1000} defaultValue={settings.delivery_fee_per_km ?? 5000} className={inputCls} />
          </Field>
          <Field label="Đơn tối thiểu để giao (₫)">
            <input name="minOrderForDelivery" type="number" min={0} step={1000} defaultValue={settings.min_order_for_delivery ?? 0} className={inputCls} />
          </Field>
          <Field label="ETA pickup (phút)">
            <input name="pickupEtaMinutes" type="number" min={1} max={240} defaultValue={settings.pickup_eta_minutes ?? 15} className={inputCls} />
          </Field>
          <Field label="ETA giao hàng (phút)">
            <input name="deliveryEtaMinutes" type="number" min={1} max={240} defaultValue={settings.delivery_eta_minutes ?? 30} className={inputCls} />
          </Field>
          <Field label="Chế độ vùng giao">
            <select name="deliveryAreaMode" defaultValue={settings.delivery_area_mode ?? "RADIUS"} className={selectCls}>
              <option value="RADIUS">Bán kính tròn</option>
              <option value="CUSTOM">Vùng tuỳ chỉnh</option>
            </select>
          </Field>
        </div>

        <div className="mt-4 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-3)]">
          <div className="flex items-center justify-between">
            <p className="d-eyebrow">Bậc phí theo khoảng cách</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFeeTiers((prev) => [...prev, { id: nextId("tier"), label: `Mức ${prev.length + 1}`, upToKm: "", fee: "", contact: false }])}
            >
              + Thêm bậc
            </Button>
          </div>
          <div className="mt-2 grid gap-2">
            {feeTiers.map((tier) => (
              <div key={tier.id} className="grid gap-2 rounded-[var(--d-r-sm)] border border-[var(--d-line)] bg-[var(--d-surface)] p-2 sm:grid-cols-[1.2fr_0.7fr_0.9fr_auto_auto]">
                <input
                  value={tier.label}
                  onChange={(e) => setFeeTiers((p) => p.map((t) => (t.id === tier.id ? { ...t, label: e.target.value } : t)))}
                  placeholder="Tên bậc"
                  className={inputCls + " text-[length:var(--d-fs-xs)]"}
                />
                <input
                  type="number"
                  inputMode="decimal"
                  value={tier.upToKm}
                  onChange={(e) => setFeeTiers((p) => p.map((t) => (t.id === tier.id ? { ...t, upToKm: e.target.value } : t)))}
                  placeholder="Đến km"
                  className={inputCls + " text-[length:var(--d-fs-xs)]"}
                  disabled={tier.contact}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  value={tier.fee}
                  onChange={(e) => setFeeTiers((p) => p.map((t) => (t.id === tier.id ? { ...t, fee: e.target.value } : t)))}
                  placeholder="Phí ₫"
                  className={inputCls + " text-[length:var(--d-fs-xs)]"}
                  disabled={tier.contact}
                />
                <label className="flex items-center gap-1.5 px-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">
                  <input
                    type="checkbox"
                    checked={tier.contact}
                    onChange={(e) => setFeeTiers((p) => p.map((t) => (t.id === tier.id ? { ...t, contact: e.target.checked } : t)))}
                    className="h-3.5 w-3.5 accent-[var(--d-orange)]"
                  />
                  Liên hệ
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFeeTiers((p) => p.filter((t) => t.id !== tier.id))}
                  disabled={feeTiers.length <= 1}
                >
                  Xoá
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {/* PANEL 3 — Nâng cao (collapsed mặc định) */}
      <details
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen((e.currentTarget as HTMLDetailsElement).open)}
        className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]"
      >
        <summary className="flex cursor-pointer items-center justify-between gap-3 list-none px-[var(--d-s-5)] py-[var(--d-s-4)]">
          <div>
            <p className="d-eyebrow">Tuỳ chọn nâng cao</p>
            <h3 className="mt-0.5 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Provider, hiển thị, vùng cấm, phí dịch vụ</h3>
            <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Mở khi cần đổi provider map hoặc chỉnh phí dịch vụ.</p>
          </div>
          <span className="grid h-8 w-8 place-items-center rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] text-[var(--d-text-muted)]">
            <Settings2 size={14} />
          </span>
        </summary>

        <div className="grid gap-4 border-t border-[var(--d-line)] px-[var(--d-s-5)] py-[var(--d-s-4)]">
          {/* Provider & hiển thị bản đồ */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Provider geocoding">
              <select name="mapGeocodingProvider" value={mapGeocodingProvider} onChange={(e) => setMapGeocodingProvider(e.target.value as GeocodingProvider)} className={selectCls}>
                <option value="goong">Goong.io</option>
                <option value="mapbox">Mapbox</option>
                <option value="vietmap">Vietmap</option>
                <option value="nominatim">Nominatim</option>
              </select>
            </Field>
            <Field label="Provider routing">
              <select name="mapRoutingProvider" value={mapRoutingProvider} onChange={(e) => setMapRoutingProvider(e.target.value as RoutingProvider)} className={selectCls}>
                <option value="goong">Goong.io</option>
                <option value="mapbox">Mapbox</option>
                <option value="vietmap">Vietmap</option>
                <option value="osrm">OSRM</option>
              </select>
            </Field>
            <Field label="Zoom mặc định (8-18)">
              <input name="mapDefaultZoom" type="number" min={8} max={18} defaultValue={settings.map_default_zoom ?? 14} className={inputCls} />
            </Field>
            <Field label="Style hiển thị">
              <select name="mapDisplayStyle" defaultValue={settings.map_display_style ?? "LIGHT"} className={selectCls}>
                <option value="LIGHT">Sáng</option>
                <option value="DARK">Tối</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <ToggleCard name="showStoreMarkerOnOrdering" defaultChecked={settings.show_store_marker_on_ordering ?? true} icon={<MapPin size={15} />} label="Hiện marker quán" hint="Trên trang khách." />
            <ToggleCard name="showCustomerDistance" defaultChecked={settings.show_customer_distance ?? true} icon={<Eye size={15} />} label="Hiện khoảng cách" hint="Khách thấy số km tới quán." />
            <ToggleCard name="showDeliveryEta" defaultChecked={settings.show_delivery_eta ?? true} icon={<Eye size={15} />} label="Hiện ETA giao hàng" />
            <ToggleCard name="allowOutsideDeliveryArea" defaultChecked={settings.allow_outside_delivery_area ?? false} icon={<Truck size={15} />} label="Cho phép ngoài vùng" hint="Có cảnh báo." />
            <ToggleCard name="requireOutsideAreaConfirmation" defaultChecked={settings.require_outside_area_confirmation ?? true} icon={<AlertTriangle size={15} />} label="Yêu cầu xác nhận" />
            <ToggleCard name="autoSuggestNearestBranch" defaultChecked={settings.auto_suggest_nearest_branch ?? true} icon={<Building2 size={15} />} label="Gợi ý chi nhánh gần nhất" />
          </div>

          {/* Vùng cấm */}
          <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-3)]">
            <div className="flex items-center justify-between">
              <p className="d-eyebrow">Vùng cấm giao hàng</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setExclusionZones((p) => [...p, { id: nextId("zone"), name: "", areaKm2: "0", polygon: [] }])}
              >
                + Thêm vùng
              </Button>
            </div>
            {exclusionZones.length === 0 ? (
              <p className="mt-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Chưa có vùng cấm. Thêm khi muốn loại trừ một số khu vực khỏi giao hàng.</p>
            ) : (
              <div className="mt-2 grid gap-2">
                {exclusionZones.map((zone) => (
                  <div key={zone.id} className="grid gap-2 rounded-[var(--d-r-sm)] border border-[var(--d-line)] bg-[var(--d-surface)] p-2 sm:grid-cols-[1.4fr_0.8fr_auto]">
                    <input
                      value={zone.name}
                      placeholder="Tên vùng cấm"
                      onChange={(e) => setExclusionZones((p) => p.map((z) => (z.id === zone.id ? { ...z, name: e.target.value } : z)))}
                      className={inputCls + " text-[length:var(--d-fs-xs)]"}
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={zone.areaKm2}
                      placeholder="Diện tích km²"
                      onChange={(e) => setExclusionZones((p) => p.map((z) => (z.id === zone.id ? { ...z, areaKm2: e.target.value } : z)))}
                      className={inputCls + " text-[length:var(--d-fs-xs)]"}
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => setExclusionZones((p) => p.filter((z) => z.id !== zone.id))}>Xoá</Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Phí dịch vụ + meta vùng giao */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Tên vùng giao (hiển thị)"><input name="deliveryAreaName" defaultValue={settings.delivery_area_name ?? ""} className={inputCls} /></Field>
            <Field label="Số phường/xã ước lượng"><input name="deliveryAreaWardCount" type="number" min={0} defaultValue={settings.delivery_area_ward_count ?? 0} className={inputCls} /></Field>
            <Field label="Loại phí dịch vụ"><select name="serviceFeeType" defaultValue={settings.service_fee_type ?? "ORDER_PERCENT"} className={selectCls}><option value="ORDER_PERCENT">% theo đơn</option></select></Field>
            <Field label="Phí dịch vụ (%)"><input name="serviceFeePercent" type="number" min={0} max={100} step="0.1" defaultValue={settings.service_fee_percent ?? 0} className={inputCls} /></Field>
            <Field label="Phí dịch vụ tối thiểu (₫)"><input name="serviceFeeMin" type="number" min={0} step={1000} defaultValue={settings.service_fee_min ?? 0} className={inputCls} /></Field>
            <Field label="Phí dịch vụ tối đa (₫)"><input name="serviceFeeMax" type="number" min={0} step={1000} defaultValue={settings.service_fee_max ?? ""} className={inputCls} /></Field>
            <Field label="Ghi chú vùng giao" full><input name="deliveryAreaNote" defaultValue={settings.delivery_area_note ?? ""} placeholder="Ghi chú nội bộ" className={inputCls} /></Field>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <ToggleCard name="deliveryFeeEnabled" defaultChecked={settings.delivery_fee_enabled ?? true} icon={<Truck size={15} />} label="Bật phí ship" hint="Tắt = miễn phí toàn bộ." />
            <ToggleCard name="serviceFeeEnabled" defaultChecked={settings.service_fee_enabled ?? false} icon={<Save size={15} />} label="Bật phí dịch vụ" />
          </div>

          {areaStats ? (
            <div className="grid gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-3)] sm:grid-cols-3">
              <Stat label="Bán kính tối đa" value={`${areaStats.maxDistanceKm.toFixed(1)} km`} />
              <Stat label="Diện tích vùng" value={`${areaStats.areaKm2.toFixed(1)} km²`} />
              <Stat label="Số đỉnh polygon" value={String(deliveryPolygon.length)} />
            </div>
          ) : null}
        </div>
      </details>

      {/* Sticky save bar */}
      <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] px-[var(--d-s-4)] py-[var(--d-s-3)] shadow-[var(--d-sh-md)]">
        <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          {pinned ? "Đã ghim toạ độ — sẵn sàng lưu." : "Chưa ghim toạ độ — backend sẽ vẫn lưu nhưng khách không tính được khoảng cách."}
        </p>
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          <Save size={15} /> {pending ? "Đang lưu…" : "Lưu cấu hình online"}
          <ArrowRight size={14} />
        </Button>
      </div>

      </form>

      {/* Embed sub-tools — chỉ mở khi cần */}
      <details className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]">
        <summary className="flex cursor-pointer items-center justify-between gap-3 list-none px-[var(--d-s-5)] py-[var(--d-s-4)]">
          <div>
            <p className="d-eyebrow">Theo chi nhánh</p>
            <h3 className="mt-0.5 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Bật / tắt nhận đơn theo chi nhánh</h3>
          </div>
          <Badge tone="neutral">{branchDeliverySettings.length} chi nhánh</Badge>
        </summary>
        <div className="border-t border-[var(--d-line)] px-[var(--d-s-5)] py-[var(--d-s-4)]">
          <BranchDeliveryControls branches={branchDeliverySettings} />
        </div>
      </details>

      {mapOperationalMetrics ? (
        <details className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]">
          <summary className="flex cursor-pointer items-center justify-between gap-3 list-none px-[var(--d-s-5)] py-[var(--d-s-4)]">
            <div>
              <p className="d-eyebrow">Sức khoẻ map</p>
              <h3 className="mt-0.5 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Vận hành map &amp; ETA 24h</h3>
            </div>
          </summary>
          <div className="border-t border-[var(--d-line)] px-[var(--d-s-5)] py-[var(--d-s-4)]">
            <MapOperationalMetricsPanel metrics={mapOperationalMetrics} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

const inputCls = "h-10 w-full rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none transition focus:border-[var(--d-jade)] focus:ring-2 focus:ring-[var(--d-jade)]/20";
const selectCls = inputCls + " font-semibold appearance-none";

function Field({ label, children, full, hint }: { label: string; children: ReactNode; full?: boolean; hint?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5", full && "sm:col-span-2 xl:col-span-4")}>
      <span className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</span>
      {children}
      {hint ? <span className="text-[length:var(--d-fs-2xs)] font-semibold text-[var(--d-text-faint)]">{hint}</span> : null}
    </label>
  );
}

function ToggleCard({
  name,
  label,
  hint,
  defaultChecked,
  icon
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked: boolean;
  icon?: ReactNode;
}) {
  return (
    <label className="flex min-h-[68px] cursor-pointer items-start gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3 transition hover:border-[var(--d-line-strong)]">
      {icon ? <span className="grid h-9 w-9 flex-none place-items-center rounded-[var(--d-r-md)] bg-[var(--d-primary-soft)] text-[var(--d-primary)]">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{label}</span>
        {hint ? <span className="mt-0.5 block text-[length:var(--d-fs-xs)] leading-5 text-[var(--d-text-muted)]">{hint}</span> : null}
      </span>
      <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-[var(--d-r-sm)] border border-[var(--d-line)] bg-[var(--d-surface-2)]">
        <input type="hidden" name={name} value="false" />
        <input type="checkbox" name={name} value="true" defaultChecked={defaultChecked} className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        <Check className="scale-90 text-[var(--d-jade)] opacity-0 transition peer-checked:opacity-100" size={18} />
      </span>
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--d-r-sm)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
      <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</p>
      <p className="d-num mt-1 text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{value}</p>
    </div>
  );
}

// Imports kept; helper SwitchControl from primitives intentionally unused here for clarity.
void SwitchControl;
