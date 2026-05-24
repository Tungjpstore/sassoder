"use client";

import { useActionState, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  Bell,
  Bot,
  Building2,
  Copy,
  Crown,
  Download,
  Eye,
  ExternalLink,
  HelpCircle,
  Info,
  LocateFixed,
  MapPin,
  Pencil,
  Plus,
  QrCode,
  RotateCcw,
  Save,
  Store,
  Trash2,
  Truck
} from "lucide-react";
import { updateOrderingSettingsAction } from "@/app/dashboard/actions";
import {
  estimateDeliveryAreaStats,
  makeDefaultDeliveryPolygon,
  type DeliveryAreaPoint
} from "@/components/maps/delivery-area-editor";
import { DeliveryZoneMapEditor } from "@/components/maps/delivery-zone-map-editor";
import { StoreLocationPicker } from "@/components/maps/store-location-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatVnd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { OrderingSettings } from "@/services/delivery-service";
import type { Json } from "@/types/supabase";

type FeeTierForm = {
  id: string;
  label: string;
  upToKm: string;
  fee: string;
  contact: boolean;
};

type ExclusionZoneForm = {
  id: string;
  name: string;
  areaKm2: string;
  polygon: DeliveryAreaPoint[];
};

type GeocodingProvider = OrderingSettings["map_geocoding_provider"];
type RoutingProvider = OrderingSettings["map_routing_provider"];

const tabs = [
  { id: "publish", label: "1. Bật online & QR", target: "online-publish-card" },
  { id: "location", label: "2. Ghim vị trí", target: "map-location-card" },
  { id: "advanced", label: "Tuỳ chọn nâng cao", target: "advanced-delivery-settings" },
  { id: "save", label: "Lưu cấu hình", target: "save-settings-bar" }
];

const defaultFeeTiers: FeeTierForm[] = [
  { id: "under-2", label: "Dưới 2 km", upToKm: "2", fee: "15000", contact: false },
  { id: "2-to-5", label: "Từ 2 km đến 5 km", upToKm: "5", fee: "25000", contact: false },
  { id: "5-to-8", label: "Từ 5 km đến 8 km", upToKm: "8", fee: "35000", contact: false },
  { id: "over-8", label: "Trên 8 km", upToKm: "", fee: "", contact: true }
];

function jsonArray(value: Json | null | undefined) {
  return Array.isArray(value) ? value : [];
}

