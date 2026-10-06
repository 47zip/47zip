create extension if not exists pgcrypto;
create table if not exists public.user_roles (user_id uuid primary key references auth.users(id) on delete cascade, role text not null check (role in ('admin','customer')) default 'customer', created_at timestamptz not null default now());
create or replace function public.has_role(who uuid, wanted text)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles r where r.user_id = who and r.role = wanted) $$;
create table if not exists public.products (
 id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null, description text not null default '', category text not null default '',
 format text not null check (format in ('pdf','docx','zip','rar')), price_mxn_cents integer not null check (price_mxn_cents > 0),
 published boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.product_assets (product_id uuid primary key references public.products(id) on delete cascade, source_path text not null unique, source_name text not null, source_size bigint not null check (source_size > 0), created_at timestamptz not null default now());
create table if not exists public.orders (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 status text not null check (status in ('pending','paid','failed','refunded','fulfillment_failed')) default 'pending',
 provider text not null check (provider in ('paypal','nowpayments')), external_order_id text unique,
 currency text not null default 'MXN', amount_mxn_cents integer not null check (amount_mxn_cents > 0),
 created_at timestamptz not null default now(), paid_at timestamptz
);
create table if not exists public.order_items (item_id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade, product_id uuid references public.products(id) on delete set null, product_name text not null, product_format text not null, unit_price_mxn_cents integer not null check (unit_price_mxn_cents > 0));
create table if not exists public.download_packages (order_id uuid primary key references public.orders(id) on delete cascade, blob_path text not null unique, password_ciphertext text not null, password_nonce text not null, password_tag text not null, download_count integer not null default 0 check (download_count >= 0), max_downloads integer not null default 5 check (max_downloads between 1 and 20), created_at timestamptz not null default now());
revoke all on function public.has_role(uuid,text) from public, anon;
grant execute on function public.has_role(uuid,text) to authenticated, service_role;
create table if not exists public.payment_events (provider text not null, event_id text not null, processed_at timestamptz not null default now(), primary key (provider,event_id));
create index if not exists orders_user_created_idx on public.orders(user_id,created_at desc);
create index if not exists orders_status_created_idx on public.orders(status,created_at desc);
create index if not exists products_published_idx on public.products(published,created_at desc);
alter table public.user_roles enable row level security;
alter table public.products enable row level security;
alter table public.product_assets enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.download_packages enable row level security;
alter table public.payment_events enable row level security;
create policy "read own role" on public.user_roles for select to authenticated using (user_id=(select auth.uid()));
create policy "public reads published catalog" on public.products for select to anon,authenticated using (published);
create policy "admin manages products" on public.products for all to authenticated using (public.has_role((select auth.uid()),'admin') and (auth.jwt()->>'aal')='aal2') with check (public.has_role((select auth.uid()),'admin') and (auth.jwt()->>'aal')='aal2');
create policy "admin manages private source metadata" on public.product_assets for all to authenticated using (public.has_role((select auth.uid()),'admin') and (auth.jwt()->>'aal')='aal2') with check (public.has_role((select auth.uid()),'admin') and (auth.jwt()->>'aal')='aal2');
create policy "customer reads own orders" on public.orders for select to authenticated using (user_id=(select auth.uid()));
create policy "admin reads orders" on public.orders for select to authenticated using (public.has_role((select auth.uid()),'admin') and (auth.jwt()->>'aal')='aal2');
create policy "customer reads own order items" on public.order_items for select to authenticated using (exists (select 1 from public.orders o where o.id=order_id and o.user_id=(select auth.uid())));
create policy "admin reads order items" on public.order_items for select to authenticated using (public.has_role((select auth.uid()),'admin') and (auth.jwt()->>'aal')='aal2');
-- No client policies for generated packages or payment events.

create or replace function public.consume_download(p_order_id uuid, p_user_id uuid)
returns setof public.download_packages language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.orders o where o.id = p_order_id and o.user_id = p_user_id and o.status = 'paid') then
    return;
  end if;
  return query update public.download_packages d set download_count = d.download_count + 1
    where d.order_id = p_order_id and d.download_count < d.max_downloads
    returning d.*;
end;
$$;
revoke all on function public.consume_download(uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_download(uuid, uuid) to service_role;

create or replace function public.get_admin_summary()
returns table (total_sales bigint, total_revenue_cents bigint, product_count bigint)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') or coalesce(auth.jwt()->>'aal', '') <> 'aal2' then
    raise insufficient_privilege using message = 'Admin MFA session required.';
  end if;
  return query select
    (select count(*)::bigint from public.orders where paid_at is not null and status in ('paid','fulfillment_failed')),
    (select coalesce(sum(amount_mxn_cents), 0)::bigint from public.orders where paid_at is not null and status in ('paid','fulfillment_failed')),
    (select count(*)::bigint from public.products where published);
end;
$$;
revoke all on function public.get_admin_summary() from public, anon;
grant execute on function public.get_admin_summary() to authenticated;

