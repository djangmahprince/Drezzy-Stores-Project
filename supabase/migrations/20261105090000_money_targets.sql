-- Money (PRD FR-FIN-003 to FR-FIN-010) and targets (PRD section 15).
--   Money: other money in, expense receipts, payslip fields, month close with an Owner-only logged unlock, budgets with an
--   80% alert, and the profit report by month and branch.
--   Targets: owners other than one person (role, team, branch, everyone, partner), weights, pause and close with a
--   logged reason, comments, check-in metrics, the Daily Plan, scorecards, weekly summaries, starter templates and a
--   leaderboard that is off until the Owner switches it on.

-- ---------------------------------------------------------------------------
-- Labels for expense categories (one place, used by the ledger, summary and budgets)
-- ---------------------------------------------------------------------------
create or replace function private.expense_label(c public.expense_category) returns text
language sql immutable as $$
  select case c::text
    when 'supplier_costs' then 'Supplier costs' when 'delivery_and_riders' then 'Delivery and riders' when 'ads_and_promotion' then 'Ads and promotion'
    when 'rent_and_utilities' then 'Rent' when 'utilities' then 'Utilities' when 'packaging' then 'Packaging'
    when 'data_and_airtime' then 'Data and airtime' when 'software_and_hosting' then 'Software and hosting' else 'Other' end
$$;

-- ---------------------------------------------------------------------------
-- Other money in (owner top-ups and similar, FR-FIN-004)
-- ---------------------------------------------------------------------------
create table public.money_in_entries (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12, 2) not null check (amount > 0),
  received_on date not null default current_date,
  branch public.app_branch not null default 'both',
  method text not null default 'momo' check (method in ('cash', 'momo', 'card', 'bank')),
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  created_by uuid references auth.users (id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);
alter table public.money_in_entries enable row level security;
create policy money_in_read on public.money_in_entries for select to authenticated using (private.has_perm('expenses', 'view') and private.expense_categories() is null);
create policy money_in_write on public.money_in_entries for insert to authenticated
  with check (private.has_perm('expenses', 'create') and private.expense_categories() is null and created_by = auth.uid());
create policy money_in_delete on public.money_in_entries for delete to authenticated using (private.has_perm('expenses', 'delete'));
revoke all on public.money_in_entries from anon, authenticated, public;
grant select, insert, delete on public.money_in_entries to authenticated;
create trigger money_in_audit after insert or update or delete on public.money_in_entries for each row execute function private.audit_row();

-- Expenses can be linked to an ad campaign (cost per order by channel) once campaigns exist (analytics migration).
alter table public.expenses add column if not exists campaign text check (char_length(campaign) <= 80);

-- Salary records: allowances, deductions and the payment reference for the payslip (FR-FIN-007).
alter table public.salary_records
  add column if not exists allowances numeric(12, 2) not null default 0 check (allowances >= 0),
  add column if not exists deductions numeric(12, 2) not null default 0 check (deductions >= 0),
  add column if not exists reference text check (char_length(reference) <= 80);

create or replace function private.guard_salary() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null and current_user not in ('anon', 'authenticated') then return new; end if;
  if old.status = 'paid' and (new.status <> 'paid' or new.amount <> old.amount or new.staff_id <> old.staff_id or new.month <> old.month
      or new.paid_on is distinct from old.paid_on or new.allowances <> old.allowances or new.deductions <> old.deductions) then
    raise exception 'A paid salary cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Month close (FR-FIN-009): a closed month's figures cannot change until the Owner unlocks it, which is logged.
-- ---------------------------------------------------------------------------
create table public.month_closes (
  month date primary key check (month = date_trunc('month', month)::date),
  closed_by uuid references auth.users (id) on delete set null,
  closed_by_name text,
  closed_at timestamptz not null default now(),
  note text
);
create table public.month_close_log (
  id bigint generated always as identity primary key,
  month date not null,
  action text not null check (action in ('closed', 'unlocked')),
  by_id uuid references auth.users (id) on delete set null,
  by_name text,
  reason text,
  at timestamptz not null default now()
);
alter table public.month_closes enable row level security;
alter table public.month_close_log enable row level security;
create policy month_closes_read on public.month_closes for select to authenticated using (private.has_perm('expenses', 'view'));
create policy month_close_log_read on public.month_close_log for select to authenticated using (private.has_perm('expenses', 'view') and private.expense_categories() is null);
revoke all on public.month_closes, public.month_close_log from anon, authenticated, public;
grant select on public.month_closes, public.month_close_log to authenticated;

create or replace function private.month_is_closed(p_day date) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_day is not null and exists (select 1 from public.month_closes where month = date_trunc('month', p_day)::date)
$$;

create or replace function private.guard_closed_month() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old date;
  v_new date;
