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
  branch_a1 uuid;
  branch_a2 uuid;
  branch_b uuid;
  table_a uuid;
  table_a2 uuid;
  table_b uuid;
  table_unassigned uuid;
  reservation_a uuid;
  reservation_b uuid;
  reservation_unassigned uuid;
  reservation_deposit uuid;
  reservation_deposit_duplicate uuid;
  qr_result public.tables%rowtype;
  overlap_blocked boolean := false;
  atomic_overlap_blocked boolean := false;
  cross_branch_blocked boolean := false;
  released_slot_reused boolean := false;
  wrong_table_blocked boolean := false;
  wrong_reservation_blocked boolean := false;
  wrong_bill_table_blocked boolean := false;
  duplicate_reminder_blocked boolean := false;
  duplicate_deposit_transition_blocked boolean := false;
  nullable_branch_change_blocked boolean := false;
  missing_publication_tables text[];
  slug_suffix text := replace(gen_random_uuid()::text, '-', '');
begin
  insert into public.restaurants (name, slug, reservations_enabled, opening_time, closing_time)
  values ('Reservation DB rehearsal A', 'reservation-db-rehearsal-a-' || slug_suffix, true, '08:00', '23:00')
  returning id into restaurant_a;

  insert into public.restaurants (name, slug, reservations_enabled, opening_time, closing_time)
  values ('Reservation DB rehearsal B', 'reservation-db-rehearsal-b-' || slug_suffix, true, '08:00', '23:00')
  returning id into restaurant_b;

  insert into public.store_branches (restaurant_id, name, address, latitude, longitude, is_primary)
  values (restaurant_a, 'A Primary-' || slug_suffix, 'A', 10.0, 106.0, true)
  returning id into branch_a1;

  insert into public.store_branches (restaurant_id, name, address, latitude, longitude, is_primary)
  values (restaurant_a, 'A Secondary-' || slug_suffix, 'A2', 10.1, 106.1, false)
  returning id into branch_a2;

  insert into public.store_branches (restaurant_id, name, address, latitude, longitude, is_primary)
  values (restaurant_b, 'B Primary-' || slug_suffix, 'B', 11.0, 107.0, true)
  returning id into branch_b;

  insert into public.tables (restaurant_id, branch_id, name, capacity, is_bookable)
  values (restaurant_a, branch_a1, 'A1-' || slug_suffix, 4, true)
  returning id into table_a;

  insert into public.tables (restaurant_id, branch_id, name, capacity, is_bookable)
  values (restaurant_a, branch_a2, 'A2-' || slug_suffix, 4, true)
  returning id into table_a2;

  insert into public.tables (restaurant_id, branch_id, name, capacity, is_bookable)
  values (restaurant_b, branch_b, 'B1-' || slug_suffix, 4, true)
  returning id into table_b;

  insert into public.tables (restaurant_id, name, capacity, is_bookable)
  values (restaurant_a, 'Unassigned-' || slug_suffix, 4, true)
  returning id into table_unassigned;

  if not exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_a
      and r.allow_legacy_qr = false
  ) or not exists (
    select 1
    from public.tables t
    where t.id = table_a
      and t.qr_enabled = true
      and t.qr_token_enforced = true
      and t.qr_token_version = 1
  ) then
    raise exception 'QR hardening defaults were not applied';
  end if;

  select * into strict qr_result
  from public.rotate_table_qr_token(restaurant_a, table_a);
  if qr_result.qr_token_version <> 2 or not qr_result.qr_token_enforced then
    raise exception 'QR rotation RPC did not return the rotated table';
  end if;

  select * into strict qr_result
  from public.set_table_qr_enabled(restaurant_a, table_a, false);
  if qr_result.qr_enabled or qr_result.qr_token_version <> 3 or qr_result.qr_token_rotated_at is null then
    raise exception 'QR disable RPC did not revoke the prior token';
  end if;

  select * into strict qr_result
  from public.set_table_qr_enabled(restaurant_a, table_a, true);
  if not qr_result.qr_enabled or qr_result.qr_token_version <> 3 then
    raise exception 'QR re-enable RPC unexpectedly reused or rotated token state';
  end if;

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

  insert into public.reservations (
    restaurant_id,
    status,
    customer_name,
    customer_phone,
    party_size,
    starts_at,
    ends_at,
    access_token_hash
  ) values (
    restaurant_a,
    'confirmed',
    'Unassigned branch rehearsal',
    '+84900000006',
    2,
    '2026-06-04T12:00:00Z',
    '2026-06-04T13:30:00Z',
    'unassigned-branch-rehearsal'
  ) returning id into reservation_unassigned;

  insert into public.reservation_table_locks (
    reservation_id,
    restaurant_id,
    table_id,
    starts_at,
    ends_at,
    status
  ) values (
    reservation_unassigned,
    restaurant_a,
    table_unassigned,
    '2026-06-04T12:00:00Z',
    '2026-06-04T13:30:00Z',
    'active'
  );

  begin
    update public.tables
    set branch_id = branch_a1
    where id = table_unassigned;
  exception
    when check_violation then
      nullable_branch_change_blocked := true;
  end;

  if not nullable_branch_change_blocked
    or exists (select 1 from public.tables where id = table_unassigned and branch_id is not null)
  then
    raise exception 'nullable table branch changed while an active reservation lock existed';
  end if;

  update public.reservation_table_locks
  set status = 'released'
  where reservation_id = reservation_unassigned;

  update public.tables
  set branch_id = branch_a1
  where id = table_unassigned;

  if not exists (select 1 from public.tables where id = table_unassigned and branch_id = branch_a1) then
    raise exception 'released reservation lock did not allow a table branch assignment';
  end if;

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
    ) values (
      reservation_a,
      restaurant_a,
      table_a2,
      '2026-06-01T14:00:00Z',
      '2026-06-01T15:30:00Z',
      'active'
    );
  exception
    when check_violation then
      cross_branch_blocked := true;
  end;

  if not cross_branch_blocked then
    raise exception 'cross-branch reservation lock group was not blocked';
  end if;

  begin
    perform public.create_reservation_with_table_lock(
      jsonb_build_object(
        'restaurant_id', restaurant_a,
        'status', 'confirmed',
        'customer_name', 'Atomic overlap rehearsal',
        'customer_phone', '+84900000003',
        'party_size', 2,
        'starts_at', '2026-06-01T12:30:00Z',
        'ends_at', '2026-06-01T13:00:00Z',
        'deposit_required_amount', 0,
        'deposit_paid_amount', 0,
        'deposit_status', 'none',
        'source', 'PUBLIC',
        'access_token_hash', 'atomic-overlap-rehearsal'
      ),
      table_a,
      '2026-06-01T13:00:00Z'
    );
  exception
    when exclusion_violation then
      atomic_overlap_blocked := true;
  end;

  if not atomic_overlap_blocked then
    raise exception 'atomic reservation creation did not surface overlap';
  end if;
  if exists (select 1 from public.reservations where access_token_hash = 'atomic-overlap-rehearsal') then
    raise exception 'atomic reservation creation left an orphan reservation after lock conflict';
  end if;

  insert into public.reservations (
    restaurant_id,
    status,
    customer_name,
    customer_phone,
    party_size,
    starts_at,
    ends_at,
    deposit_required_amount,
    deposit_paid_amount,
    deposit_status,
    payment_method,
    access_token_hash
  ) values (
    restaurant_a,
    'waiting_deposit_confirm',
    'Deposit rehearsal',
    '+84900000004',
    2,
    '2026-06-02T12:00:00Z',
    '2026-06-02T13:30:00Z',
    100000,
    0,
    'waiting_confirm',
    'QR',
    'deposit-rehearsal'
  ) returning id into reservation_deposit;

  if not public.confirm_reservation_deposit_atomic(
    restaurant_a,
    reservation_deposit,
    'reservation:' || reservation_deposit || ':deposit-confirmed',
    'reservation_db_rehearsal'
  ) then
    raise exception 'atomic reservation deposit confirmation did not transition';
  end if;
  if not exists (
    select 1
    from public.reservations r
    join public.reservation_deposit_logs l
      on l.reservation_id = r.id
     and l.restaurant_id = r.restaurant_id
    where r.id = reservation_deposit
      and r.restaurant_id = restaurant_a
      and r.status = 'confirmed'
      and r.deposit_status = 'paid'
      and r.deposit_paid_amount = 100000
      and l.status = 'confirmed'
      and l.amount = 100000
  ) then
    raise exception 'atomic reservation deposit confirmation did not persist state and audit together';
  end if;

  insert into public.reservations (
    restaurant_id,
    status,
    customer_name,
    customer_phone,
    party_size,
    starts_at,
    ends_at,
    deposit_required_amount,
    deposit_paid_amount,
    deposit_status,
    payment_method,
    access_token_hash
  ) values (
    restaurant_a,
    'waiting_deposit_confirm',
    'Duplicate transition rehearsal',
    '+84900000005',
    2,
    '2026-06-03T12:00:00Z',
    '2026-06-03T13:30:00Z',
    200000,
    0,
    'waiting_confirm',
    'QR',
    'duplicate-transition-rehearsal'
  ) returning id into reservation_deposit_duplicate;

  begin
    perform public.confirm_reservation_deposit_atomic(
      restaurant_a,
      reservation_deposit_duplicate,
      'reservation:' || reservation_deposit || ':deposit-confirmed',
      'reservation_db_rehearsal'
    );
  exception
    when unique_violation then
      duplicate_deposit_transition_blocked := true;
  end;

  if not duplicate_deposit_transition_blocked then
    raise exception 'duplicate deposit transition key did not abort the reservation transition';
  end if;
  if not exists (
    select 1
    from public.reservations r
    where r.id = reservation_deposit_duplicate
      and r.status = 'waiting_deposit_confirm'
      and r.deposit_status = 'waiting_confirm'
      and r.deposit_paid_amount = 0
  ) or exists (
    select 1
    from public.reservation_deposit_logs l
    where l.reservation_id = reservation_deposit_duplicate
  ) then
    raise exception 'duplicate deposit transition left state without its audit log';
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
