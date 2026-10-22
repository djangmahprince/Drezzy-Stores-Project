-- Customer notifications (PRD section 18): an outbox. The database decides WHAT must be sent (a customer-facing order
-- update, for a customer who gave an email); a small server job sends it and reports back. If sending fails it is retried,
-- and an order is never held up by an email provider being down.

create type public.notification_status as enum ('queued', 'sending', 'sent', 'failed');

create table public.notifications (
  id bigint generated always as identity primary key,
  order_id uuid references public.orders (id) on delete cascade,
  channel text not null default 'email' check (channel in ('email')),
  template text not null,
  to_address text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.notification_status not null default 'queued',
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz
);
create index notifications_queue_idx on public.notifications (status, created_at) where status in ('queued', 'sending');
create index notifications_order_idx on public.notifications (order_id);

alter table public.notifications enable row level security;
-- addresses are personal data: only people who manage settings can look at the outbox
create policy notifications_read on public.notifications for select to authenticated using (private.has_perm('settings', 'view'));
revoke all on public.notifications from anon, public;
grant select on public.notifications to authenticated;

-- Every customer-facing order update becomes one queued email.
create or replace function private.queue_order_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  c public.customers%rowtype;
begin
  if new.public_note is null or new.kind not in ('placed', 'payment', 'status') then return new; end if;
  select * into o from public.orders where id = new.order_id;
  select * into c from public.customers where id = o.customer_id;
  if c.email is null then return new; end if;
  insert into public.notifications (order_id, template, to_address, payload) values (
    o.id, case when new.kind = 'placed' then 'order_placed' else 'order_update' end, c.email,
    jsonb_build_object('number', o.number, 'name', c.full_name, 'headline', new.public_note, 'status', new.status,
                       'total', o.total, 'paid', o.amount_paid, 'balance', o.balance_due, 'phone', c.phone));
  return new;
end $$;
create trigger order_events_email after insert on public.order_events for each row execute function private.queue_order_email();

-- The sender takes a batch (rows stuck in "sending" for 10 minutes are retried), then reports each result.
create or replace function public.claim_notifications(p_limit int default 20) returns setof public.notifications
language sql security definer set search_path = '' as $$
  update public.notifications n set status = 'sending', attempts = n.attempts + 1, claimed_at = now()
  where n.id in (
    select id from public.notifications
    where (status = 'queued' or (status = 'sending' and claimed_at < now() - interval '10 minutes')) and attempts < 5
    order by created_at limit greatest(1, least(p_limit, 100)) for update skip locked)
  returning n.*
$$;

create or replace function public.finish_notification(p_id bigint, p_ok boolean, p_error text default null) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set
    status = case when p_ok then 'sent'::public.notification_status when attempts >= 5 then 'failed'::public.notification_status else 'queued'::public.notification_status end,
    sent_at = case when p_ok then now() end, last_error = case when p_ok then null else left(p_error, 300) end
  where id = p_id
$$;

revoke execute on function public.claim_notifications(int), public.finish_notification(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_notifications(int), public.finish_notification(bigint, boolean, text) to service_role;
