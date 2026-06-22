"use client";

import { useState } from "react";
import { CalendarClock, Check, Eye, Phone, Plus, Users, Wallet, X } from "lucide-react";
import { FilterTabs, Toolbar } from "../workspace-ui";
import { MetricCard, EmptyState, Badge } from "../primitives";
import { OrderDetailDrawer, type OrderDetail } from "../order-detail-drawer";
import { Button } from "../button";
import { Modal } from "../overlay";
import { useToast } from "@/components/dashboard-v2/adapters/dashboard-shared";
import type { FloorTable } from "../maps";
import { fmtVnd } from "./data";
import { cn } from "@/lib/utils";

type Reservation = {
  id: string;
  name: string;
  phone: string;
  partySize: number;
  datetime: string;
  tableId?: string;
  tableName?: string;
  deposit?: string;
  status: "pending" | "confirmed" | "checked-in" | "cancelled";
  note?: string;
};

const TABLES: FloorTable[] = [
  { id: "t01", name: "01", seats: 2, zone: "Trong nhà", status: "available", x: 18, y: 22 },
  { id: "t02", name: "02", seats: 4, zone: "Trong nhà", status: "serving", x: 38, y: 22 },
  { id: "t04", name: "04", seats: 4, zone: "Trong nhà", status: "serving", x: 58, y: 22 },
  { id: "t07", name: "07", seats: 6, zone: "Trong nhà", status: "available", x: 78, y: 22 },
  { id: "t12", name: "12", seats: 4, zone: "Sân vườn", status: "reserved", x: 52, y: 72 },
  { id: "t15", name: "15", seats: 8, zone: "Sân vườn", status: "reserved", x: 76, y: 72 }
];

const INIT: Reservation[] = [
  { id: "r1", name: "Anh Bình", phone: "0901 222 333", partySize: 4, datetime: "Hôm nay 19:00", tableId: "t12", tableName: "12", deposit: "200.000₫", status: "confirmed", note: "Sinh nhật, cần bánh kem" },
  { id: "r2", name: "Chị Lan", phone: "0905 123 456", partySize: 8, datetime: "Hôm nay 19:30", tableId: "t15", tableName: "15", deposit: "500.000₫", status: "confirmed" },
  { id: "r3", name: "Anh Minh", phone: "0933 444 555", partySize: 2, datetime: "Hôm nay 20:00", status: "pending" },
  { id: "r4", name: "Chị Mai", phone: "0977 888 999", partySize: 6, datetime: "Mai 12:00", status: "pending", note: "Họp công ty" }
];

const STATUS = {
  pending: { label: "Chờ xác nhận", tone: "orange" as const },
  confirmed: { label: "Đã xác nhận", tone: "info" as const },
  "checked-in": { label: "Đã đến", tone: "ok" as const },
  cancelled: { label: "Đã huỷ", tone: "danger" as const }
};

function buildDetail(r: Reservation): OrderDetail {
  return {
    id: r.id,
    code: `#${r.id.toUpperCase()}`,
    table: r.tableName ? `Bàn ${r.tableName}` : "Chưa xếp bàn",
    channel: "reservation",
    customer: { name: r.name, phone: r.phone },
    items: [],
    subtotal: "—",
    total: r.deposit ?? "—",
    paymentStatus: r.deposit ? "paid" : "unpaid",
    elapsedMin: 0,
    status: "new",
    reservation: { datetime: r.datetime, partySize: r.partySize, depositVnd: r.deposit },
    floor: r.tableId ? { tables: TABLES, selectedId: r.tableId } : undefined
  };
}

