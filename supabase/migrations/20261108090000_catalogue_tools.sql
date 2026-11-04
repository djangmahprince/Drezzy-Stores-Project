-- Catalogue tools (PRD FR-CAT-003, 004, 005): supplier details, an expected date for pre-orders, and one-call confirmation
-- after staff have spoken to a supplier. Bulk edit and price lists write through the existing tables and their rules.

alter table public.suppliers
  add column if not exists contact_person text check (char_length(contact_person) <= 80),
  add column if not exists location text check (char_length(location) <= 120),
  add column if not exists supplies text check (char_length(supplies) <= 300),
  add column if not exists trusted boolean not null default false;

alter table public.variants add column if not exists expected_on date;
grant select (expected_on) on public.variants to anon;

-- "We called them and everything still stands": refreshes every offer from this supplier and the variants they supply.
create or replace function public.confirm_supplier_checked(p_supplier uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  if not private.has_perm('availability', 'edit') then raise exception 'You cannot update availability' using errcode = '42501'; end if;
  if not exists (select 1 from public.suppliers where id = p_supplier) then raise exception 'Supplier not found'; end if;
  update public.supplier_offers set checked_at = now() where supplier_id = p_supplier;
  update public.variants v set last_checked_at = now()
  where v.preferred_supplier_id = p_supplier or exists (select 1 from public.supplier_offers so where so.variant_id = v.id and so.supplier_id = p_supplier);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.confirm_supplier_checked(uuid) from public, anon;
grant execute on function public.confirm_supplier_checked(uuid) to authenticated;
