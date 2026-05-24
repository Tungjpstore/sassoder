"use client";

import { useActionState } from "react";
import { CheckCircle2, MapPin, Plus, Save, Store, TriangleAlert } from "lucide-react";
import { createStoreBranchAction, updateStoreBranchAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type BranchSettingsPanelBranch = {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
};

function formatCoordinate(value: number | null) {
  return value === null ? "" : String(value);
}

function branchReadiness(branch: BranchSettingsPanelBranch) {
  if (!branch.is_active) return { label: "Đã ẩn", tone: "muted" as const };
  if (branch.latitude === null || branch.longitude === null) return { label: "Thiếu tọa độ", tone: "warning" as const };
  return { label: "Sẵn sàng", tone: "ready" as const };
}

function StatusPill({ label, tone }: { label: string; tone: "ready" | "warning" | "muted" }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-black",
        tone === "ready" && "border-[#b8dcc5] bg-[#edf7ef] text-[#0f6944]",
        tone === "warning" && "border-[#f3d4ad] bg-[#fff7eb] text-[#a65f00]",
        tone === "muted" && "border-[#e1ddd4] bg-[#fbfaf7] text-[#667166]"
      )}
    >
      {label}
    </span>
  );
}

function BranchFormFields({ branch }: { branch?: BranchSettingsPanelBranch }) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <label className="grid gap-2 text-sm font-black">
          Tên chi nhánh
          <Input name="name" defaultValue={branch?.name ?? ""} required maxLength={120} placeholder="Chi nhánh chính" />
        </label>
        <label className="grid gap-2 text-sm font-black">
          Địa chỉ
          <Input name="address" defaultValue={branch?.address ?? ""} maxLength={240} placeholder="Địa chỉ vận hành" />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-[160px_160px_minmax(0,1fr)]">
        <label className="grid gap-2 text-sm font-black">
          Vĩ độ
          <Input name="latitude" type="number" step="any" min={-90} max={90} defaultValue={formatCoordinate(branch?.latitude ?? null)} />
        </label>
        <label className="grid gap-2 text-sm font-black">
          Kinh độ
          <Input name="longitude" type="number" step="any" min={-180} max={180} defaultValue={formatCoordinate(branch?.longitude ?? null)} />
        </label>
        <div className="grid gap-2 sm:grid-cols-2 md:self-end">
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-black">
            Chi nhánh chính
            <input type="checkbox" name="isPrimary" value="true" defaultChecked={branch?.is_primary ?? false} className="h-5 w-5 accent-[var(--primary)]" />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-black">
            Đang hoạt động
            <input type="checkbox" name="isActive" value="true" defaultChecked={branch?.is_active ?? true} className="h-5 w-5 accent-[var(--primary)]" />
          </label>
        </div>
      </div>
    </div>
  );
}

