-- Targets, daily reports and analytics (PRD sections 15 and 16).
--   * Targets are counted from real orders, supplier orders and reports; nobody types in their own progress.
--   * Everyone on staff files a daily report; managers see who has not.
--   * Analytics are aggregates computed in the database. Money figures are hidden from roles whose analytics access is
--     limited to another area ("Catalogue", "Delivery", "Content", "Service"); only Money-limited and unlimited roles see them.
--   * The shop sends anonymous visit events (no personal data) so the funnel can start before an order exists.

-- ---------------------------------------------------------------------------
-- Targets
-- ---------------------------------------------------------------------------
create type public.target_metric as enum ('paid_sales', 'orders', 'deliveries', 'supplier_orders', 'reports');

create table public.targets (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.staff (id) on delete cascade, -- null means the whole team
  metric public.target_metric not null,
  goal numeric(14, 2) not null check (goal > 0),
  period_start date not null,
  period_end date not null,
  note text,
  set_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (period_end >= period_start and period_end - period_start <= 400)
);
create index targets_period_idx on public.targets (period_start, period_end);

alter table public.targets enable row level security;
create policy targets_read on public.targets for select to authenticated using (
  private.has_perm('targets_set', 'view')
  or (private.has_perm('targets_view', 'view') and (private.perm_scope('targets_view') = 'all' or staff_id is null or staff_id = auth.uid()))
);
create policy targets_insert on public.targets for insert to authenticated with check (private.has_perm('targets_set', 'create') and set_by = auth.uid());
create policy targets_update on public.targets for update to authenticated using (private.has_perm('targets_set', 'edit')) with check (private.has_perm('targets_set', 'edit'));
create policy targets_delete on public.targets for delete to authenticated using (private.has_perm('targets_set', 'delete'));
revoke all on public.targets from anon, public;
grant select, insert, update, delete on public.targets to authenticated;
create trigger targets_audit after insert or update or delete on public.targets for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Daily reports
-- ---------------------------------------------------------------------------
create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null default auth.uid() references public.staff (id) on delete cascade,
  report_date date not null default current_date,
  summary text not null check (char_length(btrim(summary)) between 3 and 2000),
  blockers text check (char_length(blockers) <= 1000),
  orders_handled int check (orders_handled between 0 and 1000),
  created_at timestamptz not null default now(),
  unique (staff_id, report_date)
);

alter table public.daily_reports enable row level security;
create policy reports_read on public.daily_reports for select to authenticated using (
  (staff_id = auth.uid() and private.my_role() is not null) or private.has_perm('targets_set', 'view')
);
-- anyone on staff files their own report, for today or the day before (a late report is better than none)
create policy reports_insert on public.daily_reports for insert to authenticated with check (
  private.my_role() is not null and staff_id = auth.uid() and report_date between current_date - 1 and current_date
);
create policy reports_update on public.daily_reports for update to authenticated
  using (private.my_role() is not null and staff_id = auth.uid() and report_date between current_date - 1 and current_date)
  with check (staff_id = auth.uid() and report_date between current_date - 1 and current_date);
revoke all on public.daily_reports from anon, public;
grant select, insert, update on public.daily_reports to authenticated;
create trigger daily_reports_audit after insert or update or delete on public.daily_reports for each row execute function private.audit_row();