function pointFromJson(point: Json): DeliveryAreaPoint | null {
  if (!point || typeof point !== "object" || Array.isArray(point)) return null;
  const candidate = point as { lat?: unknown; lng?: unknown };
  const lat = Number(candidate.lat);
  const lng = Number(candidate.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function readPolygon(value: Json | null | undefined, centerLat: number, centerLng: number) {
  const points = jsonArray(value).map(pointFromJson).filter((point): point is DeliveryAreaPoint => Boolean(point));
  return points.length >= 3 ? points : makeDefaultDeliveryPolygon(centerLat, centerLng);
}

function readFeeTiers(value: Json | null | undefined) {
  const tiers = jsonArray(value)
    .map((tier, index) => {
      if (!tier || typeof tier !== "object" || Array.isArray(tier)) return null;
      const candidate = tier as { id?: unknown; label?: unknown; upToKm?: unknown; fee?: unknown; contact?: unknown };
      return {
        id: typeof candidate.id === "string" && candidate.id ? candidate.id : `tier-${index + 1}`,
        label: typeof candidate.label === "string" && candidate.label ? candidate.label : `Mức ${index + 1}`,
        upToKm: candidate.upToKm === null || candidate.upToKm === undefined ? "" : String(candidate.upToKm),
        fee: candidate.fee === null || candidate.fee === undefined ? "" : String(candidate.fee),
        contact: Boolean(candidate.contact)
      };
    })
    .filter((tier): tier is FeeTierForm => Boolean(tier));
  return tiers.length ? tiers : defaultFeeTiers;
}

function readExclusionZones(value: Json | null | undefined) {
  return jsonArray(value)
    .map((zone, index) => {
      if (!zone || typeof zone !== "object" || Array.isArray(zone)) return null;
      const candidate = zone as { id?: unknown; name?: unknown; areaKm2?: unknown; polygon?: unknown };
      const polygon = Array.isArray(candidate.polygon)
        ? candidate.polygon.map((point) => pointFromJson(point as Json)).filter((point): point is DeliveryAreaPoint => Boolean(point))
        : [];
      return {
        id: typeof candidate.id === "string" && candidate.id ? candidate.id : `zone-${index + 1}`,
        name: typeof candidate.name === "string" ? candidate.name : "",
        areaKm2: candidate.areaKm2 === null || candidate.areaKm2 === undefined ? "0" : String(candidate.areaKm2),
        polygon
      };
    })
    .filter((zone): zone is ExclusionZoneForm => zone !== null && zone.name.trim().length > 0);
}

function mapProviderName(provider: string) {
  const map: Record<string, string> = {
    goong: "Goong.io",
    mapbox: "Mapbox",
    vietmap: "Vietmap",
    nominatim: "Nominatim",
    osrm: "OSRM"
  };
  return map[provider] ?? provider;
}

function nextClientId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

function Card({
  id,
  title,
  description,
  children,
  className
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("dashboard-delivery-card rounded-[14px] border border-[#e7e2d8] bg-white p-4 shadow-[0_1px_2px_rgba(29,39,32,0.04)]", className)}>
      <div>
        <h3 className="text-[15px] font-extrabold text-[#101813]">{title}</h3>
        {description ? <p className="mt-1 text-xs font-medium text-[#667166]">{description}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ToggleField({
  name,
  label,
  defaultChecked,
  disabled = false
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex min-h-8 items-center justify-between gap-3 text-sm font-medium text-[#303a32]", disabled && "opacity-50")}>
      <span>{label}</span>
      <input type="checkbox" name={name} value="true" defaultChecked={defaultChecked} disabled={disabled} className="peer sr-only" />
      <span className="relative h-5 w-9 rounded-full bg-[#d6d8d2] transition after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition peer-checked:bg-[#0f6944] peer-checked:after:translate-x-4" />
    </label>
  );
}

function MiniMetric({
  icon,
  label,
  value,
  tone = "green",
  children
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  tone?: "green" | "red";
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#ece7dd] bg-[#fbfaf7] px-3 py-2">
      <span className={cn("grid h-9 w-9 place-items-center rounded-xl", tone === "green" ? "bg-[#edf6ed] text-[#0f6944]" : "bg-[#fff1ed] text-[#e74c3c]")}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[11px] font-medium text-[#667166]">{label}</span>
        {children ?? <strong className="mt-0.5 block text-xs text-[#101813]">{value}</strong>}
      </span>
    </div>
  );
}

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
  const initialLat = Number(settings.store_lat ?? 10.7769);
  const initialLng = Number(settings.store_lng ?? 106.7009);
  const [storeLat, setStoreLat] = useState(settings.store_lat?.toString() ?? "");
  const [storeLng, setStoreLng] = useState(settings.store_lng?.toString() ?? "");
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(settings.address ?? null);
  const [geocodeMessage, setGeocodeMessage] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [activeTab, setActiveTab] = useState("publish");
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkCopyFallback, setLinkCopyFallback] = useState(false);
  const [mapGeocodingProvider, setMapGeocodingProvider] = useState<GeocodingProvider>(settings.map_geocoding_provider ?? "goong");
  const [mapRoutingProvider, setMapRoutingProvider] = useState<RoutingProvider>(settings.map_routing_provider ?? "goong");
  const [feeTiers, setFeeTiers] = useState<FeeTierForm[]>(() => readFeeTiers(settings.delivery_fee_tiers));
  const [exclusionZones, setExclusionZones] = useState<ExclusionZoneForm[]>(() => readExclusionZones(settings.delivery_exclusion_zones));
  const [deliveryPolygon, setDeliveryPolygon] = useState<DeliveryAreaPoint[]>(() => readPolygon(settings.delivery_area_polygon, initialLat, initialLng));
  const centerLat = Number(storeLat) || initialLat;
  const centerLng = Number(storeLng) || initialLng;
  const center = useMemo(() => ({ lat: centerLat, lng: centerLng }), [centerLat, centerLng]);
  const areaStats = useMemo(() => estimateDeliveryAreaStats(deliveryPolygon, center), [deliveryPolygon, center]);

  const serializedFeeTiers = JSON.stringify(
    feeTiers.map((tier) => ({
      id: tier.id,
      label: tier.label.trim(),
      upToKm: tier.upToKm === "" ? null : Number(tier.upToKm),
      fee: tier.fee === "" ? null : Number(tier.fee),
      contact: tier.contact
    }))
  );
  const serializedExclusions = JSON.stringify(
    exclusionZones
      .filter((zone) => zone.name.trim().length > 0)
      .map((zone) => ({
        id: zone.id,
        name: zone.name.trim(),
        areaKm2: Number(zone.areaKm2) || 0,
        polygon: zone.polygon
      }))
  );

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
      setResolvedAddress(json.data.address);
      setGeocodeMessage(`Đã lấy tọa độ từ địa chỉ quán: ${json.data.address}`);
    } catch (error) {
      setGeocodeMessage(error instanceof Error ? error.message : "Không tự lấy được tọa độ.");
    } finally {
      setGeocoding(false);
    }
  }

  function useCurrentPosition() {
    if (!navigator.geolocation) {
      setGeocodeMessage("Trình duyệt không hỗ trợ GPS.");
      return;
    }
    setGeocodeMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStoreLat(position.coords.latitude.toFixed(6));
        setStoreLng(position.coords.longitude.toFixed(6));
        setGeocodeMessage("Đã cập nhật vị trí hiện tại của thiết bị.");
      },
      () => setGeocodeMessage("Không lấy được GPS. Hãy cấp quyền vị trí cho trình duyệt."),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  function scrollToTab(tab: (typeof tabs)[number]) {
    setActiveTab(tab.id);
    document.getElementById(tab.target)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  async function copyOnlineUrl() {
    try {
      await navigator.clipboard.writeText(onlineUrl);
      setLinkCopied(true);
      setLinkCopyFallback(false);
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      setLinkCopyFallback(true);
    }
  }

  return (
    <form
      id="online-ordering"
      action={formAction}
      className={cn(
        "dashboard-delivery-settings min-h-full bg-[#fbfaf7] text-[#101813]",
        compact ? "-mx-3 -mb-3 px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-1 sm:-mx-4 sm:px-4" : "rounded-2xl border border-[#e7e2d8] p-5"
      )}
    >
      <input type="hidden" name="address" value={resolvedAddress ?? settings.address ?? ""} readOnly />
      <input type="hidden" name="storeLat" value={storeLat} readOnly />
      <input type="hidden" name="storeLng" value={storeLng} readOnly />
      <input type="hidden" name="deliveryBaseFee" value={settings.delivery_base_fee} readOnly />
      <input type="hidden" name="deliveryFeePerKm" value={settings.delivery_fee_per_km} readOnly />
      <input type="hidden" name="deliveryFeeTiers" value={serializedFeeTiers} readOnly />
      <input type="hidden" name="deliveryAreaPolygon" value={JSON.stringify(deliveryPolygon)} readOnly />
      <input type="hidden" name="deliveryExclusionZones" value={serializedExclusions} readOnly />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold tracking-[-0.02em] text-[#101813] sm:text-[22px]">Địa chỉ & giao hàng</h2>
          <p className="mt-1 max-w-2xl text-xs font-medium leading-5 text-[#667166] sm:text-sm">Ghim đúng vị trí quán, bật kênh online và lưu cấu hình giao hàng.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <span className="hidden h-10 items-center gap-2 rounded-lg border border-[#f3d4ad] bg-[#fff7eb] px-3 text-xs font-extrabold text-[#f27c1b] sm:inline-flex">
            <Crown size={14} aria-hidden="true" />
            Gói Premium
          </span>
          <span className="hidden h-9 w-9 place-items-center rounded-full border border-[#e7e2d8] bg-white text-[#364238] sm:grid">
            <HelpCircle size={17} aria-hidden="true" />
          </span>
          <span className="relative hidden h-9 w-9 place-items-center rounded-full border border-[#e7e2d8] bg-white text-[#364238] sm:grid">
            <Bell size={17} aria-hidden="true" />
            <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-[#f04438] text-[9px] font-black text-white">5</span>
          </span>
          <span className="hidden h-9 w-9 place-items-center rounded-full bg-[#e9f4e6] text-[#0f6944] sm:grid">
            <Bot size={18} aria-hidden="true" />
          </span>
          <a
            href={onlineUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#cbded0] bg-white px-4 text-xs font-extrabold text-[#0f6944] sm:h-10 sm:w-auto"
          >
            <Download size={15} aria-hidden="true" />
            Xem trang đặt món
          </a>
        </div>
      </div>

      <div className="dashboard-delivery-tabs mt-4 flex gap-3 overflow-x-auto overscroll-x-contain border-b border-[#e5e0d6] pb-1 text-xs font-semibold text-[#3b463d] sm:text-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => scrollToTab(tab)}
            className={cn(
              "min-h-10 shrink-0 rounded-t-lg border-b-2 px-2 pb-2 transition",
              activeTab === tab.id ? "border-[#0f6944] text-[#0f2318]" : "border-transparent text-[#3f493f] hover:text-[#0f6944]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card
        id="online-publish-card"
        title="Bật đặt online, link & QR chia sẻ"
        description="Điều khiển trạng thái public của trang đặt món online và dùng QR riêng cho kênh bán từ xa."
        className="mt-5"
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-[#e8e3d9] bg-[#fbfaf7] p-3">
                <ToggleField name="onlineOrderingEnabled" label="Bật nhận đặt online" defaultChecked={settings.online_ordering_enabled ?? false} />
                <p className="mt-2 text-xs font-medium leading-5 text-[#667166]">Tắt công tắc này thì link public sẽ dừng nhận đơn từ xa.</p>
              </div>
              <div className="rounded-xl border border-[#e8e3d9] bg-[#fbfaf7] p-3">
                <ToggleField name="pickupEnabled" label="Cho khách đến lấy" defaultChecked={settings.pickup_enabled ?? true} />
                <p className="mt-2 text-xs font-medium leading-5 text-[#667166]">Khách tự đến quán lấy món theo ETA cấu hình.</p>
              </div>
              <div className="rounded-xl border border-[#e8e3d9] bg-[#fbfaf7] p-3">
                <ToggleField name="deliveryEnabled" label="Bật giao hàng" defaultChecked={settings.delivery_enabled ?? false} />
                <p className="mt-2 text-xs font-medium leading-5 text-[#667166]">Cần tọa độ quán để tính phí và khoảng cách chính xác.</p>
              </div>
              <div className="rounded-xl border border-[#e8e3d9] bg-[#fbfaf7] p-3">
                  <ToggleField name="deliveryTrackingEnabled" label="Theo dõi giao hàng theo thời gian thực" defaultChecked={settings.delivery_tracking_enabled ?? false} />
                <p className="mt-2 text-xs font-medium leading-5 text-[#667166]">Hiển thị vị trí/ETA khi quán có luồng giao hàng.</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <label className="grid gap-1 text-xs font-bold text-[#566052]">
                Luồng thanh toán online
                <select name="onlinePaymentMode" defaultValue={settings.online_payment_mode ?? "PAY_AFTER"} className="h-11 rounded-lg border border-[#e1ddd4] bg-white px-3 text-sm font-semibold text-[#101813] outline-none">
                  <option value="PAY_AFTER">Thanh toán sau / khi nhận hàng</option>
                  <option value="QR_PREPAID">Bắt buộc VietQR trước khi quán nhận đơn</option>
                </select>
              </label>
              <div className="rounded-xl border border-[#e8e3d9] bg-white p-3">
                <p className="text-xs font-bold text-[#566052]">Link đặt online</p>
                <code className="mt-2 block overflow-x-auto rounded-lg border border-[#ede8df] bg-[#fbfaf7] px-3 py-2 text-xs font-extrabold text-[#101813]">{onlineUrl}</code>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={copyOnlineUrl} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d7e5d9] bg-[#f3faf4] px-3 text-xs font-extrabold text-[#0f6944]">
                    <Copy size={15} aria-hidden="true" />
                    {linkCopied ? "Đã sao chép" : "Sao chép link"}
                  </button>
                  <a href={onlineUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d7e5d9] bg-white px-3 text-xs font-extrabold text-[#0f6944]">
                    <ExternalLink size={15} aria-hidden="true" />
                    Mở link
                  </a>
                </div>
                {linkCopyFallback ? (
                  <p className="mt-2 rounded-lg border border-[#f3d4ad] bg-[#fff7eb] px-3 py-2 text-xs font-bold text-[#a65f00]">
                    Trình duyệt không cho sao chép tự động. Hãy chọn link phía trên rồi sao chép thủ công.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#dfe9df] bg-[#f4faf2] p-4 text-center">
            <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-[#0f6944] text-white">
              <QrCode size={18} aria-hidden="true" />
            </div>
            <Image
              src="/api/admin/online-qr?size=520"
              alt="QR đặt món online"
              width={180}
              height={180}
              unoptimized
              className="mx-auto rounded-xl border border-[#d7e5d9] bg-white p-2"
            />
            <p className="mt-3 text-sm font-extrabold text-[#101813]">QR đặt món online riêng</p>
            <p className="mt-1 text-xs font-medium leading-5 text-[#667166]">Dùng cho fanpage, standee, sticker giao hàng hoặc chiến dịch quảng cáo.</p>
            <a href="/api/admin/online-qr?size=1200&download=1" className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border border-[#d7e5d9] bg-white px-3 text-xs font-extrabold text-[#0f6944]">
              <Download size={15} aria-hidden="true" />
              Tải QR riêng
            </a>
          </div>
        </div>
      </Card>

      <div className="mt-5 grid gap-3 rounded-2xl border border-[#dcebdc] bg-[linear-gradient(135deg,#f5fbf2,#fff7eb)] p-4 sm:grid-cols-3">
        <MiniMetric icon={<MapPin size={17} aria-hidden="true" />} label="Bước bắt buộc" value={storeLat && storeLng ? "Đã có pin quán" : "Ghim vị trí quán"} />
        <MiniMetric icon={<Truck size={17} aria-hidden="true" />} label="Mặc định giao hàng" value={`${settings.delivery_radius_km}km · ${formatVnd(settings.delivery_base_fee)} phí gốc`} />
        <MiniMetric icon={<Store size={17} aria-hidden="true" />} label="Khuyến nghị" value="Lưu ngay, chỉnh nâng cao sau" />
      </div>

      <div className="dashboard-delivery-layout mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.45fr)]">
        <div className="grid content-start gap-4">
          <Card id="map-location-card" title="Vị trí quán trên bản đồ" description="Kéo thả marker để cập nhật vị trí chính xác của quán">
            <StoreLocationPicker
              compact
              seedAddress={settings.address}
              latitude={storeLat}
              longitude={storeLng}
              onLatitudeChange={setStoreLat}
              onLongitudeChange={setStoreLng}
              onResolvedAddress={setResolvedAddress}
            />
            <div className="dashboard-map-detail-panel rounded-b-xl border-x border-b border-[#e7e2d8] bg-white">
	              <div className="flex items-center justify-between gap-3 border-b border-[#eee9df] px-4 py-3">
	                <div className="min-w-0">
	                  <p className="text-[11px] font-semibold text-[#667166]">Địa chỉ</p>
	                  <input
	                    aria-label="Địa chỉ quán"
	                    value={resolvedAddress ?? settings.address ?? ""}
	                    onChange={(event) => setResolvedAddress(event.target.value)}
	                    placeholder="Nhập địa chỉ quán"
	                    autoComplete="street-address"
	                    className="mt-1 w-full rounded-lg border border-transparent bg-transparent px-0 py-1 text-sm font-bold text-[#101813] outline-none placeholder:text-[#9aa39a] focus:border-[#d7e5d9] focus:bg-white focus:px-2"
	                  />
	                </div>
	                <span className="grid h-8 w-8 place-items-center rounded-lg text-[#0f6944]" aria-hidden="true">
	                  <Pencil size={15} aria-hidden="true" />
	                </span>
	              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-[11px] font-semibold text-[#667166]">Tọa độ</p>
                  <p className="mt-1 text-sm font-bold text-[#101813]">{storeLat && storeLng ? `${Number(storeLat).toFixed(4)}, ${Number(storeLng).toFixed(4)}` : "Chưa có tọa độ"}</p>
                </div>
                <button
                  type="button"
                  onClick={useCurrentPosition}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d7e5d9] bg-white px-3 text-xs font-extrabold text-[#0f6944]"
                >
                  <LocateFixed size={15} aria-hidden="true" />
                  Lấy vị trí hiện tại
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={autofillCoordinates}
                disabled={geocoding}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d7e5d9] bg-[#f3faf4] px-3 text-xs font-extrabold text-[#0f6944] disabled:opacity-60"
              >
                <MapPin size={15} aria-hidden="true" />
                {geocoding ? "Đang định vị..." : "Tự lấy từ địa chỉ quán"}
              </button>
            </div>
            {geocodeMessage ? <p className="mt-3 rounded-lg bg-[#edf7ef] px-3 py-2 text-xs font-bold text-[#0f6944]">{geocodeMessage}</p> : null}
          </Card>

          <details className="rounded-[14px] border border-[#e7e2d8] bg-white p-4 shadow-[0_1px_2px_rgba(29,39,32,0.04)]">
            <summary className="cursor-pointer text-[15px] font-extrabold text-[#101813] marker:text-[#0f6944]">
              Tuỳ chọn bản đồ nâng cao
              <span className="mt-1 block text-xs font-medium text-[#667166]">Chỉ cần mở khi muốn đổi nguồn bản đồ, độ phóng hoặc kiểu hiển thị.</span>
            </summary>
            <div className="mt-4 grid gap-4">
              <Card title="Tùy chọn hiển thị bản đồ">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-bold text-[#566052]">
                    Zoom mặc định
                    <select name="mapDefaultZoom" defaultValue={settings.map_default_zoom ?? 14} className="h-10 rounded-lg border border-[#e1ddd4] bg-white px-3 text-sm font-semibold text-[#101813] outline-none">
                      {[12, 13, 14, 15, 16, 17, 18].map((zoom) => (
                        <option key={zoom} value={zoom}>{zoom}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-bold text-[#566052]">
                    Kiểu bản đồ
                    <select name="mapDisplayStyle" defaultValue={settings.map_display_style ?? "LIGHT"} className="h-10 rounded-lg border border-[#e1ddd4] bg-white px-3 text-sm font-semibold text-[#101813] outline-none">
                      <option value="LIGHT">Sáng (Light)</option>
                      <option value="DARK">Tối (Dark)</option>
                    </select>
                  </label>
                </div>
                <div className="mt-4 grid gap-2">
                  <ToggleField name="showStoreMarkerOnOrdering" label="Hiển thị marker quán trên trang đặt món" defaultChecked={settings.show_store_marker_on_ordering ?? true} />
                  <ToggleField name="showCustomerDistance" label="Cho phép khách xem khoảng cách đến quán" defaultChecked={settings.show_customer_distance ?? true} />
                </div>
              </Card>

              <Card id="provider-card" title="Nguồn bản đồ" description="Nguồn bản đồ đang sử dụng">
                <div className="rounded-xl border border-[#dfe9df] bg-[#f4faf2] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-[#0f6944] text-white">
                        <MapPin size={17} aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-sm font-extrabold text-[#101813]">{mapProviderName(mapRoutingProvider)} <span className="font-bold text-[#0f6944]">(Khuyến nghị)</span></p>
                        <p className="mt-1 text-xs font-medium text-[#667166]">Ổn định, chi tiết, hỗ trợ tốt tại Việt Nam</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs font-bold text-[#566052]">
                      Geocoding
                      <select
                        name="mapGeocodingProvider"
                        value={mapGeocodingProvider}
                        onChange={(event) => setMapGeocodingProvider(event.target.value as GeocodingProvider)}
                        className="h-10 rounded-lg border border-[#dbe5d9] bg-white px-3 text-sm font-semibold text-[#101813] outline-none"
                      >
                        <option value="goong">Goong.io</option>
                        <option value="mapbox">Mapbox</option>
                        <option value="vietmap">Vietmap</option>
                        <option value="nominatim">Nominatim</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-[#566052]">
                      Routing
                      <select
                        name="mapRoutingProvider"
                        value={mapRoutingProvider}
                        onChange={(event) => setMapRoutingProvider(event.target.value as RoutingProvider)}
                        className="h-10 rounded-lg border border-[#dbe5d9] bg-white px-3 text-sm font-semibold text-[#101813] outline-none"
                      >
                        <option value="goong">Goong.io</option>
                        <option value="mapbox">Mapbox</option>
                        <option value="vietmap">Vietmap</option>
                        <option value="osrm">OSRM</option>
                      </select>
                    </label>
                  </div>
                </div>
                <label className="mt-4 grid gap-1 text-xs font-bold text-[#566052]">
                  Access Token
                  <span className="relative">
                    <input
                      readOnly
                      value={`${mapProviderName(mapRoutingProvider)} token đang lấy từ biến môi trường`}
                      className="h-10 w-full rounded-lg border border-[#e1ddd4] bg-white px-3 pr-10 text-sm font-semibold text-[#101813] outline-none"
                    />
                    <Eye className="absolute right-3 top-1/2 -translate-y-1/2 text-[#667166]" size={15} aria-hidden="true" />
                  </span>
                </label>
              </Card>
            </div>
          </details>
        </div>

        <details id="advanced-delivery-settings" className="rounded-[14px] border border-[#e7e2d8] bg-white p-4 shadow-[0_1px_2px_rgba(29,39,32,0.04)]">
          <summary className="cursor-pointer text-[15px] font-extrabold text-[#101813] marker:text-[#0f6944]">
            Mở tuỳ chọn nâng cao: vùng giao, phí, ETA
            <span className="mt-1 block text-xs font-medium text-[#667166]">Có thể để mặc định để nhận đơn nhanh; chỉ chỉnh khi quán đã có chính sách giao hàng riêng.</span>
          </summary>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="grid content-start gap-4">
          <Card id="delivery-area-card" title="Khu vực giao hàng" description="Thiết lập khu vực bạn có thể giao hàng đến">
            <label className="grid gap-1 text-xs font-bold text-[#566052]">
              Vùng giao hàng
              <select name="deliveryAreaMode" defaultValue={settings.delivery_area_mode ?? "CUSTOM"} className="h-10 rounded-lg border border-[#e1ddd4] bg-white px-3 text-sm font-semibold text-[#101813] outline-none">
                <option value="CUSTOM">Vẽ vùng tùy chỉnh</option>
                <option value="RADIUS">Theo bán kính</option>
              </select>
            </label>
            <div className="mt-3">
              <DeliveryZoneMapEditor centerLat={center.lat} centerLng={center.lng} points={deliveryPolygon} onChange={setDeliveryPolygon} />
            </div>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1 text-xs font-bold text-[#566052]">
                Tên khu vực
                <Input name="deliveryAreaName" defaultValue={settings.delivery_area_name ?? "Khu vực giao hàng chính"} className="h-10 rounded-lg border-[#e1ddd4] bg-white text-sm" />
              </label>
              <label className="grid gap-1 text-xs font-bold text-[#566052]">
                Ghi chú (không bắt buộc)
                <Input name="deliveryAreaNote" defaultValue={settings.delivery_area_note ?? ""} placeholder="Áp dụng cho khu vực Quận 1, Quận 3..." className="h-10 rounded-lg border-[#e1ddd4] bg-white text-sm" />
              </label>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <MiniMetric icon={<Building2 size={17} aria-hidden="true" />} label="Diện tích" value={`${areaStats.areaKm2.toFixed(1)} km²`} />
              <MiniMetric icon={<Truck size={17} aria-hidden="true" />} label="Khoảng cách tối đa" value={`${areaStats.maxDistanceKm.toFixed(1)} km`} />
              <MiniMetric icon={<Store size={17} aria-hidden="true" />} label="Số phường/xã" tone="red">
                <input
                  name="deliveryAreaWardCount"
                  type="number"
                  min={0}
                  max={10000}
                  defaultValue={settings.delivery_area_ward_count ?? 0}
                  className="mt-0.5 h-7 w-full rounded-md border border-[#eee1d8] bg-white px-2 text-xs font-extrabold text-[#101813] outline-none"
                />
              </MiniMetric>
            </div>
            <div className="mt-4 rounded-xl border border-[#dcebdc] bg-[#edf7ef] px-3 py-3 text-xs font-semibold leading-5 text-[#145a40]">
              <Info className="mr-2 inline" size={14} aria-hidden="true" />
              Mẹo: Di chuyển các điểm trên bản đồ để chỉnh sửa khu vực. Khách chỉ có thể đặt hàng trong khu vực này.
            </div>
          </Card>

          <Card title="Ngoại lệ khu vực" description="Loại trừ các khu vực không giao hàng (nếu có)">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setExclusionZones((current) => [...current, { id: nextClientId("zone"), name: "Vùng loại trừ mới", areaKm2: areaStats.areaKm2.toFixed(2), polygon: deliveryPolygon }])}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#d7e5d9] bg-white px-3 text-xs font-extrabold text-[#0f6944]"
              >
                <Plus size={14} aria-hidden="true" />
                Thêm vùng loại trừ
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-[#ece7dd]">
              <div className="grid min-w-[420px] grid-cols-[minmax(0,1fr)_90px_70px] bg-[#fbfaf7] px-3 py-2 text-xs font-bold text-[#667166]">
                <span>Tên vùng loại trừ</span>
                <span>Diện tích</span>
                <span className="text-right">Thao tác</span>
              </div>
              {exclusionZones.length ? (
                exclusionZones.map((zone, index) => (
                  <div key={zone.id} className="grid min-w-[420px] grid-cols-[minmax(0,1fr)_90px_70px] items-center border-t border-[#ece7dd] px-3 py-2 text-xs font-semibold text-[#101813]">
                    <input
                      value={zone.name}
                      onChange={(event) => setExclusionZones((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item)))}
                      className="min-w-0 rounded-md border border-transparent bg-transparent px-1 py-1 outline-none focus:border-[#d7e5d9] focus:bg-white"
                    />
                    <input
                      value={zone.areaKm2}
                      onChange={(event) => setExclusionZones((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, areaKm2: event.target.value } : item)))}
                      className="w-16 rounded-md border border-transparent bg-transparent px-1 py-1 outline-none focus:border-[#d7e5d9] focus:bg-white"
                    />
                    <span className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setExclusionZones((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, areaKm2: areaStats.areaKm2.toFixed(2), polygon: deliveryPolygon } : item)))}
                        className="text-[#0f6944]"
                        aria-label="Dùng vùng đang vẽ làm vùng loại trừ"
                      >
                        <Pencil size={15} aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => setExclusionZones((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-[#f04438]" aria-label="Xóa vùng loại trừ">
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                ))
              ) : (
                <p className="border-t border-[#ece7dd] px-3 py-4 text-center text-xs font-semibold text-[#667166]">Chưa có vùng loại trừ.</p>
              )}
            </div>
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card id="delivery-fee-card" title="Cấu hình phí giao hàng" description="Thiết lập phí giao hàng theo khoảng cách">
            <div className="mb-3">
              <ToggleField name="deliveryFeeEnabled" label="Bật tính phí giao hàng" defaultChecked={settings.delivery_fee_enabled ?? true} />
            </div>
            <div className="overflow-x-auto rounded-xl border border-[#ece7dd]">
              <div className="grid min-w-[540px] grid-cols-[minmax(0,1.2fr)_minmax(72px,0.5fr)_minmax(92px,0.7fr)_44px] bg-[#fbfaf7] px-3 py-2 text-xs font-bold text-[#667166]">
                <span>Khoảng cách</span>
                <span>Đến km</span>
                <span>Phí giao hàng</span>
                <span className="text-right">Thao tác</span>
              </div>
              {feeTiers.map((tier, index) => (
                <div key={tier.id} className="grid min-w-[540px] grid-cols-[minmax(0,1.2fr)_minmax(72px,0.5fr)_minmax(92px,0.7fr)_44px] items-center border-t border-[#ece7dd] px-3 py-2 text-xs font-semibold text-[#101813]">
                  <input
                    aria-label={`Tên mức phí ${index + 1}`}
                    value={tier.label}
                    onChange={(event) => setFeeTiers((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, label: event.target.value } : item)))}
                    className="min-w-0 rounded-md border border-transparent bg-transparent px-1 py-1 outline-none focus:border-[#d7e5d9] focus:bg-white"
                  />
                  <input
                    aria-label={`Ngưỡng km tối đa cho mức phí ${index + 1}`}
                    value={tier.upToKm}
                    onChange={(event) => setFeeTiers((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, upToKm: event.target.value } : item)))}
                    placeholder="Cuối"
                    inputMode="decimal"
                    className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 font-extrabold outline-none placeholder:text-[#9aa39a] focus:border-[#d7e5d9] focus:bg-white"
                  />
                  <input
                    aria-label={`Phí giao hàng cho mức ${index + 1}`}
                    value={tier.fee}
                    onChange={(event) => {
                      const next = event.target.value;
                      setFeeTiers((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, fee: next, contact: next.trim() === "" } : item
                        )
                      );
                    }}
                    placeholder="Liên hệ"
                    inputMode="numeric"
                    className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 font-extrabold outline-none placeholder:text-[#9aa39a] focus:border-[#d7e5d9] focus:bg-white"
                  />
                  <span className="flex justify-end gap-3">
                    <button type="button" onClick={() => setFeeTiers((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-[#f04438]" aria-label="Xóa mức phí">
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setFeeTiers((current) => [...current, { id: nextClientId("tier"), label: "Mức phí mới", upToKm: "", fee: "0", contact: false }])}
              className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#d7e5d9] bg-white text-xs font-extrabold text-[#0f6944]"
            >
              <Plus size={15} aria-hidden="true" />
              Thêm mức phí
            </button>
          </Card>

          <Card id="service-fee-card" title="Phí dịch vụ" description="Phí áp dụng cho đơn hàng (không bao gồm phí giao hàng)">
            <div className="grid gap-3">
              <ToggleField name="serviceFeeEnabled" label="Bật phí dịch vụ" defaultChecked={settings.service_fee_enabled ?? false} />
              <label className="grid gap-1 text-xs font-bold text-[#566052]">
                Loại phí
                <select name="serviceFeeType" defaultValue={settings.service_fee_type ?? "ORDER_PERCENT"} className="h-10 rounded-lg border border-[#e1ddd4] bg-white px-3 text-sm font-semibold text-[#101813] outline-none">
                  <option value="ORDER_PERCENT">Phí % theo giá trị đơn</option>
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-bold text-[#566052]">
                  Tỷ lệ phí (%)
                  <span className="relative">
                    <Input name="serviceFeePercent" type="number" min={0} max={100} step="0.1" defaultValue={settings.service_fee_percent ?? 0} className="h-10 rounded-lg border-[#e1ddd4] bg-white pr-8 text-sm" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#667166]">%</span>
                  </span>
                </label>
                <label className="grid gap-1 text-xs font-bold text-[#566052]">
                  Giá trị tối thiểu
                  <Input name="serviceFeeMin" type="number" min={0} step={1000} defaultValue={settings.service_fee_min ?? 0} className="h-10 rounded-lg border-[#e1ddd4] bg-white text-sm" />
                </label>
              </div>
              <label className="grid gap-1 text-xs font-bold text-[#566052]">
                Giá trị tối đa (không bắt buộc)
                <Input name="serviceFeeMax" type="number" min={0} step={1000} defaultValue={settings.service_fee_max ?? ""} placeholder="Nhập giá trị tối đa (nếu có)" className="h-10 rounded-lg border-[#e1ddd4] bg-white text-sm" />
                <span className="font-medium text-[#8a9287]">Nếu để trống, sẽ không giới hạn</span>
              </label>
            </div>
          </Card>

          <Card id="other-settings-card" title="Cài đặt khác">
            <div className="grid gap-2">
              <ToggleField name="allowOutsideDeliveryArea" label="Cho phép đặt ngoài khu vực hoạt động" defaultChecked={settings.allow_outside_delivery_area ?? false} />
              <ToggleField name="showDeliveryEta" label="Hiển thị thời gian dự kiến khi đặt món" defaultChecked={settings.show_delivery_eta ?? true} />
              <ToggleField name="requireOutsideAreaConfirmation" label="Yêu cầu xác nhận khi đơn hàng ngoài khu vực" defaultChecked={settings.require_outside_area_confirmation ?? true} />
              <ToggleField name="autoSuggestNearestBranch" label="Tự động gợi ý quán gần nhất cho khách" defaultChecked={settings.auto_suggest_nearest_branch ?? true} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-xs font-bold text-[#566052]">
                Bán kính nhận đơn
                <Input name="deliveryRadiusKm" type="number" min={0} max={200} step="0.1" defaultValue={settings.delivery_radius_km} className="h-10 rounded-lg border-[#e1ddd4] bg-white text-sm" />
              </label>
              <label className="grid gap-1 text-xs font-bold text-[#566052]">
                Miễn phí trong
                <Input name="freeDeliveryRadiusKm" type="number" min={0} max={200} step="0.1" defaultValue={settings.free_delivery_radius_km} className="h-10 rounded-lg border-[#e1ddd4] bg-white text-sm" />
              </label>
              <label className="grid gap-1 text-xs font-bold text-[#566052]">
                Đơn giao tối thiểu
                <Input name="minOrderForDelivery" type="number" min={0} step={1000} defaultValue={settings.min_order_for_delivery} className="h-10 rounded-lg border-[#e1ddd4] bg-white text-sm" />
              </label>
              <label className="grid gap-1 text-xs font-bold text-[#566052]">
                ETA đến lấy
                <Input name="pickupEtaMinutes" type="number" min={1} max={240} defaultValue={settings.pickup_eta_minutes} className="h-10 rounded-lg border-[#e1ddd4] bg-white text-sm" />
              </label>
              <label className="grid gap-1 text-xs font-bold text-[#566052]">
                ETA giao hàng
                <Input name="deliveryEtaMinutes" type="number" min={1} max={240} defaultValue={settings.delivery_eta_minutes} className="h-10 rounded-lg border-[#e1ddd4] bg-white text-sm" />
              </label>
            </div>
          </Card>
        </div>
          </div>
        </details>
      </div>

      {state?.error ? <p role="alert" className="mt-4 rounded-xl bg-[#fff1ed] px-4 py-3 text-sm font-extrabold text-[#c23b2a]">{state.error}</p> : null}
      {state?.success ? <p aria-live="polite" className="mt-4 rounded-xl bg-[#edf7ef] px-4 py-3 text-sm font-extrabold text-[#0f6944]">{state.success}</p> : null}

      <div id="save-settings-bar" className="dashboard-delivery-save-bar sticky bottom-0 z-10 mt-4 grid grid-cols-1 gap-2 border-t border-[#e5e0d6] bg-[#fbfaf7]/95 px-0 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
        <button
          type="button"
          onClick={() => {
            setFeeTiers(defaultFeeTiers);
            setDeliveryPolygon(makeDefaultDeliveryPolygon(center.lat, center.lng));
          }}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#e1ddd4] bg-white px-4 text-sm font-extrabold text-[#364238] sm:w-auto"
        >
          <RotateCcw size={16} aria-hidden="true" />
          Khôi phục mặc định
        </button>
        <Button disabled={pending} className="h-11 w-full min-w-0 rounded-lg bg-[#0f6944] text-white hover:bg-[#0b5738] sm:w-auto sm:min-w-[170px]">
          <Save size={16} aria-hidden="true" />
          {pending ? "Đang lưu..." : "Lưu thay đổi"}
        </Button>
      </div>
    </form>
  );
}
