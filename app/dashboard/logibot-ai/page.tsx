import { ProductionDashboardShell as AdminShell } from "@/components/dashboard-v2/production-shell";
import { LogibotAiWorkspace, type LogibotWorkspaceData } from "@/components/dashboard/logibot-ai-workspace";
import { buildCopilotThreadId } from "@/lib/ai/copilot-thread";
import { requireDashboardAdminAccess } from "@/lib/dashboard-access";
import { listActiveStoreBranches } from "@/services/branch-service";

export const dynamic = "force-dynamic";

function ownerNameFromEmail(email: string) {
  const name = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  return name ? name.replace(/\b\w/g, (char) => char.toUpperCase()) : "Chủ quán";
}

export default async function LogibotAiPage() {
  const { session, entitlement } = await requireDashboardAdminAccess("ai_owner_assistant");
  const branchLoad = await loadLogibotBranches(session.restaurantId);
  const branches = branchLoad.branches;
  const primaryBranch = branches.find((branch) => branch.is_primary) ?? branches[0] ?? null;

  const workspace: LogibotWorkspaceData = {
    restaurantId: session.restaurantId,
    restaurantName: session.restaurant.name,
    ownerName: ownerNameFromEmail(session.email),
    branchName: branchLoad.error ? "Không tải được chi nhánh" : primaryBranch?.name ?? "Chi nhánh chính",
    branchStatus: branchLoad.error ? "Lỗi dữ liệu chi nhánh" : primaryBranch?.temporarily_closed ? "Tạm đóng" : primaryBranch ? "Đang mở" : "Chưa có branch",
    branchDataError: branchLoad.error,
    threadId: buildCopilotThreadId("logivn", "dashboard", session.restaurantId)
  };

  return (
    <AdminShell
      title="LogiBot AI"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="AI vận hành quán từ dữ liệu thật."
      hideHeading
      showLiveActionCenter={false}
      showQuickActionsFab={false}
      showDashboardCopilot={false}
    >
      <LogibotAiWorkspace workspace={workspace} />
    </AdminShell>
  );
}

async function loadLogibotBranches(restaurantId: string) {
  try {
    return { branches: await listActiveStoreBranches(restaurantId), error: null };
  } catch (error) {
    return { branches: [], error: error instanceof Error ? error.message : "Không tải được dữ liệu chi nhánh" };
  }
}
