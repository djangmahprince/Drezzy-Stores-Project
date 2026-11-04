-- The categories Drezzy actually sells in, set by the owner: Sneakers, Shoes, Shirts, Loafers and Watches.
-- This replaces the PRD's seed list. Sneakers keep their Men and Ladies sub-categories. A category that still has
-- products is left in place, so this can never orphan a product.
insert into public.categories (name, slug, sort) values ('Shirts', 'shirts', 3), ('Loafers', 'loafers', 4)
on conflict (slug) do nothing;
update public.categories set sort = 1 where slug = 'sneakers';
update public.categories set sort = 2 where slug = 'shoes';
update public.categories set sort = 5 where slug = 'watches';

delete from public.categories c
where c.parent_id is not null and c.slug not in ('sneakers-men', 'sneakers-ladies')
  and not exists (select 1 from public.products p where p.category_id = c.id);
delete from public.categories c
where c.parent_id is null and c.slug in ('slides-and-sandals', 'outfits', 'accessories')
  and not exists (select 1 from public.products p where p.category_id = c.id)
  and not exists (select 1 from public.categories k where k.parent_id = c.id);
