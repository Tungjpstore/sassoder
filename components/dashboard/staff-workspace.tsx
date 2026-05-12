"use client";

import { useActionState, useMemo, useState } from "react";
import { CalendarDays, Mail, Search, ShieldCheck, Star, Trash2, UserPlus, UserRound, Users, X } from "lucide-react";
import { createStaffAction, deleteStaffAction, updateStaffRoleAction } from "@/app/dashboard/actions";
import { ConfirmActionButton } from "@/components/dashboard/confirm-action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  STAFF_PERMISSION_PRESETS,
  getStaffPermissionPreset,
  normalizeStaffPermissions,
  staffPermissionLabel,
  type StaffPermissionProfile,
  type StaffRole
} from "@/lib/staff-permissions";

type StaffUser = {
  id: string;
  email: string;
  role: StaffRole;
  restaurant_id: string;
  staff_title?: string | null;
  permission_profile?: StaffPermissionProfile | null;
  permissions?: unknown;
  account_status?: "active" | "blocked";
};
type OperationsSummary = {
  pending: number;
  ordering: number;
  completedToday: number;
  paid: number;
};

type StaffWorkspaceProps = {
  users: StaffUser[];
  operations: OperationsSummary;
  currentUserId: string;
  currentRole: StaffRole;
  fallbackUser: StaffUser;
};

type StaffPanelMode = "closed" | "staff" | "create";

function roleLabel(role: StaffRole) {
  return role === "ADMIN" ? "Quản lý" : "Nhân viên";
}

function profileForUser(user: StaffUser) {
  return getStaffPermissionPreset(user.permission_profile ?? (user.role === "ADMIN" ? "manager" : "service"));
}

function userPermissions(user: StaffUser) {
  return normalizeStaffPermissions(user.permissions, profileForUser(user).key);
}

