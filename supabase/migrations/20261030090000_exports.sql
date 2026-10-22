-- Data exports (PRD section 21): who downloaded what, and when. The download itself is built by the app from rows the
-- person's own session may already read, so an export can never contain more than their role can see on screen.
-- This only records the fact of the export, and the record cannot be edited or removed.

create table public.export_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_name text,
  kind text not null check (kind in ('orders', 'customers', 'money', 'catalogue')),
  row_count int not null check (row_count >= 0)
);

alter table public.export_log enable row level security;
create policy export_log_read on public.export_log for select to authenticated using (private.has_perm('audit', 'view'));
revoke all on public.export_log from anon, public, authenticated;
grant select on public.export_log to authenticated;

create or replace function private.export_log_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'The export log cannot be changed' using errcode = '42501';
end $$;
create trigger export_log_no_change before update or delete on public.export_log for each row execute function private.export_log_immutable();

create or replace function public.log_export(p_kind text, p_rows int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_perm('exports', 'export') then raise exception 'You cannot export data' using errcode = '42501'; end if;
  insert into public.export_log (actor_id, actor_name, kind, row_count) values (auth.uid(), private.staff_name(), p_kind, greatest(coalesce(p_rows, 0), 0));
end $$;
revoke execute on function public.log_export(text, int) from public, anon;
grant execute on function public.log_export(text, int) to authenticated;
