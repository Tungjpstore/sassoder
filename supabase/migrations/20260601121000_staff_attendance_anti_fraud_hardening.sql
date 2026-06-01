-- Staff attendance anti-fraud hardening.
-- Add forward-only guardrails for new writes while leaving historical cleanup to a later backfill.

do $$
begin
  if to_regclass('public.attendance_logs') is not null then
    if not exists (
      select 1 from pg_constraint where conname = 'attendance_logs_clock_order_hardening'
    ) then
      alter table public.attendance_logs
        add constraint attendance_logs_clock_order_hardening
        check (clock_out_at is null or clock_out_at > clock_in_at) not valid;
    end if;

    if not exists (
      select 1 from pg_constraint where conname = 'attendance_logs_anomaly_score_range_hardening'
    ) then
      alter table public.attendance_logs
        add constraint attendance_logs_anomaly_score_range_hardening
        check (anomaly_score between 0 and 100) not valid;
    end if;

    if not exists (
      select 1 from pg_constraint where conname = 'attendance_logs_anomaly_flags_shape_hardening'
    ) then
      alter table public.attendance_logs
        add constraint attendance_logs_anomaly_flags_shape_hardening
        check (
          cardinality(anomaly_flags) <= 24
          and array_position(anomaly_flags, null) is null
          and array_position(anomaly_flags, '') is null
        ) not valid;
    end if;

    if not exists (
      select 1 from pg_constraint where conname = 'attendance_logs_clock_in_presence_proof_hardening'
    ) then
      alter table public.attendance_logs
        add constraint attendance_logs_clock_in_presence_proof_hardening
        check (
          created_at < timestamp with time zone '2026-06-01 00:00:00+00'
          or
          clock_in_source = 'manual'
          or (
            branch_id is not null
            and clock_in_lat is not null
            and clock_in_lng is not null
            and clock_in_accuracy_meters is not null
            and clock_in_accuracy_meters <= 80
            and clock_in_distance_meters is not null
            and clock_in_distance_meters <= 150
            and (
              clock_in_device ? 'deviceFingerprint'
              or clock_in_device ? 'fingerprint'
              or clock_in_device ? 'device_fingerprint'
            )
            and (
              clock_in_device ? 'attendanceSessionToken'
              or clock_in_device ? 'staffSessionToken'
            )
          )
        ) not valid;
    end if;

    if not exists (
      select 1 from pg_constraint where conname = 'attendance_logs_clock_out_presence_proof_hardening'
    ) then
      alter table public.attendance_logs
        add constraint attendance_logs_clock_out_presence_proof_hardening
        check (
          clock_out_source is null
          or clock_out_at < timestamp with time zone '2026-06-01 00:00:00+00'
          or clock_out_source = 'manual'
          or (
            branch_id is not null
            and clock_out_lat is not null
            and clock_out_lng is not null
            and clock_out_accuracy_meters is not null
            and clock_out_accuracy_meters <= 80
            and clock_out_distance_meters is not null
            and clock_out_distance_meters <= 150
            and (
              clock_out_device ? 'deviceFingerprint'
              or clock_out_device ? 'fingerprint'
              or clock_out_device ? 'device_fingerprint'
            )
            and (
              clock_out_device ? 'attendanceSessionToken'
              or clock_out_device ? 'staffSessionToken'
            )
          )
        ) not valid;
    end if;
  end if;

  if to_regclass('public.staff_attendance_qr_tokens') is not null then
    if not exists (
      select 1 from pg_constraint where conname = 'staff_attendance_qr_tokens_usage_count_limit_hardening'
    ) then
      alter table public.staff_attendance_qr_tokens
        add constraint staff_attendance_qr_tokens_usage_count_limit_hardening
        check (usage_limit is null or usage_count <= usage_limit) not valid;
    end if;
  end if;

  if to_regclass('public.staff_attendance_wifi_networks') is not null then
    if not exists (
      select 1 from pg_constraint where conname = 'staff_attendance_wifi_networks_exact_cidr_hardening'
    ) then
      alter table public.staff_attendance_wifi_networks
        add constraint staff_attendance_wifi_networks_exact_cidr_hardening
        check (
          (family(public_ip_cidr) = 4 and masklen(public_ip_cidr) = 32)
          or (family(public_ip_cidr) = 6 and masklen(public_ip_cidr) = 128)
        ) not valid;
    end if;
  end if;
end $$;

create index if not exists attendance_logs_restaurant_staff_clock_in_hardening_idx
  on public.attendance_logs (restaurant_id, staff_member_id, clock_in_at desc);
