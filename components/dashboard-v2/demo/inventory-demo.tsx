"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Boxes, FileText, PackageCheck, Sparkles, TrendingDown } from "lucide-react";
import { FilterTabs, Toolbar, DataTable, type Column } from "../workspace-ui";
import { MetricCard, Badge, EmptyState } from "../primitives";
import { Button } from "../button";
import { Drawer } from "../overlay";
import { useToast } from "@/components/dashboard/toast-provider";
import { fmtVnd } from "./data";

/* InventoryDemo — kho gắn với vận hành:
 *  - cảnh báo thiếu hàng theo min stock
 *  - drawer chi tiết có công thức món bị ảnh hưởng
 *  - hành động tạo PO mô phỏng để đưa item về trạng thái active
 */

type StockStatus = "ok" | "low" | "out";
type Ing = {
  id: string;
  name: string;
  onHand: number;
  min: number;
  unit: string;
  cost: number;
  status: StockStatus;
  supplier: string;
  affects: string[];
  daysLeft: number;
};

const INIT: Ing[] = [
  { id: "i1", name: "Sữa tươi", onHand: 2, min: 10, unit: "lít", cost: 32_000, status: "low", supplier: "Vinamilk Đà Nẵng", affects: ["Bạc xỉu", "Latte", "Cà phê sữa"], daysLeft: 1 },
  { id: "i2", name: "Cà phê hạt", onHand: 8, min: 5, unit: "kg", cost: 180_000, status: "ok", supplier: "Rang xay A Lâm", affects: ["Cà phê sữa đá", "Americano", "Bạc xỉu"], daysLeft: 5 },
  { id: "i3", name: "Đá viên", onHand: 0, min: 20, unit: "kg", cost: 8_000, status: "out", supplier: "Đá sạch Hải Châu", affects: ["Tất cả đồ uống lạnh"], daysLeft: 0 },
  { id: "i4", name: "Trà nhài", onHand: 3, min: 5, unit: "kg", cost: 120_000, status: "low", supplier: "Trà Mộc", affects: ["Trà đào cam sả", "Trà chanh"], daysLeft: 2 },
  { id: "i5", name: "Đường", onHand: 25, min: 10, unit: "kg", cost: 22_000, status: "ok", supplier: "Tạp hoá Hoà", affects: ["Đồ uống", "Tráng miệng"], daysLeft: 9 },
  { id: "i6", name: "Trân châu", onHand: 12, min: 8, unit: "kg", cost: 45_000, status: "ok", supplier: "Topping Việt", affects: ["Trà sữa", "Bạc xỉu topping"], daysLeft: 4 }
];

const STON = {
  ok: { label: "Đủ", tone: "ok" as const },
  low: { label: "Sắp hết", tone: "orange" as const },
  out: { label: "Hết hàng", tone: "danger" as const }
};

