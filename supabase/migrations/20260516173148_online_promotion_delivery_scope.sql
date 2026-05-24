-- Add promotion benefit scope so online ordering can distinguish item/order discounts
-- from delivery-fee campaigns such as free shipping.

alter table public.promotions
  add column if not exists discount_scope text not null default 'ORDER';

alter table public.promotions
  drop constraint if exists promotions_discount_scope_check,
  add constraint promotions_discount_scope_check
    check (discount_scope in ('ORDER', 'DELIVERY_FEE'));