-- What has actually been achieved, counted from the records.
create or replace function private.target_actual(p_metric public.target_metric, p_staff uuid, p_from date, p_to date) returns numeric
language sql stable security definer set search_path = '' as $$
  select case p_metric
    when 'paid_sales' then coalesce((select sum(o.amount_paid) from public.orders o
      where o.status <> 'cancelled' and o.created_at >= p_from and o.created_at < p_to + 1
        and (p_staff is null or o.assigned_agent_id = p_staff or o.created_by = p_staff)), 0)
    when 'orders' then coalesce((select count(*) from public.orders o
      where o.status <> 'cancelled' and o.amount_paid > 0 and o.created_at >= p_from and o.created_at < p_to + 1
        and (p_staff is null or o.assigned_agent_id = p_staff or o.created_by = p_staff)), 0)
    when 'deliveries' then coalesce((select count(*) from public.orders o
      where o.status = 'delivered' and o.updated_at >= p_from and o.updated_at < p_to + 1
        and (p_staff is null or o.assigned_dispatch_id = p_staff)), 0)
    when 'supplier_orders' then coalesce((select count(*) from public.supplier_orders s
      where s.ordered_at >= p_from and s.ordered_at < p_to + 1 and (p_staff is null or s.staff_id = p_staff)), 0)
    when 'reports' then coalesce((select count(*) from public.daily_reports r
      where r.report_date between p_from and p_to and (p_staff is null or r.staff_id = p_staff)), 0)
  end
$$;

-- Who has filed for a day (managers only).
create or replace function public.report_status(p_date date default current_date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_perm('targets_set', 'view') then raise exception 'You cannot see the team reports' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('staff_id', s.id, 'name', s.full_name, 'role', r.name,
      'filed', rep.id is not null, 'summary', rep.summary, 'blockers', rep.blockers, 'orders_handled', rep.orders_handled, 'at', rep.created_at) order by s.full_name)
    from public.staff s join public.roles r on r.id = s.role_id
    left join public.daily_reports rep on rep.staff_id = s.id and rep.report_date = p_date
    where s.active), '[]'::jsonb);
end $$;

-- Targets the caller may see, with live progress.
create or replace function public.target_progress(p_date date default current_date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.has_perm('targets_set', 'view') or private.has_perm('targets_view', 'view')) then
    raise exception 'You cannot see targets' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'staff_id', t.staff_id, 'staff', coalesce(s.full_name, 'Whole team'), 'metric', t.metric, 'goal', t.goal,
      'actual', private.target_actual(t.metric, t.staff_id, t.period_start, t.period_end),
      'from', t.period_start, 'to', t.period_end, 'note', t.note,
      'elapsed', least(1, greatest(0, (p_date - t.period_start + 1)::numeric / (t.period_end - t.period_start + 1)))
    ) order by t.period_end desc, s.full_name)
    from public.targets t left join public.staff s on s.id = t.staff_id
    where t.period_end >= p_date - 31
      and (private.has_perm('targets_set', 'view')
           or (private.perm_scope('targets_view') = 'all' or t.staff_id is null or t.staff_id = auth.uid()))), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Visit events (anonymous) and the analytics summary
-- ---------------------------------------------------------------------------
create table public.site_events (
  id bigint generated always as identity primary key,
  session text not null check (char_length(session) between 8 and 64),
  name text not null check (name in ('visit', 'product_view', 'add_to_cart', 'checkout_started')),
  source text check (char_length(source) <= 40),
  day date not null default current_date,
  at timestamptz not null default now(),
  unique (session, name, day)
);
create index site_events_day_idx on public.site_events (day, name);
alter table public.site_events enable row level security;
revoke all on public.site_events from anon, public, authenticated; -- read only through analytics_summary

