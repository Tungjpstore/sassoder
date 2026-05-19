insert into public.platform_admin_role_permissions (role, permission)
values
  ('owner', 'tenants.suspend'),
  ('owner', 'tenants.restore'),
  ('owner', 'tenants.delete'),
  ('owner', 'users.block'),
  ('owner', 'users.restore'),
  ('support', 'tenants.suspend'),
  ('support', 'tenants.restore'),
  ('support', 'users.block'),
  ('support', 'users.restore')
on conflict (role, permission) do nothing;

delete from public.platform_admin_role_permissions
where role = 'support'
  and permission in ('tenants.write', 'users.write');

insert into public.platform_audit_logs (actor, action, target_type, metadata)
select
  'migration',
  'platform_admin_governance_hardening_applied',
  'platform_admin_rbac',
  jsonb_build_object(
    'splitPermissions',
    array['tenants.suspend', 'tenants.restore', 'tenants.delete', 'users.block', 'users.restore'],
    'removedSupportPermissions',
    array['tenants.write', 'users.write']
  )
where not exists (
  select 1
  from public.platform_audit_logs
  where actor = 'migration'
    and action = 'platform_admin_governance_hardening_applied'
    and target_type = 'platform_admin_rbac'
);
