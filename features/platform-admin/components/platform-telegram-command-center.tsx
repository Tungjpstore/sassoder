import { LockKeyhole } from "lucide-react";
import { PlatformTelegramConnectCard } from "@/features/platform-admin/components/platform-telegram-connect-card";
import { badgeTone } from "@/features/platform-admin/components/primitives";
import { hasPlatformAdminPermission, type PlatformAdminSession } from "@/lib/platform-admin-auth";
import { getPlatformTelegramOpsState } from "@/services/platform-telegram-connection-service";

export async function PlatformTelegramCommandCenter({ session }: { session: PlatformAdminSession }) {
  if (!hasPlatformAdminPermission(session, "security.read")) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500">
          <LockKeyhole size={18} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-950">DevOps Telegram bị giới hạn</p>
            <span className={badgeTone("warning")}>security.read required</span>
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-600">Tài khoản hiện tại không có quyền tạo link hoặc thu hồi kết nối DevOps bot.</p>
        </div>
      </div>
    );
  }

  const state = await getPlatformTelegramOpsState();
  return <PlatformTelegramConnectCard initialState={state} />;
}