function ActionFeedback({ state }: { state?: { error?: string; success?: string } }) {
  if (!state?.error && !state?.success) return null;

  return (
    <p
      role={state.error ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
        state.error
          ? "border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent-strong)]"
          : "border-[var(--primary)]/15 bg-[var(--primary-soft)] text-[var(--primary)]"
      }`}
    >
      {state.error ?? state.success}
    </p>
  );
}

export function StaffWorkspace({ users, operations, currentUserId, currentRole, fallbackUser }: StaffWorkspaceProps) {
  const [createState, createFormAction, creating] = useActionState(createStaffAction, undefined);
  const [updateState, updateFormAction, updating] = useActionState(updateStaffRoleAction, undefined);
  const [deleteState, deleteFormAction, deleting] = useActionState(deleteStaffAction, undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<StaffPanelMode>("closed");
  const [profileFilter, setProfileFilter] = useState<StaffPermissionProfile | "all">("all");
  const [createProfile, setCreateProfile] = useState<StaffPermissionProfile>("service");
  const [query, setQuery] = useState("");
  const canManage = currentRole === "ADMIN";
  const sourceUsers = useMemo(() => (users.length ? users : [fallbackUser]), [fallbackUser, users]);
  const createPreset = getStaffPermissionPreset(createProfile);

  const filteredUsers = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return sourceUsers.filter((user) => {
      const profile = profileForUser(user);
      const matchesProfile = profileFilter === "all" || profile.key === profileFilter;
      const title = user.staff_title ?? profile.title;
      const matchesKeyword =
        !keyword ||
        user.email.toLowerCase().includes(keyword) ||
        user.email.split("@")[0].toLowerCase().includes(keyword) ||
        title.toLowerCase().includes(keyword);
      return matchesProfile && matchesKeyword;
    });
  }, [query, profileFilter, sourceUsers]);

  const selectedUser = selectedId ? sourceUsers.find((user) => user.id === selectedId) ?? null : null;
  const adminCount = sourceUsers.filter((user) => user.role === "ADMIN").length;
  const staffCount = sourceUsers.filter((user) => user.role === "STAFF").length;
  const managerCount = sourceUsers.filter((user) => profileForUser(user).key === "manager").length;
  const stats = [
    { label: "Tổng tài khoản", value: sourceUsers.length, meta: `${managerCount || adminCount} quản lý`, icon: Users },
    { label: "Nhân viên", value: staffCount, meta: "Theo chức danh vận hành", icon: UserRound },
    { label: "Đơn đang xử lý", value: operations.pending + operations.ordering, meta: "Cần phối hợp trong ca", icon: CalendarDays },
    { label: "Đơn hoàn tất hôm nay", value: operations.completedToday + operations.paid, meta: "Từ dữ liệu order", icon: Star }
  ];

  return (
    <div className="grid gap-3">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="admin-stat-tile rounded-[14px] p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">{stat.label}</p>
                <span className="dashboard-stat-icon">
                  <Icon size={18} />
                </span>
              </div>
              <p className="metric-number mt-3 text-2xl font-semibold text-[var(--foreground)]">{stat.value}</p>
              <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">{stat.meta}</p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-4">
        <div className="dashboard-panel p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">Danh sách nhân sự</h2>
              <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Tạo nhân viên theo chức danh để mỗi ca có quyền vận hành rõ ràng, không phải chỉnh từng trang rời rạc.</p>
            </div>
            <Button type="button" onClick={() => setPanelMode("create")} className="shadow-none hover:shadow-none">
              <UserPlus size={16} />
              Thêm nhân viên
            </Button>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-[170px_minmax(0,1fr)_120px]">
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
              Chức danh
              <select
                value={profileFilter}
                onChange={(event) => setProfileFilter(event.target.value as StaffPermissionProfile | "all")}
                className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold normal-case tracking-normal text-[var(--foreground)] outline-none"
              >
                <option value="all">Tất cả chức danh</option>
                {STAFF_PERMISSION_PRESETS.map((preset) => (
                  <option key={preset.key} value={preset.key}>{preset.title}</option>
                ))}
              </select>
            </label>
            <label className="relative grid gap-1 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
              Tìm nhanh
              <Search className="pointer-events-none absolute bottom-4 left-3 h-4 w-4 text-[var(--outline)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tên nhân viên hoặc email..."
                className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-10 pr-3 text-sm font-medium normal-case tracking-normal outline-none"
              />
            </label>
            <Button type="button" variant="secondary" className="self-end" onClick={() => {
              setProfileFilter("all");
              setQuery("");
            }}>
              Xoá lọc
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="dashboard-muted-header grid grid-cols-[1.4fr_0.8fr_1fr_0.8fr] gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-[0.06em] max-lg:hidden">
              <span>Tài khoản</span>
              <span>Chức danh</span>
              <span>Email</span>
              <span>Trạng thái</span>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {filteredUsers.length === 0 && (
                <div className="grid min-h-40 place-items-center px-5 py-8 text-sm font-semibold text-[var(--muted-foreground)]">
                  Không tìm thấy nhân viên phù hợp.
                </div>
              )}
              {filteredUsers.map((user, index) => {
	                const isSelected = selectedUser?.id === user.id;
                  const profile = profileForUser(user);
                return (
                  <button
                    key={user.id}
                    type="button"
	                    onClick={() => {
                        setSelectedId(user.id);
                        setPanelMode("staff");
                      }}
                    className={`dashboard-selectable-row grid w-full gap-3 px-4 py-3 text-left lg:grid-cols-[1.4fr_0.8fr_1fr_0.8fr] ${
                      isSelected ? "dashboard-selected-row" : ""
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--primary)] text-sm font-black text-white">{user.email.charAt(0).toUpperCase()}</span>
                      <span>
                        <span className="block text-sm font-semibold">{user.email.split("@")[0]}</span>
                        <span className="text-xs font-semibold text-[var(--muted-foreground)]">NV{String(index + 1).padStart(4, "0")}</span>
                      </span>
                    </span>
                    <span><Badge tone={profile.role === "ADMIN" ? "green" : "neutral"}>{user.staff_title ?? profile.title}</Badge></span>
                    <span className="truncate text-sm font-semibold text-[var(--muted-foreground)]">{user.email}</span>
                    <span><Badge tone={user.account_status === "blocked" ? "yellow" : "green"}>{user.account_status === "blocked" ? "Đã khóa" : "Đang hoạt động"}</Badge></span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[var(--muted-foreground)]">
              <span>Đang hiển thị {filteredUsers.length} / {sourceUsers.length} tài khoản</span>
              <span>{canManage ? "Quản lý có thể đổi vai trò hoặc xoá tài khoản phụ." : "Bạn cần quyền Quản lý để chỉnh nhân viên."}</span>
            </div>
          </div>
        </div>

        {panelMode !== "closed" && (
          <div className="fixed inset-0 z-[var(--z-dashboard-drawer)] overflow-hidden overscroll-contain">
            <button
              type="button"
              className="drawer-backdrop absolute inset-0 z-0"
              aria-label="Đóng thông tin nhân viên"
              onClick={() => {
                setPanelMode("closed");
                setSelectedId(null);
              }}
            />
            <aside
              role="dialog"
              aria-modal="true"
              aria-labelledby="staff-drawer-title"
              className="drawer-panel absolute inset-y-0 right-0 z-[1] flex h-dvh max-h-dvh w-full max-w-[460px] flex-col border-l border-[var(--border)] bg-[var(--surface)]"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5 sm:py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Nhân viên</p>
                  <h3 id="staff-drawer-title" className="mt-1 text-xl font-semibold text-[var(--foreground)]">
                    {panelMode === "create" ? "Tạo tài khoản nhân viên" : selectedUser?.email.split("@")[0] ?? "Chi tiết nhân viên"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPanelMode("closed");
                    setSelectedId(null);
                  }}
                  className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]"
                  aria-label="Đóng thông tin nhân viên"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-5">
                {panelMode === "create" && (
                  <form action={createFormAction} className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                    <ActionFeedback state={createState} />
                    <label className="grid gap-2 text-sm font-semibold">
                      Email nhân viên
                      <Input name="email" type="email" placeholder="nhanvien@quan.vn" required disabled={!canManage} />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold">
                      Mật khẩu tạm
                      <Input name="password" type="password" minLength={8} placeholder="Ít nhất 8 ký tự" required disabled={!canManage} />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold">
                      Chức danh & quyền
                      <select
                        name="permissionProfile"
                        value={createProfile}
                        onChange={(event) => setCreateProfile(event.target.value as StaffPermissionProfile)}
                        disabled={!canManage}
                        className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none disabled:opacity-60"
                      >
                        {STAFF_PERMISSION_PRESETS.map((preset) => (
                          <option key={preset.key} value={preset.key}>{preset.title}</option>
                        ))}
                      </select>
                    </label>
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                      <p className="text-sm font-semibold text-[var(--foreground)]">{createPreset.title} · {roleLabel(createPreset.role)}</p>
                      <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">{createPreset.description}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {createPreset.permissions.map((permission) => (
                          <Badge key={permission} tone="green">{staffPermissionLabel(permission)}</Badge>
                        ))}
                      </div>
                    </div>
                    <Button disabled={!canManage || creating} className="shadow-none hover:shadow-none">
                      <UserPlus size={16} />
                      {creating ? "Đang tạo..." : "Tạo tài khoản"}
                    </Button>
                  </form>
                )}

                {panelMode === "staff" && selectedUser && (
                  <div className="grid gap-4">
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                      <div className="flex items-center gap-4">
                        <span className="grid h-20 w-20 place-items-center rounded-full bg-[var(--primary)] text-3xl font-black text-white">{selectedUser.email.charAt(0).toUpperCase()}</span>
                        <div>
                          <h2 className="text-xl font-semibold text-[var(--foreground)]">{selectedUser.email.split("@")[0]}</h2>
                          <p className="mt-1 text-sm font-semibold text-[var(--muted-foreground)]">{selectedUser.staff_title ?? profileForUser(selectedUser).title} · {selectedUser.account_status === "blocked" ? "Đã khóa" : "Đang hoạt động"}</p>
                        </div>
                      </div>
                      <div className="mt-5 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
                        <div className="flex items-center gap-2"><Mail size={16} className="text-[var(--primary)]" /> {selectedUser.email}</div>
                        <div className="flex items-center gap-2"><ShieldCheck size={16} className="text-[var(--primary)]" /> Vai trò hệ thống: {roleLabel(selectedUser.role)}</div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <h3 className="text-sm font-semibold text-[var(--foreground)]">Quyền truy cập</h3>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {userPermissions(selectedUser).map((permission) => (
                          <Badge key={permission} tone="green">{staffPermissionLabel(permission)}</Badge>
                        ))}
                      </div>
                    </div>

                    <form key={selectedUser.id} action={updateFormAction} className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <ActionFeedback state={updateState} />
                      <h3 className="text-sm font-semibold text-[var(--foreground)]">Cập nhật chức danh</h3>
                      <input type="hidden" name="userId" value={selectedUser.id} />
                      <select
                        name="permissionProfile"
                        defaultValue={profileForUser(selectedUser).key}
                        disabled={!canManage || selectedUser.id === currentUserId}
                        className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none disabled:opacity-60"
                      >
                        {STAFF_PERMISSION_PRESETS.map((preset) => (
                          <option key={preset.key} value={preset.key}>{preset.title}</option>
                        ))}
                      </select>
                      <Button disabled={!canManage || selectedUser.id === currentUserId || updating} className="shadow-none hover:shadow-none">
                        <ShieldCheck size={16} />
                        {updating ? "Đang lưu..." : "Lưu quyền truy cập"}
                      </Button>
                    </form>

                    <form action={deleteFormAction} className="rounded-xl border border-[var(--accent)]/20 bg-[var(--surface)] p-4">
                      <ActionFeedback state={deleteState} />
                      <h3 className="text-sm font-semibold text-[var(--accent-strong)]">Vùng xoá tài khoản</h3>
                      <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Chỉ xoá tài khoản phụ khi chắc chắn không còn dùng trong ca vận hành.</p>
                      <input type="hidden" name="userId" value={selectedUser.id} />
                      <ConfirmActionButton
                        type="submit"
                        variant="ghost"
                        className="mt-4 w-full border-[var(--accent)]/30 text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]"
                        disabled={!canManage || selectedUser.id === currentUserId || deleting}
                        confirmTitle="Xoá tài khoản nhân viên"
                        confirmDescription={`Tài khoản ${selectedUser.email} sẽ mất quyền truy cập vào dashboard quán.`}
                        confirmLabel="Xoá tài khoản"
                      >
                        <Trash2 size={16} />
                        {deleting ? "Đang xoá..." : "Xoá tài khoản này"}
                      </ConfirmActionButton>
                    </form>
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}
