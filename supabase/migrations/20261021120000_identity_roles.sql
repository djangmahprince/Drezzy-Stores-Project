-- Sprint 1: staff identity, roles and permissions (PRD section 4, FR-ROLE-001 to 003).
--
-- Every rule here is enforced by the database, not only hidden in the interface:
--   * Row-level security decides who can read or write each table.
--   * Staff data is only reachable on an MFA-verified session (aal2). Staff 2FA is required by the PRD.
--   * Nobody can raise their own access, and only an Owner can create Owners or edit role definitions.
--   * Salary access can only ever belong to the Owner and Finance roles (FR-ROLE-003).

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
-- functions created in this schema from now on are not callable by the public or anonymous visitors
alter default privileges in schema private revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.app_module as enum (
  'products', 'availability', 'orders', 'refunds', 'customers', 'staff', 'salary', 'expenses',
  'targets_set', 'targets_view', 'analytics', 'content', 'exports', 'settings', 'audit'
);
create type public.app_branch as enum ('accra', 'kumasi', 'both');
create type public.perm_scope as enum ('all', 'own');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null check (char_length(name) between 2 and 60),
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  module public.app_module not null,
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_export boolean not null default false,
  scope public.perm_scope not null default 'all',
  -- narrower limits the matrix describes in words, enforced per module as those modules are built
  restriction text,
  primary key (role_id, module),
  -- you cannot change something you cannot see (data export is its own permission)
  check (not (can_create or can_edit or can_delete) or can_view)
);

create table public.staff (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 100),
  email text not null,
  phone text,
  role_id uuid not null references public.roles (id),
  branch public.app_branch not null default 'both',
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index staff_role_idx on public.staff (role_id);

-- ---------------------------------------------------------------------------
-- Helpers used by policies. SECURITY DEFINER so they can read staff without recursing into RLS.
-- ---------------------------------------------------------------------------
create or replace function private.jwt_aal() returns text
language sql stable as $$ select coalesce(auth.jwt() ->> 'aal', 'aal1') $$;

create or replace function private.role_key(p_role uuid) returns text
language sql stable security definer set search_path = '' as $$
  select r.key from public.roles r where r.id = p_role
$$;

-- The signed-in, active staff member's role id, only on a verified (aal2) session.
create or replace function private.my_role() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.role_id from public.staff s
  where s.id = auth.uid() and s.active and private.jwt_aal() = 'aal2'
$$;

create or replace function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.my_role() is not null
$$;

create or replace function private.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.role_key(private.my_role()) = 'owner', false)
$$;

create or replace function private.has_perm(p_module public.app_module, p_action text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case p_action
      when 'view' then rp.can_view
      when 'create' then rp.can_create
      when 'edit' then rp.can_edit
      when 'delete' then rp.can_delete
      when 'export' then rp.can_export
      else false
    end
    from public.role_permissions rp
    where rp.role_id = private.my_role() and rp.module = p_module
  ), false)
$$;

-- 'all' or 'own' for the signed-in staff member, null when the module is not theirs.
create or replace function private.perm_scope(p_module public.app_module) returns public.perm_scope
language sql stable security definer set search_path = '' as $$
  select rp.scope from public.role_permissions rp
  where rp.role_id = private.my_role() and rp.module = p_module
    and (rp.can_view or rp.can_create or rp.can_edit or rp.can_delete or rp.can_export)
$$;

-- ---------------------------------------------------------------------------
-- Guards (these run for signed-in API users only; migrations and the owner bootstrap have no auth.uid())
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger roles_touch before update on public.roles for each row execute function private.touch_updated_at();
create trigger staff_touch before update on public.staff for each row execute function private.touch_updated_at();

create or replace function private.guard_roles() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'System roles cannot be deleted' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.is_system then
      raise exception 'Only the built-in roles are system roles' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.is_system and (new.key <> old.key or new.is_system <> old.is_system) then
    raise exception 'System roles cannot be renamed or converted' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger roles_guard before insert or update or delete on public.roles
  for each row execute function private.guard_roles();

