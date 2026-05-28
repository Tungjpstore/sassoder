import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { AppError } from "@/lib/response";

function getEncryptionSecretMaterial() {
  return (
    process.env.PLATFORM_AI_SECRET_KEY?.trim() ||
    process.env.PLATFORM_ADMIN_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ""
  );
}

function getEncryptionKey() {
  const material = getEncryptionSecretMaterial();
  if (!material) {
    throw new AppError("Cần cấu hình PLATFORM_AI_SECRET_KEY để mã hoá khoá API AI trong admin.logivn.com.", 500);
  }
  return createHash("sha256").update(`logivn-platform-ai:${material}`).digest();
}

export function fingerprintPlatformAiSecret(secret: string) {
  return createHash("sha256").update(secret.trim()).digest("hex").slice(0, 20);
}

export function encryptPlatformAiSecret(secret: string) {
  const apiKey = secret.trim();
  if (apiKey.length < 8) throw new AppError("API key AI quá ngắn hoặc chưa hợp lệ.", 400);
  if (apiKey.length > 3000) throw new AppError("API key AI vượt quá giới hạn lưu trữ an toàn.", 400);

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    fingerprint: fingerprintPlatformAiSecret(apiKey),
    lastFour: apiKey.slice(-4)
  };
}

export function decryptPlatformAiSecret(input: { ciphertext: string; iv: string; tag: string }) {
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(input.iv, "base64"));
  decipher.setAuthTag(Buffer.from(input.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(input.ciphertext, "base64")), decipher.final()]).toString("utf8");
}
