"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ElementType } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Crown,
  Download,
  EyeOff,
  Grid3X3,
  Layers3,
  Link2,
  Plus,
  Printer,
  QrCode,
  RadioTower,
  RefreshCw,
  Save,
  Search,
  Table2,
  Trash2,
  Users,
  Wrench,
  X
} from "lucide-react";
import { createTableAction, deleteTableAction, rotateTableQrAction, toggleTableQrAction, updateTableAction } from "@/app/dashboard/actions";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { ConfirmActionButton } from "@/components/dashboard/confirm-action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { buildTenantUrl } from "@/lib/tenant-domain";
import { cn } from "@/lib/utils";
import type { RestaurantTableWithStatus, TableOperationalStatus } from "@/services/table-service";

type TablesWorkspaceProps = {
  restaurantId: string;
  restaurantSlug: string;
  restaurantName: string;
  dashboardTableCount: number;
  tables: RestaurantTableWithStatus[];
};

type StatusFilter = TableOperationalStatus | "all";
type TablePanelMode = "closed" | "table" | "create";
type RealtimeState = "connecting" | "connected" | "error";

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "available", label: "Trống" },
  { value: "needs_confirm", label: "Chờ nhận đơn" },
  { value: "serving", label: "Đang ra món" },
  { value: "overdue", label: "Quá giờ ra món" },
  { value: "awaiting_payment", label: "Chờ thanh toán" }
];

const POSTER_LOGO_URL = "/brand/logivn/logo-horizontal-transparent.png";

function statusMeta(status: TableOperationalStatus) {
  const map = {
    available: { label: "Trống", className: "border-[var(--primary)]/20 bg-[var(--primary-soft)] text-[var(--primary)]", dot: "bg-[var(--primary)]", tone: "green" },
    needs_confirm: { label: "Chờ nhận đơn", className: "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent-strong)]", dot: "bg-[var(--accent)]", tone: "yellow" },
    serving: { label: "Đang ra món", className: "border-[var(--secondary)]/40 bg-[var(--secondary-soft)] text-[var(--primary)]", dot: "bg-[var(--secondary)]", tone: "green" },
    overdue: { label: "Quá giờ ra món", className: "border-[var(--tertiary)]/15 bg-[var(--danger-soft)] text-[var(--tertiary)]", dot: "bg-[var(--accent)]", tone: "red" },
    awaiting_payment: { label: "Chờ thanh toán", className: "border-[var(--secondary)]/40 bg-[var(--secondary-soft)] text-[var(--primary)]", dot: "bg-[var(--primary)]", tone: "blue" }
  } satisfies Record<TableOperationalStatus, { label: string; className: string; dot: string; tone: "green" | "yellow" | "red" | "blue" }>;
  return map[status];
}

