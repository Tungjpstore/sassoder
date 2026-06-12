insert into public.platform_admin_role_permissions (role, permission)
values
  ('owner', 'logimail.approve'),
  ('ops', 'logimail.approve')
on conflict (role, permission) do nothing;

insert into public.platform_audit_logs (actor, action, target_type, metadata)
values (
  'migration',
  'platform_logimail_approval_permission_granted',
  'platform_admin_role_permissions',
  jsonb_build_object(
    'permission', 'logimail.approve',
    'roles', array['owner', 'ops']
  )
)
on conflict do nothing;
