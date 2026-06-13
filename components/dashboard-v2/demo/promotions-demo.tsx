"use client";

import { useState } from "react";
import { CalendarRange, Copy, Gift, Pause, Pencil, Play, Plus, Sparkles, Tag, Trash2, TrendingUp } from "lucide-react";
import { FilterTabs, Toolbar } from "../workspace-ui";
import { MetricCard, Badge, EmptyState } from "../primitives";
import { Button } from "../button";
import { Drawer, Modal } from "../overlay";
import { useToast } from "@/components/dashboard/toast-provider";
import { fmtVnd } from "./data";
import { cn } from "@/lib/utils";

type PromoType = "percent" | "amount" | "combo" | "happy-hour";
type PromoStatus = "active" | "scheduled" | "paused" | "expired";

type Promo = {
  id: string;
  name: string;
  type: PromoType;
  value: string;
  uses: number;
  cap: number;
  revenue: number;
  status: PromoStatus;
  startDate: string;
  endDate: string;
  conditions: string[];
};

const STATUS: Record<PromoStatus, { label: string; tone: "ok" | "info" | "neutral" | "danger" }> = {
  active: { label: "Đang chạy", tone: "ok" },
  scheduled: { label: "Đã lên lịch", tone: "info" },
  paused: { label: "Tạm dừng", tone: "neutral" },
  expired: { label: "Hết hạn", tone: "danger" }
};

const TYPE_LABEL: Record<PromoType, string> = {
  percent: "Giảm %",
  amount: "Giảm tiền",
  combo: "Combo",
  "happy-hour": "Giờ vàng"
};

const INIT: Promo[] = [
  { id: "p1", name: "Giờ vàng 14h-16h", type: "happy-hour", value: "-20%", uses: 124, cap: 500, revenue: 1_240_000, status: "active", startDate: "01/06", endDate: "30/06", conditions: ["Áp dụng QR tại bàn", "Khung 14:00–16:00"] },
  { id: "p2", name: "Combo cuối tuần", type: "combo", value: "Combo 2 ly + bánh", uses: 56, cap: 100, revenue: 980_000, status: "active", startDate: "01/06", endDate: "30/06", conditions: ["Chỉ T7, CN", "Tối đa 2 lần/khách"] },
  { id: "p3", name: "Sinh nhật khách", type: "amount", value: "-50.000₫", uses: 18, cap: 50, revenue: 450_000, status: "active", startDate: "Vĩnh viễn", endDate: "—", conditions: ["Khách có hồ sơ", "Trong tuần sinh nhật"] },
  { id: "p4", name: "Khai trương chi nhánh", type: "percent", value: "-30%", uses: 0, cap: 200, revenue: 0, status: "scheduled", startDate: "20/06", endDate: "27/06", conditions: ["Chi nhánh Hải Châu 2", "Tối đa 50.000₫/đơn"] }
];

