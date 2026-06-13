"use client";

import { useState } from "react";
import { Clock3, Phone, Plus, ShieldCheck, Star, UserCog, Users } from "lucide-react";
import { FilterTabs, Toolbar, DataTable, type Column } from "../workspace-ui";
import { MetricCard, Badge, EmptyState } from "../primitives";
import { Button } from "../button";
import { Drawer, Modal } from "../overlay";
import { useToast } from "@/components/dashboard/toast-provider";
import { fmtVnd } from "./data";

/* StaffDemo — đội ngũ vận hành: bảng nhân sự + drawer ca làm.
 *  - Bảng dense, hành động nhanh (gọi điện, mở chi tiết)
 *  - Drawer: ca làm tuần, hiệu suất, role
 */

type Role = "owner" | "manager" | "staff";
type Member = {
  id: string;
  name: string;
  role: Role;
  phone: string;
  shift: string;
  status: "online" | "offline";
  todayHours: number;
  ordersToday: number;
  rating: number;
};

const ROLE: Record<Role, { label: string; tone: "jade" | "info" | "neutral" }> = {
  owner: { label: "Chủ quán", tone: "jade" },
  manager: { label: "Quản lý", tone: "info" },
  staff: { label: "Nhân viên", tone: "neutral" }
};

const M: Member[] = [
  { id: "s1", name: "Anh Nam", role: "owner", phone: "0901 111 222", shift: "—", status: "online", todayHours: 8, ordersToday: 0, rating: 5.0 },
  { id: "s2", name: "Chị Hà", role: "manager", phone: "0905 333 444", shift: "Sáng 7h-15h", status: "online", todayHours: 6.5, ordersToday: 47, rating: 4.9 },
  { id: "s3", name: "Anh Tú", role: "staff", phone: "0933 555 666", shift: "Sáng 7h-15h", status: "online", todayHours: 6.5, ordersToday: 38, rating: 4.7 },
  { id: "s4", name: "Chị Lan", role: "staff", phone: "0977 777 888", shift: "Tối 15h-22h", status: "offline", todayHours: 0, ordersToday: 0, rating: 4.6 },
  { id: "s5", name: "Anh Phú", role: "staff", phone: "0988 999 000", shift: "Tối 15h-22h", status: "offline", todayHours: 0, ordersToday: 0, rating: 4.5 }
];

export function StaffDemo() {
  const [members, setMembers] = useState(M);
  const [tab, setTab] = useState("all");
  const [sel, setSel] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const toast = useToast();
  const counts = { all: members.length, online: members.filter((m) => m.status === "online").length };
  const visible = tab === "all" ? members : tab === "online" ? members.filter((m) => m.status === "online") : members.filter((m) => m.role === tab);
  const current = members.find((m) => m.id === sel) ?? null;

  const cols: Column<Member>[] = [
    { key: "name", header: "Nhân viên", width: "1.6fr", render: (m) => (
      <span className="inline-flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--d-primary-soft)] text-[length:var(--d-fs-sm)] font-bold text-[var(--d-primary)]">{m.name.replace(/^(Anh|Chị)\s*/, "").charAt(0)}</span>
        <span>
          <span className="block text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{m.name}</span>
          <span className="block text-[length:var(--d-fs-xs)] text-[var(--d-text-faint)]">{m.phone}</span>
        </span>
      </span>
    ) },
    { key: "role", header: "Vai trò", render: (m) => <Badge tone={ROLE[m.role].tone}>{ROLE[m.role].label}</Badge> },
    { key: "shift", header: "Ca làm", render: (m) => <span className="text-[var(--d-text-muted)]">{m.shift}</span> },
    { key: "stats", header: "Hôm nay", render: (m) => (
      <span className="d-num text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
        {m.ordersToday > 0 ? `${m.ordersToday} đơn · ${m.todayHours}h` : "—"}
      </span>
    ) },
    { key: "status", header: "Trạng thái", align: "right", render: (m) => (
      <span className={`inline-flex items-center gap-1.5 text-[length:var(--d-fs-xs)] font-semibold ${m.status === "online" ? "text-[var(--d-ok-fg)]" : "text-[var(--d-text-faint)]"}`}>
        <span className={`h-2 w-2 rounded-full ${m.status === "online" ? "bg-[var(--d-ok-fg)]" : "bg-[var(--d-text-faint)]"}`} />
        {m.status === "online" ? "Đang làm" : "Nghỉ"}
      </span>
    ) }
  ];

  const totalOrders = members.reduce((s, m) => s + m.ordersToday, 0);

  return (
    <div className="flex flex-col gap-[var(--d-s-5)]">
      <Toolbar eyebrow="Đội ngũ vận hành" title="Nhân viên">
        <Button variant="primary" size="md" onClick={() => setCreateOpen(true)}><Plus size={15} /> Mời nhân viên</Button>
      </Toolbar>

      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        <MetricCard icon={<Users size={18} />} label="Tổng nhân sự" value={String(members.length)} tone="jade" />
        <MetricCard icon={<ShieldCheck size={18} />} label="Đang làm ca" value={String(counts.online)} tone="info" />
        <MetricCard icon={<UserCog size={18} />} label="Quản lý" value={String(members.filter((m) => m.role === "manager").length)} tone="orange" />
        <MetricCard icon={<Clock3 size={18} />} label="Đơn đã phục vụ" value={String(totalOrders)} tone="neutral" />
      </section>

      <FilterTabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "all", label: "Tất cả", count: counts.all },
          { key: "online", label: "Đang làm", count: counts.online },
          { key: "manager", label: "Quản lý" },
          { key: "staff", label: "Nhân viên" }
        ]}
      />

      <DataTable columns={cols} rows={visible} onRowClick={(m) => setSel(m.id)} empty={<EmptyState icon={<Users size={20} />} title="Không có nhân viên" />} />

      <StaffDrawer member={current} open={Boolean(current)} onClose={() => setSel(null)} onSaved={() => toast.success("Đã lưu thông tin nhân viên")} />
      <CreateStaffModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={(m) => { setMembers((p) => [...p, m]); setCreateOpen(false); toast.success("Đã mời nhân viên mới"); }} />
    </div>
  );
}