begin
  if tg_table_name = 'expenses' then
    v_old := case when tg_op <> 'INSERT' then old.spent_on end; v_new := case when tg_op <> 'DELETE' then new.spent_on end;
  elsif tg_table_name = 'money_in_entries' then
    v_old := case when tg_op <> 'INSERT' then old.received_on end; v_new := case when tg_op <> 'DELETE' then new.received_on end;
  elsif tg_table_name = 'salary_records' then
    v_old := case when tg_op <> 'INSERT' then coalesce(old.paid_on, old.month) end; v_new := case when tg_op <> 'DELETE' then coalesce(new.paid_on, new.month) end;
  elsif tg_table_name = 'rider_cash_handovers' then
    v_old := case when tg_op <> 'INSERT' then old.day end; v_new := case when tg_op <> 'DELETE' then new.day end;
  end if;
  if private.month_is_closed(v_old) or private.month_is_closed(v_new) then
    raise exception 'That month is closed. Ask the Owner to unlock it first' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger expenses_closed before insert or update or delete on public.expenses for each row execute function private.guard_closed_month();
create trigger money_in_closed before insert or update or delete on public.money_in_entries for each row execute function private.guard_closed_month();
create trigger salary_closed before insert or update or delete on public.salary_records for each row execute function private.guard_closed_month();
create trigger handovers_closed before insert or update or delete on public.rider_cash_handovers for each row execute function private.guard_closed_month();

