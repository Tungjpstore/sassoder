-- Preserve audit immutability while allowing Auth's ON DELETE SET NULL FK action.
-- The only permitted update is detaching a deleted actor; every other field
-- remains immutable and is still intercepted by the no-update rule.

drop rule if exists logimail_audit_logs_no_update on logimail.audit_logs;

create rule logimail_audit_logs_no_update as
  on update to logimail.audit_logs
  where not (
    old.actor_id is not null
    and new.actor_id is null
    and old.id is not distinct from new.id
    and old.workspace_id is not distinct from new.workspace_id
    and old.action is not distinct from new.action
    and old.target_type is not distinct from new.target_type
    and old.target_id is not distinct from new.target_id
    and old.metadata is not distinct from new.metadata
    and old.created_at is not distinct from new.created_at
  )
  do instead nothing;
