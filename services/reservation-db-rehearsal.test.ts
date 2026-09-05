import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

type CommandResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

const dbUrl = process.env.RESERVATION_DB_URL?.trim() || process.env.DATABASE_URL?.trim() || "";
const rehearsalRequired = process.env.RESERVATION_DB_REHEARSAL_REQUIRED === "true";

const rehearsalSql = String.raw`
begin;
set local search_path = public, extensions;

do $$
declare
  restaurant_a uuid;
  restaurant_b uuid;
  table_a uuid;
  table_b uuid;
  reservation_a uuid;
  reservation_b uuid;
  overlap_blocked boolean := false;
  released_slot_reused boolean := false;
  wrong_table_blocked boolean := false;
  wrong_reservation_blocked boolean := false;
  wrong_bill_table_blocked boolean := false;
  duplicate_reminder_blocked boolean := false;
  atomic_reservation_id uuid;
  atomic_order_id uuid;
  menu_category_id uuid;
  menu_item_id uuid;
  missing_publication_tables text[];
  slug_suffix text := replace(gen_random_uuid()::text, '-', '');
begin
  insert into public.restaurants (name, slug, reservations_enabled, opening_time, closing_time)
  values ('Reservation DB rehearsal A', 'reservation-db-rehearsal-a-' || slug_suffix, true, '08:00', '23:00')
  returning id into restaurant_a;

  insert into public.restaurants (name, slug, reservations_enabled, opening_time, closing_time)
  values ('Reservation DB rehearsal B', 'reservation-db-rehearsal-b-' || slug_suffix, true, '08:00', '23:00')
  returning id into restaurant_b;

  insert into public.tables (restaurant_id, name, capacity, is_bookable)
  values (restaurant_a, 'A1-' || slug_suffix, 4, true)
  returning id into table_a;

  insert into public.tables (restaurant_id, name, capacity, is_bookable)
  values (restaurant_b, 'B1-' || slug_suffix, 4, true)
  returning id into table_b;

  insert into public.reservations (
    restaurant_id,
    status,
    customer_name,
    customer_phone,
    party_size,
    starts_at,
    ends_at,
    access_token_hash
  )
  values (
    restaurant_a,
    'confirmed',
    'Reservation Rehearsal A',
    '+84900000001',
    2,
    '2026-06-01T12:00:00Z',
    '2026-06-01T13:30:00Z',
    'rehearsal-token-a'
  )
  returning id into reservation_a;

  insert into public.reservations (
    restaurant_id,
    status,
    customer_name,
    customer_phone,
    party_size,
    starts_at,
    ends_at,
    access_token_hash
  )
  values (
    restaurant_b,
    'confirmed',
    'Reservation Rehearsal B',
    '+84900000002',
    2,
    '2026-06-01T12:00:00Z',
    '2026-06-01T13:30:00Z',
    'rehearsal-token-b'
  )
  returning id into reservation_b;

  insert into public.reservation_table_locks (
    reservation_id,
    restaurant_id,
    table_id,
    starts_at,
    ends_at,
    status
  )
  values (
    reservation_a,
    restaurant_a,
    table_a,
    '2026-06-01T12:00:00Z',
    '2026-06-01T13:30:00Z',
    'active'
  );

  begin
    insert into public.reservation_table_locks (
      reservation_id,
      restaurant_id,
      table_id,
      starts_at,
      ends_at,
      status
    )
    values (
      reservation_a,
      restaurant_a,
      table_a,
      '2026-06-01T12:30:00Z',
      '2026-06-01T13:00:00Z',
      'active'
    );
  exception
    when exclusion_violation then
      overlap_blocked := true;
  end;

  if not overlap_blocked then
    raise exception 'overlapping active reservation lock was not blocked';
  end if;

  begin
    insert into public.reservation_table_locks (
      reservation_id,
      restaurant_id,
      table_id,
      starts_at,
      ends_at,
      status
    )
    values (
      reservation_a,
      restaurant_a,
      table_b,
      '2026-06-01T14:00:00Z',
      '2026-06-01T15:30:00Z',
      'active'
    );
  exception
    when foreign_key_violation then
      wrong_table_blocked := true;
  end;

  if not wrong_table_blocked then
    raise exception 'cross-tenant table lock assignment was not blocked';
  end if;

  begin
    insert into public.reservation_table_locks (
      reservation_id,
      restaurant_id,
      table_id,
      starts_at,
      ends_at,
      status
    )
    values (
      reservation_b,
      restaurant_a,
      table_a,
      '2026-06-01T14:00:00Z',
      '2026-06-01T15:30:00Z',
      'active'
    );
  exception
    when foreign_key_violation then
      wrong_reservation_blocked := true;
  end;

  if not wrong_reservation_blocked then
    raise exception 'cross-tenant reservation lock assignment was not blocked';
  end if;

  begin
    insert into public.table_bills (restaurant_id, table_id, reservation_id, status)
    values (restaurant_a, table_b, reservation_a, 'open');
  exception
    when foreign_key_violation then
      wrong_bill_table_blocked := true;
  end;

  if not wrong_bill_table_blocked then
    raise exception 'cross-tenant table bill assignment was not blocked';
  end if;

  insert into public.reservation_notification_outbox (
    restaurant_id,
    reservation_id,
    audience,
    channel,
    status,
    title,
    body,
    dedupe_key,
    payload
  )
  values (
    restaurant_a,
    reservation_a,
    'customer',
    'in_app',
    'queued',
    'Reminder',
    'Reminder body',
    'reservation:' || reservation_a || ':reminder:customer_arrival_2h',
    '{"kind":"customer_arrival_2h"}'::jsonb
  );

  begin
    insert into public.reservation_notification_outbox (
      restaurant_id,
      reservation_id,
      audience,
      channel,
      status,
      title,
      body,
      dedupe_key,
      payload
    )
    values (
      restaurant_a,
      reservation_a,
      'customer',
      'in_app',
      'queued',
      'Duplicate reminder',
      'Duplicate reminder body',
      'reservation:' || reservation_a || ':reminder:customer_arrival_2h',
      '{"kind":"customer_arrival_2h"}'::jsonb
    );
  exception
    when unique_violation then
      duplicate_reminder_blocked := true;
  end;

  if not duplicate_reminder_blocked then
    raise exception 'duplicate reservation reminder dedupe key was not blocked';
  end if;

  update public.reservation_table_locks
  set status = 'released'
  where reservation_id = reservation_a
    and restaurant_id = restaurant_a
    and table_id = table_a;

  insert into public.reservation_table_locks (
    reservation_id,
    restaurant_id,
    table_id,
    starts_at,
    ends_at,
    status
  )
  values (
    reservation_a,
    restaurant_a,
    table_a,
    '2026-06-01T12:30:00Z',
    '2026-06-01T13:00:00Z',
    'active'
  );
  released_slot_reused := true;

  if not released_slot_reused then
    raise exception 'released reservation lock slot was not reusable';
  end if;

  if to_regprocedure('public.create_reservation_with_lock(jsonb,uuid,timestamptz,jsonb)') is null then
    raise exception 'Phase 1 reservation atomic RPC is missing';
  end if;

  select id into atomic_reservation_id
  from public.create_reservation_with_lock(
    jsonb_build_object(
      'restaurant_id', restaurant_a,
      'status', 'confirmed',
      'customer_name', 'Atomic Reservation',
      'customer_phone', '+84900000003',
      'party_size', 2,
      'starts_at', '2026-06-01T16:00:00Z',
      'ends_at', '2026-06-01T17:30:00Z',
      'access_token_hash', 'atomic-reservation-token'
    ),
    table_a,
    '2026-06-01T17:45:00Z'::timestamptz,
    null
  );

  if atomic_reservation_id is null or not exists (
    select 1 from public.reservation_table_locks
    where reservation_id = atomic_reservation_id and status = 'active'
  ) then
    raise exception 'atomic reservation RPC did not persist reservation and lock together';
  end if;

  if to_regprocedure('public.create_order_with_items_atomic(jsonb,jsonb,jsonb)') is null then
    raise exception 'Phase 1 order atomic RPC is missing';
  end if;

  insert into public.menu_categories (restaurant_id, name)
  values (restaurant_a, 'Atomic rehearsal category ' || slug_suffix)
  returning id into menu_category_id;

  insert into public.menu_items (restaurant_id, category_id, name, price)
  values (restaurant_a, menu_category_id, 'Atomic rehearsal item ' || slug_suffix, 100)
  returning id into menu_item_id;

  select id into atomic_order_id
  from public.create_order_with_items_atomic(
    jsonb_build_object(
      'restaurant_id', restaurant_a,
      'table_id', table_a,
      'status', 'pending',
      'fulfillment_type', 'DINE_IN',
      'subtotal', 100,
      'discount_amount', 0,
      'total', 100,
      'payment_status', 'unpaid',
      'idempotency_key', 'atomic-order-' || slug_suffix
    ),
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', menu_item_id,
      'quantity', 1,
      'price', 100,
      'base_price', 100,
      'modifier_total', 0,
      'modifier_snapshot', '[]'::jsonb
    )),
    null
  );

  if atomic_order_id is null or not exists (
    select 1 from public.order_items where order_id = atomic_order_id
  ) then
    raise exception 'atomic order RPC did not persist order and item together';
  end if;

  if has_table_privilege('authenticated', 'public.stock_balances', 'INSERT')
     or has_table_privilege('authenticated', 'public.stock_balances', 'UPDATE')
     or has_table_privilege('authenticated', 'public.stock_balances', 'DELETE') then
    raise exception 'authenticated inventory DML grants remain enabled';
  end if;

  select array_agg(required.tablename order by required.tablename)
  into missing_publication_tables
  from (
    values
      ('reservations'),
      ('reservation_table_locks'),
      ('tables'),
      ('table_bills')
  ) as required(tablename)
  left join pg_publication_tables published
    on published.pubname = 'supabase_realtime'
   and published.schemaname = 'public'
   and published.tablename = required.tablename
  where published.tablename is null;

  if missing_publication_tables is not null then
    raise exception 'missing reservation realtime publication tables: %', missing_publication_tables;
  end if;
end $$;

select 'reservation_db_rehearsal_ok';
rollback;
`;