create or replace function public.close_month(p_month date, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', p_month)::date;
begin
  if not (private.has_perm('expenses', 'delete') and private.expense_categories() is null) then raise exception 'Only Finance or the Owner can close a month' using errcode = '42501'; end if;
  if v_month >= date_trunc('month', current_date)::date then raise exception 'Only a month that has ended can be closed'; end if;
  insert into public.month_closes (month, closed_by, closed_by_name, note) values (v_month, auth.uid(), private.staff_name(), nullif(btrim(coalesce(p_note, '')), ''));
  insert into public.month_close_log (month, action, by_id, by_name, reason) values (v_month, 'closed', auth.uid(), private.staff_name(), nullif(btrim(coalesce(p_note, '')), ''));
exception when unique_violation then
  raise exception 'That month is already closed';
end $$;

create or replace function public.unlock_month(p_month date, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', p_month)::date;
begin
  if not private.is_owner() then raise exception 'Only the Owner can unlock a closed month' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason for unlocking'; end if;
  delete from public.month_closes where month = v_month;
  if not found then raise exception 'That month is not closed'; end if;
  insert into public.month_close_log (month, action, by_id, by_name, reason) values (v_month, 'unlocked', auth.uid(), private.staff_name(), btrim(p_reason));
end $$;

-- ---------------------------------------------------------------------------
-- Budgets (FR-FIN-010): per expense category, for every month or one month. Alerts at 80% come from the scheduled checks.
-- ---------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  category public.expense_category not null,
  month date check (month is null or month = date_trunc('month', month)::date),
  amount numeric(12, 2) not null check (amount > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index budgets_unique on public.budgets (category, coalesce(month, '1900-01-01'::date));
alter table public.budgets enable row level security;
create policy budgets_read on public.budgets for select to authenticated using (private.has_perm('expenses', 'view') and private.expense_categories() is null);
create policy budgets_write on public.budgets for all to authenticated
  using (private.has_perm('expenses', 'delete') and private.expense_categories() is null)
  with check (private.has_perm('expenses', 'delete') and private.expense_categories() is null);
revoke all on public.budgets from anon, authenticated, public;
grant select, insert, update, delete on public.budgets to authenticated;
create trigger budgets_audit after insert or update or delete on public.budgets for each row execute function private.audit_row();

create or replace function public.budget_status(p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', p_month)::date;
begin
  if not (private.has_perm('expenses', 'view') and private.expense_categories() is null) then raise exception 'You cannot see budgets' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('category', c, 'label', private.expense_label(c), 'budget', b, 'spent', s, 'pct', case when b > 0 then round(s * 100 / b) end) order by c::text)
    from (
      select cat as c,
        coalesce((select amount from public.budgets where category = cat and month = v_month), (select amount from public.budgets where category = cat and month is null)) as b,
        coalesce((select sum(amount) from public.expenses where category = cat and spent_on >= v_month and spent_on < (v_month + interval '1 month')::date), 0)
          + case when cat::text = 'supplier_costs' then coalesce((select sum(c2.agreed_cost) from public.supplier_orders so join public.supplier_order_costs c2 on c2.supplier_order_id = so.id
                                                      where so.status = 'received' and so.received_at >= v_month and so.received_at < v_month + interval '1 month'), 0) else 0 end as s
      from unnest(enum_range(null::public.expense_category)) cat
    ) x where b is not null), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- The ledger and the summary, now with other money in, net salaries and every category label
-- ---------------------------------------------------------------------------
create or replace view public.money_ledger with (security_invoker = true) as
  select p.confirmed_at as at, 'in'::text as direction, 'Sales'::text as category, p.amount as amount, o.branch as branch,
         coalesce(p.method, p.provider::text) as method,
         case when p.kind = 'balance' then 'Balance collected' else 'Payment' end || ' · ' || o.number as label, 'payment'::text as source, p.id::text as ref
  from public.payments p join public.orders o on o.id = p.order_id
  where p.status = 'success' and p.kind in ('checkout', 'balance')
    and private.has_perm('expenses', 'view') and private.expense_categories() is null
  union all
  select (m.received_on::timestamp at time zone 'UTC'), 'in', 'Other money in', m.amount, m.branch, m.method, m.reason, 'money_in', m.id::text
  from public.money_in_entries m
  union all
  select p.confirmed_at, 'out', 'Refunds', p.amount, o.branch, coalesce(p.method, p.provider::text), 'Refund · ' || o.number, 'refund', p.id::text
  from public.payments p join public.orders o on o.id = p.order_id
  where p.status = 'success' and p.kind = 'refund'
    and private.has_perm('expenses', 'view') and private.expense_categories() is null
  union all
  select (sr.paid_on::timestamp at time zone 'UTC'), 'out', 'Salaries', (sr.amount + sr.allowances - sr.deductions)::numeric(12, 2), 'both'::public.app_branch, coalesce(sr.method, 'cash'),
         'Salary · ' || to_char(sr.month, 'Mon YYYY'), 'salary', sr.id::text
  from public.salary_records sr
  where sr.status = 'paid' and private.has_perm('salary', 'view') and private.has_perm('expenses', 'view') and private.expense_categories() is null
  union all
  select so.received_at, 'out', 'Supplier costs', c.agreed_cost, o.branch, 'supplier', 'Supplier order · ' || o.number, 'supplier_order', so.id::text
  from public.supplier_orders so
  join public.supplier_order_costs c on c.supplier_order_id = so.id
  join public.orders o on o.id = so.order_id
  where so.status = 'received' and private.has_perm('expenses', 'view') and private.can_use_category('supplier_costs')
  union all
  select (e.spent_on::timestamp at time zone 'UTC'), 'out', private.expense_label(e.category), e.amount, e.branch, e.method, coalesce(e.note, 'Expense'), 'expense', e.id::text
  from public.expenses e;

create or replace function public.money_summary(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_in numeric(14, 2);
  v_other numeric(14, 2);
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
  select coalesce(sum(amount), 0) into v_other from public.money_in_entries where received_on between p_from and p_to;
  select coalesce(sum(p.amount), 0) into v_refunds from public.payments p
    where p.status = 'success' and p.kind = 'refund' and p.confirmed_at >= p_from and p.confirmed_at < p_to + 1;
  if private.has_perm('salary', 'view') then
    select coalesce(sum(amount + allowances - deductions), 0) into v_salaries from public.salary_records where status = 'paid' and paid_on between p_from and p_to;
  end if;
  select coalesce((select sum(c.agreed_cost) from public.supplier_orders so join public.supplier_order_costs c on c.supplier_order_id = so.id
                   where so.status = 'received' and so.received_at >= p_from and so.received_at < p_to + 1), 0)
       + coalesce((select sum(e.amount) from public.expenses e where e.spent_on between p_from and p_to), 0) + v_refunds + v_salaries into v_out;
  select coalesce(sum(balance_due), 0) into v_owed from public.orders where payment_state = 'part_paid' and status <> 'cancelled';

  select coalesce(jsonb_agg(jsonb_build_object('category', category, 'amount', amount) order by amount desc), '[]'::jsonb) into v_cats from (
    select 'Supplier costs' as category, sum(c.agreed_cost) as amount from public.supplier_orders so join public.supplier_order_costs c on c.supplier_order_id = so.id
      where so.status = 'received' and so.received_at >= p_from and so.received_at < p_to + 1
    union all
    select private.expense_label(e.category), sum(e.amount) from public.expenses e where e.spent_on between p_from and p_to group by e.category
    union all select 'Refunds', nullif(v_refunds, 0)
    union all select 'Salaries', nullif(v_salaries, 0)
  ) x where amount is not null;

  return jsonb_build_object('money_in', v_in + v_other, 'sales_in', v_in, 'other_in', v_other, 'money_out', v_out, 'net', v_in + v_other - v_out,
    'balances_to_collect', v_owed, 'out_by_category', v_cats, 'closed', private.month_is_closed(p_from) and date_trunc('month', p_from) = date_trunc('month', p_to));
end $$;

-- Profit by month and branch (FR-FIN-008): net sales minus supplier costs, expenses and salaries. Owner and Finance.
create or replace function public.profit_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.has_perm('expenses', 'view') and private.expense_categories() is null and private.has_perm('salary', 'view')) then
    raise exception 'The profit report is for the Owner and Finance' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 800 then raise exception 'Choose a valid period'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('month', m, 'branch', b, 'net_sales', ns, 'supplier_costs', sc, 'expenses', ex, 'salaries', sa,
      'profit', ns - sc - ex - sa) order by m, b)
    from (
      select m, b,
        coalesce((select sum(o.total) from public.orders o where o.amount_paid > 0 and o.status <> 'cancelled' and date_trunc('month', o.created_at)::date = m and o.branch::text = b), 0)
          - coalesce((select sum(p.amount) from public.payments p join public.orders o on o.id = p.order_id where p.kind = 'refund' and p.status = 'success'
                      and date_trunc('month', p.confirmed_at)::date = m and o.branch::text = b), 0) as ns,
        coalesce((select sum(c.agreed_cost) from public.supplier_orders so join public.supplier_order_costs c on c.supplier_order_id = so.id join public.orders o on o.id = so.order_id
                  where so.status = 'received' and date_trunc('month', so.received_at)::date = m and o.branch::text = b), 0) as sc,
        coalesce((select sum(e.amount) from public.expenses e where date_trunc('month', e.spent_on)::date = m and e.branch::text = b), 0) as ex,
        coalesce((select sum(s.amount + s.allowances - s.deductions) from public.salary_records s where s.status = 'paid' and date_trunc('month', s.paid_on)::date = m and b = 'both'), 0) as sa
      from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') g(mm)
      cross join lateral (select g.mm::date as m) mm
      cross join (values ('accra'), ('kumasi'), ('both')) br(b)
    ) x), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Targets: owners, weights, status, check-ins and comments
