import "server-only";

import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const staffAvatarBucket = "staff-avatars";
const maxAvatarSize = 3 * 1024 * 1024;

const allowedAvatarTypes = new Map([
  ["image/jpeg", { contentType: "image/jpeg", extension: "jpg" }],
  ["image/jpg", { contentType: "image/jpeg", extension: "jpg" }],
  ["image/png", { contentType: "image/png", extension: "png" }],
  ["image/webp", { contentType: "image/webp", extension: "webp" }]
]);

function isFileLike(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function resolveAvatarFileType(file: File) {
  const byMime = allowedAvatarTypes.get(file.type.toLowerCase());
  if (byMime) return byMime;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "jpeg") return allowedAvatarTypes.get("image/jpeg");
  if (extension === "jpg") return allowedAvatarTypes.get("image/jpeg");
  if (extension === "png") return allowedAvatarTypes.get("image/png");
  if (extension === "webp") return allowedAvatarTypes.get("image/webp");
  return undefined;
}

function assertAvatarFile(file: FormDataEntryValue | null) {
  if (!isFileLike(file) || file.size === 0) {
    throw new AppError("Vui lòng chọn ảnh đại diện hợp lệ.", 400);
  }

  const imageType = resolveAvatarFileType(file);
  if (!imageType) {
    throw new AppError("Ảnh đại diện chỉ hỗ trợ JPG, PNG hoặc WebP.", 400);
  }

  if (file.size > maxAvatarSize) {
    throw new AppError("Ảnh đại diện không được vượt quá 3MB.", 400);
  }

  return { file, imageType };
}

function assertAvatarMagicBytes(bytes: Buffer, extension: string) {
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const isWebp = bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";

  if ((extension === "jpg" && isJpeg) || (extension === "png" && isPng) || (extension === "webp" && isWebp)) return;
  throw new AppError("File ảnh đại diện không khớp định dạng JPG, PNG hoặc WebP.", 400);
}

export async function uploadStaffAvatarFile({
  restaurantId,
  staffMemberId,
  file
}: {
  restaurantId: string;
  staffMemberId: string;
  file: FormDataEntryValue | null;
}) {
  const { file: avatarFile, imageType } = assertAvatarFile(file);
  let bytes: Buffer;
  try {
    bytes = Buffer.from(await avatarFile.arrayBuffer());
  } catch {
    throw new AppError("Không đọc được ảnh đại diện. Vui lòng chọn ảnh khác.", 400);
  }
  assertAvatarMagicBytes(bytes, imageType.extension);

  const supabase = createAdminSupabaseClient();
  const path = `${restaurantId}/${staffMemberId}/${crypto.randomUUID()}.${imageType.extension}`;
  const { error } = await supabase.storage.from(staffAvatarBucket).upload(path, bytes, {
    contentType: imageType.contentType,
    cacheControl: "31536000",
    upsert: false
  });

  if (error) {
    throw new AppError(error.message || "Không tải được ảnh đại diện.", 400);
  }

  const { data } = supabase.storage.from(staffAvatarBucket).getPublicUrl(path);
  return data.publicUrl;
}
