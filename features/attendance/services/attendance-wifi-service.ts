import "server-only";

import { AppError } from "@/lib/response";
import { exactIpCidr, ipMatchesCidr } from "@/lib/attendance-network";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type DashboardSession = {
  userId: string;
  restaurantId: string;
};

type StaffAttendanceWifiNetworkRegisterInput = {
  branchId: string;
  label?: string | "";
};

type ValidateStaffAttendanceWifiNetworkInput = {
  supabase: any;
  restaurantId: string;
  branchId: string;
  requestIp?: string | null;
  usedAt: Date;
  clock: "in" | "out";
  staffMemberId: string;
};

type StaffAttendanceWifiNetworkRow = {
  id: string;
  branch_id: string;
  label: string;
  public_ip_cidr: string;
  is_active: boolean;
};

function isMissingWifiNetworkSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "PGRST204" || error.code === "42P01" || /staff_attendance_wifi_networks|public_ip_cidr/i.test(message);
}

function normalizeWifiLabel(value: string | null | undefined) {
  const label = value?.trim();
  return label ? label.slice(0, 80) : "WiFi quán";
}

async function readActiveBranch(supabase: any, restaurantId: string, branchId: string) {
  const branchResult = await supabase
    .from("store_branches")
    .select("id,name,is_active")
    .eq("restaurant_id", restaurantId)
    .eq("id", branchId)
    .maybeSingle();

  if (branchResult.error) throw branchResult.error;
  const branch = branchResult.data as { id: string; name: string; is_active: boolean } | null;
  if (!branch || !branch.is_active) throw new AppError("Chi nhánh WiFi không khả dụng.", 404);
  return branch;
}

export async function registerStaffAttendanceWifiNetwork({
  session,
  input,
  requestIp
}: {
  session: DashboardSession;
  input: StaffAttendanceWifiNetworkRegisterInput;
  requestIp?: string | null;
}) {
  const publicIpCidr = exactIpCidr(requestIp);
  if (!publicIpCidr || !requestIp) {
    throw new AppError("Không xác định được IP công khai của mạng quán. Hãy thao tác từ WiFi tại chi nhánh.", 422);
  }

  const supabase = createAdminSupabaseClient() as any;
  const branch = await readActiveBranch(supabase, session.restaurantId, input.branchId);
  const label = normalizeWifiLabel(input.label);
  const now = new Date().toISOString();

  const existingResult = await supabase
    .from("staff_attendance_wifi_networks")
    .select("id")
    .eq("restaurant_id", session.restaurantId)
    .eq("branch_id", branch.id)
    .eq("public_ip_cidr", publicIpCidr)
    .maybeSingle();

  if (existingResult.error) {
    if (isMissingWifiNetworkSchema(existingResult.error)) {
      throw new AppError("Chưa có migration WiFi chấm công. Vui lòng cập nhật database trước khi lưu mạng.", 503);
    }
    throw existingResult.error;
  }

  const payload = {
    restaurant_id: session.restaurantId,
    branch_id: branch.id,
    label,
    public_ip_cidr: publicIpCidr,
    is_active: true,
    last_seen_ip: requestIp,
    last_seen_at: now,
    created_by: session.userId,
    metadata: {
      registeredFrom: "dashboard",
      exactIpOnly: true
    }
  };

  const mutation = existingResult.data?.id
    ? supabase
        .from("staff_attendance_wifi_networks")
        .update(payload)
        .eq("restaurant_id", session.restaurantId)
        .eq("id", existingResult.data.id)
    : supabase.from("staff_attendance_wifi_networks").insert(payload);

  const result = await mutation.select("id,branch_id,label,public_ip_cidr,last_seen_at,created_at").single();
  if (result.error) throw result.error;

  return {
    id: result.data.id as string,
    branchId: branch.id,
    branchName: branch.name,
    label: result.data.label as string,
    publicIpCidr: result.data.public_ip_cidr as string,
    lastSeenIp: requestIp,
    lastSeenAt: result.data.last_seen_at as string,
    createdAt: result.data.created_at as string
  };
}

export async function validateStaffAttendanceWifiNetwork({
  supabase,
  restaurantId,
  branchId,
  requestIp,
  usedAt,
  clock,
  staffMemberId
}: ValidateStaffAttendanceWifiNetworkInput) {
  if (!exactIpCidr(requestIp)) {
    throw new AppError("Không xác minh được WiFi quán từ IP hiện tại. Hãy kết nối WiFi chi nhánh hoặc dùng QR/GPS.", 403);
  }

  const result = await supabase
    .from("staff_attendance_wifi_networks")
    .select("id,branch_id,label,public_ip_cidr,is_active")
    .eq("restaurant_id", restaurantId)
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (result.error) {
    if (isMissingWifiNetworkSchema(result.error)) {
      throw new AppError("Chưa cấu hình WiFi chấm công cho hệ thống. Vui lòng cập nhật database và lưu WiFi chi nhánh.", 503);
    }
    throw result.error;
  }

  const networks = ((result.data ?? []) as StaffAttendanceWifiNetworkRow[]).filter((network) => network.is_active);
  const network = networks.find((item) => ipMatchesCidr(requestIp, item.public_ip_cidr));
  if (!network) {
    throw new AppError("Thiết bị chưa ở WiFi đã đăng ký cho chi nhánh này. Hãy kết nối đúng WiFi quán hoặc báo quản lý lưu mạng hiện tại.", 403);
  }

  const updateResult = await supabase
    .from("staff_attendance_wifi_networks")
    .update({
      last_seen_ip: requestIp,
      last_seen_at: usedAt.toISOString(),
      metadata: {
        lastClock: clock,
        lastStaffMemberId: staffMemberId
      }
    })
    .eq("restaurant_id", restaurantId)
    .eq("id", network.id)
    .select("id")
    .maybeSingle();

  if (updateResult.error && !isMissingWifiNetworkSchema(updateResult.error)) throw updateResult.error;

  return {
    id: network.id,
    branchId: network.branch_id,
    label: network.label,
    publicIpCidr: network.public_ip_cidr,
    requestIp: requestIp ?? null
  };
}