-- ---------------------------------------------------------------------------
alter table public.targets
  add column if not exists owner_kind text not null default 'person' check (owner_kind in ('person', 'role', 'team', 'branch', 'everyone', 'partner')),
  add column if not exists role_key text,
  add column if not exists branch public.app_branch,
  add column if not exists team text,
  add column if not exists weight numeric(5, 2) not null default 1 check (weight > 0 and weight <= 10),
  add column if not exists status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  add column if not exists check_in_label text check (char_length(check_in_label) <= 60),
  add column if not exists change_reason text;
-- old rows: a target with no person was for the whole team
update public.targets set owner_kind = 'everyone' where staff_id is null and rider_id is null and owner_kind = 'person';
alter table public.targets add constraint targets_owner_shape check (
  (owner_kind = 'person' and staff_id is not null) or (owner_kind = 'role' and role_key is not null) or (owner_kind = 'team' and team is not null)
  or (owner_kind = 'branch' and branch is not null) or (owner_kind = 'everyone') or (owner_kind = 'partner' and rider_id is not null));
alter table public.targets add constraint targets_check_in_label check (metric::text <> 'check_in' or check_in_label is not null);

-- Older callers insert a target with no owner kind: no person means the whole team, a rider means a partner.
create or replace function private.target_defaults() returns trigger
language plpgsql as $$
begin
  if new.owner_kind = 'person' and new.staff_id is null then
    new.owner_kind := case when new.rider_id is not null then 'partner' else 'everyone' end;
  end if;
  return new;
end $$;
create trigger targets_defaults before insert on public.targets for each row execute function private.target_defaults();

-- Changing a goal, period or status needs a reason, which the audit log keeps with the old and new values (PRD section 15).
create or replace function private.guard_targets() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null and current_user not in ('anon', 'authenticated') then return new; end if;
  if (new.goal, new.period_start, new.period_end, new.status, new.weight) is distinct from (old.goal, old.period_start, old.period_end, old.status, old.weight)
     and (new.change_reason is null or new.change_reason is not distinct from old.change_reason or char_length(btrim(new.change_reason)) < 3) then
    raise exception 'Give a reason for changing the target' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger targets_guard before update on public.targets for each row execute function private.guard_targets();

create table public.target_comments (
  id bigint generated always as identity primary key,
  target_id uuid references public.targets (id) on delete cascade,
  staff_id uuid references public.staff (id) on delete cascade, -- a comment on someone's week
  week_start date,
  author_id uuid references auth.users (id) on delete set null,
  author_name text,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  at timestamptz not null default now(),
  check (target_id is not null or (staff_id is not null and week_start is not null))
);
alter table public.target_comments enable row level security;
create policy target_comments_read on public.target_comments for select to authenticated using (
  private.has_perm('targets_set', 'view') or staff_id = auth.uid() or exists (select 1 from public.targets t where t.id = target_id and t.staff_id = auth.uid()));
create policy target_comments_write on public.target_comments for insert to authenticated with check (private.has_perm('targets_set', 'edit') and author_id = auth.uid());
revoke all on public.target_comments from anon, authenticated, public;
grant select, insert on public.target_comments to authenticated;