export function InventoryDemo() {
  const [items, setItems] = useState(INIT);
  const [tab, setTab] = useState("all");
  const [sel, setSel] = useState<string | null>(null);
  const toast = useToast();

  const counts = { all: items.length, low: items.filter((i) => i.status === "low").length, out: items.filter((i) => i.status === "out").length };
  const visible = tab === "all" ? items : tab === "alert" ? items.filter((i) => i.status !== "ok") : items.filter((i) => i.status === tab);
  const current = items.find((i) => i.id === sel) ?? null;
  const inventoryValue = useMemo(() => items.reduce((s, i) => s + i.onHand * i.cost, 0), [items]);

  function receive(id: string) {
    setItems((p) => p.map((i) => (i.id === id ? { ...i, onHand: Math.max(i.min * 2, i.onHand + i.min), status: "ok" as const, daysLeft: 7 } : i)));
    toast.success("Đã ghi nhận phiếu nhập kho");
  }

  const cols: Column<Ing>[] = [
    { key: "name", header: "Nguyên liệu", width: "1.6fr", render: (i) => (
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold text-[var(--d-text)]">{i.name}</span>
        <span className="text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">{i.supplier}</span>
      </span>
    ) },
    { key: "stock", header: "Tồn / Tối thiểu", render: (i) => <span className="d-num text-[var(--d-text-muted)]"><span className={i.status !== "ok" ? "font-bold text-[var(--d-danger-fg)]" : "font-bold text-[var(--d-text)]"}>{i.onHand}</span> / {i.min} {i.unit}</span> },
    { key: "days", header: "Còn dùng", render: (i) => <span className="d-num text-[var(--d-text-muted)]">{i.daysLeft === 0 ? "Hôm nay" : `${i.daysLeft} ngày`}</span> },
    { key: "cost", header: "Giá vốn", align: "right", render: (i) => <span className="d-num text-[var(--d-text-muted)]">{fmtVnd(i.cost)}/{i.unit}</span> },
    { key: "status", header: "Trạng thái", align: "right", render: (i) => <Badge tone={STON[i.status].tone}>{STON[i.status].label}</Badge> }
  ];

  return (
    <div className="flex flex-col gap-[var(--d-s-5)]">
      <Toolbar eyebrow="Kho & giá vốn" title="Kho hàng">
        <Button variant="secondary" size="md" onClick={() => toast.success("Đã mở phiếu nhập kho mới")}><FileText size={15} /> Tạo phiếu nhập</Button>
        <Button variant="primary" size="md" onClick={() => toast.info("AI đang đọc hoá đơn ảnh, sẽ tạo phiếu nhập tự động khi xong")}><Sparkles size={15} /> AI đọc hoá đơn</Button>
      </Toolbar>

      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        <MetricCard icon={<Boxes size={18} />} label="Nguyên liệu" value={String(items.length)} tone="jade" />
        <MetricCard icon={<AlertTriangle size={18} />} label="Sắp hết" value={String(counts.low)} tone="orange" />
        <MetricCard icon={<TrendingDown size={18} />} label="Hết hàng" value={String(counts.out)} tone="danger" />
        <MetricCard icon={<FileText size={18} />} label="Giá trị kho" value={fmtVnd(inventoryValue)} tone="neutral" />
      </section>

      <div className="flex flex-col gap-3 rounded-[var(--d-r-lg)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)]/50 p-[var(--d-s-4)] sm:flex-row sm:items-center">
        <Sparkles size={18} className="flex-none text-[var(--d-orange-600)]" />
        <p className="flex-1 text-[length:var(--d-fs-sm)] text-[var(--d-text)]"><span className="font-semibold">AI gợi ý:</span> đặt thêm Sữa tươi 20 lít và Đá viên 40kg trước 16:00 để không tắt món lạnh ca tối.</p>
        <Button variant="secondary" size="sm" onClick={() => items.filter((i) => i.status !== "ok").forEach((i) => receive(i.id))}>Tạo PO nhanh</Button>
      </div>

      <FilterTabs active={tab} onChange={setTab} tabs={[{ key: "all", label: "Tất cả", count: counts.all }, { key: "alert", label: "Cần chú ý", count: counts.low + counts.out }, { key: "low", label: "Sắp hết", count: counts.low }, { key: "out", label: "Hết", count: counts.out }]} />

      <DataTable columns={cols} rows={visible} onRowClick={(i) => setSel(i.id)} empty={<EmptyState icon={<PackageCheck size={20} />} title="Không có cảnh báo kho" />} />

      <InventoryDrawer item={current} open={Boolean(current)} onClose={() => setSel(null)} onReceive={receive} />
    </div>
  );
}

function InventoryDrawer({ item, open, onClose, onReceive }: { item: Ing | null; open: boolean; onClose: () => void; onReceive: (id: string) => void }) {
  if (!item) return null;
  const suggestedQty = Math.max(item.min * 2 - item.onHand, item.min);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title={item.name}
      subtitle="Chi tiết nguyên liệu"
      headerMeta={<Badge tone={STON[item.status].tone}>{STON[item.status].label}</Badge>}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>Đóng</Button>
          <Button variant="primary" size="lg" className="flex-[2]" onClick={() => onReceive(item.id)}><PackageCheck size={15} /> Nhập {suggestedQty} {item.unit}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-[var(--d-s-5)]">
        <section className="grid grid-cols-3 gap-2">
          <Tile label="Tồn kho" value={`${item.onHand} ${item.unit}`} />
          <Tile label="Tối thiểu" value={`${item.min} ${item.unit}`} />
          <Tile label="Còn dùng" value={item.daysLeft === 0 ? "Hôm nay" : `${item.daysLeft} ngày`} />
        </section>

        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
          <p className="d-eyebrow">Món bị ảnh hưởng</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.affects.map((m) => <Badge key={m} tone={item.status === "ok" ? "neutral" : "orange"}>{m}</Badge>)}
          </div>
        </section>

        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-4)]">
          <p className="d-eyebrow">Đề xuất đặt hàng</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Tile label="Nhà cung cấp" value={item.supplier} />
            <Tile label="Số lượng gợi ý" value={`${suggestedQty} ${item.unit}`} />
          </div>
          <p className="mt-3 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">Giá vốn dự kiến: <span className="d-num font-bold text-[var(--d-text)]">{fmtVnd(suggestedQty * item.cost)}</span></p>
        </section>
      </div>
    </Drawer>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
      <p className="text-[length:var(--d-fs-2xs)] font-semibold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</p>
      <p className="mt-1 truncate text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{value}</p>
    </div>
  );
}
