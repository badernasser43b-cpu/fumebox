-- =====================================================================
-- FUMEBOX — BIS 2103 e-commerce DEMONSTRATION database (Supabase / Postgres 15+)
-- Run once in the Supabase SQL Editor (then storage.sql, then seed.sql).
--
-- Security model
--   * Public visitors (role "anon") can READ the active catalogue and site content.
--   * Every public WRITE goes through a SECURITY DEFINER function that validates
--     input and calculates prices and stock server-side (place_order, submit_contact,
--     track_event). Visitors can never read orders, messages or analytics.
--   * Admins are Supabase Auth users listed in public.admins. Self sign-up must be
--     disabled in the Supabase dashboard (see docs/SETUP.md).
-- =====================================================================

-- ---------- Admins ---------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;   -- no policies: not reachable via the API

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid()); $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------- Collections (themed boxes) --------------------------------
create table if not exists public.collections (
  id           bigint generated always as identity primary key,
  slug         text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name         text not null check (char_length(btrim(name)) between 2 and 60),
  tagline      text not null default '' check (char_length(tagline) <= 120),
  description  text not null default '' check (char_length(description) <= 1500),
  theme_color  text not null default '#6D5BD0' check (theme_color ~ '^#[0-9A-Fa-f]{6}$'),
  image_url    text check (image_url is null or (char_length(image_url) <= 1000 and image_url ~ '^(https://|images/)')),
  discount_pct numeric(5,2) not null default 10 check (discount_pct between 0 and 50),
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
drop trigger if exists trg_collections_touch on public.collections;
create trigger trg_collections_touch before update on public.collections
  for each row execute function public.touch_updated_at();

-- ---------- Products (individual items, each with its own stock) -------
create table if not exists public.products (
  id            bigint generated always as identity primary key,
  name          text not null check (char_length(btrim(name)) between 2 and 120),
  description   text not null default '' check (char_length(description) <= 2000),
  price_aed     numeric(10,2) not null check (price_aed > 0 and price_aed < 100000),
  category      text not null check (char_length(btrim(category)) between 2 and 40),
  collection_id bigint references public.collections(id) on delete set null,  -- home theme
  stock         integer not null default 0 check (stock between 0 and 100000),
  image_url     text check (image_url is null or (char_length(image_url) <= 1000 and image_url ~ '^(https://|images/)')),
  is_available  boolean not null default true,
  is_featured   boolean not null default false,
  is_archived   boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists products_collection_idx on public.products(collection_id);
drop trigger if exists trg_products_touch on public.products;
create trigger trg_products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------- Contents of each signature (ready-made) box --------------
create table if not exists public.collection_items (
  collection_id bigint not null references public.collections(id) on delete cascade,
  product_id    bigint not null references public.products(id) on delete cascade,
  quantity      integer not null default 1 check (quantity between 1 and 5),
  primary key (collection_id, product_id)
);

alter table public.collections      enable row level security;
alter table public.products         enable row level security;
alter table public.collection_items enable row level security;

drop policy if exists collections_read on public.collections;
create policy collections_read on public.collections for select to anon, authenticated
  using (is_active or public.is_admin());
drop policy if exists collections_admin_all on public.collections;
create policy collections_admin_all on public.collections for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists products_read on public.products;
create policy products_read on public.products for select to anon, authenticated
  using (not is_archived or public.is_admin());
drop policy if exists products_admin_all on public.products;
create policy products_admin_all on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists collection_items_read on public.collection_items;
create policy collection_items_read on public.collection_items for select to anon, authenticated
  using (true);
drop policy if exists collection_items_admin_all on public.collection_items;
create policy collection_items_admin_all on public.collection_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Orders ----------------------------------------------------
create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,
  client_token  uuid not null unique,              -- idempotency key from the browser
  customer_name text not null,
  email         text not null,
  phone         text not null,
  address       text not null,
  emirate       text not null,
  notes         text not null default '',
  subtotal_aed  numeric(10,2) not null,
  delivery_aed  numeric(10,2) not null,
  total_aed     numeric(10,2) not null,
  status        text not null default 'new' check (status in ('new','processing','fulfilled','cancelled')),
  is_demo       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists trg_orders_touch on public.orders;
create trigger trg_orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- One row per box in the order (signature or custom)
create table if not exists public.order_lines (
  id             bigint generated always as identity primary key,
  order_id       uuid not null references public.orders(id) on delete cascade,
  line_type      text not null check (line_type in ('signature','custom')),
  collection_id  bigint references public.collections(id) on delete set null,
  title          text not null,
  quantity       integer not null check (quantity between 1 and 10),
  unit_price_aed numeric(10,2) not null,
  line_total_aed numeric(10,2) not null,
  gift_message   text not null default ''
);
create index if not exists order_lines_order_idx on public.order_lines(order_id);

-- Item breakdown of each box: this is what stock is deducted from
create table if not exists public.order_line_items (
  id              bigint generated always as identity primary key,
  order_line_id   bigint not null references public.order_lines(id) on delete cascade,
  product_id      bigint references public.products(id) on delete set null,
  product_name    text not null,
  unit_price_aed  numeric(10,2) not null,
  qty_per_box     integer not null check (qty_per_box between 1 and 5),
  qty_total       integer not null check (qty_total >= 1)
);
create index if not exists order_line_items_line_idx on public.order_line_items(order_line_id);

alter table public.orders           enable row level security;
alter table public.order_lines      enable row level security;
alter table public.order_line_items enable row level security;

drop policy if exists orders_admin_read on public.orders;
create policy orders_admin_read on public.orders for select to authenticated using (public.is_admin());
drop policy if exists orders_admin_update on public.orders;
create policy orders_admin_update on public.orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists order_lines_admin_read on public.order_lines;
create policy order_lines_admin_read on public.order_lines for select to authenticated using (public.is_admin());
drop policy if exists order_line_items_admin_read on public.order_line_items;
create policy order_line_items_admin_read on public.order_line_items for select to authenticated using (public.is_admin());

-- ---------- Contact messages -----------------------------------------
create table if not exists public.contact_messages (
  id         bigint generated always as identity primary key,
  name       text not null,
  email      text not null,
  subject    text not null,
  message    text not null,
  handled    boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.contact_messages enable row level security;
drop policy if exists contact_admin_read on public.contact_messages;
create policy contact_admin_read on public.contact_messages for select to authenticated using (public.is_admin());
drop policy if exists contact_admin_update on public.contact_messages;
create policy contact_admin_update on public.contact_messages for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Privacy-light analytics ----------------------------------
-- No IP address, no user agent, no cookies. session_id is a random UUID kept in
-- the visitor's sessionStorage (one browser-tab session).
create table if not exists public.analytics_events (
  id            bigint generated always as identity primary key,
  event_type    text not null check (event_type in
                ('page_view','box_view','product_view','add_to_cart','builder_add_item',
                 'remove_from_cart','begin_checkout','order_placed','contact_submitted','search')),
  page          text not null check (char_length(page) <= 60),
  product_id    bigint,
  collection_id bigint,
  session_id    uuid not null,
  device        text not null check (device in ('mobile','tablet','desktop')),
  referrer      text check (referrer is null or char_length(referrer) <= 120),
  detail        text check (detail is null or char_length(detail) <= 80),
  created_at    timestamptz not null default now()
);
create index if not exists analytics_created_idx on public.analytics_events(created_at);
create index if not exists analytics_session_idx on public.analytics_events(session_id, created_at);
alter table public.analytics_events enable row level security;
drop policy if exists analytics_admin_read on public.analytics_events;
create policy analytics_admin_read on public.analytics_events for select to authenticated using (public.is_admin());

-- ---------- Editable site content (team, contact, mission…) -----------
create table if not exists public.site_settings (
  id         integer primary key default 1 check (id = 1),
  content    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_settings_touch on public.site_settings;
create trigger trg_settings_touch before update on public.site_settings
  for each row execute function public.touch_updated_at();
alter table public.site_settings enable row level security;
drop policy if exists settings_public_read on public.site_settings;
create policy settings_public_read on public.site_settings for select to anon, authenticated using (true);
drop policy if exists settings_admin_write on public.site_settings;
create policy settings_admin_write on public.site_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
insert into public.site_settings (id) values (1) on conflict (id) do nothing;

-- ---------- Least-privilege table grants (defence in depth on top of RLS)
revoke all on public.admins, public.collections, public.products, public.collection_items,
              public.orders, public.order_lines, public.order_line_items,
              public.contact_messages, public.analytics_events, public.site_settings
  from anon, authenticated;
grant select on public.collections, public.products, public.collection_items, public.site_settings
  to anon, authenticated;
grant insert, update, delete on public.collections, public.products, public.collection_items
  to authenticated;
grant select, update on public.orders, public.contact_messages to authenticated;
grant select on public.order_lines, public.order_line_items, public.analytics_events to authenticated;
grant update on public.site_settings to authenticated;

-- =====================================================================
-- place_order — the only way to create an order.
--
-- p_lines is a JSON array of boxes:
--   {"type":"signature","collection_id":1,"quantity":2}
--   {"type":"custom","items":[{"product_id":3,"quantity":1}, ...],"gift_message":"..."}
--
-- Pricing (all recalculated here; prices sent by the browser are ignored):
--   signature box = sum(item price × qty in box) × (1 − collection discount %)
--   custom box    = sum(item price × qty chosen) + AED 15 gift box & wrapping
--   delivery      = free when subtotal ≥ AED 200, otherwise AED 15
-- Stock: total units of every item across ALL boxes in the order are checked and
-- deducted together, inside one transaction, with the product rows locked.
-- =====================================================================
create or replace function public.place_order(
  p_client_token uuid,
  p_customer     jsonb,
  p_lines        jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  c_packaging constant numeric(10,2) := 15;
  v_existing public.orders%rowtype;
  v_name    text := btrim(coalesce(p_customer->>'name',''));
  v_email   text := lower(btrim(coalesce(p_customer->>'email','')));
  v_phone   text := btrim(coalesce(p_customer->>'phone',''));
  v_address text := btrim(coalesce(p_customer->>'address',''));
  v_emirate text := btrim(coalesce(p_customer->>'emirate',''));
  v_notes   text := btrim(coalesce(p_customer->>'notes',''));
  v_line    record;
  v_col     public.collections%rowtype;
  v_need    record;
  v_prod    public.products%rowtype;
  v_qty     int;
  v_gift    text;
  v_n       int;
  v_subtotal numeric(10,2);
  v_delivery numeric(10,2);
  v_order_id uuid;
  v_line_id  bigint;
  v_ref      text;
begin
  if p_client_token is null then raise exception 'INVALID_REQUEST' using errcode='P0001'; end if;

  -- Idempotency: a resubmitted form returns the original order instead of a duplicate.
  select * into v_existing from public.orders where client_token = p_client_token;
  if found then
    return jsonb_build_object('reference', v_existing.reference, 'total_aed', v_existing.total_aed, 'duplicate', true);
  end if;

  -- Customer validation (mirrors the browser checks; the server is authoritative)
  if char_length(v_name) not between 2 and 80 then raise exception 'INVALID_NAME' using errcode='P0001'; end if;
  if char_length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then raise exception 'INVALID_EMAIL' using errcode='P0001'; end if;
  if v_phone !~ '^\+?[0-9][0-9 \-]{6,18}$' then raise exception 'INVALID_PHONE' using errcode='P0001'; end if;
  if char_length(v_address) not between 5 and 300 then raise exception 'INVALID_ADDRESS' using errcode='P0001'; end if;
  if v_emirate not in ('Abu Dhabi','Dubai','Sharjah','Ajman','Umm Al Quwain','Ras Al Khaimah','Fujairah') then
    raise exception 'INVALID_EMIRATE' using errcode='P0001'; end if;
  if char_length(v_notes) > 500 then raise exception 'INVALID_NOTES' using errcode='P0001'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 10 then
    raise exception 'INVALID_CART' using errcode='P0001'; end if;

  -- Abuse guard for a public demo: global cap on order creation rate.
  if (select count(*) from public.orders where created_at > now() - interval '10 minutes') >= 60 then
    raise exception 'RATE_LIMITED' using errcode='P0001'; end if;

  -- Working tables for this call only
  drop table if exists pg_temp._mb_lines; drop table if exists pg_temp._mb_items;
  create temp table _mb_lines (line_no int primary key, line_type text, collection_id bigint,
                               title text, qty int, gift text, discount numeric, unit_price numeric(10,2)) on commit drop;
  create temp table _mb_items (line_no int, product_id bigint, per_box int,
                               primary key (line_no, product_id)) on commit drop;

  -- 1) Expand every box into its individual items
  for v_line in select e as j, ord from jsonb_array_elements(p_lines) with ordinality as t(e, ord) loop
    v_gift := left(btrim(coalesce(v_line.j->>'gift_message','')), 200);

    if v_line.j->>'type' = 'signature' then
      begin v_qty := (v_line.j->>'quantity')::int; exception when others then v_qty := null; end;
      if v_qty is null or v_qty not between 1 and 10 then raise exception 'INVALID_QUANTITY' using errcode='P0001'; end if;
      select * into v_col from public.collections
        where id = (v_line.j->>'collection_id')::bigint and is_active;
      if not found then raise exception 'BOX_UNAVAILABLE' using errcode='P0001'; end if;
      insert into pg_temp._mb_lines values (v_line.ord, 'signature', v_col.id, v_col.name || ' Box', v_qty, v_gift, v_col.discount_pct, null);
      insert into pg_temp._mb_items select v_line.ord, ci.product_id, ci.quantity
        from public.collection_items ci where ci.collection_id = v_col.id;
      get diagnostics v_n = row_count;
      if v_n = 0 then raise exception 'BOX_UNAVAILABLE:%', v_col.name using errcode='P0001'; end if;

    elsif v_line.j->>'type' = 'custom' then
      if jsonb_typeof(v_line.j->'items') is distinct from 'array' then raise exception 'INVALID_CART' using errcode='P0001'; end if;
      insert into pg_temp._mb_lines values (v_line.ord, 'custom', null, 'Build-Your-Own Box', 1, v_gift, 0, null);
      begin
        insert into pg_temp._mb_items
          select v_line.ord, (i->>'product_id')::bigint, sum((i->>'quantity')::int)
          from jsonb_array_elements(v_line.j->'items') i group by 2;
      exception when others then
        raise exception 'INVALID_QUANTITY' using errcode='P0001';
      end;
      select count(*) into v_n from pg_temp._mb_items where line_no = v_line.ord;
      if v_n not between 3 and 8 then raise exception 'CUSTOM_BOX_SIZE' using errcode='P0001'; end if;
      if exists (select 1 from pg_temp._mb_items where line_no = v_line.ord and (product_id is null or per_box is null or per_box not between 1 and 3)) then
        raise exception 'INVALID_QUANTITY' using errcode='P0001'; end if;
    else
      raise exception 'INVALID_CART' using errcode='P0001';
    end if;
  end loop;

  -- 2) Lock every product involved (id order avoids deadlocks) and check total demand
  for v_need in
    select i.product_id, sum(i.per_box * l.qty)::int as units
      from pg_temp._mb_items i join pg_temp._mb_lines l using (line_no)
     group by i.product_id order by i.product_id
  loop
    select * into v_prod from public.products where id = v_need.product_id for update;
    if not found or v_prod.is_archived or not v_prod.is_available then
      raise exception 'PRODUCT_UNAVAILABLE:%', coalesce(v_prod.name, v_need.product_id::text) using errcode='P0001';
    end if;
    if v_prod.stock < v_need.units then
      raise exception 'INSUFFICIENT_STOCK:%:%', v_prod.name, v_prod.stock using errcode='P0001';
    end if;
  end loop;

  -- 3) Price each box from current database prices
  with priced as (
    select l.line_no,
           sum(p.price_aed * i.per_box) as items_sum
      from pg_temp._mb_lines l join pg_temp._mb_items i using (line_no) join public.products p on p.id = i.product_id
     group by l.line_no
  )
  update pg_temp._mb_lines l set unit_price = case
      when l.line_type = 'signature' then round(pr.items_sum * (1 - l.discount / 100.0), 2)
      else pr.items_sum + c_packaging end
    from priced pr where pr.line_no = l.line_no;

  select sum(unit_price * qty) into v_subtotal from pg_temp._mb_lines;
  v_delivery := case when v_subtotal >= 200 then 0 else 15 end;

  -- 4) Unique human-friendly reference (Dubai date + random suffix)
  loop
    v_ref := 'MB-' || to_char(now() at time zone 'Asia/Dubai', 'YYMMDD') || '-' ||
             upper(substr(replace(gen_random_uuid()::text,'-',''), 1, 5));
    exit when not exists (select 1 from public.orders where reference = v_ref);
  end loop;

  begin
    insert into public.orders (reference, client_token, customer_name, email, phone, address, emirate, notes,
                               subtotal_aed, delivery_aed, total_aed)
    values (v_ref, p_client_token, v_name, v_email, v_phone, v_address, v_emirate, v_notes,
            v_subtotal, v_delivery, v_subtotal + v_delivery)
    returning id into v_order_id;
  exception when unique_violation then
    select * into v_existing from public.orders where client_token = p_client_token;
    if found then
      return jsonb_build_object('reference', v_existing.reference, 'total_aed', v_existing.total_aed, 'duplicate', true);
    end if;
    raise;
  end;

  -- 5) Record boxes and their item breakdown
  for v_line in select * from pg_temp._mb_lines order by line_no loop
    insert into public.order_lines (order_id, line_type, collection_id, title, quantity,
                                    unit_price_aed, line_total_aed, gift_message)
    values (v_order_id, v_line.line_type, v_line.collection_id, v_line.title, v_line.qty,
            v_line.unit_price, v_line.unit_price * v_line.qty, v_line.gift)
    returning id into v_line_id;

    insert into public.order_line_items (order_line_id, product_id, product_name, unit_price_aed, qty_per_box, qty_total)
    select v_line_id, p.id, p.name, p.price_aed, i.per_box, i.per_box * v_line.qty
      from pg_temp._mb_items i join public.products p on p.id = i.product_id
     where i.line_no = v_line.line_no;
  end loop;

  -- 6) Deduct stock for every individual item
  update public.products p set stock = p.stock - d.units
    from (select i.product_id, sum(i.per_box * l.qty)::int units
            from pg_temp._mb_items i join pg_temp._mb_lines l using (line_no) group by i.product_id) d
   where p.id = d.product_id;

  return jsonb_build_object('reference', v_ref, 'subtotal_aed', v_subtotal, 'delivery_aed', v_delivery,
                            'total_aed', v_subtotal + v_delivery, 'duplicate', false);