-- One row per visitor per step per day, so refreshing or spamming cannot inflate the funnel.
create or replace function public.track_event(p_session text, p_name text, p_source text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_name not in ('visit', 'product_view', 'add_to_cart', 'checkout_started') or char_length(coalesce(p_session, '')) not between 8 and 64 then return; end if;
  insert into public.site_events (session, name, source) values (p_session, p_name, left(nullif(btrim(p_source), ''), 40)) on conflict do nothing;
end $$;
revoke execute on function public.track_event(text, text, text) from public;
grant execute on function public.track_event(text, text, text) to anon, authenticated;

create or replace function public.analytics_summary(p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_own boolean := private.perm_scope('analytics') = 'own';
  v_limit text := (select rp.restriction from public.role_permissions rp where rp.role_id = private.my_role() and rp.module = 'analytics');
  v_money boolean := v_limit is null or v_limit ilike 'money%';
  v_placed int; v_paid int; v_delivered int; v_cancelled int; v_gross numeric(14, 2);
  v_new int; v_repeat int;
  v_funnel jsonb; v_channels jsonb; v_sources jsonb; v_products jsonb;
begin
  if not private.has_perm('analytics', 'view') then raise exception 'You cannot see analytics' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose a valid period'; end if;

  create temporary table if not exists pg_temp.a_orders (id uuid, customer_id uuid, channel text, source text, status text, paid numeric, created timestamptz) on commit drop;
  truncate pg_temp.a_orders;
  insert into pg_temp.a_orders
    select o.id, o.customer_id, o.channel::text, o.source, o.status::text, o.amount_paid, o.created_at from public.orders o
    where o.created_at >= p_from and o.created_at < p_to + 1 and (not v_own or o.assigned_agent_id = auth.uid() or o.created_by = auth.uid());

  select count(*), count(*) filter (where paid > 0 and status <> 'cancelled'), count(*) filter (where status = 'delivered'), count(*) filter (where status = 'cancelled'),
         coalesce(sum(paid) filter (where status <> 'cancelled'), 0)
    into v_placed, v_paid, v_delivered, v_cancelled, v_gross from pg_temp.a_orders;

  select count(*) filter (where n = 1), count(*) filter (where n > 1) into v_new, v_repeat from (
    select customer_id, count(*) n from public.orders o
    where o.amount_paid > 0 and o.status <> 'cancelled' and o.customer_id in (select customer_id from pg_temp.a_orders where paid > 0 and status <> 'cancelled')
    group by customer_id) x;

  select coalesce(jsonb_agg(jsonb_build_object('step', step, 'count', n) order by ord), '[]'::jsonb) into v_funnel from (
    select 1 ord, 'Visited the shop' step, count(distinct session) n from public.site_events where name = 'visit' and day between p_from and p_to and not v_own
    union all select 2, 'Viewed a product', count(distinct session) from public.site_events where name = 'product_view' and day between p_from and p_to and not v_own
    union all select 3, 'Added to bag', count(distinct session) from public.site_events where name = 'add_to_cart' and day between p_from and p_to and not v_own
    union all select 4, 'Started checkout', count(distinct session) from public.site_events where name = 'checkout_started' and day between p_from and p_to and not v_own
    union all select 5, 'Placed an order', v_placed
    union all select 6, 'Paid', v_paid
    union all select 7, 'Delivered', v_delivered) f;

  select coalesce(jsonb_agg(jsonb_build_object('channel', channel, 'orders', n) order by n desc), '[]'::jsonb) into v_channels
    from (select channel, count(*) n from pg_temp.a_orders group by channel) c;
  select coalesce(jsonb_agg(jsonb_build_object('source', source, 'orders', n) order by n desc), '[]'::jsonb) into v_sources
    from (select coalesce(source, 'Not given') source, count(*) n from pg_temp.a_orders group by 1) c;
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'units', units, 'revenue', case when v_money then revenue end) order by units desc), '[]'::jsonb) into v_products from (
    select i.product_name name, sum(i.qty)::int units, sum(i.qty * i.unit_price) revenue
    from public.order_items i join pg_temp.a_orders a on a.id = i.order_id
    where a.paid > 0 and a.status <> 'cancelled' group by i.product_name order by sum(i.qty) desc limit 8) p;

  return jsonb_build_object('orders_placed', v_placed, 'paid_orders', v_paid, 'delivered', v_delivered, 'cancelled', v_cancelled,
    'gross_sales', case when v_money then v_gross end, 'average_order', case when v_money and v_paid > 0 then round(v_gross / v_paid, 2) end,
    'new_customers', v_new, 'repeat_customers', v_repeat, 'funnel', v_funnel, 'channels', v_channels, 'sources', v_sources, 'top_products', v_products,
    'money_visible', v_money);
end $$;

revoke execute on function public.report_status(date), public.target_progress(date), public.analytics_summary(date, date) from public, anon;
grant execute on function public.report_status(date), public.target_progress(date), public.analytics_summary(date, date) to authenticated;