test("reservation database rehearsal guards availability, tenant assignment and realtime inputs", { timeout: 30_000 }, async (t) => {
  if (!dbUrl) {
    if (rehearsalRequired) {
      assert.fail("Set RESERVATION_DB_URL or DATABASE_URL to run the reservation DB rehearsal.");
    }
    t.skip("Set RESERVATION_DB_URL or DATABASE_URL to run the reservation DB rehearsal.");
    return;
  }

  const hasPsql = await commandExists("psql");
  if (!hasPsql) {
    if (rehearsalRequired) {
      assert.fail("Install psql to run the reservation DB rehearsal.");
    }
    t.skip("psql is not installed; skipping reservation DB rehearsal.");
    return;
  }

  const result = await runPsql(dbUrl, rehearsalSql);
  assert.equal(result.code, 0, redactDbUrl(result.stderr || result.stdout));
  assert.match(result.stdout, /reservation_db_rehearsal_ok/);
});

async function commandExists(command: string) {
  const result = await runCommand(command, ["--version"]);
  return result.code === 0;
}

async function runPsql(connectionString: string, sql: string) {
  return runCommand("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"], sql, buildPsqlEnv(connectionString));
}

function buildPsqlEnv(connectionString: string): NodeJS.ProcessEnv {
  const parsed = new URL(connectionString);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGCONNECT_TIMEOUT: process.env.PGCONNECT_TIMEOUT ?? "10",
    PGDATABASE: database,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username)
  };

  if (parsed.password) {
    env.PGPASSWORD = decodeURIComponent(parsed.password);
  }

  const sslMode = parsed.searchParams.get("sslmode");
  if (sslMode) {
    env.PGSSLMODE = sslMode;
  }

  return env;
}

async function runCommand(command: string, args: string[], stdin?: string, env?: NodeJS.ProcessEnv): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error: Error) => {
      resolve({ code: null, stdout, stderr, error });
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });

    child.stdin.end(stdin ?? "");
  });
}

function redactDbUrl(output: string) {
  if (!dbUrl) return output;
  const parsed = new URL(dbUrl);
  const redactedUrl = parsed.password ? dbUrl.split(parsed.password).join("[PASSWORD]") : dbUrl;
  return output.split(dbUrl).join("[DATABASE_URL]").split(redactedUrl).join("[DATABASE_URL]");
}
