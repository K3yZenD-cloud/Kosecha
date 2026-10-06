-- =====================================================================
-- Esquema y seguridad (Row Level Security) para kosecha-catalogo
--
-- Cómo usar:
--   1. Entra a tu proyecto en https://supabase.com/dashboard
--   2. Ve a "SQL Editor" → "New query"
--   3. Pega todo este archivo y ejecútalo (Run)
--
-- Por qué es necesario:
--   Por defecto, Supabase le otorga a los roles "anon" y "authenticated"
--   permisos de SELECT/INSERT/UPDATE/DELETE sobre cualquier tabla nueva
--   en el esquema "public". Como SUPABASE_ANON_KEY es una clave pública
--   (se usa en el navegador), sin estas políticas cualquier persona que
--   conozca esa clave podría leer, modificar o borrar el catálogo
--   directamente vía la API de Supabase, sin pasar por el login del panel.
--
--   El panel administrador siempre escribe usando SUPABASE_SERVICE_ROLE_KEY,
--   que "bypassea" RLS automáticamente. Por eso basta con dejar sólo
--   lectura pública (SELECT) para anon/authenticated y nada de escritura.
-- =====================================================================

/* ---------------------- Tablas ---------------------- */

create table if not exists public.catalog_meta (
  id bigint primary key generated always as identity,
  business_name text not null default 'Kosecha',
  tagline text default '',
  footer_note text default '',
  contact text default '',
  logo_url text,
  updated_at timestamp default now(),
  constraint only_one_row check (id = 1)
);

create table if not exists public.sections (
  id text primary key,
  name text not null,
  "order" integer default 0,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.products (
  id text primary key,
  section_id text not null references public.sections(id) on delete cascade,
  name text not null,
  weight text,
  price numeric(10, 2) not null,
  wholesale_price text,
  variants jsonb not null default '[]'::jsonb,
  image_url text,
  "order" integer default 0,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

alter table public.products add column if not exists wholesale_price text;
alter table public.products add column if not exists variants jsonb not null default '[]'::jsonb;

insert into public.catalog_meta (id, business_name, tagline, footer_note, contact)
values (1, 'Kosecha', 'Del campo a tu mesa', 'Hecho a mano, con cariño y de temporada.', 'contacto@kosecha.cl · Santiago, Chile')
on conflict (id) do nothing;

create index if not exists idx_products_section_id on public.products(section_id);
create index if not exists idx_products_order on public.products("order");
create index if not exists idx_sections_order on public.sections("order");

/* ---------------- Row Level Security: tablas ---------------- */

alter table public.catalog_meta enable row level security;
alter table public.sections enable row level security;
alter table public.products enable row level security;

-- Quita los permisos amplios que Supabase otorga por defecto.
revoke all on public.catalog_meta from anon, authenticated;
revoke all on public.sections from anon, authenticated;
revoke all on public.products from anon, authenticated;

-- Sólo lectura pública (el catálogo es visible para cualquier visitante).
grant select on public.catalog_meta to anon, authenticated;
grant select on public.sections to anon, authenticated;
grant select on public.products to anon, authenticated;

drop policy if exists "Public read catalog_meta" on public.catalog_meta;
create policy "Public read catalog_meta" on public.catalog_meta
  for select to anon, authenticated using (true);

drop policy if exists "Public read sections" on public.sections;
create policy "Public read sections" on public.sections
  for select to anon, authenticated using (true);

drop policy if exists "Public read products" on public.products;
create policy "Public read products" on public.products
  for select to anon, authenticated using (true);

-- No se crean políticas de INSERT/UPDATE/DELETE para anon/authenticated:
-- el panel administrador escribe siempre con SUPABASE_SERVICE_ROLE_KEY,
-- que bypassea RLS, así que la ausencia de políticas de escritura aquí
-- bloquea cualquier intento de escritura con la clave pública (anon).

/* ---------------- Storage: bucket "uploads" ---------------- */

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

drop policy if exists "Public Select" on storage.objects;
drop policy if exists "Admin Insert" on storage.objects;
drop policy if exists "Admin Delete" on storage.objects;

-- Lectura pública de imágenes (necesaria para mostrar el catálogo).
create policy "Public Select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'uploads');

-- A propósito NO se crean políticas de insert/update/delete para
-- anon/authenticated: subir o borrar imágenes sólo debe poder hacerlo
-- el backend autenticado, que usa SUPABASE_SERVICE_ROLE_KEY (bypassa RLS).
