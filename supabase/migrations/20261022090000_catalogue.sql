-- Sprint 2: catalogue, variants, suppliers and availability (PRD sections 8 and 13).
--
-- Drezzy keeps no stock. Each size of each colour is a variant with an availability ("can a supplier supply it?")
-- and a lead time. Supplier costs live in their own table that only people who handle money and sourcing can read.
-- Shoppers (anon) can read published products and the public columns of their variants, nothing else.

create type public.availability as enum ('available', 'limited', 'unavailable', 'pre_order');
create type public.audience as enum ('men', 'ladies', 'men_and_ladies', 'unisex');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories (id) on delete restrict,
  name text not null check (char_length(name) between 2 and 60),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sku text not null unique check (char_length(sku) between 2 and 30),
  name text not null check (char_length(name) between 2 and 140),
  brand text not null check (char_length(brand) between 1 and 60),
  category_id uuid not null references public.categories (id),
  audience public.audience not null default 'unisex',
  description text not null default '',
  details text[] not null default '{}',
  condition text not null default 'Brand new, original',
  is_new boolean not null default false,
  popular int not null default 0,
  published boolean not null default false,
  -- stand-in artwork until real photography is uploaded: { kind, tone, upper, accent }
  art jsonb,
  images text[] not null default '{}',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);
create index products_published_idx on public.products (published) where published;

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 80),
  phone text,
  whatsapp text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  style text,
  colour text not null check (char_length(colour) between 1 and 60),
  size text not null check (char_length(size) between 1 and 20),
  sku text not null unique check (char_length(sku) between 2 and 60),
  price numeric(10, 2) not null check (price >= 0),
  compare_at numeric(10, 2),
  availability public.availability not null default 'unavailable',
  lead_days int not null default 2 check (lead_days between 0 and 60),
  preferred_supplier_id uuid references public.suppliers (id) on delete set null,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (compare_at is null or compare_at > price)
);
-- style is optional, so uniqueness has to treat "no style" as one value
create unique index variants_unique_combo on public.variants (product_id, coalesce(style, ''), colour, size);
create index variants_product_idx on public.variants (product_id);

-- what each supplier charges for a variant, and whether they can supply it. COST IS SENSITIVE.
create table public.supplier_offers (
  variant_id uuid not null references public.variants (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  cost numeric(10, 2) not null check (cost >= 0),
  lead_days int check (lead_days between 0 and 60),
  available boolean not null default true,
  checked_at timestamptz not null default now(),
  primary key (variant_id, supplier_id)
);
create index supplier_offers_supplier_idx on public.supplier_offers (supplier_id);

-- ---------------------------------------------------------------------------
-- Seed: the category tree from PRD section 8 (two levels)
-- ---------------------------------------------------------------------------
insert into public.categories (name, slug, sort) values
  ('Sneakers', 'sneakers', 1), ('Shoes', 'shoes', 2), ('Slides and Sandals', 'slides-and-sandals', 3),
  ('Outfits', 'outfits', 4), ('Watches', 'watches', 5), ('Accessories', 'accessories', 6);

insert into public.categories (parent_id, name, slug, sort)
select p.id, c.name, c.slug, c.sort
from (values
  ('sneakers', 'Men', 'sneakers-men', 1), ('sneakers', 'Ladies', 'sneakers-ladies', 2),
  ('shoes', 'Formal', 'shoes-formal', 1), ('shoes', 'Casual', 'shoes-casual', 2), ('shoes', 'Loafers', 'shoes-loafers', 3),
  ('outfits', 'Sets', 'outfits-sets', 1), ('outfits', 'Tracksuits', 'outfits-tracksuits', 2),
  ('outfits', 'Tops', 'outfits-tops', 3), ('outfits', 'Bottoms', 'outfits-bottoms', 4),
  ('accessories', 'Caps', 'accessories-caps', 1), ('accessories', 'Bags', 'accessories-bags', 2), ('accessories', 'Socks', 'accessories-socks', 3)
) as c (parent_slug, name, slug, sort)
join public.categories p on p.slug = c.parent_slug;

-- ---------------------------------------------------------------------------
-- Helpers and guards
-- ---------------------------------------------------------------------------
-- Supplier costs are visible to Owner, Admin, Finance and Sourcing: people who can both see money and handle sourcing.
-- (Dispatch can see expenses for delivery costs and availability to read, but must not see what suppliers charge.)
create or replace function private.can_see_costs() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_perm('expenses', 'view')
     and (private.has_perm('availability', 'edit') or private.has_perm('expenses', 'delete'))
$$;
revoke execute on function private.can_see_costs() from public, anon;
grant execute on function private.can_see_costs() to authenticated;

create trigger products_touch before update on public.products for each row execute function private.touch_updated_at();
create trigger suppliers_touch before update on public.suppliers for each row execute function private.touch_updated_at();
create trigger variants_touch before update on public.variants for each row execute function private.touch_updated_at();

-- categories stay two levels deep
create or replace function private.guard_categories() returns trigger
language plpgsql as $$
begin
  if new.parent_id is not null and exists (select 1 from public.categories c where c.id = new.parent_id and c.parent_id is not null) then
    raise exception 'Categories can only go two levels deep' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger categories_guard before insert or update on public.categories for each row execute function private.guard_categories();

-- Who may change what on a variant. Price and identity need "products: edit"; availability, lead time and the
-- preferred supplier need "availability: edit". This is how a Sourcing Officer can keep availability honest
-- without being able to reprice, and how a Content Editor can read but never change either.
create or replace function private.guard_variants() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if not private.has_perm('products', 'create') then
      raise exception 'You cannot add products or variants' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not private.has_perm('products', 'delete') then
      raise exception 'You cannot delete variants' using errcode = '42501';
    end if;
    return old;
  end if;

  if (new.product_id, new.style, new.colour, new.size, new.sku, new.price, new.compare_at)
     is distinct from (old.product_id, old.style, old.colour, old.size, old.sku, old.price, old.compare_at)
     and not private.has_perm('products', 'edit') then
    raise exception 'You cannot change prices or product details' using errcode = '42501';
  end if;

  if (new.availability, new.lead_days, new.preferred_supplier_id, new.last_checked_at)
     is distinct from (old.availability, old.lead_days, old.preferred_supplier_id, old.last_checked_at)
     and not private.has_perm('availability', 'edit') then
    raise exception 'You cannot change availability' using errcode = '42501';
  end if;

  return new;
end $$;
create trigger variants_guard before insert or update or delete on public.variants
  for each row execute function private.guard_variants();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.variants enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_offers enable row level security;

-- categories: public to read; "products: edit" to change
create policy categories_read on public.categories for select to anon, authenticated using (true);
create policy categories_write on public.categories for all to authenticated
  using (private.has_perm('products', 'edit')) with check (private.has_perm('products', 'edit'));

-- products: shoppers see published ones; staff with the right see everything
create policy products_read_public on public.products for select to anon, authenticated using (published);
create policy products_read_staff on public.products for select to authenticated using (private.has_perm('products', 'view'));
create policy products_insert on public.products for insert to authenticated with check (private.has_perm('products', 'create'));
create policy products_update on public.products for update to authenticated
  using (private.has_perm('products', 'edit')) with check (private.has_perm('products', 'edit'));
create policy products_delete on public.products for delete to authenticated using (private.has_perm('products', 'delete'));

-- variants: public columns for published products; staff by permission
create policy variants_read_public on public.variants for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.published));
create policy variants_read_staff on public.variants for select to authenticated using (private.has_perm('products', 'view'));
create policy variants_insert on public.variants for insert to authenticated with check (private.has_perm('products', 'create'));
create policy variants_update on public.variants for update to authenticated
  using (private.has_perm('products', 'edit') or private.has_perm('availability', 'edit'))
  with check (private.has_perm('products', 'edit') or private.has_perm('availability', 'edit'));