create or replace function private.guard_role_permissions() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role uuid := coalesce(new.role_id, old.role_id);
  v_key text := private.role_key(v_role);
  v_module public.app_module := coalesce(new.module, old.module);
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  -- the Owner always keeps full control, so nobody can lock the business out
  if v_key = 'owner' then
    raise exception 'The Owner role''s permissions cannot be changed' using errcode = '42501';
  end if;
  -- FR-ROLE-003: salary records belong to the Owner and Finance only, and nobody can grant them further
  if v_module = 'salary' and v_key <> 'finance' and tg_op <> 'DELETE' then
    raise exception 'Salary access can only belong to the Owner and Finance roles' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

create trigger role_permissions_guard before insert or update or delete on public.role_permissions
  for each row execute function private.guard_role_permissions();

create or replace function private.guard_staff() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old_key text;
  v_new_key text;
  v_other_owners int;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  v_new_key := case when tg_op = 'DELETE' then null else private.role_key(new.role_id) end;
  v_old_key := case when tg_op = 'INSERT' then null else private.role_key(old.role_id) end;

  -- only an Owner can create an Owner, or change one
  if not private.is_owner() and (v_new_key = 'owner' or v_old_key = 'owner') then
    raise exception 'Only an Owner can create or change an Owner' using errcode = '42501';
  end if;

  -- FR-ROLE-003: the Finance role carries salary access, so an Admin cannot hand it out or take it away either
  if not private.is_owner() and (v_new_key = 'finance' or v_old_key = 'finance')
     and (tg_op <> 'UPDATE' or v_new_key is distinct from v_old_key) then
    raise exception 'Only an Owner can assign or remove the Finance role' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.id = auth.uid() then
    if new.role_id <> old.role_id or new.active <> old.active then
      raise exception 'You cannot change your own role or status' using errcode = '42501';
    end if;
  end if;

  -- the business always keeps at least one active Owner
  if v_old_key = 'owner' and old.active and (tg_op = 'DELETE' or not new.active or v_new_key <> 'owner') then
    select count(*) into v_other_owners
    from public.staff s
    where s.id <> old.id and s.active and private.role_key(s.role_id) = 'owner';
    if v_other_owners = 0 then
      raise exception 'There must always be one active Owner' using errcode = '42501';
    end if;
  end if;

  return coalesce(new, old);
end $$;

create trigger staff_guard before insert or update or delete on public.staff
  for each row execute function private.guard_staff();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.staff enable row level security;

-- roles: any verified staff member can read them; only an Owner can change them (FR-ROLE-001)
create policy roles_read on public.roles for select to authenticated using (private.is_staff());
create policy roles_insert on public.roles for insert to authenticated with check (private.is_owner());
create policy roles_update on public.roles for update to authenticated using (private.is_owner()) with check (private.is_owner());
create policy roles_delete on public.roles for delete to authenticated using (private.is_owner());

create policy role_permissions_read on public.role_permissions for select to authenticated using (private.is_staff());
create policy role_permissions_insert on public.role_permissions for insert to authenticated with check (private.is_owner());
create policy role_permissions_update on public.role_permissions for update to authenticated using (private.is_owner()) with check (private.is_owner());
create policy role_permissions_delete on public.role_permissions for delete to authenticated using (private.is_owner());

-- staff: you can always read your own row (the app needs it to route you through 2FA); everything else needs the permission
create policy staff_read_self on public.staff for select to authenticated using (id = auth.uid() and active);
create policy staff_read on public.staff for select to authenticated using (private.has_perm('staff', 'view'));
create policy staff_insert on public.staff for insert to authenticated with check (private.has_perm('staff', 'create'));
create policy staff_update on public.staff for update to authenticated
  using (private.has_perm('staff', 'edit')) with check (private.has_perm('staff', 'edit'));
create policy staff_delete on public.staff for delete to authenticated using (private.has_perm('staff', 'delete'));

-- ---------------------------------------------------------------------------
-- Grants: nothing is open to anonymous visitors. Tables are opened one by one as the storefront needs them.
-- ---------------------------------------------------------------------------
revoke all on public.roles, public.role_permissions, public.staff from anon, public;
grant select, insert, update, delete on public.roles, public.role_permissions, public.staff to authenticated;
alter default privileges in schema public revoke all on tables from anon;

-- Final privilege pass for everything defined above.
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