export function BranchSettingsPanel({ branches }: { branches: BranchSettingsPanelBranch[] }) {
  const [createState, createAction, createPending] = useActionState(createStoreBranchAction, undefined);
  const [updateState, updateAction, updatePending] = useActionState(updateStoreBranchAction, undefined);
  const activeCount = branches.filter((branch) => branch.is_active).length;
  const primaryBranch = branches.find((branch) => branch.is_primary && branch.is_active) ?? branches.find((branch) => branch.is_active) ?? branches[0] ?? null;
  const branchesWithCoordinates = branches.filter((branch) => branch.latitude !== null && branch.longitude !== null).length;

  return (
    <section className="grid gap-4">
      <div className="dashboard-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="dashboard-eyebrow">Branch foundation</p>
            <h2 className="dashboard-section-title mt-1">Chi nhánh của quán</h2>
            <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-[var(--muted-foreground)]">
              Quán luôn có chi nhánh mặc định để bàn, đơn hàng, nhân viên, kho và AI cùng gán vào một điểm vận hành.
            </p>
          </div>
          <div className="grid min-w-[220px] gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-container)] p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-[var(--muted-foreground)]">Đang hoạt động</span>
              <strong>{activeCount}/{branches.length}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-[var(--muted-foreground)]">Có tọa độ</span>
              <strong>{branchesWithCoordinates}</strong>
            </div>
          </div>
        </div>

        {primaryBranch ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--primary)]/15 bg-[var(--primary-soft)] px-4 py-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--surface)] text-[var(--primary)]">
              <Store size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-black text-[var(--foreground)]">{primaryBranch.name}</span>
              <span className="mt-0.5 flex items-center gap-1 truncate text-xs font-semibold text-[var(--muted-foreground)]">
                <MapPin size={12} />
                {primaryBranch.address || "Chưa có địa chỉ riêng"}
              </span>
            </span>
            <StatusPill label="Mặc định hiện hành" tone="ready" />
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-[#f3d4ad] bg-[#fff7eb] px-4 py-3 text-sm font-bold text-[#a65f00]">
            Hệ thống đang tạo chi nhánh mặc định. Tải lại trang nếu trạng thái này kéo dài.
          </div>
        )}
      </div>

      <form action={createAction} className="dashboard-panel p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="dashboard-stat-icon h-9 w-9">
            <Plus size={16} />
          </span>
          <h3 className="text-base font-black text-[var(--foreground)]">Thêm chi nhánh</h3>
        </div>
        <BranchFormFields />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold leading-5 text-[var(--muted-foreground)]">
            Có thể để trống tọa độ nếu chi nhánh chưa ghim bản đồ; các quyền vận hành vẫn được gán đủ.
          </p>
          <Button disabled={createPending}>
            <Plus size={15} />
            Tạo chi nhánh
          </Button>
        </div>
        {createState?.error ? <p role="alert" className="mt-3 rounded-xl bg-[#fff1ed] px-4 py-3 text-sm font-extrabold text-[#c23b2a]">{createState.error}</p> : null}
        {createState?.success ? <p aria-live="polite" className="mt-3 rounded-xl bg-[#edf7ef] px-4 py-3 text-sm font-extrabold text-[#0f6944]">{createState.success}</p> : null}
      </form>

      <div className="grid gap-3">
        {branches.map((branch) => {
          const readiness = branchReadiness(branch);
          return (
            <form key={branch.id} action={updateAction} className="dashboard-panel p-4">
              <input type="hidden" name="branchId" value={branch.id} />
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="dashboard-stat-icon h-10 w-10 shrink-0">
                    <Store size={17} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[var(--foreground)]">{branch.name}</p>
                    <p className="mt-0.5 text-xs font-semibold text-[var(--muted-foreground)]">
                      {branch.is_primary ? "Chi nhánh chính" : `Tạo lúc ${new Date(branch.created_at).toLocaleDateString("vi-VN")}`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {branch.is_primary ? <StatusPill label="Chính" tone="ready" /> : null}
                  <StatusPill label={readiness.label} tone={readiness.tone} />
                </div>
              </div>

              <BranchFormFields branch={branch} />

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--muted-foreground)]">
                  {readiness.tone === "ready" ? <CheckCircle2 size={14} className="text-[#0f6944]" /> : <TriangleAlert size={14} className="text-[#a65f00]" />}
                  <span>{branch.latitude !== null && branch.longitude !== null ? `${branch.latitude.toFixed(5)}, ${branch.longitude.toFixed(5)}` : "Chưa ghim tọa độ"}</span>
                </div>
                <Button disabled={updatePending}>
                  <Save size={15} />
                  Lưu chi nhánh
                </Button>
              </div>
            </form>
          );
        })}
      </div>

      {updateState?.error ? <p role="alert" className="rounded-xl bg-[#fff1ed] px-4 py-3 text-sm font-extrabold text-[#c23b2a]">{updateState.error}</p> : null}
      {updateState?.success ? <p aria-live="polite" className="rounded-xl bg-[#edf7ef] px-4 py-3 text-sm font-extrabold text-[#0f6944]">{updateState.success}</p> : null}
    </section>
  );
}
