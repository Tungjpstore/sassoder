create unique index concurrently if not exists billing_payment_logs_request_signature_idx
  on public.billing_payment_logs (request_signature)
  where request_signature is not null;
