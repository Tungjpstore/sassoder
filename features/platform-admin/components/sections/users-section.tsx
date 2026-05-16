import { updatePlatformUserStatusAction } from "@/app/admin/actions";
import {
  PrimaryButton,
  SectionCard,
  badgeTone,
  statusTone
} from "@/features/platform-admin/components/primitives";
import type { Snapshot } from "@/features/platform-admin/types";

export function Users({ snapshot }: { snapshot: Snapshot }) {
  return (
    <SectionCard title="Quản lý user nền tảng">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.1em] text-slate-500">
            <tr>
              <th className="px-3 py-3">User</th>
              <th className="px-3 py-3">Quán</th>
              <th className="px-3 py-3">Vai trò</th>
              <th className="px-3 py-3">Trạng thái</th>
              <th className="px-3 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {snapshot.users.map((user) => (
              <tr key={user.id} className="bg-white">
                <td className="px-3 py-3">
                  <p className="font-semibold text-slate-950">{user.email}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">{user.id.slice(0, 8)}</p>
                </td>
                <td className="px-3 py-3 text-slate-600">{user.restaurantName}</td>
                <td className="px-3 py-3 text-slate-600">{user.role}</td>
                <td className="px-3 py-3"><span className={badgeTone(statusTone(user.accountStatus))}>{user.accountStatus === "blocked" ? "Đã chặn" : "Đang hoạt động"}</span></td>
                <td className="px-3 py-3">
                  <form action={updatePlatformUserStatusAction} className="ml-auto flex max-w-[360px] justify-end gap-2">
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="status" value={user.accountStatus === "blocked" ? "active" : "blocked"} />
                    <input name="reason" placeholder="Lý do" className="h-9 w-40 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400" />
                    <PrimaryButton tone={user.accountStatus === "blocked" ? "dark" : "danger"}>{user.accountStatus === "blocked" ? "Mở" : "Chặn"}</PrimaryButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
