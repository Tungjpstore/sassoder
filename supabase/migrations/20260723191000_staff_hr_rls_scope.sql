-- Restrict sensitive HR records to the owner/admin or the staff member who owns them.
-- Mutations stay behind audited server services using the service role.

revoke insert, update, delete on table
  public.staff_reviews,
  public.staff_contracts,
  public.staff_documents,
  public.staff_devices
from authenticated;

grant select on table
  public.staff_reviews,
  public.staff_contracts,
  public.staff_documents,
  public.staff_devices
to authenticated;

drop policy if exists "admins can mutate own staff reviews" on public.staff_reviews;
drop policy if exists "admins can mutate own staff contracts" on public.staff_contracts;
drop policy if exists "admins can mutate own staff documents" on public.staff_documents;
drop policy if exists "admins can mutate own staff devices" on public.staff_devices;

drop policy if exists "restaurant users can read own staff reviews" on public.staff_reviews;
create policy "restaurant users can read own staff reviews"
on public.staff_reviews for select to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and (
    app_private.current_user_role() = 'ADMIN'
    or exists (
      select 1 from public.staff_members own_member
      where own_member.restaurant_id = public.staff_reviews.restaurant_id
        and own_member.id = public.staff_reviews.staff_member_id
        and own_member.user_id = auth.uid()
        and own_member.archived_at is null
        and own_member.employment_status = 'active'
    )
  )
);

drop policy if exists "restaurant users can read own staff contracts" on public.staff_contracts;
create policy "restaurant users can read own staff contracts"
on public.staff_contracts for select to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and (
    app_private.current_user_role() = 'ADMIN'
    or exists (
      select 1 from public.staff_members own_member
      where own_member.restaurant_id = public.staff_contracts.restaurant_id
        and own_member.id = public.staff_contracts.staff_member_id
        and own_member.user_id = auth.uid()
        and own_member.archived_at is null
        and own_member.employment_status = 'active'
    )
  )
);

drop policy if exists "restaurant users can read own staff documents" on public.staff_documents;
create policy "restaurant users can read own staff documents"
on public.staff_documents for select to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and (
    app_private.current_user_role() = 'ADMIN'
    or exists (
      select 1 from public.staff_members own_member
      where own_member.restaurant_id = public.staff_documents.restaurant_id
        and own_member.id = public.staff_documents.staff_member_id
        and own_member.user_id = auth.uid()
        and own_member.archived_at is null
        and own_member.employment_status = 'active'
    )
  )
);

drop policy if exists "restaurant users can read own staff devices" on public.staff_devices;
create policy "restaurant users can read own staff devices"
on public.staff_devices for select to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and (
    app_private.current_user_role() = 'ADMIN'
    or exists (
      select 1 from public.staff_members own_member
      where own_member.restaurant_id = public.staff_devices.restaurant_id
        and own_member.id = public.staff_devices.staff_member_id
        and own_member.user_id = auth.uid()
        and own_member.archived_at is null
        and own_member.employment_status = 'active'
    )
  )
);

notify pgrst, 'reload schema';