end $$;

-- =====================================================================
-- submit_contact
-- =====================================================================
create or replace function public.submit_contact(p_name text, p_email text, p_subject text, p_message text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name,''));
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_subject text := btrim(coalesce(p_subject,''));
  v_message text := btrim(coalesce(p_message,''));
begin
  if char_length(v_name) not between 2 and 80 then raise exception 'INVALID_NAME' using errcode='P0001'; end if;
  if char_length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then raise exception 'INVALID_EMAIL' using errcode='P0001'; end if;
  if char_length(v_subject) not between 2 and 120 then raise exception 'INVALID_SUBJECT' using errcode='P0001'; end if;
  if char_length(v_message) not between 10 and 2000 then raise exception 'INVALID_MESSAGE' using errcode='P0001'; end if;
  if (select count(*) from public.contact_messages where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'RATE_LIMITED' using errcode='P0001'; end if;
  insert into public.contact_messages (name, email, subject, message) values (v_name, v_email, v_subject, v_message);
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
-- track_event — anonymous analytics; drops floods and malformed events silently
-- =====================================================================
create or replace function public.track_event(
  p_event_type text, p_page text, p_session_id uuid, p_device text,
  p_product_id bigint default null, p_collection_id bigint default null,
  p_referrer text default null, p_detail text default null
) returns void language plpgsql security definer set search_path = public
as $$
begin
  if p_session_id is null then return; end if;
  if (select count(*) from public.analytics_events
       where session_id = p_session_id and created_at > now() - interval '1 minute') >= 60 then
    return;
  end if;
  insert into public.analytics_events (event_type, page, product_id, collection_id, session_id, device, referrer, detail)
  values (p_event_type, left(coalesce(p_page,'unknown'), 60), p_product_id, p_collection_id, p_session_id,
          p_device, left(p_referrer, 120), left(p_detail, 80));
exception when check_violation or not_null_violation then
  return;
end $$;

-- =====================================================================
-- analytics_report — admin-only weekly report for Stage 3
-- =====================================================================
create or replace function public.analytics_report(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_to <= p_from or p_to - p_from > interval '93 days' then raise exception 'INVALID_RANGE' using errcode='P0001'; end if;

  with ev as (select *, (created_at at time zone 'Asia/Dubai')::date as d
                from public.analytics_events where created_at >= p_from and created_at < p_to),
       ord as (select *, (created_at at time zone 'Asia/Dubai')::date as d
                 from public.orders where created_at >= p_from and created_at < p_to and status <> 'cancelled')
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'totals', jsonb_build_object(
      'sessions',        (select count(distinct session_id) from ev),
      'page_views',      (select count(*) from ev where event_type='page_view'),
      'box_views',       (select count(*) from ev where event_type='box_view'),
      'add_to_cart',     (select count(*) from ev where event_type='add_to_cart'),
      'builder_adds',    (select count(*) from ev where event_type='builder_add_item'),
      'begin_checkout',  (select count(*) from ev where event_type='begin_checkout'),
      'orders',          (select count(*) from ord),
      'revenue_aed',     (select coalesce(sum(total_aed),0) from ord),
      'avg_order_aed',   (select coalesce(round(avg(total_aed),2),0) from ord),
      'contact_messages',(select count(*) from ev where event_type='contact_submitted'),
      'cart_sessions',   (select count(distinct session_id) from ev where event_type='add_to_cart'),
      'checkout_sessions',(select count(distinct session_id) from ev where event_type='begin_checkout'),
      'order_sessions',  (select count(distinct session_id) from ev where event_type='order_placed')
    ),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
        'day', to_char(gs, 'YYYY-MM-DD'),
        'sessions',    (select count(distinct session_id) from ev where d = gs::date),
        'page_views',  (select count(*) from ev where event_type='page_view' and d = gs::date),
        'add_to_cart', (select count(*) from ev where event_type='add_to_cart' and d = gs::date),
        'orders',      (select count(*) from ord where d = gs::date),
        'revenue_aed', (select coalesce(sum(total_aed),0) from ord where d = gs::date)) order by gs)
      from generate_series((p_from at time zone 'Asia/Dubai')::date,
                           ((p_to - interval '1 second') at time zone 'Asia/Dubai')::date, interval '1 day') gs), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(jsonb_build_object('page', page, 'views', n) order by n desc)
        from (select page, count(*) n from ev where event_type='page_view' group by page) x), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('device', device, 'sessions', n) order by n desc)
        from (select device, count(distinct session_id) n from ev group by device) x), '[]'::jsonb),
    'referrers', coalesce((select jsonb_agg(jsonb_build_object('source', src, 'sessions', n) order by n desc)
        from (select coalesce(nullif(referrer,''),'direct') src, count(distinct session_id) n
                from ev where event_type='page_view' group by 1 limit 10) x), '[]'::jsonb),
    'boxes', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'views', coalesce(s.views,0), 'adds', coalesce(s.adds,0),
                                                           'units_sold', coalesce(u.units,0)) order by coalesce(u.units,0) desc, coalesce(s.views,0) desc)
        from public.collections c
        left join (select collection_id, count(*) filter (where event_type='box_view') views,
                          count(*) filter (where event_type='add_to_cart') adds
                     from ev where collection_id is not null group by collection_id) s on s.collection_id = c.id
        left join (select ol.collection_id, sum(ol.quantity) units from public.order_lines ol join ord on ord.id = ol.order_id
                    where ol.line_type='signature' group by ol.collection_id) u on u.collection_id = c.id
        where s.collection_id is not null or u.collection_id is not null), '[]'::jsonb),
    -- every item that was viewed, added in the builder OR sold (directly or inside a signature box)
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(p.name, '#'||ids.product_id),
                                                           'views', coalesce(s.views,0), 'builder_adds', coalesce(s.adds,0),
                                                           'units_sold', coalesce(u.units,0)) order by coalesce(u.units,0) desc, coalesce(s.adds,0) desc, coalesce(s.views,0) desc)
        from (select product_id from ev where product_id is not null
              union
              select oli.product_id from public.order_line_items oli join public.order_lines ol on ol.id = oli.order_line_id
                join ord on ord.id = ol.order_id where oli.product_id is not null) ids
        left join (select product_id, count(*) filter (where event_type='product_view') views,
                          count(*) filter (where event_type='builder_add_item') adds
                     from ev where product_id is not null group by product_id) s on s.product_id = ids.product_id
        left join public.products p on p.id = ids.product_id
        left join (select oli.product_id, sum(oli.qty_total) units
                     from public.order_line_items oli join public.order_lines ol on ol.id = oli.order_line_id
                     join ord on ord.id = ol.order_id group by oli.product_id) u on u.product_id = ids.product_id), '[]'::jsonb),
    'searches', coalesce((select jsonb_agg(jsonb_build_object('term', term, 'count', n) order by n desc)
        from (select lower(detail) term, count(*) n from ev where event_type='search' and detail is not null
               group by 1 order by 2 desc limit 15) x), '[]'::jsonb),
    'order_types', coalesce((select jsonb_agg(jsonb_build_object('type', line_type, 'boxes', n))
        from (select ol.line_type, sum(ol.quantity) n from public.order_lines ol join ord on ord.id = ol.order_id
               group by 1) x), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- ---------- Keep-alive probe (used by the GitHub Action) --------------
-- Reads a real table so Supabase counts it as database activity (free projects pause after ~7 inactive days)
create or replace function public.ping() returns text language sql stable security definer set search_path = public
as $$ select 'ok:' || count(*)::text from public.products $$;

-- ---------- Function privileges ----------------------------------------
revoke all on function public.place_order(uuid, jsonb, jsonb) from public;
revoke all on function public.submit_contact(text, text, text, text) from public;
revoke all on function public.track_event(text, text, uuid, text, bigint, bigint, text, text) from public;
revoke all on function public.analytics_report(timestamptz, timestamptz) from public;
revoke all on function public.is_admin() from public;
revoke all on function public.ping() from public;
grant execute on function public.place_order(uuid, jsonb, jsonb) to anon, authenticated;
grant execute on function public.submit_contact(text, text, text, text) to anon, authenticated;
grant execute on function public.track_event(text, text, uuid, text, bigint, bigint, text, text) to anon, authenticated;
grant execute on function public.analytics_report(timestamptz, timestamptz) to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.ping() to anon, authenticated;
