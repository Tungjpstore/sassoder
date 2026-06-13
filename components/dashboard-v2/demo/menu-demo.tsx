"use client";

import { useMemo, useState } from "react";
import { Coffee, Flame, Pencil, Plus, Search, Sparkles, TrendingUp, Utensils } from "lucide-react";
import { FilterTabs, Toolbar } from "../workspace-ui";
import { MetricCard, Badge, EmptyState, SwitchControl } from "../primitives";
import { Button } from "../button";
import { Drawer, Modal } from "../overlay";
import { useToast } from "@/components/dashboard/toast-provider";
import { fmtVnd } from "./data";
import { cn } from "@/lib/utils";

/* MenuDemo — quản lý món với drawer chi tiết:
 *  - Giá vốn / giá bán / biên lợi nhuận
 *  - Trạm chế biến (đồng bộ với KDS: drink/hot)
 *  - Bán chạy hôm nay, tồn nguyên liệu liên quan
 */

type Cat = "drink" | "food" | "dessert" | "combo";
type MenuItem = {
  id: string;
  name: string;
  cat: Cat;
  price: number;
  cost: number;
  station: "drink" | "hot";
  image: string;
  available: boolean;
  soldToday: number;
  bestseller?: boolean;
};

const CAT_LABEL: Record<Cat, string> = { drink: "Đồ uống", food: "Đồ ăn", dessert: "Tráng miệng", combo: "Combo" };

const INIT: MenuItem[] = [
  { id: "m1", name: "Cà phê sữa đá", cat: "drink", price: 25_000, cost: 9_000, station: "drink", image: "☕", available: true, soldToday: 64, bestseller: true },
  { id: "m2", name: "Bạc xỉu", cat: "drink", price: 30_000, cost: 11_000, station: "drink", image: "🥛", available: true, soldToday: 52, bestseller: true },
  { id: "m3", name: "Trà đào cam sả", cat: "drink", price: 35_000, cost: 13_000, station: "drink", image: "🍑", available: true, soldToday: 38 },
  { id: "m4", name: "Latte", cat: "drink", price: 40_000, cost: 15_000, station: "drink", image: "🧋", available: false, soldToday: 0 },
  { id: "m5", name: "Bánh mì thịt", cat: "food", price: 30_000, cost: 14_000, station: "hot", image: "🥖", available: true, soldToday: 27 },
  { id: "m6", name: "Phở bò tái", cat: "food", price: 55_000, cost: 26_000, station: "hot", image: "🍜", available: true, soldToday: 19 },
  { id: "m7", name: "Caramen", cat: "dessert", price: 20_000, cost: 7_000, station: "hot", image: "🍮", available: true, soldToday: 22 },
  { id: "m8", name: "Combo 2 ly + bánh", cat: "combo", price: 70_000, cost: 30_000, station: "drink", image: "📦", available: true, soldToday: 31, bestseller: true }
];

const margin = (i: MenuItem) => Math.round(((i.price - i.cost) / i.price) * 100);

