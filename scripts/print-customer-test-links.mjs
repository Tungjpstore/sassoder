// Dev helper: in ra link test luồng khách hàng (slug + bàn + token).
// Chạy: node scripts/print-customer-test-links.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const base = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: restaurants, error } = await supabase
  .from("restaurants")
  .select("id, slug, name, online_ordering_enabled, pickup_enabled, delivery_enabled, reservations_enabled, allow_legacy_qr")
  .order("created_at", { ascending: true })
  .limit(10);

if (error) {
  console.error("restaurants error:", error.message);
  process.exit(1);
}
if (!restaurants?.length) {
  console.log("Không có nhà hàng nào trong DB.");
  process.exit(0);
}

for (const r of restaurants) {
  console.log("\n=== " + r.name + "  (slug: " + r.slug + ") ===");
  console.log("flags:", {
    online: r.online_ordering_enabled,
    pickup: r.pickup_enabled,
    delivery: r.delivery_enabled,
    reservations: r.reservations_enabled,
    allow_legacy_qr: r.allow_legacy_qr
  });

  const { data: tables } = await supabase
    .from("tables")
    .select("id, name, qr_token")
    .eq("restaurant_id", r.id)
    .limit(3);

  if (r.online_ordering_enabled && (r.pickup_enabled || r.delivery_enabled)) {
    console.log("Đặt món online:", base + "/r/" + r.slug);
  }
  if (r.reservations_enabled) {
    console.log("Đặt bàn:       ", base + "/r/" + r.slug + "/reserve");
  }
  for (const t of tables ?? []) {
    const token = t.qr_token ? "?t=" + t.qr_token : "";
    console.log("Bàn " + (t.name ?? t.id) + ": " + base + "/r/" + r.slug + "/table/" + t.id + token);
  }
}
console.log("");