-- ---------------------------------------------------------------------------
-- Daily Plan and check-ins (PRD daily routine)
-- ---------------------------------------------------------------------------
create table public.daily_plans (
  staff_id uuid not null default auth.uid() references public.staff (id) on delete cascade,
  plan_date date not null default current_date,
  lines text[] not null check (array_length(lines, 1) between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (staff_id, plan_date)
);
alter table public.daily_plans enable row level security;
create policy plans_read on public.daily_plans for select to authenticated using ((staff_id = auth.uid() and private.is_staff()) or private.has_perm('targets_set', 'view'));
create policy plans_write on public.daily_plans for insert to authenticated with check (staff_id = auth.uid() and private.is_staff() and plan_date = current_date);
create policy plans_update on public.daily_plans for update to authenticated using (staff_id = auth.uid() and plan_date = current_date) with check (staff_id = auth.uid() and plan_date = current_date);
revoke all on public.daily_plans from anon, authenticated, public;
grant select, insert, update on public.daily_plans to authenticated;

alter table public.daily_reports
  add column if not exists checkins jsonb not null default '{}'::jsonb check (jsonb_typeof(checkins) = 'object'),
  add column if not exists auto_numbers jsonb;

-- ---------------------------------------------------------------------------
-- Measuring targets
-- ---------------------------------------------------------------------------
-- The staff a target belongs to (null = everyone, for whole-team targets).
create or replace function private.target_people(t public.targets) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select case t.owner_kind
    when 'person' then array[t.staff_id]
    when 'role' then (select coalesce(array_agg(s.id), '{}') from public.staff s join public.roles r on r.id = s.role_id where r.key = t.role_key)
    when 'team' then (select coalesce(array_agg(s.id), '{}') from public.staff s where s.team = t.team)
    else null end
$$;

create or replace function private.target_value(t public.targets) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  v_people uuid[] := private.target_people(t);
  v_branch text := case when t.owner_kind = 'branch' then t.branch::text end;
  v_from date := t.period_start;
  v_to date := t.period_end;
  v_done int;
  v_on int;
begin
  case t.metric::text
    when 'paid_sales' then
      return coalesce((select sum(o.amount_paid) from public.orders o where o.status <> 'cancelled' and o.created_at >= v_from and o.created_at < v_to + 1
        and (v_people is null or o.assigned_agent_id = any (v_people) or o.created_by = any (v_people)) and (v_branch is null or o.branch::text = v_branch)), 0);
    when 'orders' then
      return coalesce((select count(*) from public.orders o where o.status <> 'cancelled' and o.amount_paid > 0 and o.created_at >= v_from and o.created_at < v_to + 1
        and (v_people is null or o.assigned_agent_id = any (v_people) or o.created_by = any (v_people)) and (v_branch is null or o.branch::text = v_branch)), 0);
    when 'deliveries' then
      return coalesce((select count(*) from public.orders o where o.status = 'delivered' and coalesce(o.delivered_at, o.updated_at) >= v_from and coalesce(o.delivered_at, o.updated_at) < v_to + 1
        and (t.owner_kind <> 'partner' or o.rider_id = t.rider_id) and (v_people is null or o.assigned_dispatch_id = any (v_people)) and (v_branch is null or o.branch::text = v_branch)), 0);
    when 'on_time_deliveries' then
      select count(*), count(*) filter (where coalesce(o.delivered_at, o.updated_at)::date <= o.est_delivery_date) into v_done, v_on
        from public.orders o where o.status = 'delivered' and coalesce(o.delivered_at, o.updated_at) >= v_from and coalesce(o.delivered_at, o.updated_at) < v_to + 1
        and (t.owner_kind <> 'partner' or o.rider_id = t.rider_id) and (v_people is null or o.assigned_dispatch_id = any (v_people)) and (v_branch is null or o.branch::text = v_branch);
      return case when v_done = 0 then 0 else round(v_on * 100.0 / v_done, 1) end;
    when 'supplier_orders' then
      return coalesce((select count(*) from public.supplier_orders s join public.orders o on o.id = s.order_id where s.ordered_at >= v_from and s.ordered_at < v_to + 1
        and (v_people is null or s.staff_id = any (v_people)) and (v_branch is null or o.branch::text = v_branch)), 0);
    when 'reports' then
      return coalesce((select count(*) from public.daily_reports r where r.report_date between v_from and v_to and (v_people is null or r.staff_id = any (v_people))), 0);
    when 'balances_collected' then
      return coalesce((select sum(p.amount) from public.payments p join public.orders o on o.id = p.order_id where p.kind = 'balance' and p.status = 'success'
        and p.confirmed_at >= v_from and p.confirmed_at < v_to + 1 and (t.owner_kind <> 'partner' or p.collected_by_rider = t.rider_id)
        and (v_people is null or p.checked_by = any (v_people)) and (v_branch is null or o.branch::text = v_branch)), 0);
    when 'articles_published' then
      return coalesce((select count(*) from public.articles a where a.status = 'published' and a.publish_at >= v_from and a.publish_at < v_to + 1
        and (v_people is null or a.author_id = any (v_people))), 0);
    when 'check_in' then
      return coalesce((select sum((r.checkins ->> t.check_in_label)::numeric) from public.daily_reports r
        where r.report_date between v_from and v_to and (v_people is null or r.staff_id = any (v_people)) and (r.checkins ->> t.check_in_label) ~ '^[0-9]+(\.[0-9]+)?$'), 0);
    else
      return 0;
  end case;
end $$;

-- Kept for older callers: the value for one person (or everyone) over a period.
create or replace function private.target_actual(p_metric public.target_metric, p_staff uuid, p_from date, p_to date) returns numeric
language sql stable security definer set search_path = '' as $$
  select private.target_value(row(null, p_staff, p_metric, 1, p_from, p_to, null, null, now(), null,
    case when p_staff is null then 'everyone' else 'person' end, null, null, null, 1, 'active', null, null)::public.targets)
$$;

-- The owner of a target in words.
create or replace function private.target_owner_label(t public.targets) returns text
language sql stable security definer set search_path = '' as $$
  select case t.owner_kind
    when 'person' then (select full_name from public.staff where id = t.staff_id)
    when 'role' then coalesce((select name from public.roles where key = t.role_key), t.role_key) || ' (role)'
    when 'team' then 'Team ' || t.team
    when 'branch' then initcap(t.branch::text) || ' branch'
    when 'partner' then (select name from public.riders where id = t.rider_id) || ' (partner)'
    else 'Whole team' end
$$;

-- Can the caller see this target? Managers see all; others see their own, their role's, team's and branch's, and everyone's.
create or replace function private.can_see_target(t public.targets) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_perm('targets_set', 'view')
    or (private.has_perm('targets_view', 'view') and (private.perm_scope('targets_view') = 'all' or t.owner_kind = 'everyone'
        or (t.owner_kind = 'person' and t.staff_id = auth.uid())
        or (t.owner_kind = 'role' and t.role_key = private.role_key(private.my_role()))
        or (t.owner_kind = 'team' and t.team = (select team from public.staff where id = auth.uid()))
        or (t.owner_kind = 'branch' and (select branch from public.staff where id = auth.uid()) in (t.branch, 'both'))))
$$;

drop policy if exists targets_read on public.targets;
create policy targets_read on public.targets for select to authenticated using (private.can_see_target(targets));

create or replace function public.target_progress(p_date date default current_date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.has_perm('targets_set', 'view') or private.has_perm('targets_view', 'view')) then
    raise exception 'You cannot see targets' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'staff_id', t.staff_id, 'staff', private.target_owner_label(t), 'owner_kind', t.owner_kind, 'metric', t.metric, 'goal', t.goal,
      'actual', private.target_value(t), 'from', t.period_start, 'to', t.period_end, 'note', t.note, 'weight', t.weight, 'status', t.status,
      'label', t.check_in_label,
      'elapsed', least(1, greatest(0, (p_date - t.period_start + 1)::numeric / (t.period_end - t.period_start + 1)))
    ) order by t.status, t.period_end desc)
    from public.targets t
    where t.period_end >= p_date - 31 and private.can_see_target(t)), '[]'::jsonb);
