import { AppError } from "@/lib/response";

export function getSupabaseBrowserEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new AppError("Thiếu biến môi trường Supabase", 500);
  }

  return { url, anonKey };
}

export function getSupabaseServiceEnv() {
  const { url } = getSupabaseBrowserEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new AppError("Thiếu SUPABASE_SERVICE_ROLE_KEY", 500);
  }

  return { url, serviceRoleKey };
}