function qrImageUrl(tableUrl: string, size = 520) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(tableUrl)}`;
}

function tableQrUrl(restaurantSlug: string, table: RestaurantTableWithStatus) {
  const url = buildTenantUrl(restaurantSlug, `/table/${table.id}`);
  if (!table.qr_token) return url;
  const parsed = new URL(url);
  parsed.searchParams.set("t", table.qr_token);
  return parsed.toString();
}

function formatVnd(value: number) {
  return `${value.toLocaleString("vi-VN")}đ`;
}

function formatTime(value: string | null) {
  if (!value) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(value));
}

function formatClock(value: Date | null) {
  if (!value) return "Đang đồng bộ";
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value);
}

function minutesUntil(value: string | null, nowMs: number) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - nowMs) / 60_000);
}

function realtimeLabel(status: RealtimeState) {
  if (status === "connected") return "Bàn live";
  if (status === "error") return "Live gián đoạn";
  return "Đang nối live";
}

function realtimeTone(status: RealtimeState): "green" | "yellow" | "red" {
  if (status === "connected") return "green";
  if (status === "error") return "red";
  return "yellow";
}

function statusPriority(status: TableOperationalStatus) {
  const priority = {
    overdue: 5,
    needs_confirm: 4,
    awaiting_payment: 3,
    serving: 2,
    available: 1
  } satisfies Record<TableOperationalStatus, number>;
  return priority[status];
}

function tableActionCopy(table: RestaurantTableWithStatus, nowMs: number) {
  if (table.is_hidden) return "Bàn đang ẩn khỏi sơ đồ vận hành";
  if (table.is_under_maintenance) return "Bàn đang bảo trì, không nhận đặt trước";
  if (table.is_bookable === false) return "Không nhận đặt bàn trước";
  if (table.status === "overdue") {
    const lateBy = Math.abs(minutesUntil(table.nextServiceDueAt, nowMs) ?? 0);
    return lateBy ? `Trễ ${lateBy} phút, cần đẩy bếp/phục vụ` : "Đơn đã quá giờ phục vụ";
  }
  if (table.status === "needs_confirm") return "Có order mới cần nhận ngay";
  if (table.status === "awaiting_payment") return `${formatVnd(table.unpaidTotal)} đang chờ thu`;
  if (table.status === "serving") {
    const dueIn = minutesUntil(table.nextServiceDueAt, nowMs);
    return dueIn === null ? "Đang phục vụ" : dueIn <= 5 ? `Còn ${Math.max(dueIn, 0)} phút tới hạn` : `Tới hạn sau ${dueIn} phút`;
  }
  return table.qr_enabled ? "Sẵn sàng nhận khách" : "QR đang tắt";
}

function seatingZoneLabel(value?: string | null) {
  if (value === "outdoor") return "Ngoài trời";
  if (value === "mixed") return "Linh hoạt";
  return "Trong nhà";
}

function tableKindLabel(value?: string | null) {
  if (value === "vip") return "VIP";
  if (value === "bar") return "Quầy bar";
  if (value === "community") return "Bàn chung";
  return "Tiêu chuẩn";
}

function tableAreaLabel(table: Pick<RestaurantTableWithStatus, "area" | "floor_label">) {
  const area = table.area || "Khu chính";
  const floor = table.floor_label || "Tầng trệt";
  return `${floor} · ${area}`;
}

function TablesMetric({
  icon: Icon,
  label,
  value,
  meta,
  tone
}: {
  icon: ElementType;
  label: string;
  value: string | number;
  meta: string;
  tone: "green" | "yellow" | "red" | "blue";
}) {
  const toneClass =
    tone === "red"
      ? "border-[var(--accent)]/30 bg-[var(--danger-soft)] text-[var(--tertiary)]"
      : tone === "yellow"
        ? "border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent-strong)]"
        : tone === "blue"
          ? "border-[var(--secondary)]/30 bg-[var(--secondary-soft)] text-[var(--primary)]"
          : "border-[var(--primary)]/20 bg-[var(--primary-soft)] text-[var(--primary)]";

  return (
    <article className="admin-stat-tile rounded-[14px] p-4">
      <div className="flex items-start justify-between gap-3">
        <span className={cn("grid h-10 w-10 place-items-center rounded-xl border", toneClass)}>
          <Icon size={18} />
        </span>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <p className="metric-number mt-3 text-2xl font-black text-[var(--foreground)]">{value}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[var(--muted-foreground)]">{meta}</p>
    </article>
  );
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function filenameSafe(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "qr-ban";
}

function splitPosterTitle(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 16 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  if (lines.length <= 2) return lines.length ? lines : ["LogiVN"];
  return [lines[0], lines.slice(1).join(" ")];
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function fetchAssetDataUrl(url: string) {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error(`Không tải được tài nguyên: ${url}`);
  return readBlobAsDataUrl(await response.blob());
}

function buildQrPosterSvg({
  restaurantName,
  tableName,
  qrDataUrl,
  logoDataUrl
}: {
  restaurantName: string;
  tableName: string;
  qrDataUrl: string;
  logoDataUrl: string;
}) {
  const tableNumber = tableName.match(/\d+/)?.[0]?.padStart(2, "0") ?? tableName.slice(0, 8).toUpperCase();
  const titleLines = splitPosterTitle(restaurantName);
  const titleFontSize = titleLines.length > 1 ? 52 : 62;
  const titleStartY = titleLines.length > 1 ? 314 : 338;
  const titleMarkup = titleLines
    .map((line, index) => `<tspan x="400" dy="${index === 0 ? 0 : 58}">${escapeXml(line)}</tspan>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1120" viewBox="0 0 800 1120">
  <defs>
    <linearGradient id="ivory" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#fffaf1"/>
      <stop offset="1" stop-color="#fff2df"/>
    </linearGradient>
    <pattern id="waves" width="42" height="18" patternUnits="userSpaceOnUse">
      <path d="M0 18C10 2 30 2 42 18" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="2"/>
      <path d="M-21 18C-10 2 10 2 21 18" fill="none" stroke="#ffffff" stroke-opacity=".1" stroke-width="2"/>
    </pattern>
    <filter id="softShadow" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#0F4D3A" flood-opacity=".14"/>
    </filter>
  </defs>
  <rect x="0" y="0" width="800" height="1120" rx="36" fill="url(#ivory)"/>
  <rect x="28" y="28" width="744" height="1064" rx="28" fill="none" stroke="#0F4D3A" stroke-width="5"/>
  <rect x="46" y="46" width="708" height="1028" rx="22" fill="none" stroke="#0F4D3A" stroke-opacity=".22" stroke-width="2"/>

  <path d="M92 92h210M498 92h210" stroke="#0F4D3A" stroke-width="3" stroke-linecap="round"/>
  <text x="400" y="104" text-anchor="middle" font-size="36" fill="#F28C28" font-family="Arial, Helvetica, sans-serif">✦</text>
  <image href="${logoDataUrl}" x="126" y="116" width="548" height="112" preserveAspectRatio="xMidYMid meet"/>
  <path d="M210 258h380" stroke="#0F4D3A" stroke-width="3" stroke-linecap="round"/>
  <text x="400" y="276" text-anchor="middle" font-size="30" fill="#F28C28" font-family="Arial, Helvetica, sans-serif">◆</text>

  <rect x="98" y="292" width="604" height="158" rx="24" fill="#fffaf1" fill-opacity=".9" stroke="#0F4D3A" stroke-width="4"/>
  <text x="400" y="${titleStartY}" text-anchor="middle" font-size="${titleFontSize}" font-weight="900" fill="#0F4D3A" font-family="Arial, Helvetica, sans-serif">${titleMarkup}</text>
  <text x="400" y="494" text-anchor="middle" font-size="26" font-weight="800" fill="#0F4D3A" font-family="Arial, Helvetica, sans-serif">Quét mã để xem menu &amp; gọi món</text>

  <rect x="152" y="530" width="496" height="496" rx="34" fill="#ffffff" stroke="#0F4D3A" stroke-width="7" filter="url(#softShadow)"/>
  <rect x="176" y="554" width="448" height="448" rx="18" fill="#ffffff" stroke="#F28C28" stroke-width="3" stroke-dasharray="9 10"/>
  <image href="${qrDataUrl}" x="196" y="574" width="408" height="408" preserveAspectRatio="xMidYMid meet"/>

  <rect x="250" y="1010" width="300" height="56" rx="18" fill="#fffaf1" stroke="#0F4D3A" stroke-width="3"/>
  <text x="400" y="1048" text-anchor="middle" font-size="24" font-weight="900" fill="#0F4D3A" font-family="Arial, Helvetica, sans-serif">MÃ QR GỌI MÓN</text>

  <text x="400" y="1090" text-anchor="middle" font-size="21" font-weight="800" fill="#0F4D3A" font-family="Arial, Helvetica, sans-serif">Gọi món nhanh  •  Thanh toán tiện lợi  •  Phục vụ tốt hơn</text>

  <path d="M0 1014C150 970 250 1060 400 1018C550 976 650 1042 800 998V1120H0Z" fill="#0F4D3A"/>
  <path d="M0 997C150 954 250 1044 400 1001C550 960 650 1024 800 982" fill="none" stroke="#F28C28" stroke-width="8"/>
  <rect x="252" y="960" width="296" height="84" rx="25" fill="#fffaf1" stroke="#F28C28" stroke-width="3"/>
  <text x="340" y="1011" text-anchor="middle" font-size="24" font-weight="900" fill="#0F4D3A" font-family="Arial, Helvetica, sans-serif">Bàn số:</text>
  <text x="455" y="1025" text-anchor="middle" font-size="64" font-weight="900" fill="#F28C28" font-family="Arial, Helvetica, sans-serif">${escapeXml(tableNumber)}</text>
