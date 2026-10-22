-- Money records (PRD section 17): one ledger of every cedi in and out.
--   * Money in: each confirmed payment (checkout and balance).
--   * Money out: supplier costs (when the supplier order is received) and expenses entered here.
-- The ledger is a VIEW over those tables, so every payment and supplier cost appears exactly once and can never drift
-- from the order it belongs to. The view runs with the caller's rights, so it shows only what each role may already read.

create type public.expense_category as enum (
  'supplier_costs', 'delivery_and_riders', 'ads_and_promotion', 'rent_and_utilities', 'packaging', 'other'
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  category public.expense_category not null,
  amount numeric(12, 2) not null check (amount > 0),
  spent_on date not null default current_date,
  branch public.app_branch not null default 'both',
  method text not null default 'cash' check (method in ('cash', 'momo', 'card', 'bank')),
  note text,
  receipt_path text,
  created_by uuid references auth.users (id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);
create index expenses_date_idx on public.expenses (spent_on desc);

-- A role's expense limit is written in the permission matrix ("Supplier costs only", "Delivery costs only").
-- This turns that wording into the categories the role may touch. No limit means all categories.
create or replace function private.expense_categories() returns public.expense_category[]
language sql stable security definer set search_path = '' as $$
  select case
    when rp.restriction is null then null
    when rp.restriction ilike 'supplier%' then array['supplier_costs']::public.expense_category[]
    when rp.restriction ilike 'delivery%' then array['delivery_and_riders']::public.expense_category[]
    else array[]::public.expense_category[]
  end
  from public.role_permissions rp where rp.role_id = private.my_role() and rp.module = 'expenses'
$$;
revoke execute on function private.expense_categories() from public, anon;
grant execute on function private.expense_categories() to authenticated;

create or replace function private.can_use_category(c public.expense_category) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.expense_categories() is null or c = any (private.expense_categories()), false)
$$;
revoke execute on function private.can_use_category(public.expense_category) from public, anon;
grant execute on function private.can_use_category(public.expense_category) to authenticated;

alter table public.expenses enable row level security;
create policy expenses_read on public.expenses for select to authenticated
  using (private.has_perm('expenses', 'view') and private.can_use_category(category));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (private.has_perm('expenses', 'create') and private.can_use_category(category) and created_by = auth.uid());
create policy expenses_update on public.expenses for update to authenticated
  using (private.has_perm('expenses', 'edit') and private.can_use_category(category) and created_by = auth.uid())
  with check (private.has_perm('expenses', 'edit') and private.can_use_category(category));
create policy expenses_delete on public.expenses for delete to authenticated
  using (private.has_perm('expenses', 'delete'));

revoke all on public.expenses from anon, public;
grant select, insert, update, delete on public.expenses to authenticated;
create trigger expenses_audit after insert or update or delete on public.expenses for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- The ledger
-- ---------------------------------------------------------------------------
create view public.money_ledger with (security_invoker = true) as
  select p.confirmed_at as at, 'in'::text as direction, 'Sales'::text as category, p.amount as amount, o.branch as branch,
         coalesce(p.method, p.provider::text) as method,
         case when p.kind = 'balance' then 'Balance collected' else 'Payment' end || ' · ' || o.number as label, 'payment'::text as source, p.id::text as ref
  from public.payments p join public.orders o on o.id = p.order_id
  where p.status = 'success' and p.kind in ('checkout', 'balance')
    and private.has_perm('expenses', 'view') and private.expense_categories() is null  -- roles limited to one category never see sales
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

revoke all on public.money_ledger from anon, public;
grant select on public.money_ledger to authenticated;

-- Totals for a period (FR cash-flow summary). Roles limited to one expense category do not get company-wide totals.
create or replace function public.money_summary(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_in numeric(14, 2);
  v_out numeric(14, 2);
  v_owed numeric(14, 2);
  v_cats jsonb;
begin
  if not private.has_perm('expenses', 'view') or private.expense_categories() is not null then
    raise exception 'You cannot see the money summary' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose a valid period'; end if;

  select coalesce(sum(p.amount), 0) into v_in from public.payments p
    where p.status = 'success' and p.kind in ('checkout', 'balance') and p.confirmed_at >= p_from and p.confirmed_at < p_to + 1;
  select coalesce((select sum(c.agreed_cost) from public.supplier_orders so join public.supplier_order_costs c on c.supplier_order_id = so.id
                   where so.status = 'received' and so.received_at >= p_from and so.received_at < p_to + 1), 0)
       + coalesce((select sum(e.amount) from public.expenses e where e.spent_on between p_from and p_to), 0) into v_out;
  select coalesce(sum(balance_due), 0) into v_owed from public.orders where payment_state = 'part_paid' and status <> 'cancelled';

  select coalesce(jsonb_agg(jsonb_build_object('category', category, 'amount', amount) order by amount desc), '[]'::jsonb) into v_cats from (
    select 'Supplier costs' as category, sum(c.agreed_cost) as amount from public.supplier_orders so join public.supplier_order_costs c on c.supplier_order_id = so.id
      where so.status = 'received' and so.received_at >= p_from and so.received_at < p_to + 1
    union all
    select case e.category when 'supplier_costs' then 'Supplier costs' when 'delivery_and_riders' then 'Delivery and riders' when 'ads_and_promotion' then 'Ads and promotion'
                           when 'rent_and_utilities' then 'Rent and utilities' when 'packaging' then 'Packaging' else 'Other' end, sum(e.amount)
      from public.expenses e where e.spent_on between p_from and p_to group by e.category
  ) x where amount is not null;

  return jsonb_build_object('money_in', v_in, 'money_out', v_out, 'net', v_in - v_out, 'balances_to_collect', v_owed, 'out_by_category', v_cats);
end $$;
revoke execute on function public.money_summary(date, date) from public, anon;
grant execute on function public.money_summary(date, date) to authenticated;