export function PromotionsDemo() {
  const [items, setItems] = useState<Promo[]>(INIT);
  const [tab, setTab] = useState("all");
  const [sel, setSel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const visible = tab === "all" ? items : items.filter((p) => p.status === tab);
  const current = items.find((p) => p.id === sel) ?? null;
  const totalUses = items.reduce((s, p) => s + p.uses, 0);
  const totalRevenue = items.reduce((s, p) => s + p.revenue, 0);
  const avgConversion = items.length ? Math.round((totalUses / items.reduce((s, p) => s + p.cap, 0)) * 100) : 0;

  const togglePause = (id: string) => {
    setItems((p) => p.map((x) => (x.id === id ? { ...x, status: x.status === "paused" ? "active" : x.status === "active" ? "paused" : x.status } : x)));
    toast.success("Đã cập nhật trạng thái khuyến mãi");
  };

  const remove = (id: string) => {
    setItems((p) => p.filter((x) => x.id !== id));
    setSel(null);
    toast.info("Đã xoá khuyến mãi");
  };

  const duplicate = (p: Promo) => {
    setItems((prev) => [...prev, { ...p, id: `p${prev.length + 1}`, name: `${p.name} (bản sao)`, status: "scheduled", uses: 0, revenue: 0 }]);
    toast.success("Đã nhân bản khuyến mãi");
  };

  const create = (data: { name: string; type: PromoType; value: string; cap: number }) => {
    setItems((p) => [
      ...p,
      { id: `p${p.length + 1}`, name: data.name, type: data.type, value: data.value, uses: 0, cap: data.cap, revenue: 0, status: "scheduled", startDate: "Hôm nay", endDate: "—", conditions: ["Áp dụng tất cả kênh"] }
    ]);
    setCreating(false);
    toast.success("Đã tạo khuyến mãi mới");
  };

  return (
    <div className="flex flex-col gap-[var(--d-s-5)]">
      <Toolbar eyebrow="Marketing" title="Khuyến mãi">
        <Button variant="secondary" size="md" onClick={() => toast.info("AI đang phân tích khách hàng để gợi ý chiến dịch")}><Sparkles size={15} /> AI gợi ý CT</Button>
        <Button variant="primary" size="md" onClick={() => setCreating(true)}><Plus size={15} /> Tạo khuyến mãi</Button>
      </Toolbar>

      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        <MetricCard icon={<Tag size={18} />} label="Đang chạy" value={String(items.filter((x) => x.status === "active").length)} tone="jade" />
        <MetricCard icon={<Gift size={18} />} label="Lượt dùng" value={String(totalUses)} helper="hôm nay" tone="orange" />
        <MetricCard icon={<TrendingUp size={18} />} label="Doanh thu KM" value={fmtVnd(totalRevenue)} tone="info" />
        <MetricCard icon={<Sparkles size={18} />} label="Tỉ lệ chuyển đổi" value={`${avgConversion}%`} tone="neutral" />
      </section>

      <FilterTabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "all", label: "Tất cả", count: items.length },
          { key: "active", label: "Đang chạy", count: items.filter((x) => x.status === "active").length },
          { key: "scheduled", label: "Lên lịch", count: items.filter((x) => x.status === "scheduled").length },
          { key: "paused", label: "Tạm dừng", count: items.filter((x) => x.status === "paused").length }
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState icon={<Tag size={20} />} title="Chưa có khuyến mãi" description="Tạo chương trình để tăng lượt khách giờ vắng." action={<Button variant="primary" size="md" onClick={() => setCreating(true)}><Plus size={15} /> Tạo khuyến mãi</Button>} />
      ) : (
        <div className="grid gap-[var(--d-s-3)] sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => (
            <PromoCard key={p.id} promo={p} onOpen={() => setSel(p.id)} onPause={() => togglePause(p.id)} onDuplicate={() => duplicate(p)} />
          ))}
        </div>
      )}

      <PromoDrawer promo={current} open={Boolean(current)} onClose={() => setSel(null)} onPause={togglePause} onDelete={remove} onSave={() => { setSel(null); toast.success("Đã lưu thay đổi"); }} />
      <CreatePromoModal open={creating} onClose={() => setCreating(false)} onCreate={create} />
    </div>
  );
}
function PromoCard({ promo, onOpen, onPause, onDuplicate }: { promo: Promo; onOpen: () => void; onPause: () => void; onDuplicate: () => void }) {
  const pct = Math.min(100, Math.round((promo.uses / promo.cap) * 100));
  const isPaused = promo.status === "paused";
  return (
    <article className="flex flex-col overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--d-sh-md)]">
      <header className="flex items-start justify-between gap-2 px-[var(--d-s-4)] pb-2 pt-[var(--d-s-4)]">
        <div className="min-w-0">
          <p className="d-eyebrow text-[var(--d-orange-600)]">{TYPE_LABEL[promo.type]}</p>
          <p className="mt-1 text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{promo.name}</p>
          <p className="d-num mt-1 text-[length:var(--d-fs-display)] font-bold text-[var(--d-orange-600)]">{promo.value}</p>
        </div>
        <Badge tone={STATUS[promo.status].tone}>{STATUS[promo.status].label}</Badge>
      </header>
      <div className="px-[var(--d-s-4)] pb-3">
        <div className="flex items-center justify-between gap-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          <span>Đã dùng</span>
          <span className="d-num font-semibold text-[var(--d-text)]">{promo.uses} / {promo.cap}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--d-surface-3)]">
          <span className="block h-full rounded-full bg-[var(--d-jade)]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 inline-flex items-center gap-1 text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]"><CalendarRange size={11} />{promo.startDate} → {promo.endDate}</p>
      </div>
      <div className="grid grid-cols-3 border-t border-[var(--d-line)]">
        <button onClick={onPause} className="flex h-11 items-center justify-center gap-1 border-r border-[var(--d-line)] text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)] hover:bg-[var(--d-surface-2)]">{isPaused ? <><Play size={14} /> Mở lại</> : <><Pause size={14} /> Tạm dừng</>}</button>
        <button onClick={onDuplicate} className="flex h-11 items-center justify-center gap-1 border-r border-[var(--d-line)] text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)] hover:bg-[var(--d-surface-2)]"><Copy size={14} /> Nhân bản</button>
        <button onClick={onOpen} className="flex h-11 items-center justify-center gap-1 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-primary)] hover:bg-[var(--d-primary-soft)]"><Pencil size={14} /> Sửa</button>
      </div>
    </article>
  );
}

