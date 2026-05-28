import { updateSaasPlanAction } from "@/features/platform-admin/actions";
import {
  Field,
  PrimaryButton,
  SectionCard,
  TextArea
} from "@/features/platform-admin/components/primitives";
import type { Plan, Snapshot } from "@/features/platform-admin/types";
import { formatVnd } from "@/lib/money";

export function Plans({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {snapshot.plans.map((plan: Plan) => (
        <PlanForm key={plan.id} plan={plan} />
      ))}
    </div>
  );
}

function PlanForm({ plan }: { plan: Plan }) {
  const schemaPending = plan.id.startsWith("schema-pending");

  return (
    <SectionCard title={`${plan.name} · ${formatVnd(plan.monthly_price)}/tháng`}>
      <form action={updateSaasPlanAction} className="grid gap-4">
        <input type="hidden" name="planId" value={plan.id} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Tên gói" name="name" defaultValue={plan.name} />
          <Field label="Giá tháng" name="monthlyPrice" type="number" defaultValue={plan.monthly_price} />
          <Field label="Số ngày dùng thử" name="trialDays" type="number" defaultValue={plan.trial_days} />
          <label className="grid gap-2 text-sm font-semibold text-slate-200">
            Trạng thái
            <select name="isActive" defaultValue={plan.is_active ? "true" : "false"} className="h-10 rounded-lg border border-white/10 bg-[#0A1020] px-3 text-sm font-semibold text-white outline-none focus:border-sky-400/60">
              <option value="true">Đang bán</option>
              <option value="false">Ẩn gói</option>
            </select>
          </label>
        </div>
        <TextArea label="Mô tả" name="description" defaultValue={plan.description ?? ""} rows={2} />
        <TextArea label="Tính năng, mỗi dòng một mục" name="features" defaultValue={plan.features.join("\n")} rows={5} />
        {schemaPending ? (
          <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-sm font-semibold text-amber-100">
            Cần chạy migration billing trước khi chỉnh gói này.
          </div>
        ) : (
          <PrimaryButton tone="dark">Lưu gói dịch vụ</PrimaryButton>
        )}
      </form>
    </SectionCard>
  );
}