export function MenuDemo() {
  const [tab, setTab] = useState<"all" | Cat>("all");
  const [q, setQ] = useState("");
  const [items, setItems] = useState(INIT);
  const [sel, setSel] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const toast = useToast();

  const visible = useMemo(() => {
    let list = tab === "all" ? items : items.filter((i) => i.cat === tab);
    if (q.trim()) list = list.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()));
    return list;
  }, [items, tab, q]);

  const current = items.find((i) => i.id === sel) ?? null;
  const toggle = (id: string) => setItems((p) => p.map((x) => (x.id === id ? { ...x, available: !x.available } : x)));

  const create = (data: { name: string; cat: Cat; price: number; cost: number; station: "drink" | "hot" }) => {
    setItems((p) => [...p, { id: `m${p.length + 1}`, name: data.name, cat: data.cat, price: data.price, cost: data.cost, station: data.station, image: data.cat === "drink" ? "🥤" : data.cat === "food" ? "🍽️" : data.cat === "dessert" ? "🍮" : "📦", available: true, soldToday: 0 }]);
    setCreateOpen(false);
    toast.success(`Đã thêm món "${data.name}" vào menu`);
  };

  return (
    <div className="flex flex-col gap-[var(--d-s-5)]">
      <Toolbar eyebrow="Quản lý thực đơn" title="Menu món">
        <Button variant="secondary" size="md" onClick={() => toast.info("AI đang phân tích menu để gợi ý món mới")}><Sparkles size={15} /> AI tạo menu</Button>
        <Button variant="primary" size="md" onClick={() => setCreateOpen(true)}><Plus size={15} /> Thêm món</Button>
      </Toolbar>

      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        <MetricCard icon={<Utensils size={18} />} label="Tổng món" value={String(items.length)} tone="jade" />
        <MetricCard icon={<Coffee size={18} />} label="Đang bán" value={String(items.filter((i) => i.available).length)} tone="info" />
        <MetricCard icon={<TrendingUp size={18} />} label="Bán hôm nay" value={String(items.reduce((s, i) => s + i.soldToday, 0))} tone="orange" />
        <MetricCard icon={<Plus size={18} />} label="Tạm hết" value={String(items.filter((i) => !i.available).length)} tone="neutral" />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          active={tab}
          onChange={(k) => setTab(k as typeof tab)}
          tabs={[
            { key: "all", label: "Tất cả", count: items.length },
            { key: "drink", label: "Đồ uống" },
            { key: "food", label: "Đồ ăn" },
            { key: "dessert", label: "Tráng miệng" },
            { key: "combo", label: "Combo" }
          ]}
        />
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--d-text-faint)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm món..." className="h-9 w-56 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] pl-9 pr-3 text-[length:var(--d-fs-sm)] outline-none transition focus:border-[var(--d-jade)]" />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={<Search size={20} />} title="Không tìm thấy món" description="Thử từ khoá khác hoặc đổi danh mục." />
      ) : (
        <div className="grid gap-[var(--d-s-3)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((it) => (
            <article key={it.id} className="flex flex-col overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--d-sh-md)]">
              <button type="button" onClick={() => setSel(it.id)} className="relative grid aspect-[4/3] place-items-center bg-[var(--d-surface-2)] text-[3.5rem]">
                {it.image}
                {it.bestseller ? <span className="absolute left-2 top-2"><Badge tone="orange">Hot</Badge></span> : null}
                {!it.available ? <span className="absolute inset-0 grid place-items-center bg-[var(--d-surface)]/70 text-[length:var(--d-fs-sm)] font-bold uppercase text-[var(--d-text-muted)]">Tạm hết</span> : null}
              </button>
              <div className="flex flex-1 flex-col gap-1.5 p-[var(--d-s-3)]">
                <button type="button" onClick={() => setSel(it.id)} className="line-clamp-1 text-left text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{it.name}</button>
                <div className="flex items-center justify-between">
                  <p className="d-num text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{fmtVnd(it.price)}</p>
                  <span className="text-[length:var(--d-fs-2xs)] font-semibold text-[var(--d-ok-fg)]">LN {margin(it)}%</span>
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-[var(--d-line)] pt-2">
                  <span className="text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">Bán {it.soldToday}</span>
                  <SwitchControl checked={it.available} onChange={() => toggle(it.id)} label={it.available ? "Bán" : "Tắt"} className="h-7 min-w-[70px]" />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <MenuDrawer item={current} open={Boolean(current)} onClose={() => setSel(null)} onToggle={toggle} />
      <CreateItemModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={create} />
    </div>
  );
}

