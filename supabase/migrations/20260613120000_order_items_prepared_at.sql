-- Per-item preparation tracking.
-- Cho phép bếp / màn hình bàn đánh dấu từng món "đã làm xong / đã ra" mà không
-- đổi trạng thái cấp đơn. prepared_at = null nghĩa là món chưa làm xong.

alter table public.order_items
  add column if not exists prepared_at timestamptz;

create index if not exists order_items_prepared_at_idx
  on public.order_items (order_id, prepared_at);
