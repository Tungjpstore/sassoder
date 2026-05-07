import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const menuImageBucket = "menu-images";
const maxImageSize = 5 * 1024 * 1024;
const allowedImageTypes = new Map([
  ["image/jpeg", { contentType: "image/jpeg", extension: "jpg" }],
  ["image/jpg", { contentType: "image/jpeg", extension: "jpg" }],
  ["image/png", { contentType: "image/png", extension: "png" }],
  ["image/webp", { contentType: "image/webp", extension: "webp" }]
]);

const allowedImageExtensions = new Map([
  ["jpg", { contentType: "image/jpeg", extension: "jpg" }],
  ["jpeg", { contentType: "image/jpeg", extension: "jpg" }],
  ["png", { contentType: "image/png", extension: "png" }],
  ["webp", { contentType: "image/webp", extension: "webp" }]
]);

function isFileLike(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function resolveImageFileType({
  fileName,
  contentType
}: {
  fileName: string;
  contentType?: string | null;
}) {
  const byMime = contentType ? allowedImageTypes.get(contentType.toLowerCase()) : undefined;
  if (byMime) return byMime;

  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension ? allowedImageExtensions.get(extension) : undefined;
}

function assertMenuImage({
  fileName,
  contentType,
  size
}: {
  fileName: string;
  contentType?: string | null;
  size: number;
}) {
  const imageType = resolveImageFileType({ fileName, contentType });
  if (!imageType) {
    throw new AppError("Ảnh món chỉ hỗ trợ JPG, PNG hoặc WebP.", 400);
  }

  if (size > maxImageSize) {
    throw new AppError("Ảnh món không được vượt quá 5MB.", 400);
  }

  if (size <= 0) {
    throw new AppError("Ảnh món không hợp lệ. Vui lòng chọn ảnh khác.", 400);
  }

  return imageType;
}

export async function createMenuImageSignedUpload({
  restaurantId,
  fileName,
  contentType,
  size
}: {
  restaurantId: string;
  fileName: string;
  contentType?: string | null;
  size: number;
}) {
  const imageType = assertMenuImage({ fileName, contentType, size });
  const supabase = createAdminSupabaseClient();
  const path = `${restaurantId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${imageType.extension}`;
  const { data, error } = await supabase.storage.from(menuImageBucket).createSignedUploadUrl(path, { upsert: false });

  if (error || !data) {
    throw new AppError(error?.message || "Không tạo được quyền tải ảnh món.", 400);
  }

  const { data: publicUrl } = supabase.storage.from(menuImageBucket).getPublicUrl(path);

  return {
    path,
    token: data.token,
    publicUrl: publicUrl.publicUrl,
    contentType: imageType.contentType
  };
}

export async function uploadMenuImageFile({
  restaurantId,
  file
}: {
  restaurantId: string;
  file: FormDataEntryValue | null;
}) {
  if (!isFileLike(file) || file.size === 0) return undefined;

  const imageType = assertMenuImage({ fileName: file.name, contentType: file.type, size: file.size });

  const supabase = createAdminSupabaseClient();
  const path = `${restaurantId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${imageType.extension}`;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(await file.arrayBuffer());
  } catch {
    throw new AppError("Không đọc được ảnh món. Vui lòng chọn ảnh khác và thử lại.", 400);
  }

  const { error } = await supabase.storage.from(menuImageBucket).upload(path, bytes, {
    contentType: imageType.contentType,
    cacheControl: "31536000",
    upsert: false
  });

  if (error) {
    throw new AppError(error.message || "Không tải được ảnh món.", 400);
  }

  const { data } = supabase.storage.from(menuImageBucket).getPublicUrl(path);
  return data.publicUrl;
}