function PromoDrawer({ promo, open, onClose, onPause, onDelete, onSave }: { promo: Promo | null; open: boolean; onClose: () => void; onPause: (id: string) => void; onDelete: (id: string) => void; onSave: () => void }) {
  if (!promo) return null;
  return (
    <Drawer open={open} onClose={onClose} width="md" title={promo.name} subtitle={TYPE_LABEL[promo.type]} headerMeta={<Badge tone={STATUS[promo.status].tone}>{STATUS[promo.status].label}</Badge>} footer={
      <div className="flex gap-2">
        <Button variant="danger" size="lg" onClick={() => onDelete(promo.id)}><Trash2 size={15} /> Xoá</Button>
        <Button variant="secondary" size="lg" className="flex-1" onClick={() => onPause(promo.id)}>{promo.status === "paused" ? <><Play size={15} /> Mở lại</> : <><Pause size={15} /> Tạm dừng</>}</Button>
        <Button variant="primary" size="lg" className="flex-1" onClick={onSave}><Pencil size={15} /> Lưu</Button>
      </div>
    }>
      <div className="flex flex-col gap-[var(--d-s-5)]">
        <section className="grid grid-cols-3 gap-2">
          <Tile label="Lượt dùng" value={String(promo.uses)} />
          <Tile label="Giới hạn" value={String(promo.cap)} />
          <Tile label="Doanh thu" value={fmtVnd(promo.revenue)} />
        </section>
        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
          <p className="d-eyebrow">Cấu hình</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Editable label="Tên chiến dịch" defaultValue={promo.name} />
            <Editable label="Giá trị giảm" defaultValue={promo.value} />
            <Editable label="Bắt đầu" defaultValue={promo.startDate} />
            <Editable label="Kết thúc" defaultValue={promo.endDate} />
          </div>
        </section>
        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)]/50 p-[var(--d-s-4)]">
          <p className="d-eyebrow">Điều kiện áp dụng</p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {promo.conditions.map((c) => <li key={c} className="text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">• {c}</li>)}
          </ul>
        </section>
      </div>
    </Drawer>
  );
}

function CreatePromoModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (d: { name: string; type: PromoType; value: string; cap: number }) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<PromoType>("percent");
  const [value, setValue] = useState("");
  const [cap, setCap] = useState(100);
  return (
    <Modal open={open} onClose={onClose} title="Tạo khuyến mãi mới" subtitle="Marketing" size="md" footer={
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
        <Button variant="primary" size="md" onClick={() => onCreate({ name: name || "Khuyến mãi mới", type, value: value || "-10%", cap })}><Plus size={15} /> Tạo</Button>
      </div>
    }>
      <div className="grid gap-3 sm:grid-cols-2">
        <Editable label="Tên chiến dịch" placeholder="VD: Giờ vàng cuối tuần" onChange={setName} full />
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Loại khuyến mãi</span>
          <div className="grid grid-cols-4 gap-2">
            {(["percent", "amount", "combo", "happy-hour"] as PromoType[]).map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} className={cn("rounded-[var(--d-r-md)] border px-3 py-2 text-[length:var(--d-fs-xs)] font-semibold transition", type === t ? "border-[var(--d-jade)] bg-[var(--d-primary-soft)] text-[var(--d-primary)]" : "border-[var(--d-line)] bg-[var(--d-surface)] text-[var(--d-text-muted)] hover:border-[var(--d-line-strong)]")}>{TYPE_LABEL[t]}</button>
            ))}
          </div>
        </div>
        <Editable label="Giá trị" placeholder={type === "percent" ? "-20%" : "-50.000₫"} onChange={setValue} />
        <Editable label="Giới hạn lượt" defaultValue="100" type="number" onChange={(v) => setCap(Number(v) || 100)} />
      </div>
    </Modal>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3 text-center">
      <p className="text-[length:var(--d-fs-2xs)] font-semibold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</p>
      <p className="d-num mt-1 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{value}</p>
    </div>
  );
}

function Editable({ label, defaultValue, placeholder, full, type = "text", onChange }: { label: string; defaultValue?: string; placeholder?: string; full?: boolean; type?: string; onChange?: (v: string) => void }) {
  return (
    <label className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">{label}</span>
      <input type={type} defaultValue={defaultValue} placeholder={placeholder} onChange={(e) => onChange?.(e.target.value)} className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none transition focus:border-[var(--d-jade)] focus:ring-2 focus:ring-[var(--d-jade)]/20" />
    </label>
  );
}