</svg>`;
}

async function svgToPngDownload(svg: string, filename: string) {
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Không tạo được ảnh từ template QR."));
      img.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1680;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Trình duyệt không hỗ trợ tạo ảnh.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function printSvgPosters(svgPosters: string[], title: string) {
  const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(title)}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff7eb; font-family: Arial, Helvetica, sans-serif; }
    main { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10mm; align-items: start; }
    .poster { break-inside: avoid; page-break-inside: avoid; width: 100%; }
    .poster svg { display: block; width: 100%; height: auto; }
    @media print {
      body { background: #fff7eb; }
      main { gap: 8mm; }
    }
  </style>
</head>
<body>
  <main>${svgPosters.map((svg) => `<section class="poster">${svg}</section>`).join("")}</main>
  <script>
    window.onload = () => {
      window.focus();
      setTimeout(() => window.print(), 250);
    };
  </script>
</body>
</html>`;
  const htmlUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const printWindow = window.open(htmlUrl, "_blank", "width=980,height=900");
  if (!printWindow) {
    URL.revokeObjectURL(htmlUrl);
    window.alert("Trình duyệt đang chặn cửa sổ in. Hãy cho phép popup để in template QR.");
    return;
  }
  window.setTimeout(() => URL.revokeObjectURL(htmlUrl), 10_000);
}

function QrPrintPoster({
  restaurantName,
  tableName,
  qrUrl
}: {
  restaurantName: string;
  tableName: string;
  qrUrl: string;
}) {
  const tableNumber = tableName.match(/\d+/)?.[0]?.padStart(2, "0") ?? tableName.slice(0, 8).toUpperCase();

  return (
    <article className="logivn-qr-poster">
      <div className="qr-poster-inner">
        <LogiVNLogo className="mx-auto h-16" priority />
        <div className="qr-poster-divider" />
        <h2>{restaurantName}</h2>
        <p className="qr-poster-subtitle">Quét mã để xem menu & gọi món</p>
        <div className="qr-poster-box">
          <Image src={qrUrl} alt={`QR gọi món ${tableName}`} width={360} height={360} className="h-full w-full object-contain" />
        </div>
        <div className="qr-poster-code-label">Mã QR gọi món</div>
        <p className="qr-poster-benefits">
          Gọi món nhanh <span /> Thanh toán tiện lợi <span /> Phục vụ tốt hơn
        </p>
        <div className="qr-poster-table">
          <span>Bàn số:</span>
          <strong>{tableNumber}</strong>
        </div>
      </div>
    </article>
  );
}

