-- Refunds (PRD FR-ORD-010, permission matrix "refunds"): a request, a decision, and the pay-out, each by a different step.
--   * Customer Support may only REQUEST ("Request only"). Finance, Admin and Owner may approve and pay.
--   * The person who asked cannot approve their own request (an Owner may).
--   * A refund can never exceed what the customer actually paid, counting refunds already asked for.
--   * Paying a refund writes a 'refund' payment, which the money ledger shows as money out.

create type public.refund_status as enum ('requested', 'approved', 'rejected', 'paid');

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  status public.refund_status not null default 'requested',
  requested_by uuid references auth.users (id) on delete set null,
  requested_by_name text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_note text,
  method text check (method in ('momo', 'cash')),
  reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index refunds_order_idx on public.refunds (order_id);
create index refunds_status_idx on public.refunds (status, created_at desc);

-- may this person decide and pay refunds, not just ask for them?
create or replace function private.can_approve_refunds() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.has_perm('refunds', 'edit') and exists (
    select 1 from public.role_permissions rp
    where rp.role_id = private.my_role() and rp.module = 'refunds'
      and (rp.restriction is null or rp.restriction not ilike 'request%')
  ), false)
$$;
revoke execute on function private.can_approve_refunds() from public, anon;
grant execute on function private.can_approve_refunds() to authenticated;

alter table public.refunds enable row level security;
create policy refunds_read on public.refunds for select to authenticated using (private.has_perm('refunds', 'view'));
revoke all on public.refunds from anon, public;
grant select on public.refunds to authenticated;  -- every change goes through the functions below
create trigger refunds_audit after insert or update or delete on public.refunds for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Ask for a refund
-- ---------------------------------------------------------------------------
create or replace function public.request_refund(p_order uuid, p_amount numeric, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  v_committed numeric(12, 2);
  v_id uuid;
begin
  if not (private.has_perm('refunds', 'create') or private.has_perm('refunds', 'edit')) then
    raise exception 'You cannot request refunds' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above zero'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason'; end if;
  select coalesce(sum(amount), 0) into v_committed from public.refunds where order_id = o.id and status in ('requested', 'approved', 'paid');
  if p_amount > o.amount_paid - v_committed then
    raise exception 'You can refund at most GHS % on this order (paid %, already requested or refunded %)', o.amount_paid - v_committed, o.amount_paid, v_committed;
  end if;
  insert into public.refunds (order_id, amount, reason, requested_by, requested_by_name)
  values (o.id, round(p_amount, 2), btrim(p_reason), auth.uid(), private.staff_name()) returning id into v_id;
  perform private.log_event(o.id, 'note', null, null, 'Refund of GHS ' || round(p_amount, 2)::text || ' requested. Reason: ' || btrim(p_reason));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Approve or reject
-- ---------------------------------------------------------------------------
create or replace function public.review_refund(p_refund uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.refunds%rowtype;
begin
  if not private.can_approve_refunds() then raise exception 'You can request refunds but not approve them' using errcode = '42501'; end if;
  select * into r from public.refunds where id = p_refund for update;
  if not found then raise exception 'Refund not found'; end if;
  if r.status <> 'requested' then raise exception 'This refund has already been %', r.status; end if;
  if r.requested_by = auth.uid() and not private.is_owner() then raise exception 'Someone else must approve a refund you requested' using errcode = '42501'; end if;
  if not p_approve and char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Say why it is rejected'; end if;
  update public.refunds set status = case when p_approve then 'approved'::public.refund_status else 'rejected'::public.refund_status end,
    reviewed_by = auth.uid(), reviewed_by_name = private.staff_name(), reviewed_at = now(), review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = r.id;
  perform private.log_event(r.order_id, 'note', null, null, 'Refund of GHS ' || r.amount::text || case when p_approve then ' approved' else ' rejected' end || coalesce('. ' || nullif(btrim(p_note), ''), ''));
end $$;

-- ---------------------------------------------------------------------------
-- Record that the money has been sent back
-- ---------------------------------------------------------------------------
create or replace function public.pay_refund(p_refund uuid, p_method text, p_reference text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.refunds%rowtype;
  o public.orders%rowtype;
  v_refunded numeric(12, 2);
  v_ref text;
begin
  if not private.can_approve_refunds() then raise exception 'You cannot pay out refunds' using errcode = '42501'; end if;
  select * into r from public.refunds where id = p_refund for update;
  if not found then raise exception 'Refund not found'; end if;
  if r.status <> 'approved' then raise exception 'Only an approved refund can be paid'; end if;
  if p_method not in ('momo', 'cash') then raise exception 'Choose MoMo or cash'; end if;
  if p_method = 'momo' and btrim(coalesce(p_reference, '')) = '' then raise exception 'Enter the MoMo reference'; end if;
  select * into o from public.orders where id = r.order_id for update;

  v_ref := 'REF-' || o.number || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
  insert into public.payments (order_id, kind, provider, method, reference, external_ref, amount, status, confirmed_at, checked_by)
  values (o.id, 'refund', case when p_method = 'cash' then 'cash'::public.payment_provider else 'momo'::public.payment_provider end,
          p_method, v_ref, nullif(btrim(p_reference), ''), r.amount, 'success', now(), auth.uid());
  update public.refunds set status = 'paid', method = p_method, reference = nullif(btrim(p_reference), ''), paid_at = now() where id = r.id;

  select coalesce(sum(amount), 0) into v_refunded from public.refunds where order_id = o.id and status = 'paid';
  perform set_config('app.via_rpc', '1', true);
  update public.orders set payment_state = case when v_refunded >= o.amount_paid then 'refunded'::public.payment_state else 'partly_refunded'::public.payment_state end
  where id = o.id;
  perform private.log_event(o.id, 'payment', o.status, 'Refund sent', 'Refund GHS ' || r.amount::text || ' via ' || p_method || coalesce(' ' || nullif(btrim(p_reference), ''), ''));
  perform set_config('app.via_rpc', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- The ledger and the summary now show refunds as money out
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
  select coalesce((select sum(c.agreed_cost) from public.supplier_orders so join public.supplier_order_costs c on c.supplier_order_id = so.id
                   where so.status = 'received' and so.received_at >= p_from and so.received_at < p_to + 1), 0)
       + coalesce((select sum(e.amount) from public.expenses e where e.spent_on between p_from and p_to), 0) + v_refunds into v_out;
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
  ) x where amount is not null;

  return jsonb_build_object('money_in', v_in, 'money_out', v_out, 'net', v_in - v_out, 'balances_to_collect', v_owed, 'out_by_category', v_cats);
end $$;

revoke execute on function public.request_refund(uuid, numeric, text), public.review_refund(uuid, boolean, text), public.pay_refund(uuid, text, text) from public, anon;
grant execute on function public.request_refund(uuid, numeric, text), public.review_refund(uuid, boolean, text), public.pay_refund(uuid, text, text) to authenticated;
grant execute on function public.money_summary(date, date) to authenticated;