create policy variants_delete on public.variants for delete to authenticated using (private.has_perm('products', 'delete'));

-- suppliers: anyone who can see availability reads them; "availability: edit" changes them
create policy suppliers_read on public.suppliers for select to authenticated using (private.has_perm('availability', 'view'));
create policy suppliers_write on public.suppliers for all to authenticated
  using (private.has_perm('availability', 'edit')) with check (private.has_perm('availability', 'edit'));

-- offers carry the cost: only people who can see costs may read them, only sourcing may write them
create policy offers_read on public.supplier_offers for select to authenticated using (private.can_see_costs());
create policy offers_write on public.supplier_offers for all to authenticated
  using (private.has_perm('availability', 'edit') and private.can_see_costs())
  with check (private.has_perm('availability', 'edit') and private.can_see_costs());

-- ---------------------------------------------------------------------------
-- Grants. Shoppers get column-level access, so internal columns (preferred supplier, last checked) stay private.
-- ---------------------------------------------------------------------------
revoke all on public.categories, public.products, public.variants, public.suppliers, public.supplier_offers from anon, public;

grant select on public.categories to anon;
grant select (id, slug, sku, name, brand, category_id, audience, description, details, condition, is_new, popular, published, art, images, tags)
  on public.products to anon;
grant select (id, product_id, style, colour, size, sku, price, compare_at, availability, lead_days)
  on public.variants to anon;

grant select, insert, update, delete on public.categories, public.products, public.variants, public.suppliers, public.supplier_offers to authenticated;

-- ---------------------------------------------------------------------------
-- Audit. Price and availability changes are sensitive actions (FR-ROLE-002), and so are supplier costs.
-- ---------------------------------------------------------------------------
-- audit_row now also understands tables whose key is a pair (supplier_offers).
create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_name text;
  v_role text;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;

  select s.full_name, r.key into v_name, v_role
  from public.staff s join public.roles r on r.id = s.role_id
  where s.id = auth.uid();

  insert into public.audit_log (actor_id, actor_name, actor_role, action, table_name, record_id, old_values, new_values)
  values (
    auth.uid(), v_name, v_role, tg_op, tg_table_name,
    coalesce(
      v_row ->> 'id',
      case when v_row ? 'role_id' then (v_row ->> 'role_id') || ':' || coalesce(v_row ->> 'module', '') end,
      case when v_row ? 'variant_id' then (v_row ->> 'variant_id') || ':' || coalesce(v_row ->> 'supplier_id', '') end
    ),
    v_old, v_new
  );
  return coalesce(new, old);
end $$;

create trigger products_audit after insert or update or delete on public.products for each row execute function private.audit_row();
create trigger variants_audit after insert or update or delete on public.variants for each row execute function private.audit_row();
create trigger suppliers_audit after insert or update or delete on public.suppliers for each row execute function private.audit_row();
create trigger supplier_offers_audit after insert or update or delete on public.supplier_offers for each row execute function private.audit_row();
