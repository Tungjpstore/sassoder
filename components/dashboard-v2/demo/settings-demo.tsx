"use client";

import { useState } from "react";
import {
  Bell,
  Bike,
  Clock3,
  CreditCard,
  FileText,
  Paintbrush,
  QrCode,
  Save,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  WalletCards,
  ChevronRight
} from "lucide-react";
import { Toolbar } from "../workspace-ui";
import { Button } from "../button";
import { Badge, SwitchControl } from "../primitives";
import { Modal } from "../overlay";
import { useToast } from "@/components/dashboard-v2/adapters/dashboard-shared";
import { cn } from "@/lib/utils";

/* SettingsDemo — layout rail + panel.
 *  - Trái: rail dọc 280px luôn hiện ở desktop, nhóm 3 cụm
 *  - Phải: 1 section duy nhất, dense, không ép nhồi
 *  - Mobile: rail co lại thành horizontal scroll */

type SectionKey =
  | "profile" | "ai_setup" | "hours" | "branches" | "tables"
  | "online" | "payments" | "billing" | "notifications"
  | "permissions" | "receipt" | "brand";

type SectionMeta = { key: SectionKey; label: string; desc: string; icon: React.ReactNode; state: { label: string; tone: "ok" | "orange" | "info" | "neutral" } };

const SECTIONS: SectionMeta[] = [
  { key: "profile", label: "Hồ sơ quán", desc: "Tên, loại hình, liên hệ", icon: <Users size={16} />, state: { label: "Hoàn thiện", tone: "ok" } },
  { key: "hours", label: "Giờ hoạt động", desc: "Giờ mở từng ngày", icon: <Clock3 size={16} />, state: { label: "Đã đặt", tone: "ok" } },
  { key: "branches", label: "Chi nhánh", desc: "Mặc định và toạ độ", icon: <Store size={16} />, state: { label: "2 chi nhánh", tone: "info" } },
  { key: "brand", label: "Thương hiệu", desc: "Màu sắc và logo", icon: <Paintbrush size={16} />, state: { label: "Đã thiết lập", tone: "ok" } },
  { key: "receipt", label: "Mẫu hoá đơn", desc: "Khổ giấy, dòng cuối", icon: <FileText size={16} />, state: { label: "Mặc định", tone: "neutral" } },
  { key: "tables", label: "Bàn & QR", desc: "Bàn, khu vực, link QR", icon: <QrCode size={16} />, state: { label: "8 bàn", tone: "ok" } },
  { key: "online", label: "Đặt món online", desc: "Pickup, giao, phí ship", icon: <Bike size={16} />, state: { label: "Đang bật", tone: "ok" } },
  { key: "payments", label: "Thanh toán", desc: "Ngân hàng nhận VietQR", icon: <CreditCard size={16} />, state: { label: "VCB", tone: "ok" } },
  { key: "billing", label: "Gói LogiVN", desc: "Trial, gia hạn, hoá đơn", icon: <WalletCards size={16} />, state: { label: "Pro", tone: "info" } },
  { key: "ai_setup", label: "Nhận diện AI", desc: "Slogan, mô tả, quota AI", icon: <Sparkles size={16} />, state: { label: "Đã chạy", tone: "info" } },
  { key: "notifications", label: "Thông báo & Telegram", desc: "Cảnh báo realtime", icon: <Bell size={16} />, state: { label: "Đã kết nối", tone: "ok" } },
  { key: "permissions", label: "Nhân quyền", desc: "Tài khoản & phân quyền", icon: <ShieldCheck size={16} />, state: { label: "5 người", tone: "info" } }
];

const META = Object.fromEntries(SECTIONS.map((s) => [s.key, s])) as Record<SectionKey, SectionMeta>;

const GROUPS: { title: string; keys: SectionKey[] }[] = [
  { title: "Nền tảng cửa hàng", keys: ["profile", "hours", "branches", "brand", "receipt"] },
  { title: "Bán hàng & thanh toán", keys: ["tables", "online", "payments", "billing"] },
  { title: "Đội ngũ & tự động hoá", keys: ["ai_setup", "notifications", "permissions"] }
];