function MenuDrawer({ item, open, onClose, onToggle }: { item: MenuItem | null; open: boolean; onClose: () => void; onToggle: (id: string) => void }) {
  if (!item) return null;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title={item.name}
      subtitle={CAT_LABEL[item.cat]}
      headerMeta={
        <>
          <Badge tone={item.available ? "ok" : "neutral"}>{item.available ? "Đang bán" : "Tạm hết"}</Badge>
          <Badge tone={item.station === "hot" ? "danger" : "info"}>{item.station === "hot" ? "Bếp nóng" : "Pha chế"}</Badge>
          {item.bestseller ? <Badge tone="orange">Best seller</Badge> : null}
        </>
      }
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => onToggle(item.id)}>{item.available ? "Tạm ngừng bán" : "Bật bán lại"}</Button>
          <Button variant="primary" size="lg" className="flex-1"><Pencil size={15} /> Sửa món</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-[var(--d-s-5)]">
        <div className="grid aspect-[16/9] place-items-center rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)] text-[5rem]">{item.image}</div>

        <section className="grid grid-cols-3 gap-2">
          <Stat label="Giá bán" value={fmtVnd(item.price)} />
          <Stat label="Giá vốn" value={fmtVnd(item.cost)} />
          <Stat label="Biên LN" value={`${margin(item)}%`} accent />
        </section>

        <section className="grid grid-cols-2 gap-2">
          <Stat label="Bán hôm nay" value={`${item.soldToday} phần`} />
          <Stat label="Doanh thu món" value={fmtVnd(item.soldToday * item.price)} />
        </section>

        <section className="flex items-start gap-3 rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)]/50 p-[var(--d-s-4)]">
          <Flame size={18} className="mt-0.5 flex-none text-[var(--d-orange-600)]" />
          <p className="text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">
            Món được route tới trạm <span className="font-semibold text-[var(--d-text)]">{item.station === "hot" ? "Bếp nóng" : "Pha chế"}</span> trên màn hình bếp. Khi tạm hết, món sẽ ẩn khỏi menu QR của khách.
          </p>
        </section>
      </div>
    </Drawer>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3 text-center">
      <p className="text-[length:var(--d-fs-2xs)] font-semibold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</p>
      <p className={cn("d-num mt-1 text-[length:var(--d-fs-h3)] font-bold", accent ? "text-[var(--d-ok-fg)]" : "text-[var(--d-text)]")}>{value}</p>
    </div>
  );
}

function CreateItemModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (d: { name: string; cat: Cat; price: number; cost: number; station: "drink" | "hot" }) => void }) {
  const [name, setName] = useState("Món mới");
  const [cat, setCat] = useState<Cat>("drink");
  const [price, setPrice] = useState(35_000);
  const [cost, setCost] = useState(12_000);
  const station: "drink" | "hot" = cat === "drink" || cat === "combo" ? "drink" : "hot";
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} size="md" title="Thêm món mới" subtitle="Menu món" footer={
      <div className="flex justify-end gap-2"><Button variant="secondary" size="md" onClick={onClose}>Huỷ</Button><Button variant="primary" size="md" onClick={() => onCreate({ name, cat, price, cost, station })}><Plus size={15} /> Thêm món</Button></div>
    }>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 sm:col-span-2"><span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Tên món</span><input value={name} onChange={(e) => setName(e.target.value)} className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" /></label>
        <label className="flex flex-col gap-1.5"><span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Danh mục</span><select value={cat} onChange={(e) => setCat(e.target.value as Cat)} className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"><option value="drink">Đồ uống</option><option value="food">Đồ ăn</option><option value="dessert">Tráng miệng</option><option value="combo">Combo</option></select></label>
        <label className="flex flex-col gap-1.5"><span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Trạm bếp</span><input value={station === "drink" ? "Pha chế" : "Bếp nóng"} readOnly className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)] outline-none" /></label>
        <label className="flex flex-col gap-1.5"><span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Giá bán</span><input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" /></label>
        <label className="flex flex-col gap-1.5"><span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Giá vốn</span><input type="number" value={cost} onChange={(e) => setCost(Number(e.target.value) || 0)} className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" /></label>
      </div>
    </Modal>
  );
}