function StaffDrawer({ member, open, onClose, onSaved }: { member: Member | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  if (!member) return null;
  const week = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  const schedule = member.role === "owner" ? Array(7).fill(null) : member.shift.startsWith("Sáng") ? ["7-15", "7-15", "7-15", "Off", "7-15", "7-15", "Off"] : ["15-22", "15-22", "Off", "15-22", "15-22", "15-22", "15-22"];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title={member.name}
      subtitle={ROLE[member.role].label}
      headerMeta={
        <>
          <Badge tone={member.status === "online" ? "ok" : "neutral"}>{member.status === "online" ? "Đang làm" : "Nghỉ"}</Badge>
          <Badge tone="orange"><Star size={10} className="mr-1 inline" />{member.rating}</Badge>
        </>
      }
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1"><Phone size={15} /> Gọi</Button>
          <Button variant="primary" size="lg" className="flex-[2]" onClick={onSaved}><UserCog size={15} /> Lưu thông tin</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-[var(--d-s-5)]">
        <section className="grid grid-cols-3 gap-2">
          <Tile label="Đơn hôm nay" value={String(member.ordersToday)} />
          <Tile label="Giờ làm" value={`${member.todayHours}h`} />
          <Tile label="Đánh giá" value={`${member.rating} / 5.0`} />
        </section>

        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
          <p className="d-eyebrow">Thông tin nhân viên</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5"><span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Họ tên</span><input defaultValue={member.name} className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" /></label>
            <label className="flex flex-col gap-1.5"><span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Số điện thoại</span><input defaultValue={member.phone} className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" /></label>
            <label className="flex flex-col gap-1.5"><span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Vai trò</span><select defaultValue={member.role} className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"><option value="manager">Quản lý</option><option value="staff">Nhân viên</option></select></label>
            <label className="flex flex-col gap-1.5"><span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Ca làm</span><input defaultValue={member.shift} className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" /></label>
          </div>
        </section>

        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
          <p className="d-eyebrow">Lịch ca tuần này</p>
          <div className="mt-3 grid grid-cols-7 gap-1">
            {week.map((d, i) => (
              <div key={d} className="rounded-[var(--d-r-sm)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-2 text-center">
                <p className="text-[length:var(--d-fs-2xs)] uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{d}</p>
                <p className="d-num mt-1 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-text)]">{schedule[i] ?? "—"}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)]/50 p-[var(--d-s-4)]">
          <p className="d-eyebrow">Lương ước tính</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Tile label="Lương theo giờ" value={fmtVnd(member.role === "manager" ? 45_000 : 30_000)} />
            <Tile label="Tuần này" value={fmtVnd(member.todayHours * (member.role === "manager" ? 45_000 : 30_000) * 5)} />
          </div>
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

function CreateStaffModal({
  open,
  onClose,
  onCreate
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (member: Member) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [shift, setShift] = useState("Sáng 7h-15h");
  if (!open) return null;

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate({
      id: `s${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      role,
      phone: phone.trim() || "—",
      shift: role === "owner" ? "—" : shift,
      status: "offline",
      todayHours: 0,
      ordersToday: 0,
      rating: 5.0
    });
    setName("");
    setPhone("");
    setRole("staff");
  }

  return (
    <Modal open onClose={onClose} title="Mời nhân viên" subtitle="Nhân sự" size="md">
      <div className="grid gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Họ tên</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Nguyễn Văn A" className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Số điện thoại</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0901234567" className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Vai trò</span>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]">
              <option value="manager">Quản lý</option>
              <option value="staff">Nhân viên</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Ca làm</span>
            <input value={shift} onChange={(e) => setShift(e.target.value)} placeholder="Sáng 7h-15h" className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" />
          </label>
        </div>
        <div className="mt-1 flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
          <Button variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
          <Button variant="primary" size="md" onClick={submit}><Plus size={15} /> Mời nhân viên</Button>
        </div>
      </div>
    </Modal>
  );
}
