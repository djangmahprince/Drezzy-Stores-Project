-- Salary records (PRD FR-ROLE-003 and section 17): who is owed what for a month, and when it was paid.
--   * Only the Owner and Finance hold the salary permission, and nobody can grant it further (enforced in the roles migration).
--   * One record per person per month. A salary is "due" until it is marked paid; only paid salaries count as money out.
--   * Records are never silently edited: every change goes to the audit log.

create type public.salary_status as enum ('due', 'paid');

create table public.salary_records (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete restrict,
  month date not null check (month = date_trunc('month', month)::date),
  amount numeric(12, 2) not null check (amount > 0),
  status public.salary_status not null default 'due',
  paid_on date,
  method text check (method in ('cash', 'momo', 'bank')),
  note text check (char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (staff_id, month),
  check ((status = 'paid') = (paid_on is not null))
);
create index salary_month_idx on public.salary_records (month desc);

alter table public.salary_records enable row level security;
create policy salary_read on public.salary_records for select to authenticated using (private.has_perm('salary', 'view'));
create policy salary_insert on public.salary_records for insert to authenticated with check (private.has_perm('salary', 'create') and created_by = auth.uid());
create policy salary_update on public.salary_records for update to authenticated using (private.has_perm('salary', 'edit')) with check (private.has_perm('salary', 'edit'));
create policy salary_delete on public.salary_records for delete to authenticated using (private.has_perm('salary', 'delete') and status = 'due');
revoke all on public.salary_records from anon, public;
grant select, insert, update, delete on public.salary_records to authenticated;
create trigger salary_records_audit after insert or update or delete on public.salary_records for each row execute function private.audit_row();

-- A paid salary cannot be turned back into due or have its amount changed: correct it with a new note, not by rewriting history.
create or replace function private.guard_salary() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null and current_user not in ('anon', 'authenticated') then return new; end if;
  if old.status = 'paid' and (new.status <> 'paid' or new.amount <> old.amount or new.staff_id <> old.staff_id or new.month <> old.month or new.paid_on is distinct from old.paid_on) then
    raise exception 'A paid salary cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger salary_records_guard before update on public.salary_records for each row execute function private.guard_salary();

-- ---------------------------------------------------------------------------
-- Paid salaries are money out
-- ---------------------------------------------------------------------------
create or replace view public.money_ledger with (security_invoker = true) as
  select p.confirmed_at as at, 'in'::text as direction, 'Sales'::text as category, p.amount as amount, o.branch as branch,
         coalesce(p.method, p.provider::text) as method,
         case when p.kind = 'balance' then 'Balance collected' else 'Payment' end || ' · ' || o.number as label, 'payment'::text as source, p.id::text as ref
  from public.payments p join public.orders o on o.id = p.order_id
  where p.status = 'success' and p.kind in ('checkout', 'balance')
    and private.has_perm('expenses', 'view') and private.expense_categories() is null
  union all
  select p.confirmed_at, 'out', 'Refunds', p.amount, o.branch, coalesce(p.method, p.provider::text), 'Refund · ' || o.number, 'refund', p.id::text
  from public.payments p join public.orders o on o.id = p.order_id
  where p.status = 'success' and p.kind = 'refund'
    and private.has_perm('expenses', 'view') and private.expense_categories() is null
  union all
  select (sr.paid_on::timestamp at time zone 'UTC'), 'out', 'Salaries', sr.amount, 'both'::public.app_branch, coalesce(sr.method, 'cash'), 'Salary · ' || to_char(sr.month, 'Mon YYYY'), 'salary', sr.id::text
  from public.salary_records sr
  where sr.status = 'paid' and private.has_perm('salary', 'view') and private.has_perm('expenses', 'view') and private.expense_categories() is null
  union all
  select so.received_at, 'out', 'Supplier costs', c.agreed_cost, o.branch, 'supplier', 'Supplier order · ' || o.number, 'supplier_order', so.id::text
  from public.supplier_orders so
  join public.supplier_order_costs c on c.supplier_order_id = so.id
  join public.orders o on o.id = so.order_id
  where so.status = 'received' and private.has_perm('expenses', 'view') and private.can_use_category('supplier_costs')
  union all
  select (e.spent_on::timestamp at time zone 'UTC'), 'out',
         case e.category when 'supplier_costs' then 'Supplier costs' when 'delivery_and_riders' then 'Delivery and riders' when 'ads_and_promotion' then 'Ads and promotion'
                         when 'rent_and_utilities' then 'Rent and utilities' when 'packaging' then 'Packaging' else 'Other' end,
         e.amount, e.branch, e.method, coalesce(e.note, 'Expense'), 'expense', e.id::text
  from public.expenses e;

create or replace function public.money_summary(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_in numeric(14, 2);
  v_out numeric(14, 2);
  v_owed numeric(14, 2);
  v_refunds numeric(14, 2);
  v_salaries numeric(14, 2) := 0;
  v_cats jsonb;
begin
  if not private.has_perm('expenses', 'view') or private.expense_categories() is not null then
    raise exception 'You cannot see the money summary' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose a valid period'; end if;

  select coalesce(sum(p.amount), 0) into v_in from public.payments p
    where p.status = 'success' and p.kind in ('checkout', 'balance') and p.confirmed_at >= p_from and p.confirmed_at < p_to + 1;
  select coalesce(sum(p.amount), 0) into v_refunds from public.payments p
    where p.status = 'success' and p.kind = 'refund' and p.confirmed_at >= p_from and p.confirmed_at < p_to + 1;
  -- salaries are only counted for people who may see them, so Admin's totals never include pay they cannot look up
  if private.has_perm('salary', 'view') then
    select coalesce(sum(amount), 0) into v_salaries from public.salary_records where status = 'paid' and paid_on between p_from and p_to;
  end if;
  select coalesce((select sum(c.agreed_cost) from public.supplier_orders so join public.supplier_order_costs c on c.supplier_order_id = so.id
                   where so.status = 'received' and so.received_at >= p_from and so.received_at < p_to + 1), 0)
       + coalesce((select sum(e.amount) from public.expenses e where e.spent_on between p_from and p_to), 0) + v_refunds + v_salaries into v_out;
  select coalesce(sum(balance_due), 0) into v_owed from public.orders where payment_state = 'part_paid' and status <> 'cancelled';

  select coalesce(jsonb_agg(jsonb_build_object('category', category, 'amount', amount) order by amount desc), '[]'::jsonb) into v_cats from (
    select 'Supplier costs' as category, sum(c.agreed_cost) as amount from public.supplier_orders so join public.supplier_order_costs c on c.supplier_order_id = so.id
      where so.status = 'received' and so.received_at >= p_from and so.received_at < p_to + 1
    union all
    select case e.category when 'supplier_costs' then 'Supplier costs' when 'delivery_and_riders' then 'Delivery and riders' when 'ads_and_promotion' then 'Ads and promotion'
                           when 'rent_and_utilities' then 'Rent and utilities' when 'packaging' then 'Packaging' else 'Other' end, sum(e.amount)
      from public.expenses e where e.spent_on between p_from and p_to group by e.category
    union all
    select 'Refunds', nullif(v_refunds, 0)
    union all
    select 'Salaries', nullif(v_salaries, 0)
  ) x where amount is not null;

  return jsonb_build_object('money_in', v_in, 'money_out', v_out, 'net', v_in - v_out, 'balances_to_collect', v_owed, 'out_by_category', v_cats);
end $$;
grant execute on function public.money_summary(date, date) to authenticated;
