-- Defense-in-depth for paid-plan activation.
-- This RPC is only called from trusted server code with the Supabase service role.
-- It must never be executable from anon/authenticated REST clients, otherwise a
-- malicious client could try to confirm a package payment directly.

revoke all on function public.confirm_subscription_payment_atomic(uuid, text) from public;
revoke all on function public.confirm_subscription_payment_atomic(uuid, text) from anon;
revoke all on function public.confirm_subscription_payment_atomic(uuid, text) from authenticated;

grant execute on function public.confirm_subscription_payment_atomic(uuid, text) to service_role;