export function TablesWorkspace({ restaurantId, restaurantSlug, restaurantName, dashboardTableCount, tables }: TablesWorkspaceProps) {
  const router = useRouter();
  const refreshTimerRef = useRef<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<TablePanelMode>("closed");
  const [areaFilter, setAreaFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [qrActionState, setQrActionState] = useState<"idle" | "printing" | "downloading">("idle");
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("connecting");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(() => new Date());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isRefreshing, startRefreshTransition] = useTransition();

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const scheduleRefresh = () => {
      setRealtimeState("connected");
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        startRefreshTransition(() => {
          router.refresh();
          setLastSyncedAt(new Date());
        });
      }, 260);
    };

    const channel = supabase
      .channel(`admin-tables:${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tables", filter: `restaurant_id=eq.${restaurantId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, scheduleRefresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeState("connected");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtimeState("error");
      });

    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, router]);

  function refreshTables() {
    startRefreshTransition(() => {
      router.refresh();
      setLastSyncedAt(new Date());
    });
  }

  const areas = useMemo(() => {
    return ["all", ...Array.from(new Set(tables.map(tableAreaLabel)))];
  }, [tables]);

  const counts = useMemo(() => {
    return tables.reduce(
      (acc, table) => {
        acc[table.status] += 1;
        return acc;
      },
      { available: 0, needs_confirm: 0, serving: 0, overdue: 0, awaiting_payment: 0 } satisfies Record<TableOperationalStatus, number>
    );
  }, [tables]);

  const filteredTables = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return tables.filter((table) => {
      const area = tableAreaLabel(table);
      const matchesArea = areaFilter === "all" || area === areaFilter;
      const matchesStatus = statusFilter === "all" || table.status === statusFilter;
      const metadata = `${tableKindLabel(table.table_kind)} ${seatingZoneLabel(table.seating_zone)}`.toLowerCase();
      const matchesKeyword = !keyword || table.name.toLowerCase().includes(keyword) || area.toLowerCase().includes(keyword) || metadata.includes(keyword);
      return matchesArea && matchesStatus && matchesKeyword;
    });
  }, [areaFilter, query, statusFilter, tables]);

  const groupedTables = useMemo(() => {
    return [...filteredTables.reduce((map, table) => {
      const key = tableAreaLabel(table);
      map.set(key, [...(map.get(key) ?? []), table]);
      return map;
    }, new Map<string, RestaurantTableWithStatus[]>())].map(([title, items]) => ({ title, items }));
  }, [filteredTables]);

  const selected = selectedId ? tables.find((table) => table.id === selectedId) ?? null : null;
  const selectedUrl = selected ? tableQrUrl(restaurantSlug, selected) : "";
  const selectedQrUrl = selected ? qrImageUrl(selectedUrl) : "";
  const total = tables.length || dashboardTableCount;
  const serving = counts.serving + counts.needs_confirm;
  const activeTables = total - counts.available;
  const occupancyRate = Math.round((activeTables / Math.max(total, 1)) * 100);
  const qrEnabled = tables.filter((table) => table.qr_enabled).length;
  const qrDisabled = Math.max(0, total - qrEnabled);
  const areaStats = useMemo(() => {
    return areas
      .filter((area) => area !== "all")
      .map((area) => {
        const items = tables.filter((table) => tableAreaLabel(table) === area);
        const active = items.filter((table) => table.status !== "available").length;
        return {
          area,
          total: items.length,
          active,
          available: items.filter((table) => table.status === "available").length,
          overdue: items.filter((table) => table.status === "overdue").length,
          awaitingPayment: items.filter((table) => table.status === "awaiting_payment").length,
          qrDisabled: items.filter((table) => !table.qr_enabled).length,
          capacity: items.reduce((sum, table) => sum + table.capacity, 0),
          occupancyRate: Math.round((active / Math.max(items.length, 1)) * 100)
        };
      });
  }, [areas, tables]);
  const actionQueue = useMemo(() => {
    return [...tables]
      .filter((table) => table.status !== "available" || !table.qr_enabled)
      .sort((left, right) => {
        const priorityDiff = statusPriority(right.status) - statusPriority(left.status);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(left.nextServiceDueAt ?? left.oldestOrderAt ?? 0).getTime() - new Date(right.nextServiceDueAt ?? right.oldestOrderAt ?? 0).getTime();
      })
      .slice(0, 5);
  }, [tables]);
  const pressureLabel = counts.overdue
    ? `${counts.overdue} bàn quá giờ`
    : counts.needs_confirm
      ? `${counts.needs_confirm} bàn chờ nhận`
      : counts.awaiting_payment
        ? `${counts.awaiting_payment} bàn chờ thu`
        : "Mặt sàn ổn";

  async function copySelectedUrl() {
    if (!selectedUrl) return;
    await navigator.clipboard.writeText(selectedUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function buildPosterForTable(table: RestaurantTableWithStatus) {
    const tableUrl = tableQrUrl(restaurantSlug, table);
    const [logoDataUrl, qrDataUrl] = await Promise.all([
      fetchAssetDataUrl(POSTER_LOGO_URL),
      fetchAssetDataUrl(qrImageUrl(tableUrl, 760))
    ]);

    return buildQrPosterSvg({
      restaurantName,
      tableName: table.name,
      qrDataUrl,
      logoDataUrl
    });
  }

  async function downloadPoster(table: RestaurantTableWithStatus) {
    setQrActionState("downloading");
    try {
      const svg = await buildPosterForTable(table);
      await svgToPngDownload(svg, `logivn-${filenameSafe(restaurantName)}-${filenameSafe(table.name)}.png`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Không tải được template QR.");
    } finally {
      setQrActionState("idle");
    }
  }

  async function downloadAllPosters() {
    if (tables.length === 0) return;
    setQrActionState("downloading");
    try {
      for (const table of tables) {
        const svg = await buildPosterForTable(table);
        await svgToPngDownload(svg, `logivn-${filenameSafe(restaurantName)}-${filenameSafe(table.name)}.png`);
        await new Promise((resolve) => window.setTimeout(resolve, 180));
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Không tải được toàn bộ template QR.");
    } finally {
      setQrActionState("idle");
    }
  }

  async function printPosters(mode: "selected" | "all") {
    const items = mode === "selected" && selected ? [selected] : tables;
    if (items.length === 0) return;
    setQrActionState("printing");
    try {
      const posters = await Promise.all(items.map((table) => buildPosterForTable(table)));
      printSvgPosters(posters, mode === "selected" && selected ? `QR ${selected.name}` : "QR tất cả bàn");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Không mở được template để in.");
    } finally {
      setQrActionState("idle");
    }
  }

  function openTableDrawer(tableId: string) {
    setSelectedId(tableId);
    setPanelMode("table");
  }

  function closeDrawer() {
    setPanelMode("closed");
    setSelectedId(null);
  }

  return (
    <div className="grid gap-3">
      <section className="admin-hero-panel rounded-[14px] p-4">
        <div className="relative z-[1] flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={realtimeTone(realtimeState)}>
                <span className="inline-flex items-center gap-1.5">
                  <RadioTower size={13} />
                  {realtimeLabel(realtimeState)}
                </span>
              </Badge>
              <Badge tone={counts.overdue ? "red" : counts.needs_confirm ? "yellow" : "green"}>{pressureLabel}</Badge>
              <Badge tone={qrDisabled ? "yellow" : "green"}>{qrDisabled ? `${qrDisabled} QR tắt` : "QR sẵn sàng"}</Badge>
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-normal text-[var(--foreground)] sm:text-3xl">Mặt sàn & QR vận hành</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[var(--muted-foreground)]">
              Theo dõi trạng thái bàn theo khu vực, xử lý bàn đang chờ order/thanh toán và in QR đúng token để khách gọi món nhanh trong giờ cao điểm.
            </p>
          </div>
          <div className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/80 p-3 text-sm font-semibold text-[var(--muted-foreground)] shadow-sm sm:min-w-[280px]">
            <div className="flex items-center justify-between gap-3">
              <span>Cập nhật</span>
              <strong className="text-[var(--foreground)]">{formatClock(lastSyncedAt)}</strong>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-container-high)]">
              <div className={cn("h-full rounded-full", occupancyRate >= 85 ? "bg-[var(--tertiary)]" : occupancyRate >= 60 ? "bg-[var(--accent)]" : "bg-[var(--primary)]")} style={{ width: `${Math.min(100, occupancyRate)}%` }} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Công suất bàn</span>
              <strong className="text-[var(--foreground)]">{occupancyRate}%</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <TablesMetric icon={Table2} label="Tổng bàn" value={total} meta={`${areaStats.length || 1} khu vực đang quản lý`} tone="blue" />
        <TablesMetric icon={CheckCircle2} label="Bàn trống" value={counts.available} meta={`${Math.round((counts.available / Math.max(total, 1)) * 100)}% sẵn sàng nhận khách`} tone="green" />
        <TablesMetric icon={Users} label="Đang phục vụ" value={serving} meta={counts.overdue ? `${counts.overdue} bàn quá giờ` : `${counts.awaiting_payment} bàn chờ thu`} tone={counts.overdue > 0 ? "red" : counts.needs_confirm > 0 ? "yellow" : "green"} />
        <TablesMetric icon={QrCode} label="QR active" value={qrEnabled} meta={qrDisabled ? `${qrDisabled} bàn cần bật/in lại QR` : "Tất cả QR đang bật"} tone={qrDisabled ? "yellow" : "green"} />
      </section>

      <section className="grid gap-3">
        <div className="grid gap-3">
          <div className="dashboard-panel p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-[var(--foreground)]">Sơ đồ bàn realtime</h2>
                <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-[var(--muted-foreground)]">
                  Bàn được nhóm theo khu vực, màu theo trạng thái vận hành. Bấm vào từng bàn để mở QR, chỉnh thông tin, xoay token hoặc xử lý bàn đang có hóa đơn.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={refreshTables} disabled={isRefreshing} className="shadow-none hover:shadow-none">
                  <RefreshCw size={16} className={isRefreshing ? "animate-spin" : undefined} />
                  Làm mới
                </Button>
                <Button type="button" variant="secondary" onClick={() => printPosters("all")} disabled={qrActionState !== "idle" || tables.length === 0} className="shadow-none hover:shadow-none">
                  <Printer size={16} />
                  In tất cả
                </Button>
                <Button type="button" onClick={() => setPanelMode("create")} className="shadow-none hover:shadow-none">
                  <Plus size={16} />
                  Thêm bàn
                </Button>
              </div>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-[180px_190px_minmax(0,1fr)_120px]">
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                Khu vực
                <select
                  value={areaFilter}
                  onChange={(event) => setAreaFilter(event.target.value)}
                  className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold normal-case tracking-normal text-[var(--foreground)] outline-none"
                >
                  {areas.map((area) => (
                    <option key={area} value={area}>{area === "all" ? "Tất cả khu vực" : area}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                Trạng thái
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                  className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold normal-case tracking-normal text-[var(--foreground)] outline-none"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="relative grid gap-1 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                Tìm nhanh
                <Search className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-[var(--outline)]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tên bàn, khu vực..."
                  className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-10 pr-3 text-sm font-medium normal-case tracking-normal outline-none"
                />
              </label>
              <Button type="button" variant="secondary" className="self-end" onClick={() => {
                setAreaFilter("all");
                setStatusFilter("all");
                setQuery("");
              }}>
                Xoá lọc
              </Button>
            </div>

            <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Layers3 size={16} className="text-[var(--primary)]" />
                    <h3 className="text-sm font-black text-[var(--foreground)]">Khu vực & công suất</h3>
                  </div>
                  <Badge tone={occupancyRate >= 85 ? "red" : occupancyRate >= 60 ? "yellow" : "green"}>{occupancyRate}% bận</Badge>
                </div>
                {areaStats.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm font-semibold text-[var(--muted-foreground)]">
                    Chưa có khu vực. Tạo bàn đầu tiên để bắt đầu sơ đồ quán.
                  </div>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                    {areaStats.map((area) => (
                      <button
                        key={area.area}
                        type="button"
                        onClick={() => setAreaFilter(area.area)}
                        className={cn(
                          "rounded-lg border bg-[var(--surface)] p-3 text-left transition hover:border-[var(--primary)]",
                          areaFilter === area.area ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/15" : "border-[var(--border)]"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-black text-[var(--foreground)]">{area.area}</p>
                          <span className="text-xs font-black text-[var(--primary)]">{area.active}/{area.total}</span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-container-high)]">
                          <div className={cn("h-full rounded-full", area.overdue ? "bg-[var(--tertiary)]" : area.occupancyRate >= 70 ? "bg-[var(--accent)]" : "bg-[var(--primary)]")} style={{ width: `${Math.min(100, area.occupancyRate)}%` }} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-[var(--muted-foreground)]">
                          <span>{area.available} trống</span>
                          <span>{area.capacity} chỗ</span>
                          {area.overdue ? <span className="text-[var(--tertiary)]">{area.overdue} quá giờ</span> : null}
                          {area.qrDisabled ? <span className="text-[var(--accent-strong)]">{area.qrDisabled} QR tắt</span> : null}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className={counts.overdue ? "text-[var(--tertiary)]" : "text-[var(--accent)]"} />
                    <h3 className="text-sm font-black text-[var(--foreground)]">Cần xử lý</h3>
                  </div>
                  <Badge tone={actionQueue.length ? (counts.overdue ? "red" : "yellow") : "green"}>{actionQueue.length || "Ổn"}</Badge>
                </div>
                <div className="grid gap-2">
                  {actionQueue.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-4 text-sm font-semibold text-[var(--muted-foreground)]">
                      Không có bàn cần can thiệp. Mặt sàn đang sẵn sàng.
                    </div>
                  ) : (
                    actionQueue.map((table) => {
                      const meta = statusMeta(table.status);
                      return (
                        <button
                          key={table.id}
                          type="button"
                          onClick={() => openTableDrawer(table.id)}
                          className="rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-left transition hover:border-[var(--primary)]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm font-black text-[var(--foreground)]">{table.name}</span>
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                          </div>
                          <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">{tableAreaLabel(table)} · {tableActionCopy(table, nowMs)}</p>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4">
              {tables.length === 0 ? (
                <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] px-5 text-center">
                  <div>
                    <Table2 className="mx-auto text-[var(--primary)]" size={34} />
                    <h2 className="mt-3 text-lg font-semibold text-[var(--foreground)]">Chưa có bàn</h2>
                    <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Tạo bàn đầu tiên để hệ thống sinh QR menu cho khách quét.</p>
                  </div>
                </div>
              ) : filteredTables.length === 0 ? (
                <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] px-5 text-center text-sm font-medium text-[var(--muted-foreground)]">
                  Không có bàn phù hợp với bộ lọc hiện tại.
                </div>
              ) : (
                <div className="grid gap-6">
                  {groupedTables.map((group) => (
                    <div key={group.title}>
                      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                        <Grid3X3 size={16} />
                        {group.title}
                      </h2>
                      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
                        {group.items.map((table) => {
                          const meta = statusMeta(table.status);
                          const isSelected = selected?.id === table.id;
                          const dueIn = minutesUntil(table.nextServiceDueAt, nowMs);
                          return (
                            <button
                              key={table.id}
                              type="button"
                              onClick={() => openTableDrawer(table.id)}
                              className={cn(
                                "min-h-[112px] rounded-xl border px-3 py-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
                                meta.className,
                                isSelected ? "ring-2 ring-[var(--primary)]/24 ring-offset-2 ring-offset-[var(--surface)]" : ""
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-black">{table.name}</p>
                                  <p className="mt-1 truncate text-xs font-bold opacity-75">{table.capacity} chỗ · {tableKindLabel(table.table_kind)}</p>
                                </div>
                                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
                              </div>
                              <p className="mt-3 text-[11px] font-black uppercase tracking-[0.06em]">{meta.label}</p>
                              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold opacity-80">
                                {table.unpaidTotal > 0 ? <span>{formatVnd(table.unpaidTotal)}</span> : <span>{seatingZoneLabel(table.seating_zone)}</span>}
                                {!table.qr_enabled ? <span>QR tắt</span> : <span>QR bật</span>}
                                {table.is_under_maintenance ? <span>Bảo trì</span> : null}
                                {table.is_hidden ? <span>Ẩn</span> : null}
                                {dueIn !== null ? <span>{dueIn < 0 ? `Trễ ${Math.abs(dueIn)}p` : `${dueIn}p`}</span> : null}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-[var(--muted-foreground)]">
                {statusOptions.filter((item) => item.value !== "all").map((status) => {
                  const meta = statusMeta(status.value as TableOperationalStatus);
                  return (
                    <span key={status.value} className="inline-flex items-center gap-1.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="dashboard-panel flex flex-wrap items-center justify-between gap-3 p-4">
	            <div>
	              <h2 className="text-lg font-semibold text-[var(--foreground)]">Xuất QR hàng loạt</h2>
	              <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">In hoặc tải nguyên bộ template QR theo đúng khung thương hiệu.</p>
	            </div>
	            <div className="flex flex-wrap gap-2">
	              <Button type="button" variant="secondary" disabled={qrActionState !== "idle" || tables.length === 0} onClick={() => printPosters("all")} className="shadow-none hover:shadow-none">
	                <Printer size={16} />
	                In tất cả
	              </Button>
	              {tables.length > 1 && (
	                <Button type="button" variant="secondary" disabled={qrActionState !== "idle"} onClick={downloadAllPosters} className="shadow-none hover:shadow-none">
	                  <Download size={16} />
	                  Tải toàn bộ
	                </Button>
	              )}
	            </div>
	            {qrActionState !== "idle" && (
	              <p className="basis-full text-xs font-semibold text-[var(--accent)]">
	                {qrActionState === "printing" ? "Đang chuẩn bị bản in..." : "Đang tạo ảnh template..."}
	              </p>
	            )}
	          </div>
	        </div>

	        {panelMode !== "closed" && (
	          <div className="fixed inset-0 z-[var(--z-dashboard-drawer)] overflow-hidden overscroll-contain">
		            <button type="button" className="drawer-backdrop absolute inset-0 z-0" aria-label="Đóng chi tiết bàn" onClick={closeDrawer} />
		            <aside
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="table-drawer-title"
                  className="drawer-panel absolute inset-y-0 right-0 z-[1] flex h-dvh max-h-dvh w-full max-w-[500px] flex-col border-l border-[var(--border)] bg-[var(--surface)]"
                >
	              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5 sm:py-4">
	                <div>
	                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Bàn & QR</p>
	                  <h3 id="table-drawer-title" className="mt-1 text-xl font-semibold text-[var(--foreground)]">
	                    {panelMode === "create" ? "Thêm bàn mới" : selected ? selected.name : "Chi tiết bàn"}
	                  </h3>
	                </div>
		                <button type="button" onClick={closeDrawer} className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]" aria-label="Đóng chi tiết bàn">
		                  <X size={18} />
		                </button>
	              </div>
	              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-5">
	                {panelMode === "create" && (
	                  <form action={createTableAction} className="grid gap-4">
	                    <label className="grid gap-2 text-sm font-semibold">
	                      Tên bàn
	                      <Input name="name" placeholder="Bàn 13" required />
	                    </label>
                    <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
	                      <label className="grid gap-2 text-sm font-semibold">
	                        Khu vực
	                        <Input name="area" placeholder="Khu chính" />
	                      </label>
	                      <label className="grid gap-2 text-sm font-semibold">
	                        Sức chứa
	                        <Input name="capacity" type="number" min={1} max={50} defaultValue={4} />
	                      </label>
	                    </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-2 text-sm font-semibold">
                          Tầng
                          <Input name="floorLabel" placeholder="Tầng trệt" />
                        </label>
                        <label className="grid gap-2 text-sm font-semibold">
                          Ưu tiên đặt bàn
                          <Input name="reservationPriority" type="number" min={1} max={999} defaultValue={100} />
                        </label>
                        <label className="grid gap-2 text-sm font-semibold">
                          Không gian
                          <select name="seatingZone" defaultValue="indoor" className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--primary)]">
                            <option value="indoor">Trong nhà</option>
                            <option value="outdoor">Ngoài trời</option>
                            <option value="mixed">Linh hoạt</option>
                          </select>
                        </label>
                        <label className="grid gap-2 text-sm font-semibold">
                          Loại bàn
                          <select name="tableKind" defaultValue="standard" className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--primary)]">
                            <option value="standard">Tiêu chuẩn</option>
                            <option value="vip">VIP</option>
                            <option value="bar">Quầy bar</option>
                            <option value="community">Bàn chung</option>
                          </select>
                        </label>
                      </div>
                      <div className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                        <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold">
                          Nhận đặt trước
                          <input type="checkbox" name="isBookable" value="true" defaultChecked className="h-5 w-5 accent-[var(--accent)]" />
                        </label>
                        <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold">
                          Ẩn khỏi sơ đồ
                          <input type="checkbox" name="isHidden" value="true" className="h-5 w-5 accent-[var(--accent)]" />
                        </label>
                        <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold">
                          Đang bảo trì
                          <input type="checkbox" name="isUnderMaintenance" value="true" className="h-5 w-5 accent-[var(--accent)]" />
                        </label>
                      </div>
	                    <Button className="shadow-none hover:shadow-none">
	                      <Plus size={16} />
	                      Thêm bàn mới
	                    </Button>
	                  </form>
	                )}

                {panelMode === "table" && selected && (
	                  <div className="grid gap-4">
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h2 className="text-lg font-semibold text-[var(--foreground)]">Thông tin bàn</h2>
                            <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Chỉnh thông tin cơ bản và kiểm tra tình trạng vận hành hiện tại.</p>
                          </div>
                          <Badge tone={statusMeta(selected.status).tone}>{statusMeta(selected.status).label}</Badge>
                        </div>
                        <form key={selected.id} action={updateTableAction} className="mt-5 grid gap-3">
                          <input type="hidden" name="tableId" value={selected.id} />
                          <label className="grid gap-2 text-sm font-semibold">
                            Tên bàn
                            <Input name="name" defaultValue={selected.name} required />
                          </label>
                          <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
                            <label className="grid gap-2 text-sm font-semibold">
                              Khu vực
                              <Input name="area" defaultValue={selected.area || "Khu chính"} />
                            </label>
                            <label className="grid gap-2 text-sm font-semibold">
                              Sức chứa
                              <Input name="capacity" type="number" min={1} max={50} defaultValue={selected.capacity} />
                            </label>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="grid gap-2 text-sm font-semibold">
                              Tầng
                              <Input name="floorLabel" defaultValue={selected.floor_label || "Tầng trệt"} />
                            </label>
                            <label className="grid gap-2 text-sm font-semibold">
                              Ưu tiên đặt bàn
                              <Input name="reservationPriority" type="number" min={1} max={999} defaultValue={selected.reservation_priority ?? 100} />
                            </label>
                            <label className="grid gap-2 text-sm font-semibold">
                              Không gian
                              <select name="seatingZone" defaultValue={selected.seating_zone ?? "indoor"} className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--primary)]">
                                <option value="indoor">Trong nhà</option>
                                <option value="outdoor">Ngoài trời</option>
                                <option value="mixed">Linh hoạt</option>
                              </select>
                            </label>
                            <label className="grid gap-2 text-sm font-semibold">
                              Loại bàn
                              <select name="tableKind" defaultValue={selected.table_kind ?? "standard"} className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--primary)]">
                                <option value="standard">Tiêu chuẩn</option>
                                <option value="vip">VIP</option>
                                <option value="bar">Quầy bar</option>
                                <option value="community">Bàn chung</option>
                              </select>
                            </label>
                          </div>
                          <div className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                            <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold">
                              Nhận đặt trước
                              <input type="checkbox" name="isBookable" value="true" defaultChecked={selected.is_bookable !== false} className="h-5 w-5 accent-[var(--accent)]" />
                            </label>
                            <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold">
                              Ẩn khỏi sơ đồ
                              <input type="checkbox" name="isHidden" value="true" defaultChecked={Boolean(selected.is_hidden)} className="h-5 w-5 accent-[var(--accent)]" />
                            </label>
                            <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold">
                              Đang bảo trì
                              <input type="checkbox" name="isUnderMaintenance" value="true" defaultChecked={Boolean(selected.is_under_maintenance)} className="h-5 w-5 accent-[var(--accent)]" />
                            </label>
                          </div>
                          <Button className="w-full shadow-none hover:shadow-none">
                            <Save size={16} />
                            Lưu thông tin bàn
                          </Button>
                        </form>
                      </div>

                      <div className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
                        <div className="flex justify-between gap-4"><span className="text-[var(--muted-foreground)]">Vị trí</span><strong>{tableAreaLabel(selected)}</strong></div>
                        <div className="flex justify-between gap-4"><span className="text-[var(--muted-foreground)]">Không gian</span><strong>{seatingZoneLabel(selected.seating_zone)}</strong></div>
                        <div className="flex justify-between gap-4"><span className="text-[var(--muted-foreground)]">Loại bàn</span><strong>{tableKindLabel(selected.table_kind)}</strong></div>
                        <div className="flex flex-wrap gap-2">
                          {selected.table_kind === "vip" ? <Badge tone="yellow"><Crown size={13} /> VIP</Badge> : null}
                          {selected.is_hidden ? <Badge tone="neutral"><EyeOff size={13} /> Đang ẩn</Badge> : null}
                          {selected.is_under_maintenance ? <Badge tone="red"><Wrench size={13} /> Bảo trì</Badge> : null}
                        </div>
                        <div className="flex justify-between gap-4"><span className="text-[var(--muted-foreground)]">Đơn đang mở</span><strong>{selected.activeOrderCount}</strong></div>
                        <div className="flex justify-between gap-4"><span className="text-[var(--muted-foreground)]">Tổng chưa thanh toán</span><strong>{formatVnd(selected.unpaidTotal)}</strong></div>
                        <div className="flex justify-between gap-4"><span className="text-[var(--muted-foreground)]">Đơn quá giờ</span><strong>{selected.overdueCount}</strong></div>
                        <div className="flex justify-between gap-4"><span className="text-[var(--muted-foreground)]">Cập nhật gần nhất</span><strong>{formatTime(selected.oldestOrderAt)}</strong></div>
                      </div>

                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                        <h3 className="font-semibold text-[var(--foreground)]">Template QR in bàn</h3>
                        <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">
                          {selected.qr_token_enforced
                            ? `QR bảo mật đang bật${selected.qr_token_rotated_at ? ` · xoay lần cuối ${formatTime(selected.qr_token_rotated_at)}` : ""}.`
                            : "QR cũ vẫn còn tương thích. Bấm xoay mã để vô hiệu hóa link cũ và dùng QR có token."}
                        </p>
                        <div className="mt-3 grid gap-4">
                          <div className={selected.qr_enabled ? "" : "opacity-45 grayscale"}>
                            <QrPrintPoster restaurantName={restaurantName} tableName={selected.name} qrUrl={selectedQrUrl} />
                          </div>
                          <div className="grid content-start gap-3">
                            <a href={selectedUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] text-sm font-semibold text-white">
                              <Link2 size={16} />
                              Mở link gọi món
                            </a>
                            <Button type="button" variant="secondary" onClick={copySelectedUrl} className="shadow-none hover:shadow-none">
                              <Copy size={16} />
                              {copied ? "Đã sao chép" : "Sao chép link"}
                            </Button>
                            <div className="grid grid-cols-2 gap-3">
                              <Button type="button" variant="secondary" disabled={qrActionState !== "idle"} onClick={() => printPosters("selected")} className="shadow-none hover:shadow-none">
                                <Printer size={16} />
                                In template
                              </Button>
                              <Button type="button" variant="secondary" disabled={qrActionState !== "idle"} onClick={() => downloadPoster(selected)} className="shadow-none hover:shadow-none">
                                <Download size={16} />
                                Tải ảnh
                              </Button>
                            </div>
                            <form action={toggleTableQrAction}>
                              <input type="hidden" name="tableId" value={selected.id} />
                              <input type="hidden" name="qrEnabled" value={String(!selected.qr_enabled)} />
                              <Button type="submit" variant={selected.qr_enabled ? "ghost" : "secondary"} className="w-full shadow-none hover:shadow-none">
                                <QrCode size={16} />
                                {selected.qr_enabled ? "Tắt QR bàn này" : "Bật QR bàn này"}
                              </Button>
                            </form>
                            <form action={rotateTableQrAction}>
                              <input type="hidden" name="tableId" value={selected.id} />
                              <ConfirmActionButton
                                type="submit"
                                variant="secondary"
                                className="w-full shadow-none hover:shadow-none"
                                confirmTitle="Xoay mã QR"
                                confirmDescription="Link QR cũ của bàn này sẽ hết hiệu lực. Hãy in lại template QR mới sau khi xoay."
                                confirmLabel="Xoay mã QR"
                              >
                                <QrCode size={16} />
                                Xoay mã QR bảo mật
                              </ConfirmActionButton>
                            </form>
                          </div>
                        </div>
                      </div>

	                      <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--surface)] p-4">
                        <h2 className="text-lg font-semibold text-[var(--foreground)]">Vùng nguy hiểm</h2>
                        <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Chỉ xoá bàn khi không còn đơn hoặc hóa đơn đang mở.</p>
                        <form action={deleteTableAction} className="mt-4">
                          <input type="hidden" name="tableId" value={selected.id} />
		                          <ConfirmActionButton
                            type="submit"
                            variant="ghost"
                            className="w-full border-[var(--accent)]/30 text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]"
                            confirmTitle="Xoá bàn"
                            confirmDescription={`${selected.name} sẽ bị xoá. Chỉ tiếp tục nếu bàn này không còn đơn hoặc hoá đơn đang mở.`}
                            confirmLabel="Xoá bàn"
                          >
                            <Trash2 size={16} />
                            Xoá bàn
                          </ConfirmActionButton>
                        </form>
                      </div>
	                  </div>
	                )}
	              </div>
	            </aside>
	          </div>
	        )}
	      </section>

      <section className="hidden print:block">
        <div className="grid grid-cols-2 gap-8">
          {tables.map((table) => {
            const tableUrl = tableQrUrl(restaurantSlug, table);
            return (
              <QrPrintPoster key={table.id} restaurantName={restaurantName} tableName={table.name} qrUrl={qrImageUrl(tableUrl, 520)} />
            );
          })}
        </div>
      </section>
    </div>
  );
}