end $$;

-- Pause, close, or adjust a target with a reason (FR-TG-001).
create or replace function public.adjust_target(p_id uuid, p jsonb, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_perm('targets_set', 'edit') then raise exception 'You cannot change targets' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason for the change'; end if;
  update public.targets set
    goal = coalesce((p ->> 'goal')::numeric, goal),
    period_start = coalesce((p ->> 'from')::date, period_start),
    period_end = coalesce((p ->> 'to')::date, period_end),
    status = coalesce(nullif(p ->> 'status', ''), status),
    weight = coalesce((p ->> 'weight')::numeric, weight),
    change_reason = btrim(p_reason) || ' · ' || to_char(now(), 'YYYY-MM-DD HH24:MI')
  where id = p_id;
  if not found then raise exception 'Target not found'; end if;
end $$;

-- Starter targets per role for a week (FR-TG-005, PRD section 15 table). Existing ones are not duplicated.
create or replace function public.apply_starter_targets(p_week_start date, p_sales_goal numeric) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_from date := p_week_start;
  v_to date := p_week_start + 6;
  r record;
  v_n int := 0;
begin
  if not private.has_perm('targets_set', 'create') then raise exception 'You cannot set targets' using errcode = '42501'; end if;
  if p_sales_goal is null or p_sales_goal <= 0 then raise exception 'Enter the weekly sales goal for each Sales Agent'; end if;
  for r in
    select s.id, ro.key, x.metric, x.goal, x.label from public.staff s join public.roles ro on ro.id = s.role_id
    cross join lateral (values
      ('sales_agent', 'paid_sales', p_sales_goal, null), ('sales_agent', 'reports', 5, null),
      ('sourcing_officer', 'supplier_orders', 10, null), ('sourcing_officer', 'reports', 5, null),
      ('dispatch_coordinator', 'on_time_deliveries', 90, null), ('dispatch_coordinator', 'reports', 5, null),
      ('content_editor', 'articles_published', 2, null), ('content_editor', 'check_in', 5, 'Social posts'),
      ('customer_support', 'check_in', 90, 'Chats answered within 1 hour (%)'), ('customer_support', 'reports', 5, null),
      ('finance', 'check_in', 100, 'Payments checked within 4 hours (%)'), ('finance', 'reports', 5, null)
    ) x(role_key, metric, goal, label)
    where s.active and s.employment_status = 'active' and ro.key = x.role_key
  loop
    if not exists (select 1 from public.targets t where t.owner_kind = 'person' and t.staff_id = r.id and t.metric::text = r.metric and t.period_start = v_from and t.period_end = v_to
                   and coalesce(t.check_in_label, '') = coalesce(r.label, '')) then
      insert into public.targets (owner_kind, staff_id, metric, goal, period_start, period_end, note, set_by, check_in_label)
      values ('person', r.id, r.metric::public.target_metric, r.goal, v_from, v_to, 'Starter target', auth.uid(), r.label);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- Working days in a period (Monday to Saturday; shops are closed on Sunday by DEFAULT).
create or replace function private.working_days(p_from date, p_to date) returns int
language sql immutable as $$
  select count(*)::int from generate_series(p_from, p_to, interval '1 day') d where extract(isodow from d) < 7
$$;

-- Staff scorecard (FR-TG-006, FR-TG-009): weighted attainment, trend, on-time rate and report completion.
create or replace function public.staff_scorecard(p_staff uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_len int := p_to - p_from + 1;
  v_score numeric;
  v_prev numeric;
  v_reports int;
  v_done int; v_on int;
begin
  if not (private.has_perm('targets_set', 'view') or p_staff = auth.uid()) then raise exception 'You cannot see this scorecard' using errcode = '42501'; end if;
  select round(sum(t.weight * least(private.target_value(t) / t.goal, 1.5)) * 100 / nullif(sum(t.weight), 0), 1) into v_score
    from public.targets t where t.owner_kind = 'person' and t.staff_id = p_staff and t.status <> 'paused' and t.period_start <= p_to and t.period_end >= p_from;
  select round(sum(t.weight * least(private.target_value(t) / t.goal, 1.5)) * 100 / nullif(sum(t.weight), 0), 1) into v_prev
    from public.targets t where t.owner_kind = 'person' and t.staff_id = p_staff and t.status <> 'paused' and t.period_start <= p_from - 1 and t.period_end >= p_from - v_len;
  select count(*) into v_reports from public.daily_reports where staff_id = p_staff and report_date between p_from and p_to;
  select count(*), count(*) filter (where coalesce(delivered_at, updated_at)::date <= est_delivery_date) into v_done, v_on
    from public.orders where assigned_dispatch_id = p_staff and status = 'delivered' and coalesce(delivered_at, updated_at) >= p_from and coalesce(delivered_at, updated_at) < p_to + 1;
  return jsonb_build_object('staff', (select full_name from public.staff where id = p_staff), 'score', v_score, 'previous', v_prev,
    'reports', v_reports, 'working_days', private.working_days(p_from, least(p_to, current_date)),
    'report_completion', case when private.working_days(p_from, least(p_to, current_date)) > 0 then round(v_reports * 100.0 / private.working_days(p_from, least(p_to, current_date))) end,
    'deliveries', v_done, 'on_time_rate', case when v_done > 0 then round(v_on * 100.0 / v_done) end,
    'targets', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'metric', t.metric, 'label', t.check_in_label, 'goal', t.goal, 'actual', private.target_value(t), 'weight', t.weight, 'status', t.status, 'from', t.period_start, 'to', t.period_end))
      from public.targets t where t.owner_kind = 'person' and t.staff_id = p_staff and t.period_start <= p_to and t.period_end >= p_from), '[]'::jsonb));
