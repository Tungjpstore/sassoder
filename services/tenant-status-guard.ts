import { AppError } from "@/lib/response";

export type TenantPlatformStatus = "active" | "suspended" | "deleted";

export type TenantStatusRow = {
  platform_status?: TenantPlatformStatus | null;
  deleted_at?: string | null;
};

export function isPublicTenantActive<T extends TenantStatusRow>(row: T | null | undefined): row is T {
  return Boolean(row && (row.platform_status ?? "active") === "active" && !row.deleted_at);
}

export function assertPublicTenantActive(row: TenantStatusRow | null | undefined) {
  if (!isPublicTenantActive(row)) {
    throw new AppError("Không tìm thấy quán", 404);
  }
}
