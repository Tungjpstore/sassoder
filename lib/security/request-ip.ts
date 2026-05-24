import { headers } from "next/headers";

export async function getRequestIpKey() {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("cf-connecting-ip") ||
    requestHeaders.get("x-real-ip") ||
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}
