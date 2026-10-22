-- Sprint 1: audit log (FR-ROLE-002). Every sensitive change is written with who, when, old value and new value.
-- The log is append-only: it can only be written by the trigger below and nobody can edit or delete entries.

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  -- a snapshot, so the entry still reads correctly after a person is renamed, changes role or leaves
  actor_name text,
  actor_role text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name text not null,
  record_id text,
  old_values jsonb,
  new_values jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_table_idx on public.audit_log (table_name, record_id);
create index audit_log_actor_idx on public.audit_log (actor_id);

alter table public.audit_log enable row level security;

create policy audit_log_read on public.audit_log for select to authenticated
  using (private.has_perm('audit', 'view'));

-- no insert, update or delete policies: nothing can write to it through the API
revoke all on public.audit_log from anon, authenticated, public;
grant select on public.audit_log to authenticated;

create or replace function private.audit_log_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'The audit log cannot be changed' using errcode = '42501';
end $$;

create trigger audit_log_no_change before update or delete on public.audit_log
  for each row execute function private.audit_log_immutable();

-- Generic row-change recorder. Attach it to any table that holds sensitive data.
create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_name text;
  v_role text;
begin
  -- an UPDATE that changed nothing is not worth recording
  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;

  select s.full_name, r.key into v_name, v_role
  from public.staff s join public.roles r on r.id = s.role_id
  where s.id = auth.uid();

  insert into public.audit_log (actor_id, actor_name, actor_role, action, table_name, record_id, old_values, new_values)
  values (
    auth.uid(), v_name, v_role, tg_op, tg_table_name,
    coalesce(v_row ->> 'id', (v_row ->> 'role_id') || ':' || coalesce(v_row ->> 'module', '')),
    v_old, v_new
  );
  return coalesce(new, old);
end $$;

revoke execute on function private.audit_row() from public, anon;

create trigger staff_audit after insert or update or delete on public.staff
  for each row execute function private.audit_row();
create trigger roles_audit after insert or update or delete on public.roles
  for each row execute function private.audit_row();
create trigger role_permissions_audit after insert or update or delete on public.role_permissions
  for each row execute function private.audit_row();