export function ReservationsDemo() {
  const [items, setItems] = useState<Reservation[]>(INIT);
  const [tab, setTab] = useState("all");
  const [sel, setSel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const counts = { all: items.length, pending: items.filter((r) => r.status === "pending").length, confirmed: items.filter((r) => r.status === "confirmed").length };
  const visible = tab === "all" ? items : items.filter((r) => r.status === tab);
  const cur = items.find((r) => r.id === sel) ?? null;

  const advance = (id: string) => {
    setItems((p) => p.map((r) => {
      if (r.id !== id) return r;
      if (r.status === "pending") { toast.success(`Đã xác nhận đặt bàn ${r.name}`); return { ...r, status: "confirmed" }; }
      if (r.status === "confirmed") { toast.success(`Khách ${r.name} đã đến`); return { ...r, status: "checked-in" }; }
      return r;
    }));
  };

  const cancel = (id: string) => {
    setItems((p) => p.map((r) => (r.id === id ? { ...r, status: "cancelled" } : r)));
    toast.info("Đã huỷ đặt bàn");
  };

  const create = (data: { name: string; phone: string; partySize: number; datetime: string }) => {
    setItems((p) => [
      ...p,
      { id: `r${p.length + 1}`, name: data.name, phone: data.phone, partySize: data.partySize, datetime: data.datetime, status: "pending" }
    ]);
    setCreating(false);
    toast.success(`Đã tạo đặt bàn cho ${data.name}`);
  };

  const totalGuests = items.filter((r) => r.status !== "cancelled").reduce((s, r) => s + r.partySize, 0);
  const depositTotal = items
    .filter((r) => r.deposit)
    .reduce((s, r) => s + parseInt((r.deposit ?? "0").replace(/\D/g, ""), 10), 0);

  return (
    <div className="flex flex-col gap-[var(--d-s-5)]">
      <Toolbar eyebrow="Đặt bàn trước" title="Đặt bàn">
        <Button variant="primary" size="md" onClick={() => setCreating(true)}><Plus size={15} /> Tạo đặt bàn</Button>
      </Toolbar>
      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        <MetricCard icon={<CalendarClock size={18} />} label="Đặt hôm nay" value={String(items.length)} tone="jade" />
        <MetricCard icon={<Users size={18} />} label="Tổng khách" value={String(totalGuests)} tone="info" />
        <MetricCard icon={<Wallet size={18} />} label="Cọc đã thu" value={fmtVnd(depositTotal)} helper={`${items.filter((r) => r.deposit).length} đặt`} tone="orange" />
        <MetricCard icon={<Check size={18} />} label="Đã xác nhận" value={String(items.filter((r) => r.status === "confirmed").length)} tone="neutral" />
      </section>
      <FilterTabs active={tab} onChange={setTab} tabs={[{ key: "all", label: "Tất cả", count: counts.all }, { key: "pending", label: "Chờ xác nhận", count: counts.pending }, { key: "confirmed", label: "Đã xác nhận", count: counts.confirmed }]} />
      {visible.length === 0 ? (
        <EmptyState icon={<CalendarClock size={22} />} title="Chưa có đặt bàn" description="Tạo đặt bàn mới để giữ chỗ cho khách." action={<Button variant="primary" size="md" onClick={() => setCreating(true)}><Plus size={15} /> Tạo đặt bàn</Button>} />
      ) : (
        <div className="grid gap-[var(--d-s-3)] sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((r) => (
            <article key={r.id} className="flex flex-col overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]">
              <header className="flex items-start justify-between gap-2 px-[var(--d-s-4)] pb-2 pt-[var(--d-s-4)]">
                <div className="min-w-0">
                  <p className="text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{r.name}</p>
                  <a href={`tel:${r.phone}`} className="mt-0.5 inline-flex items-center gap-1.5 text-[length:var(--d-fs-xs)] text-[var(--d-primary)]"><Phone size={12} />{r.phone}</a>
                </div>
                <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
              </header>
              <div className="grid grid-cols-3 gap-2 px-[var(--d-s-4)] pb-3">
                {[{ l: "Lúc", v: r.datetime }, { l: "Khách", v: `${r.partySize} người` }, { l: "Bàn", v: r.tableName ? `Bàn ${r.tableName}` : "Chưa xếp" }].map((c) => (
                  <div key={c.l} className="rounded-[var(--d-r-sm)] bg-[var(--d-surface-2)] p-2 text-center"><p className="text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">{c.l}</p><p className="d-num mt-0.5 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-text)]">{c.v}</p></div>
                ))}
              </div>
              {r.note ? <p className="border-t border-[var(--d-line)] bg-[var(--d-surface-2)]/40 px-[var(--d-s-4)] py-2 text-[length:var(--d-fs-xs)] italic text-[var(--d-text-muted)]">"{r.note}"</p> : null}
              <div className="grid grid-cols-3 border-t border-[var(--d-line)]">
                <button type="button" onClick={() => setSel(r.id)} className="flex h-11 items-center justify-center gap-1 border-r border-[var(--d-line)] text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)] transition hover:bg-[var(--d-surface-2)] hover:text-[var(--d-text)]"><Eye size={15} /> Chi tiết</button>
                <button type="button" onClick={() => cancel(r.id)} className="flex h-11 items-center justify-center gap-1 border-r border-[var(--d-line)] text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)] transition hover:bg-[var(--d-danger-bg)] hover:text-[var(--d-danger-fg)]" disabled={r.status === "cancelled"}><X size={15} /> Huỷ</button>
                <button type="button" onClick={() => advance(r.id)} disabled={r.status === "checked-in" || r.status === "cancelled"} className={cn("flex h-11 items-center justify-center gap-1 text-[length:var(--d-fs-sm)] font-semibold transition active:scale-[0.99]", (r.status === "checked-in" || r.status === "cancelled") ? "bg-[var(--d-surface-2)] text-[var(--d-text-faint)]" : "bg-[var(--d-jade)] text-[var(--d-on-jade)]")}>
                  <Check size={15} />{r.status === "pending" ? "Xác nhận" : r.status === "confirmed" ? "Đã đến" : "Xong"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <OrderDetailDrawer order={cur ? buildDetail(cur) : null} open={Boolean(cur)} onClose={() => setSel(null)} />
      <CreateReservationModal open={creating} onClose={() => setCreating(false)} onCreate={create} />
    </div>
  );
}

function CreateReservationModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (d: { name: string; phone: string; partySize: number; datetime: string }) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [datetime, setDatetime] = useState("Hôm nay 19:00");
  return (
    <Modal open={open} onClose={onClose} title="Tạo đặt bàn mới" subtitle="Đặt bàn trước" footer={
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
        <Button variant="primary" size="md" onClick={() => onCreate({ name: name || "Khách mới", phone: phone || "0900 000 000", partySize, datetime })}><Plus size={15} /> Tạo</Button>
      </div>
    }>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tên khách" onChange={setName} placeholder="Anh / Chị ..." />
        <Field label="Số điện thoại" onChange={setPhone} placeholder="09xx xxx xxx" />
        <Field label="Thời gian" defaultValue={datetime} onChange={setDatetime} />
        <Field label="Số người" type="number" defaultValue="2" onChange={(v) => setPartySize(Number(v) || 2)} />
      </div>
    </Modal>
  );
}

function Field({ label, defaultValue, placeholder, type = "text", onChange }: { label: string; defaultValue?: string; placeholder?: string; type?: string; onChange?: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">{label}</span>
      <input type={type} defaultValue={defaultValue} placeholder={placeholder} onChange={(e) => onChange?.(e.target.value)} className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none transition focus:border-[var(--d-jade)] focus:ring-2 focus:ring-[var(--d-jade)]/20" />
    </label>
  );
}