end $$;

-- Weekly summary (FR-TG-004): target vs actual, wins, misses, trend vs last week, and the Admin's comments.
create or replace function public.weekly_summary(p_staff uuid, p_week_start date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_card jsonb;
  v_last jsonb;
begin
  if not (private.has_perm('targets_set', 'view') or p_staff = auth.uid()) then raise exception 'You cannot see this summary' using errcode = '42501'; end if;
  v_card := public.staff_scorecard(p_staff, p_week_start, p_week_start + 6);
  v_last := public.staff_scorecard(p_staff, p_week_start - 7, p_week_start - 1);
  return v_card || jsonb_build_object(
    'week_start', p_week_start,
    'wins', coalesce((select jsonb_agg(x) from jsonb_array_elements(v_card -> 'targets') x where (x ->> 'actual')::numeric >= (x ->> 'goal')::numeric), '[]'::jsonb),
    'misses', coalesce((select jsonb_agg(x) from jsonb_array_elements(v_card -> 'targets') x where (x ->> 'actual')::numeric < (x ->> 'goal')::numeric and (x ->> 'to')::date <= p_week_start + 6), '[]'::jsonb),
    'last_week_score', v_last -> 'score',
    'paid_sales', (select coalesce(sum(amount_paid), 0) from public.orders where (assigned_agent_id = p_staff or created_by = p_staff) and status <> 'cancelled' and created_at >= p_week_start and created_at < p_week_start + 7),
    'paid_sales_last_week', (select coalesce(sum(amount_paid), 0) from public.orders where (assigned_agent_id = p_staff or created_by = p_staff) and status <> 'cancelled' and created_at >= p_week_start - 7 and created_at < p_week_start),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('by', author_name, 'body', body, 'at', at) order by at) from public.target_comments where staff_id = p_staff and week_start = p_week_start), '[]'::jsonb));
end $$;

