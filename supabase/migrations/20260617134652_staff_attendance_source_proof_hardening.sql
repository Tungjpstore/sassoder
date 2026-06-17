-- Staff attendance source-proof hardening.
-- QR/WiFi attendance already requires valid GPS in the API layer; these
-- forward-only constraints make the database reject future writes that are
-- missing the source-specific proof needed for audit/payroll review.

do $$
begin
  if to_regclass('public.attendance_logs') is not null then
    if not exists (
      select 1 from pg_constraint where conname = 'attendance_logs_clock_in_qr_source_proof_hardening'
    ) then
      alter table public.attendance_logs
        add constraint attendance_logs_clock_in_qr_source_proof_hardening
        check (
          created_at < timestamp with time zone '2026-06-17 00:00:00+00'
          or clock_in_source <> 'qr'
          or coalesce(raw_payload ->> 'qrTokenId', '') <> ''
        ) not valid;
    end if;

    if not exists (
      select 1 from pg_constraint where conname = 'attendance_logs_clock_out_qr_source_proof_hardening'
    ) then
      alter table public.attendance_logs
        add constraint attendance_logs_clock_out_qr_source_proof_hardening
        check (
          clock_out_source is null
          or clock_out_at < timestamp with time zone '2026-06-17 00:00:00+00'
          or clock_out_source <> 'qr'
          or coalesce(raw_payload ->> 'qrTokenId', '') <> ''
          or coalesce(clock_out_device ->> 'qrTokenId', '') <> ''
        ) not valid;
    end if;

    if not exists (
      select 1 from pg_constraint where conname = 'attendance_logs_clock_in_wifi_source_proof_hardening'
    ) then
      alter table public.attendance_logs
        add constraint attendance_logs_clock_in_wifi_source_proof_hardening
        check (
          created_at < timestamp with time zone '2026-06-17 00:00:00+00'
          or clock_in_source <> 'wifi'
          or (
            coalesce(raw_payload ->> 'wifiNetworkId', '') <> ''
            and coalesce(clock_in_device ->> 'wifiNetworkId', '') <> ''
            and coalesce(clock_in_device ->> 'networkIp', '') <> ''
          )
        ) not valid;
    end if;

    if not exists (
      select 1 from pg_constraint where conname = 'attendance_logs_clock_out_wifi_source_proof_hardening'
    ) then
      alter table public.attendance_logs
        add constraint attendance_logs_clock_out_wifi_source_proof_hardening
        check (
          clock_out_source is null
          or clock_out_at < timestamp with time zone '2026-06-17 00:00:00+00'
          or clock_out_source <> 'wifi'
          or (
            (
              coalesce(raw_payload ->> 'wifiNetworkId', '') <> ''
              or coalesce(clock_out_device ->> 'wifiNetworkId', '') <> ''
            )
            and coalesce(clock_out_device ->> 'networkIp', '') <> ''
          )
        ) not valid;
    end if;
  end if;
end $$;
