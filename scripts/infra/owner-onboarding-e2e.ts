import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type CheckResult = {
  name: string;
  ok: boolean;
  ms: number;
  error?: string;
};

type OwnerFixture = {
  email: string;
  password: string;
  userId: string;
  restaurantId: string;
  restaurantSlug: string;
};

const checks: CheckResult[] = [];
const createdUserIds: string[] = [];
const createdRestaurantIds: string[] = [];
const createdEmails: string[] = [];

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (process.env[key] !== undefined) continue;

    process.env[key] = rawValue.replace(/^(["'])(.*)\1$/, "$2");
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(name: string, fn: () => Promise<void>) {
  const startedAt = performance.now();
  try {
    await fn();
    checks.push({ name, ok: true, ms: Math.round(performance.now() - startedAt) });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      ms: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

function supabaseAdmin() {
  return createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function supabaseAnon() {
  return createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function createOwner(admin: SupabaseClient, runId: string, suffix: "a" | "b") {
  const email = `owner-onboarding-${runId}-${suffix}@logivn.test`;
  const password = `LogiVN-${randomUUID()}-Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      source: "owner-onboarding-e2e",
      runId
    }
  });

  if (error || !data.user) throw new Error(error?.message ?? "Owner auth user was not created");

  createdUserIds.push(data.user.id);
  createdEmails.push(email);
  return { email, password, userId: data.user.id };
}

async function createRestaurant(admin: SupabaseClient, owner: Awaited<ReturnType<typeof createOwner>>, runId: string, suffix: "a" | "b") {
  const slug = `owner-e2e-${runId}-${suffix}`;
  const { data, error } = await admin.rpc("create_restaurant_onboarding_core", {
    p_user_id: owner.userId,
    p_owner_email: owner.email,
    p_name: `Owner E2E ${runId.toUpperCase()} ${suffix.toUpperCase()}`,
    p_slug: slug,
    p_business_type: "CAFE",
    p_table_count: 3,
    p_address: `LogiVN E2E ${runId}`,
    p_store_lat: null,
    p_store_lng: null,
    p_hotline: "+84901234567",
    p_description: "Owner onboarding E2E temporary tenant",
    p_logo_url: null,
    p_receipt_footer: "Temporary E2E tenant",
    p_bank_code: "VCB",
    p_bank_account: "1234567890",
    p_bank_account_name: "LOGIVN E2E",
    p_primary_branch: null,
    p_categories: [{ name: "Cafe" }],
    p_menu_items: [{ name: "E2E Bac xiu", price: 39000, categoryName: "Cafe" }],
    p_plan_code: "pro"
  });

  if (error || !data) throw new Error(error?.message ?? "Onboarding RPC did not return a restaurant");

  const restaurant = Array.isArray(data) ? data[0] : data;
  assert(typeof restaurant.id === "string", "Onboarding RPC response missed restaurant id");
  createdRestaurantIds.push(restaurant.id);

  return {
    ...owner,
    restaurantId: restaurant.id,
    restaurantSlug: slug
  } satisfies OwnerFixture;
}

async function signInOwner(owner: OwnerFixture) {
  const client = supabaseAnon();
  const { data, error } = await client.auth.signInWithPassword({
    email: owner.email,
    password: owner.password
  });

  if (error || !data.session) throw new Error(error?.message ?? "Owner sign-in did not create a session");
  return client;
}

async function countRows(client: SupabaseClient, table: string, filters: Record<string, string>) {
  let query = client.from(table).select("id", { count: "exact", head: true });
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);

  const { count, error } = await query;
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}

async function verifyTenantCreated(admin: SupabaseClient, owner: OwnerFixture) {
  const { data: restaurant, error: restaurantError } = await admin
    .from("restaurants")
    .select("id,slug,staff_code,contact_email")
    .eq("id", owner.restaurantId)
    .single();

  if (restaurantError) throw new Error(`Restaurant verification failed: ${restaurantError.message}`);
  assert(restaurant.slug === owner.restaurantSlug, "Restaurant slug mismatch after onboarding");
  assert(restaurant.contact_email === owner.email, "Restaurant contact email mismatch after onboarding");
  assert(/^[A-Z0-9]{4,8}$/.test(restaurant.staff_code), "Restaurant staff_code was not generated");

  const { data: ownerUser, error: ownerUserError } = await admin
    .from("users")
    .select("id,email,role,restaurant_id")
    .eq("id", owner.userId)
    .single();

  if (ownerUserError) throw new Error(`Owner profile verification failed: ${ownerUserError.message}`);
  assert(ownerUser.email === owner.email, "Owner user email mismatch");
  assert(ownerUser.role === "ADMIN", "Owner user was not created as ADMIN");
  assert(ownerUser.restaurant_id === owner.restaurantId, "Owner user restaurant_id mismatch");

  assert((await countRows(admin, "tables", { restaurant_id: owner.restaurantId })) === 3, "Expected 3 seeded tables");
  assert((await countRows(admin, "menu_items", { restaurant_id: owner.restaurantId })) >= 1, "Expected seeded menu items");
  assert((await countRows(admin, "restaurant_subscriptions", { restaurant_id: owner.restaurantId })) === 1, "Expected subscription row");
  assert((await countRows(admin, "trial_claims", { restaurant_id: owner.restaurantId })) === 1, "Expected trial claim row");
}

async function verifyTenantIsolation(admin: SupabaseClient, ownerA: OwnerFixture, ownerB: OwnerFixture) {
  const ownerAClient = await signInOwner(ownerA);

  const ownRestaurant = await ownerAClient
    .from("restaurants")
    .select("id,slug")
    .eq("id", ownerA.restaurantId)
    .maybeSingle();
  if (ownRestaurant.error) throw new Error(`Owner own restaurant read failed: ${ownRestaurant.error.message}`);
  assert(ownRestaurant.data?.id === ownerA.restaurantId, "Owner could not read its own restaurant");

  const crossRestaurant = await ownerAClient
    .from("restaurants")
    .select("id,slug")
    .eq("id", ownerB.restaurantId);
  if (crossRestaurant.error) throw new Error(`Cross restaurant read errored: ${crossRestaurant.error.message}`);
  assert(crossRestaurant.data.length === 0, "Owner A could read Owner B restaurant through RLS");

  const crossUsers = await ownerAClient.from("users").select("id,restaurant_id,email").eq("restaurant_id", ownerB.restaurantId);
  if (crossUsers.error) throw new Error(`Cross users read errored: ${crossUsers.error.message}`);
  assert(crossUsers.data.length === 0, "Owner A could read Owner B users through RLS");

  const crossUpdate = await ownerAClient
    .from("restaurants")
    .update({ name: "RLS SHOULD BLOCK" })
    .eq("id", ownerB.restaurantId)
    .select("id");
  if (crossUpdate.error) throw new Error(`Cross restaurant update errored: ${crossUpdate.error.message}`);
  assert(crossUpdate.data.length === 0, "Owner A could update Owner B restaurant through RLS");

  const { data: untouched, error: untouchedError } = await admin
    .from("restaurants")
    .select("name")
    .eq("id", ownerB.restaurantId)
    .single();
  if (untouchedError) throw new Error(`Post-update verification failed: ${untouchedError.message}`);
  assert(untouched.name !== "RLS SHOULD BLOCK", "Cross-tenant update changed Owner B restaurant");

  const memberView = await ownerAClient.from("restaurant_members").select("id,restaurant_id").eq("restaurant_id", ownerB.restaurantId);
  if (!memberView.error) {
    assert(memberView.data.length === 0, "restaurant_members view leaked cross-tenant members");
  } else if (!/permission denied|does not exist|Could not find/i.test(memberView.error.message)) {
    throw new Error(`restaurant_members view check failed unexpectedly: ${memberView.error.message}`);
  }
}

async function cleanup(admin: SupabaseClient) {
  for (const restaurantId of createdRestaurantIds.reverse()) {
    const { error } = await admin.from("restaurants").delete().eq("id", restaurantId);
    if (error) console.error(`[owner-onboarding-e2e] restaurant cleanup failed for ${restaurantId}: ${error.message}`);
  }

  for (const email of createdEmails) {
    await admin.from("registration_intents").delete().eq("email", email);
    await admin.from("trial_claims").delete().eq("owner_email", email);
  }

  for (const userId of createdUserIds.reverse()) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error(`[owner-onboarding-e2e] auth cleanup failed for ${userId}: ${error.message}`);
  }
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const admin = supabaseAdmin();
  const runId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`.toLowerCase();

  try {
    let ownerA!: OwnerFixture;
    let ownerB!: OwnerFixture;

    await check("create two owner auth users", async () => {
      const [authOwnerA, authOwnerB] = await Promise.all([createOwner(admin, runId, "a"), createOwner(admin, runId, "b")]);
      ownerA = await createRestaurant(admin, authOwnerA, runId, "a");
      ownerB = await createRestaurant(admin, authOwnerB, runId, "b");
    });

    await check("owner onboarding creates tenant bundle", async () => {
      await verifyTenantCreated(admin, ownerA);
      await verifyTenantCreated(admin, ownerB);
    });

    await check("owner session cannot cross tenant boundary", async () => {
      await verifyTenantIsolation(admin, ownerA, ownerB);
    });
  } finally {
    await check("cleanup temporary E2E tenants", async () => cleanup(admin));
  }

  console.log("\nLogiVN owner onboarding E2E");
  console.table(checks);

  const failed = checks.filter((item) => !item.ok);
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