-- Leaderboard (FR-TG-008): off by default; the Owner switches it on per role in Settings.
create or replace function public.leaderboard(p_role text, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_on boolean := p_role in (select jsonb_array_elements_text(coalesce(private.setting('leaderboard') -> 'roles', '[]'::jsonb)));
begin
  if not (private.has_perm('targets_view', 'view') or private.has_perm('targets_set', 'view')) then raise exception 'You cannot see targets' using errcode = '42501'; end if;
  if not v_on then return jsonb_build_object('enabled', false, 'rows', '[]'::jsonb); end if;
  return jsonb_build_object('enabled', true, 'rows', coalesce((select jsonb_agg(x order by (x ->> 'value')::numeric desc) from (
    select jsonb_build_object('name', s.full_name, 'value',
      case when p_role = 'dispatch_coordinator' then (select count(*) from public.orders o where o.assigned_dispatch_id = s.id and o.status = 'delivered' and o.delivered_at >= p_from and o.delivered_at < p_to + 1)
           when p_role = 'sourcing_officer' then (select count(*) from public.supplier_orders so where so.staff_id = s.id and so.ordered_at >= p_from and so.ordered_at < p_to + 1)
           else (select count(*) from public.orders o where (o.assigned_agent_id = s.id or o.created_by = s.id) and o.amount_paid > 0 and o.status <> 'cancelled' and o.created_at >= p_from and o.created_at < p_to + 1) end) x
    from public.staff s join public.roles r on r.id = s.role_id where r.key = p_role and s.active) t), '[]'::jsonb));
end $$;

-- File the daily report with check-in numbers and the system's own numbers pre-filled (FR-TG-003).
create or replace function public.file_daily_report(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_auto jsonb;
begin
  if not private.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p ->> 'summary', ''))) < 3 then raise exception 'Write a short summary of your day'; end if;
  v_auto := jsonb_build_object(
    'orders_created', (select count(*) from public.orders where created_by = auth.uid() and created_at::date = current_date),
    'paid_sales', (select coalesce(sum(amount_paid), 0) from public.orders where (assigned_agent_id = auth.uid() or created_by = auth.uid()) and created_at::date = current_date and status <> 'cancelled'),
    'supplier_orders', (select count(*) from public.supplier_orders where staff_id = auth.uid() and ordered_at::date = current_date),
    'deliveries', (select count(*) from public.orders where assigned_dispatch_id = auth.uid() and status = 'delivered' and delivered_at::date = current_date),
    'replies', (select count(*) from public.support_messages where author_id = auth.uid() and from_staff and at::date = current_date));
  insert into public.daily_reports (staff_id, report_date, summary, blockers, orders_handled, checkins, auto_numbers)
  values (auth.uid(), current_date, left(btrim(p ->> 'summary'), 2000), left(nullif(btrim(coalesce(p ->> 'blockers', '')), ''), 1000),
          nullif(p ->> 'orders_handled', '')::int,
          coalesce((select jsonb_object_agg(left(k, 60), v) from jsonb_each(coalesce(p -> 'checkins', '{}'::jsonb)) e(k, v) where jsonb_typeof(v) = 'number'), '{}'::jsonb), v_auto)
  on conflict (staff_id, report_date) do update set summary = excluded.summary, blockers = excluded.blockers, orders_handled = excluded.orders_handled,
    checkins = excluded.checkins, auto_numbers = excluded.auto_numbers;
end $$;

-- What the system already knows about today, to pre-fill the report form.
create or replace function public.my_day() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'plan', (select lines from public.daily_plans where staff_id = auth.uid() and plan_date = current_date),
    'report', (select to_jsonb(r) from public.daily_reports r where r.staff_id = auth.uid() and r.report_date = current_date),
    'yesterday', (select to_jsonb(r) from public.daily_reports r where r.staff_id = auth.uid() and r.report_date = current_date - 1),
    'labels', coalesce((select jsonb_agg(distinct t.check_in_label) from public.targets t where t.metric::text = 'check_in' and t.status = 'active' and t.period_end >= current_date
                         and ((t.owner_kind = 'person' and t.staff_id = auth.uid()) or (t.owner_kind = 'role' and t.role_key = private.role_key(private.my_role())) or t.owner_kind = 'everyone')), '[]'::jsonb),
    'open_tasks', jsonb_build_object(
      'to_confirm', (select count(*) from public.orders o where o.status = 'to_confirm' and private.can_see_order(o.assigned_agent_id, o.created_by)),
      'to_source', (select count(*) from public.orders o where o.status = 'to_source' and private.has_perm('availability', 'edit')),
      'to_pack', (select count(*) from public.orders o where o.status in ('ready_to_pack', 'packed') and private.orders_full()),
      'unread', (select count(*) from public.staff_alerts where staff_id = auth.uid() and read_at is null)));
end $$;

revoke execute on function public.close_month(date, text), public.unlock_month(date, text), public.budget_status(date), public.profit_report(date, date),
  public.money_summary(date, date), public.target_progress(date), public.adjust_target(uuid, jsonb, text), public.apply_starter_targets(date, numeric),
  public.staff_scorecard(uuid, date, date), public.weekly_summary(uuid, date), public.leaderboard(text, date, date), public.file_daily_report(jsonb), public.my_day()
from public, anon;
grant execute on function public.close_month(date, text), public.unlock_month(date, text), public.budget_status(date), public.profit_report(date, date),
  public.money_summary(date, date), public.target_progress(date), public.adjust_target(uuid, jsonb, text), public.apply_starter_targets(date, numeric),
  public.staff_scorecard(uuid, date, date), public.weekly_summary(uuid, date), public.leaderboard(text, date, date), public.file_daily_report(jsonb), public.my_day()
to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- Expense receipts in the private receipts bucket, under expenses/<expense id>/.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    drop policy if exists expense_receipts_upload on storage.objects;
    create policy expense_receipts_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = 'expenses' and private.has_perm('expenses', 'create'));
    drop policy if exists expense_receipts_read on storage.objects;
    create policy expense_receipts_read on storage.objects for select to authenticated
      using (bucket_id = 'receipts' and (storage.foldername(name))[1] = 'expenses' and private.has_perm('expenses', 'view'));
  end if;
end $$;