export function SettingsDemo() {
  const [active, setActive] = useState<SectionKey>("profile");
  const toast = useToast();
  const meta = META[active];

  return (
    <div className="flex flex-col gap-[var(--d-s-5)]">
      <Toolbar eyebrow="Hệ thống" title="Cài đặt" />
      <div className="grid gap-[var(--d-s-4)] lg:grid-cols-[240px_1fr]">
        {/* Rail — phẳng, không card-in-card */}
        <nav className="self-start overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)] lg:sticky lg:top-[calc(var(--d-topbar-h)+var(--d-s-4))]">
          {GROUPS.map((g, gi) => (
            <div key={g.title}>
              <p className={cn("px-3 pb-1.5 pt-3 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]", gi > 0 && "border-t border-[var(--d-line)]")}>
                {g.title}
              </p>
              <div className="flex flex-col px-1.5 pb-1.5">
                {g.keys.map((k) => {
                  const item = META[k];
                  const on = active === k;
                  return (
                    <button key={k} type="button" onClick={() => setActive(k)} className={cn("flex items-center gap-2.5 rounded-[var(--d-r-md)] px-2 py-2 text-left transition-colors", on ? "bg-[var(--d-primary-soft)] text-[var(--d-primary)]" : "text-[var(--d-text-muted)] hover:bg-[var(--d-surface-2)] hover:text-[var(--d-text)]")}>
                      <span className={cn("grid h-7 w-7 flex-none place-items-center rounded-[var(--d-r-sm)]", on ? "bg-[var(--d-jade)] text-[var(--d-on-jade)]" : "text-[var(--d-text-faint)]")}>{item.icon}</span>
                      <span className="min-w-0 flex-1 truncate text-[length:var(--d-fs-sm)] font-semibold">{item.label}</span>
                      {on ? <ChevronRight size={14} className="flex-none" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Panel */}
        <div className="min-w-0">
          <header className="mb-[var(--d-s-4)] flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="d-eyebrow">{GROUPS.find((g) => g.keys.includes(active))?.title}</p>
              <h2 className="text-[length:var(--d-fs-h1)] font-bold text-[var(--d-text)]">{meta.label}</h2>
              <p className="text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">{meta.desc}</p>
            </div>
            <Badge tone={meta.state.tone}>{meta.state.label}</Badge>
          </header>

          {active === "profile" && <Profile onSave={() => toast.success("Đã lưu hồ sơ quán")} />}
          {active === "hours" && <Hours onSave={() => toast.success("Đã cập nhật giờ hoạt động")} />}
          {active === "branches" && <Branches onAction={(m) => toast.success(m)} />}
          {active === "brand" && <Brand onSave={() => toast.success("Đã cập nhật thương hiệu")} />}
          {active === "receipt" && <Receipt onSave={() => toast.success("Đã lưu mẫu hoá đơn")} />}
          {active === "tables" && <Tables onAction={(m) => toast.success(m)} />}
          {active === "online" && <Online onSave={() => toast.success("Đã cập nhật đặt món online")} />}
          {active === "payments" && <Payments onSave={() => toast.success("Đã lưu tài khoản nhận VietQR")} />}
          {active === "billing" && <Billing onAction={(m) => toast.info(m)} />}
          {active === "ai_setup" && <AiSetup onAction={(m) => toast.success(m)} />}
          {active === "notifications" && <Notifications onSave={() => toast.success("Đã lưu cảnh báo")} />}
          {active === "permissions" && <Permissions onAction={(m) => toast.info(m)} />}
        </div>
      </div>
    </div>
  );
}
function Panel({ title, desc, children, footer }: { title: string; desc?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]">
      <header className="border-b border-[var(--d-line)] px-[var(--d-s-5)] py-[var(--d-s-4)]">
        <h3 className="text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">{title}</h3>
        {desc ? <p className="mt-0.5 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">{desc}</p> : null}
      </header>
      <div className="p-[var(--d-s-5)]">{children}</div>
      {footer ? <footer className="flex justify-end gap-2 border-t border-[var(--d-line)] px-[var(--d-s-5)] py-[var(--d-s-4)]">{footer}</footer> : null}
    </section>
  );
}

function Field({ label, defaultValue, type = "text", placeholder, full }: { label: string; defaultValue?: string; type?: string; placeholder?: string; full?: boolean }) {
  return (
    <label className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">{label}</span>
      <input type={type} defaultValue={defaultValue} placeholder={placeholder} className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none transition focus:border-[var(--d-jade)] focus:ring-2 focus:ring-[var(--d-jade)]/20" />
    </label>
  );
}

function Select({ label, defaultValue, options }: { label: string; defaultValue?: string; options: { value: string; label: string }[] }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">{label}</span>
      <select defaultValue={defaultValue} className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none transition focus:border-[var(--d-jade)]">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function Toggle({ label, desc, defaultOn = false }: { label: string; desc?: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex w-full items-center justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className="block text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{label}</span>
        {desc ? <span className="block text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{desc}</span> : null}
      </span>
      <SwitchControl checked={on} onChange={setOn} />
    </div>
  );
}

function SaveFooter({ onSave }: { onSave: () => void }) {
  return <><Button variant="secondary" size="md">Huỷ</Button><Button variant="primary" size="md" onClick={onSave}><Save size={15} /> Lưu</Button></>;
}
/* ── Section 1: Hồ sơ quán ── */
function Profile({ onSave }: { onSave: () => void }) {
  return (
    <Panel title="Thông tin cơ bản" desc="Hiển thị trên menu QR, hoá đơn và Google." footer={<SaveFooter onSave={onSave} />}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tên quán" defaultValue="Quán Cafe Demo" />
        <Field label="Slug" defaultValue="quan-cafe-demo" />
        <Select label="Loại hình kinh doanh" defaultValue="cafe" options={[{ value: "cafe", label: "Quán cafe" }, { value: "restaurant", label: "Nhà hàng" }, { value: "tea", label: "Trà sữa" }, { value: "fastfood", label: "Đồ ăn nhanh" }]} />
        <Field label="Hotline" defaultValue="0905 123 456" />
        <Field label="Email" defaultValue="hello@logivn.com" type="email" />
        <Field label="Mô tả ngắn" defaultValue="Cafe specialty Đà Nẵng" full />
      </div>
    </Panel>
  );
}

/* ── Section 2: Giờ hoạt động ── */
function Hours({ onSave }: { onSave: () => void }) {
  const days = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
  const [enabled, setEnabled] = useState(() => Array(7).fill(true));
  return (
    <Panel title="Giờ mở cửa từng ngày" desc="Khách chỉ đặt online được trong khung giờ mở cửa." footer={<SaveFooter onSave={onSave} />}>
      <div className="overflow-hidden rounded-[var(--d-r-md)] border border-[var(--d-line)]">
        {days.map((d, i) => (
          <div key={d} className={cn("flex items-center justify-between gap-3 px-4 py-2.5", i > 0 && "border-t border-[var(--d-line)]")}>
            <span className="w-24 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{d}</span>
            <div className="flex flex-1 items-center justify-end gap-2">
              <input defaultValue="07:00" disabled={!enabled[i]} className="h-9 w-20 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-2 text-center text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)] disabled:opacity-50" />
              <span className="text-[var(--d-text-faint)]">–</span>
              <input defaultValue="22:00" disabled={!enabled[i]} className="h-9 w-20 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-2 text-center text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)] disabled:opacity-50" />
              <SwitchControl
                checked={enabled[i]}
                onChange={() => setEnabled((p) => p.map((x, idx) => (idx === i ? !x : x)))}
              />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ── Section 3: Chi nhánh ── */
function Branches({ onAction }: { onAction: (m: string) => void }) {
  const [list, setList] = useState([
    { id: "b1", name: "Hải Châu", addr: "23 Nguyễn Văn Linh, Đà Nẵng", primary: true, active: true },
    { id: "b2", name: "Sơn Trà", addr: "12 Võ Nguyên Giáp, Đà Nẵng", primary: false, active: true }
  ]);
  return (
    <Panel title="Danh sách chi nhánh" desc="Mỗi chi nhánh có toạ độ riêng để tính phí giao hàng và phân vùng nhân viên." footer={<><Button variant="secondary" size="md">Huỷ</Button><Button variant="primary" size="md" onClick={() => { setList((p) => [...p, { id: `b${p.length + 1}`, name: "Chi nhánh mới", addr: "Chưa nhập địa chỉ", primary: false, active: true }]); onAction("Đã thêm chi nhánh"); }}>+ Thêm chi nhánh</Button></>}>
      <div className="flex flex-col divide-y divide-[var(--d-line)]">
        {list.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-[var(--d-r-md)] bg-[var(--d-primary-soft)] text-[var(--d-primary)]"><Store size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2"><span className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{b.name}</span>{b.primary ? <Badge tone="ok">Mặc định</Badge> : null}</span>
              <span className="block truncate text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{b.addr}</span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => onAction(`Đang mở chi tiết ${b.name}`)}>Sửa</Button>
            {!b.primary ? <Button variant="ghost" size="sm" onClick={() => { setList((p) => p.filter((x) => x.id !== b.id)); onAction("Đã xoá chi nhánh"); }}>Xoá</Button> : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}
/* ── Section 4: Thương hiệu ── */
function Brand({ onSave }: { onSave: () => void }) {
  const colors = ["#1FA37A", "#E8833A", "#2563EB", "#9333EA", "#DC2626", "#0F766E"];
  const [picked, setPicked] = useState(colors[0]);
  return (
    <Panel title="Nhận diện thương hiệu" desc="Logo và màu áp dụng cho menu QR, hoá đơn và web đặt món." footer={<SaveFooter onSave={onSave} />}>
      <div className="grid gap-[var(--d-s-4)] sm:grid-cols-[auto_1fr] sm:items-start">
        <div className="flex flex-col items-center gap-2">
          <div className="grid h-24 w-24 place-items-center rounded-[var(--d-r-lg)] border border-dashed border-[var(--d-line-strong)] bg-[var(--d-surface-2)] text-[var(--d-text-faint)]"><Paintbrush size={28} /></div>
          <Button variant="secondary" size="sm">Tải logo</Button>
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Màu nhận diện</p>
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => (
                <button key={c} type="button" onClick={() => setPicked(c)} className={cn("h-9 w-9 rounded-[var(--d-r-md)] ring-2 ring-offset-2 ring-offset-[var(--d-surface)] transition", picked === c ? "ring-[var(--d-text)]" : "ring-transparent")} style={{ background: c }} aria-label={`Màu ${c}`} />
              ))}
            </div>
          </div>
          <Field label="Font hiển thị" defaultValue="Be Vietnam Pro" />
        </div>
      </div>
    </Panel>
  );
}

/* ── Section 5: Mẫu hoá đơn ── */
function Receipt({ onSave }: { onSave: () => void }) {
  return (
    <Panel title="Mẫu in / hoá đơn" desc="Khổ giấy và dòng cuối in cho khách." footer={<SaveFooter onSave={onSave} />}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Khổ giấy" defaultValue="80mm" options={[{ value: "58mm", label: "58mm" }, { value: "80mm", label: "80mm" }, { value: "a4", label: "A4" }]} />
        <Select label="Số bản in" defaultValue="2" options={[{ value: "1", label: "1 bản (khách)" }, { value: "2", label: "2 bản (khách + bếp)" }]} />
        <Field label="Dòng cảm ơn" defaultValue="Cảm ơn quý khách. Hẹn gặp lại!" full />
      </div>
      <div className="mt-3 overflow-hidden rounded-[var(--d-r-md)] border border-[var(--d-line)] px-4">
        <Toggle label="Hiện QR menu trên hoá đơn" defaultOn />
        <div className="border-t border-[var(--d-line)]"><Toggle label="In số bàn ở đầu hoá đơn" defaultOn /></div>
        <div className="border-t border-[var(--d-line)]"><Toggle label="In thông tin VAT" /></div>
      </div>
    </Panel>
  );
}

/* ── Section 6: Bàn & QR ── */
type TableCfg = { id: string; name: string; seats: number; zone: string; active: boolean };
const INIT_TABLES: TableCfg[] = [
  { id: "t01", name: "01", seats: 2, zone: "Trong nhà", active: true },
  { id: "t02", name: "02", seats: 4, zone: "Trong nhà", active: true },
  { id: "t04", name: "04", seats: 4, zone: "Trong nhà", active: true },
  { id: "t07", name: "07", seats: 6, zone: "Trong nhà", active: true },
  { id: "t09", name: "09", seats: 2, zone: "Sân vườn", active: true },
  { id: "t12", name: "12", seats: 4, zone: "Sân vườn", active: true },
  { id: "t15", name: "15", seats: 8, zone: "Sân vườn", active: true },
  { id: "t16", name: "16", seats: 4, zone: "Sân vườn", active: false }
];

function Tables({ onAction }: { onAction: (m: string) => void }) {
  const [tables, setTables] = useState(INIT_TABLES);
  const [edit, setEdit] = useState<TableCfg | null>(null);
  const [creating, setCreating] = useState(false);

  const save = (cfg: TableCfg) => {
    setTables((p) => {
      const exists = p.some((t) => t.id === cfg.id);
      return exists ? p.map((t) => (t.id === cfg.id ? cfg : t)) : [...p, cfg];
    });
    setEdit(null);
    setCreating(false);
    onAction("Đã lưu cấu hình bàn");
  };
  const remove = (id: string) => { setTables((p) => p.filter((t) => t.id !== id)); setEdit(null); onAction("Đã xoá bàn"); };

  return (
    <Panel title="Bàn & mã QR" desc="Quản lý bàn vật lý, sức chứa, khu vực và link QR khách quét gọi món." footer={<><Button variant="secondary" size="md" onClick={() => onAction("Đang xuất QR cho tất cả bàn (PDF)")}>Xuất QR hàng loạt</Button><Button variant="primary" size="md" onClick={() => onAction("Đã sao chép link menu QR")}>Copy link menu</Button></>}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {tables.map((t) => (
          <button key={t.id} onClick={() => setEdit(t)} className={cn("flex flex-col gap-1 rounded-[var(--d-r-md)] border p-3 text-left transition hover:border-[var(--d-line-strong)] hover:bg-[var(--d-surface)]", t.active ? "border-[var(--d-line)] bg-[var(--d-surface-2)]" : "border-dashed border-[var(--d-line)] bg-[var(--d-surface-2)]/50 opacity-70")}>
            <div className="flex items-center justify-between">
              <span className="d-num text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">Bàn {t.name}</span>
              {!t.active ? <Badge tone="neutral">Ẩn</Badge> : null}
            </div>
            <span className="text-[length:var(--d-fs-2xs)] text-[var(--d-text-muted)]">{t.seats} chỗ · {t.zone}</span>
            <span className="d-num text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">Mã: {t.id.toUpperCase()}</span>
          </button>
        ))}
        <button onClick={() => setCreating(true)} className="grid min-h-[84px] place-items-center rounded-[var(--d-r-md)] border border-dashed border-[var(--d-line-strong)] bg-[var(--d-surface)] text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-primary)] transition hover:bg-[var(--d-primary-soft)]">+ Thêm bàn</button>
      </div>
      <TableConfigModal
        table={creating ? { id: `t${String(tables.length + 1).padStart(2, "0")}`, name: String(tables.length + 1).padStart(2, "0"), seats: 4, zone: "Trong nhà", active: true } : edit}
        open={creating || Boolean(edit)}
        isNew={creating}
        onClose={() => { setEdit(null); setCreating(false); }}
        onSave={save}
        onDelete={remove}
      />
    </Panel>
  );
}

function TableConfigModal({ table, open, isNew, onClose, onSave, onDelete }: { table: TableCfg | null; open: boolean; isNew: boolean; onClose: () => void; onSave: (t: TableCfg) => void; onDelete: (id: string) => void }) {
  const [draft, setDraft] = useState<TableCfg | null>(table);
  if (open && table && draft?.id !== table.id) setDraft(table);
  if (!open || !draft) return null;

  return (
    <Modal open={open} onClose={onClose} size="sm" title={isNew ? "Thêm bàn mới" : `Cấu hình Bàn ${draft.name}`} subtitle="Bàn & QR" footer={
      <div className="flex w-full justify-between gap-2">
        {!isNew ? <Button variant="danger" size="md" onClick={() => onDelete(draft.id)}>Xoá bàn</Button> : <span />}
        <div className="flex gap-2"><Button variant="secondary" size="md" onClick={onClose}>Huỷ</Button><Button variant="primary" size="md" onClick={() => onSave(draft)}><Save size={15} /> Lưu</Button></div>
      </div>
    }>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5"><span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Số/tên bàn</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" /></label>
          <label className="flex flex-col gap-1.5"><span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Mã bàn (QR)</span><input value={draft.id.toUpperCase()} readOnly className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)] outline-none" /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5"><span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Sức chứa (số khách)</span><input type="number" value={draft.seats} onChange={(e) => setDraft({ ...draft, seats: Number(e.target.value) || 1 })} className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" /></label>
          <label className="flex flex-col gap-1.5"><span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Khu vực</span>
            <select value={draft.zone} onChange={(e) => setDraft({ ...draft, zone: e.target.value })} className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]">
              <option>Trong nhà</option><option>Sân vườn</option><option>Tầng 2</option><option>VIP</option>
            </select>
          </label>
        </div>
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] px-4">
          <div className="flex w-full items-center justify-between gap-4 py-3">
            <span><span className="block text-[length:var(--d-fs-sm)] font-semibold">Hiển thị bàn</span><span className="block text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Tắt để tạm ẩn bàn khỏi sơ đồ</span></span>
            <SwitchControl checked={draft.active} onChange={(checked) => setDraft({ ...draft, active: checked })} />
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
          <div className="grid h-16 w-16 flex-none place-items-center rounded-[var(--d-r-md)] bg-[var(--d-surface)] text-[var(--d-text-faint)]"><QrCode size={28} /></div>
          <div className="min-w-0"><p className="text-[length:var(--d-fs-sm)] font-semibold">QR gọi món bàn {draft.name}</p><p className="truncate text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">/m/quan-cafe-demo?ban={draft.id}</p></div>
        </div>
      </div>
    </Modal>
  );
}
/* ── Section 7: Đặt món online ── */
function Online({ onSave }: { onSave: () => void }) {
  const [zones, setZones] = useState([
    { id: "z1", name: "Nội thành (0–3km)", fee: 15_000, eta: "15–25 phút" },
    { id: "z2", name: "Lân cận (3–5km)", fee: 25_000, eta: "25–40 phút" },
    { id: "z3", name: "Xa (5–8km)", fee: 40_000, eta: "40–60 phút" }
  ]);
  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <Panel title="Kênh đặt online">
        <div className="overflow-hidden rounded-[var(--d-r-md)] border border-[var(--d-line)] px-4">
          <Toggle label="Đến lấy (PICKUP)" desc="Khách đặt qua web, đến lấy tại quán" defaultOn />
          <div className="border-t border-[var(--d-line)]"><Toggle label="Giao hàng (DELIVERY)" desc="Tự tính phí theo khoảng cách" defaultOn /></div>
          <div className="border-t border-[var(--d-line)]"><Toggle label="Thanh toán trước qua VietQR" defaultOn /></div>
        </div>
      </Panel>

      <Panel title="Địa chỉ & bản đồ điểm bán" desc="Toạ độ này là gốc tính khoảng cách và phí giao cho mọi đơn delivery.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Địa chỉ điểm bán" defaultValue="23 Nguyễn Văn Linh, Hải Châu, Đà Nẵng" full />
          <Field label="Vĩ độ (lat)" defaultValue="16.0471" />
          <Field label="Kinh độ (lng)" defaultValue="108.2068" />
        </div>
        <div className="relative mt-3 grid aspect-[16/7] place-items-center overflow-hidden rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[repeating-linear-gradient(45deg,var(--d-surface-2)_0_10px,var(--d-surface)_10px_20px)]">
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--d-jade)] text-[var(--d-on-jade)] shadow-[var(--d-sh-md)]"><Store size={18} /></span>
          </span>
          {[3, 5, 8].map((r, i) => (
            <span key={r} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-[var(--d-jade)]/40" style={{ width: `${(i + 1) * 28}%`, height: `${(i + 1) * 28}%` }} />
          ))}
          <span className="absolute bottom-2 right-2 rounded-[var(--d-r-sm)] bg-[var(--d-surface)] px-2 py-1 text-[length:var(--d-fs-2xs)] text-[var(--d-text-muted)] shadow">Bán kính 3 · 5 · 8km</span>
        </div>
        <div className="mt-2"><Button variant="secondary" size="sm" onClick={onSave}>Ghim lại vị trí trên bản đồ</Button></div>
      </Panel>

      <Panel title="Phí giao theo vùng" desc="Mỗi vùng tính theo bán kính từ điểm bán. Khách ngoài vùng xa nhất sẽ không đặt giao được." footer={<><Button variant="secondary" size="md" onClick={() => setZones((p) => [...p, { id: `z${p.length + 1}`, name: "Vùng mới", fee: 30_000, eta: "30 phút" }])}>+ Thêm vùng</Button><Button variant="primary" size="md" onClick={onSave}><Save size={15} /> Lưu phí giao</Button></>}>
        <div className="overflow-hidden rounded-[var(--d-r-md)] border border-[var(--d-line)]">
          {zones.map((z, i) => (
            <div key={z.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", i > 0 && "border-t border-[var(--d-line)]")}>
              <span className="grid h-9 w-9 flex-none place-items-center rounded-[var(--d-r-md)] bg-[var(--d-info-bg)] text-[var(--d-info-fg)]"><Bike size={16} /></span>
              <input defaultValue={z.name} className="h-9 min-w-0 flex-1 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-2.5 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" />
              <div className="flex items-center gap-1.5"><input defaultValue={z.fee.toLocaleString("vi-VN")} className="h-9 w-24 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-2.5 text-right text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" /><span className="text-[length:var(--d-fs-xs)] text-[var(--d-text-faint)]">₫</span></div>
              <input defaultValue={z.eta} className="h-9 w-28 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-2.5 text-[length:var(--d-fs-xs)] outline-none focus:border-[var(--d-jade)]" />
              <button onClick={() => setZones((p) => p.filter((x) => x.id !== z.id))} className="grid h-9 w-9 place-items-center rounded-[var(--d-r-md)] text-[var(--d-text-faint)] transition hover:bg-[var(--d-danger-bg)] hover:text-[var(--d-danger-fg)]" aria-label="Xoá vùng">×</button>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Đơn tối thiểu để giao (VND)" defaultValue="50.000" />
          <Field label="Miễn phí giao khi đơn ≥ (VND)" defaultValue="200.000" />
        </div>
      </Panel>
    </div>
  );
}

/* ── Section 8: Thanh toán ── */
function Payments({ onSave }: { onSave: () => void }) {
  return (
    <Panel title="Tài khoản nhận VietQR" desc="QR tự sinh trên hoá đơn dùng đúng số tài khoản này." footer={<SaveFooter onSave={onSave} />}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Ngân hàng" defaultValue="vcb" options={[{ value: "vcb", label: "Vietcombank" }, { value: "tcb", label: "Techcombank" }, { value: "mb", label: "MB Bank" }, { value: "vib", label: "VIB" }]} />
        <Field label="Số tài khoản" defaultValue="0123 456 789" />
        <Field label="Tên chủ tài khoản" defaultValue="QUAN CAFE DEMO" full />
      </div>
      <div className="mt-3 overflow-hidden rounded-[var(--d-r-md)] border border-[var(--d-line)] px-4">
        <Toggle label="Cho phép thanh toán tiền mặt" defaultOn />
        <div className="border-t border-[var(--d-line)]"><Toggle label="Tự xác nhận VietQR khi tiền về" defaultOn /></div>
      </div>
    </Panel>
  );
}
/* ── Section 9: Gói LogiVN ── */
function Billing({ onAction }: { onAction: (m: string) => void }) {
  const plans = [
    {
      key: "pro" as const,
      name: "LogiVN Pro",
      price: 99_000,
      current: true,
      tagline: "Tối ưu cho quán đang tăng trưởng",
      features: [
        "20 bàn QR · 500 món · 10 nhân viên",
        "Đơn realtime · KDS · VietQR · tiền mặt",
        "Đặt online (pickup + giao cơ bản)",
        "AI trợ lý chủ quán 300 lượt/tháng",
        "Khuyến mãi 20 chương trình"
      ]
    },
    {
      key: "premium" as const,
      name: "LogiVN Premium",
      price: 199_000,
      current: false,
      tagline: "Cho quán muốn AI sâu hơn và kho đa chi nhánh",
      features: [
        "300 bàn · 2000 món · 50 nhân viên",
        "Đặt bàn + nhận cọc · Theo dõi giao realtime",
        "Trung tâm vận hành kho · OCR hoá đơn",
        "AI 3000 lượt + tạo ảnh + giọng nói",
        "Báo cáo nâng cao · 200 khuyến mãi · Hỗ trợ ưu tiên"
      ]
    }
  ];

  const [upgradeOpen, setUpgradeOpen] = useState<null | "pro" | "premium">(null);
  const [renewOpen, setRenewOpen] = useState(false);

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <Panel title="Gói hiện tại" desc="Bạn đang dùng LogiVN Pro · còn 28 ngày · gia hạn tự động bằng VietQR.">
        <div className="grid gap-3 sm:grid-cols-2">
          {plans.map((p) => (
            <article key={p.key} className={cn("flex flex-col gap-2 rounded-[var(--d-r-lg)] border p-[var(--d-s-4)]", p.current ? "border-[var(--d-jade)] bg-[var(--d-primary-soft)]" : "border-[var(--d-line)] bg-[var(--d-surface-2)]")}>
              <header className="flex items-center justify-between">
                <p className="text-[length:var(--d-fs-h3)] font-bold">{p.name}</p>
                {p.current ? <Badge tone="ok">Đang dùng</Badge> : <Badge tone="orange">Khuyến nghị</Badge>}
              </header>
              <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{p.tagline}</p>
              <p className="d-num text-[length:var(--d-fs-h2)] font-bold text-[var(--d-primary)]">{p.price.toLocaleString("vi-VN")}₫<span className="text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]"> /tháng</span></p>
              <ul className="flex flex-col gap-1">{p.features.map((f) => <li key={f} className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">• {f}</li>)}</ul>
              {p.current ? (
                <Button variant="secondary" size="sm" className="mt-1" onClick={() => setRenewOpen(true)}>Gia hạn / đổi gói</Button>
              ) : (
                <Button variant="primary" size="sm" className="mt-1" onClick={() => setUpgradeOpen(p.key)}>Nâng cấp Premium</Button>
              )}
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="Hoá đơn gần đây">
        <div className="overflow-hidden rounded-[var(--d-r-md)] border border-[var(--d-line)]">
          {[{ id: "INV-2026-06", date: "01/06/2026", total: "99.000₫" }, { id: "INV-2026-05", date: "01/05/2026", total: "99.000₫" }, { id: "INV-2026-04", date: "01/04/2026", total: "99.000₫" }].map((inv, i) => (
            <div key={inv.id} className={cn("flex items-center justify-between gap-3 px-4 py-3", i > 0 && "border-t border-[var(--d-line)]")}>
              <div><p className="text-[length:var(--d-fs-sm)] font-semibold">{inv.id}</p><p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{inv.date}</p></div>
              <div className="flex items-center gap-3"><span className="d-num font-bold">{inv.total}</span><Badge tone="ok">Đã trả</Badge><Button variant="ghost" size="sm" onClick={() => onAction("Đang tải hoá đơn PDF")}>PDF</Button></div>
            </div>
          ))}
        </div>
      </Panel>
      <BillingPaymentModal
        kind={upgradeOpen ? "upgrade" : renewOpen ? "renew" : null}
        targetPlan={upgradeOpen}
        onClose={() => { setUpgradeOpen(null); setRenewOpen(false); }}
        onConfirm={(m) => { setUpgradeOpen(null); setRenewOpen(false); onAction(m); }}
      />
    </div>
  );
}

/* ── Section 10: Nhận diện AI ── */
function AiSetup({ onAction }: { onAction: (m: string) => void }) {
  const quotas = [
    { k: "ai_owner_assistant", l: "Trợ lý chủ quán", used: 184, cap: 300 },
    { k: "ai_branding_studio", l: "Studio nhận diện", used: 12, cap: 40 },
    { k: "ai_voice_input", l: "Giọng nói", used: 23, cap: 300 }
  ];
  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <Panel title="Nhận diện do AI tạo" desc="AI viết slogan, mô tả quán dựa trên hồ sơ." footer={<><Button variant="secondary" size="md" onClick={() => onAction("AI đang gợi ý slogan mới")}>Gợi ý lại</Button><Button variant="primary" size="md" onClick={() => onAction("Đã áp dụng nhận diện mới")}><Save size={15} /> Áp dụng</Button></>}>
        <div className="grid gap-3">
          <Field label="Slogan" defaultValue="Cafe specialty - Mỗi ngụm là một câu chuyện" full />
          <label className="flex flex-col gap-1.5"><span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Mô tả quán</span><textarea defaultValue="Quán cafe specialty với hạt rang xay tại chỗ, không gian xanh, phục vụ nhanh." className="min-h-[88px] rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)] focus:ring-2 focus:ring-[var(--d-jade)]/20" /></label>
        </div>
      </Panel>
      <Panel title="Mức dùng AI tháng này" desc="Mức dùng gắn theo gói. Pro 300 lượt · Premium 3000 lượt cho trợ lý chủ quán.">
        <div className="grid gap-3 sm:grid-cols-3">
          {quotas.map((q) => {
            const pct = Math.round((q.used / q.cap) * 100);
            return (
              <div key={q.k} className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
                <p className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">{q.l}</p>
                <p className="d-num mt-1 text-[length:var(--d-fs-h3)] font-bold">{q.used}<span className="text-[length:var(--d-fs-sm)] text-[var(--d-text-faint)]"> / {q.cap}</span></p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--d-surface-3)]"><span className="block h-full rounded-full bg-[var(--d-jade)]" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
/* ── Section 11: Thông báo + Telegram bot (telegram_notification_policies) ── */
type Policy = { eventType: string; label: string; enabled: boolean; scope: "permission" | "admins" | "branch"; escalationMin: number; digest: boolean };

const SCOPE_LABEL = { permission: "Theo quyền", admins: "Tất cả admin", branch: "NV chi nhánh" } as const;

const POLICIES: Policy[] = [
  { eventType: "order.created", label: "Đơn mới khách gọi", enabled: true, scope: "branch", escalationMin: 2, digest: false },
  { eventType: "order.cancelled", label: "Đơn đã huỷ", enabled: true, scope: "admins", escalationMin: 5, digest: false },
  { eventType: "payment.waiting_confirm", label: "VietQR chờ xác nhận", enabled: true, scope: "permission", escalationMin: 3, digest: false },
  { eventType: "payment.received", label: "Đã nhận thanh toán", enabled: true, scope: "permission", escalationMin: 15, digest: true },
  { eventType: "inventory.low_stock", label: "Nguyên liệu sắp hết", enabled: true, scope: "admins", escalationMin: 30, digest: false },
  { eventType: "sla.kitchen_overdue", label: "Bếp quá giờ ra món", enabled: true, scope: "branch", escalationMin: 10, digest: false },
  { eventType: "staff.shift_late", label: "Nhân viên đi trễ", enabled: false, scope: "admins", escalationMin: 10, digest: false }
];

function Notifications({ onSave }: { onSave: () => void }) {
  const [connected, setConnected] = useState(true);
  const [policies, setPolicies] = useState(POLICIES);
  const toggle = (et: string) => setPolicies((p) => p.map((x) => (x.eventType === et ? { ...x, enabled: !x.enabled } : x)));

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <Panel title="Telegram bot cho chủ quán" desc="Nhận cảnh báo realtime ngay trên Telegram qua @logivn_bot.">
        {connected ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--d-info-bg)] text-[var(--d-info-fg)]"><Bell size={18} /></span>
              <div className="min-w-0 flex-1"><p className="text-[length:var(--d-fs-sm)] font-semibold">@logivn_bot · Đã kết nối</p><p className="truncate text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Chủ quán Anh Nam · 2 admin · 3 nhân viên</p></div>
              <Badge tone="ok">Hoạt động</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[{ l: "Cảnh báo bật", v: String(policies.filter((p) => p.enabled).length) }, { l: "Gửi 24h", v: "342" }, { l: "Lỗi 24h", v: "2" }, { l: "Sự cố mở", v: "0" }].map((q) => (
                <div key={q.l} className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-2.5 text-center"><p className="d-num text-[length:var(--d-fs-h3)] font-bold">{q.v}</p><p className="text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">{q.l}</p></div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm">Gửi tin thử</Button>
              <Button variant="secondary" size="sm">Lịch sử 50 tin</Button>
              <Button variant="ghost" size="sm" onClick={() => setConnected(false)}>Ngắt kết nối</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-[var(--d-r-md)] border border-dashed border-[var(--d-line-strong)] bg-[var(--d-surface-2)] p-5 text-center">
            <p className="text-[length:var(--d-fs-sm)] font-semibold">Liên kết @logivn_bot</p>
            <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Nhập mã 6 số bot gửi để xác minh chủ quán.</p>
            <Button variant="primary" size="md" onClick={() => setConnected(true)}>Kết nối ngay</Button>
          </div>
        )}
      </Panel>

      <Panel title="Sự kiện cảnh báo" desc="Mỗi sự kiện có phạm vi gửi và thời gian leo thang riêng." footer={<SaveFooter onSave={onSave} />}>
        <div className="overflow-hidden rounded-[var(--d-r-md)] border border-[var(--d-line)]">
          {policies.map((p, i) => (
            <div key={p.eventType} className={cn("flex items-center gap-3 px-4 py-2.5", i > 0 && "border-t border-[var(--d-line)]")}>
              <span className="min-w-0 flex-1"><span className="block text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{p.label}</span><span className="d-num block text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">{p.eventType} · leo thang {p.escalationMin}'</span></span>
              <Badge tone={p.scope === "admins" ? "info" : "ok"}>{SCOPE_LABEL[p.scope]}</Badge>
              {p.digest ? <Badge tone="neutral">Gom giờ</Badge> : null}
              <SwitchControl checked={p.enabled} onChange={() => toggle(p.eventType)} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Kênh dự phòng">
        <div className="overflow-hidden rounded-[var(--d-r-md)] border border-[var(--d-line)] px-4">
          <Toggle label="Web Push trên trình duyệt" defaultOn />
          <div className="border-t border-[var(--d-line)]"><Toggle label="Email báo cáo ca 22:00" defaultOn /></div>
          <div className="border-t border-[var(--d-line)]"><Toggle label="SMS khẩn khi mất Telegram > 10 phút" /></div>
        </div>
      </Panel>
    </div>
  );
}
/* ── Section 12: Phân quyền (theo staff_permission_service) ── */
function Permissions({ onAction }: { onAction: (m: string) => void }) {
  const [team, setTeam] = useState([
    { id: "u1", name: "Anh Nam", email: "nam@cafe.vn", role: "Chủ quán" as const, perms: ["all"] },
    { id: "u2", name: "Chị Hà", email: "ha@cafe.vn", role: "Quản lý" as const, perms: ["orders.update", "payments.confirm", "menu.update", "staff.view"] },
    { id: "u3", name: "Anh Tú", email: "tu@cafe.vn", role: "Nhân viên" as const, perms: ["orders.update", "payments.view"] }
  ]);

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <Panel title="Thành viên" desc="Quyền chi tiết kế thừa từ staff_permission_service." footer={<><Button variant="secondary" size="md">Mời qua link</Button><Button variant="primary" size="md" onClick={() => { setTeam((p) => [...p, { id: `u${p.length + 1}`, name: "Thành viên mới", email: "moi@cafe.vn", role: "Nhân viên", perms: ["orders.update"] }]); onAction("Đã thêm thành viên"); }}>+ Mời thành viên</Button></>}>
        <div className="overflow-hidden rounded-[var(--d-r-md)] border border-[var(--d-line)]">
          {team.map((u, i) => (
            <div key={u.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", i > 0 && "border-t border-[var(--d-line)]")}>
              <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--d-primary-soft)] text-[length:var(--d-fs-sm)] font-bold text-[var(--d-primary)]">{u.name.replace(/^(Anh|Chị)\s*/, "").charAt(0)}</span>
              <span className="min-w-0 flex-1"><span className="block text-[length:var(--d-fs-sm)] font-semibold">{u.name}</span><span className="block truncate text-[length:var(--d-fs-xs)] text-[var(--d-text-faint)]">{u.email}</span></span>
              <Badge tone={u.role === "Chủ quán" ? "jade" : u.role === "Quản lý" ? "info" : "neutral"}>{u.role}</Badge>
              <span className="d-num hidden text-[length:var(--d-fs-2xs)] text-[var(--d-text-muted)] sm:inline">{u.perms.length === 1 && u.perms[0] === "all" ? "Toàn quyền" : `${u.perms.length} quyền`}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => onAction(`Đang mở chi tiết ${u.name}`)}>Sửa</Button>
                {u.role !== "Chủ quán" ? <Button variant="ghost" size="sm" onClick={() => { setTeam((p) => p.filter((x) => x.id !== u.id)); onAction("Đã gỡ thành viên"); }}>Gỡ</Button> : null}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Vai trò mặc định" desc="Quyền nền cho 3 vai trò chính.">
        <div className="grid gap-3 sm:grid-cols-3">
          {[{ k: "owner", l: "Chủ quán", desc: "Toàn quyền, không khoá được" }, { k: "manager", l: "Quản lý", desc: "Vận hành ca, xác nhận thanh toán, sửa menu" }, { k: "staff", l: "Nhân viên", desc: "Nhận đơn, ra món, in hoá đơn" }].map((r) => (
            <article key={r.k} className="flex flex-col gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
              <p className="text-[length:var(--d-fs-sm)] font-bold">{r.l}</p>
              <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{r.desc}</p>
              <Button variant="ghost" size="sm" onClick={() => onAction(`Đang mở mẫu quyền ${r.l}`)}>Tuỳ chỉnh quyền →</Button>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}
/* BillingPaymentModal — bám subscription-transitions.ts:
 *  - renew: cùng gói, cộng tháng
 *  - upgrade: pro→premium, quy đổi ngày còn lại sang gói mới (proration)
 *  - thanh toán bằng VietQR transfer code (createSubscriptionPaymentRequest) */
function BillingPaymentModal({ kind, targetPlan, onClose, onConfirm }: { kind: "upgrade" | "renew" | null; targetPlan: "pro" | "premium" | null; onClose: () => void; onConfirm: (m: string) => void }) {
  const [months, setMonths] = useState(1);
  const [plan, setPlan] = useState<"pro" | "premium">("pro");
  const [transferSeed] = useState(() => String(Date.now()).slice(-6));
  const isUpgrade = kind === "upgrade";
  const chosen = isUpgrade ? (targetPlan ?? "premium") : plan;
  const transferCode = `LOGIVN-${chosen.toUpperCase()}-${transferSeed}`;

  if (!kind) return null;

  const price = chosen === "premium" ? 199_000 : 99_000;
  const subtotal = price * months;
  const credit = isUpgrade ? 47_000 : 0; // quy đổi ngày còn lại của gói cũ
  const total = Math.max(0, subtotal - credit);

  return (
    <Modal open onClose={onClose} size="md" title={isUpgrade ? "Nâng cấp lên Premium" : "Gia hạn / đổi gói"} subtitle="Thanh toán VietQR" footer={
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
        <Button variant="primary" size="md" onClick={() => onConfirm(isUpgrade ? "Đã tạo yêu cầu nâng cấp Premium · chờ chuyển khoản VietQR" : "Đã tạo yêu cầu gia hạn · chờ chuyển khoản VietQR")}>Tạo yêu cầu</Button>
      </div>
    }>
      <div className="flex flex-col gap-[var(--d-s-4)]">
        {!isUpgrade ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Gói</span>
            <div className="grid grid-cols-2 gap-2">
              {(["pro", "premium"] as const).map((p) => (
                <button key={p} type="button" onClick={() => setPlan(p)} className={cn("rounded-[var(--d-r-md)] border px-3 py-2.5 text-left transition", plan === p ? "border-[var(--d-jade)] bg-[var(--d-primary-soft)]" : "border-[var(--d-line)] bg-[var(--d-surface)] hover:border-[var(--d-line-strong)]")}>
                  <span className="block text-[length:var(--d-fs-sm)] font-bold">{p === "premium" ? "Premium" : "Pro"}</span>
                  <span className="d-num block text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{(p === "premium" ? 199_000 : 99_000).toLocaleString("vi-VN")}₫/tháng</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-[var(--d-r-md)] border border-[var(--d-jade)] bg-[var(--d-primary-soft)] p-3">
            <p className="text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">LogiVN Premium · 199.000₫/tháng</p>
            <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Ngày còn lại của gói Pro sẽ được quy đổi sang Premium.</p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Số tháng</span>
          <div className="flex gap-2">
            {[1, 3, 6, 12].map((m) => (
              <button key={m} type="button" onClick={() => setMonths(m)} className={cn("h-10 flex-1 rounded-[var(--d-r-md)] border text-[length:var(--d-fs-sm)] font-semibold transition", months === m ? "border-[var(--d-jade)] bg-[var(--d-primary-soft)] text-[var(--d-primary)]" : "border-[var(--d-line)] bg-[var(--d-surface)] text-[var(--d-text-muted)] hover:border-[var(--d-line-strong)]")}>{m} tháng</button>
            ))}
          </div>
        </div>

        <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-4)]">
          <div className="flex items-center justify-between text-[length:var(--d-fs-sm)]"><span className="text-[var(--d-text-muted)]">Tạm tính ({months} tháng)</span><span className="d-num font-semibold">{subtotal.toLocaleString("vi-VN")}₫</span></div>
          {credit > 0 ? <div className="mt-1 flex items-center justify-between text-[length:var(--d-fs-sm)]"><span className="text-[var(--d-text-muted)]">Quy đổi ngày còn lại</span><span className="d-num font-semibold text-[var(--d-orange-600)]">- {credit.toLocaleString("vi-VN")}₫</span></div> : null}
          <div className="mt-2 flex items-center justify-between border-t border-[var(--d-line)] pt-2"><span className="text-[length:var(--d-fs-sm)] font-semibold">Tổng thanh toán</span><span className="d-num text-[length:var(--d-fs-h2)] font-bold text-[var(--d-text)]">{total.toLocaleString("vi-VN")}₫</span></div>
        </div>

        <div className="flex items-center gap-4 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
          <div className="grid h-24 w-24 flex-none place-items-center rounded-[var(--d-r-md)] bg-[var(--d-surface-2)] text-[var(--d-text-faint)]"><WalletCards size={32} /></div>
          <div className="min-w-0">
            <p className="d-eyebrow">Chuyển khoản VietQR</p>
            <p className="mt-1 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">Nội dung CK bắt buộc:</p>
            <p className="d-num mt-1 break-all rounded-[var(--d-r-sm)] bg-[var(--d-surface-2)] px-2 py-1 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{transferCode}</p>
            <p className="mt-1 text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">Hệ thống tự kích hoạt khi nhận được tiền (webhook PayOS).</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
