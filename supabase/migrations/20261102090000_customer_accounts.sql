-- Customer accounts (PRD section 8): an optional sign-in so a shopper sees their orders on any device.
--   * Guest checkout still works. An account only ever ADDS a view of orders; it never changes how orders are placed.
--   * Orders are linked to an account by a CONFIRMED email address that matches the one used at checkout. Someone who
--     signs up with another person's email cannot see that person's orders, because they cannot confirm the address.
--   * Staff logins are not shoppers: they are skipped, so the two kinds of sign-in never mix.

create or replace function public.link_customer_orders() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_n int;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if exists (select 1 from public.staff where id = auth.uid()) then return 0; end if;
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  if v_email is null then return 0; end if; -- the address is not confirmed yet
  update public.customers set auth_user_id = auth.uid()
  where auth_user_id is null and lower(email) = v_email;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- The signed-in shopper's own orders, newest first. Money and status only; nothing about suppliers or costs.
create or replace function public.my_orders() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'number', o.number, 'phone', c.phone, 'placed_at', o.created_at, 'status', o.status, 'payment_state', o.payment_state,
      'total', o.total, 'paid', o.amount_paid, 'balance', o.balance_due,
      'items', coalesce((select jsonb_agg(i.product_name || ' · ' || i.variant_label order by i.product_name) from public.order_items i where i.order_id = o.id), '[]'::jsonb)
    ) order by o.created_at desc)
    from public.orders o join public.customers c on c.id = o.customer_id
    where c.auth_user_id = auth.uid()), '[]'::jsonb);
end $$;

revoke execute on function public.link_customer_orders(), public.my_orders() from public, anon;
grant execute on function public.link_customer_orders(), public.my_orders() to authenticated;
