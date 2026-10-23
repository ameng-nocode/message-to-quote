-- Message to Quote: everything the app keeps in Supabase.
-- One company per Supabase project. The first account that signs up is the owner; after that only emails
-- the owner invited can sign up. Every table is locked to members of the company (row level security).

-- ---------------------------------------------------------------- people

create table public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now()
);

create table public.invites (
  email text primary key check (email = lower(email)),
  role text not null default 'member' check (role in ('member')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid());
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid() and role = 'owner');
$$;

-- What the login page needs before anyone signs in: is there an owner yet?
create or replace function public.has_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where role = 'owner');
$$;

-- Every new account: the first one becomes the owner, an invited email becomes a member, anyone else is refused.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('message-to-quote:first-owner'));
  if not exists (select 1 from public.members where role = 'owner') then
    insert into public.members (user_id, email, role) values (new.id, lower(new.email), 'owner');
    return new;
  end if;
  if exists (select 1 from public.invites where email = lower(new.email)) then
    insert into public.members (user_id, email, role)
      select new.id, lower(new.email), role from public.invites where email = lower(new.email);
    delete from public.invites where email = lower(new.email);
    return new;
  end if;
  raise exception 'NOT_INVITED: ask the owner to invite this email first';
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Someone who already has an account (removed earlier, then invited again) joins by signing in.
create or replace function public.accept_invite() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or mail = '' then return false; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then return true; end if;
  if not exists (select 1 from public.invites where email = mail) then return false; end if;
  insert into public.members (user_id, email, role) select auth.uid(), mail, role from public.invites where email = mail;
  delete from public.invites where email = mail;
  return true;
end;
$$;

-- ---------------------------------------------------------------- settings (one row)

create table public.settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default '',
  company_reg_no text not null default '',
  company_address text not null default '',
  company_phone text not null default '',
  company_email text not null default '',
  company_website text not null default '',
  company_logo text not null default '',
  currency text not null default 'RM',
  quote_title text not null default 'QUOTATION',
  quote_prefix text not null default 'QT',
  valid_days int not null default 14,
  default_delivery text not null default '',
  default_payment text not null default '',
  default_notes text not null default '',
  bank_details text not null default '',
  footer text not null default '',
  show_photo boolean not null default true,
  show_code boolean not null default true,
  show_unit boolean not null default true,
  show_discount boolean not null default false,
  tax_enabled boolean not null default false,
  tax_name text not null default 'SST',
  tax_rate numeric(6, 3) not null default 8,
  wa_country_code text not null default '60',
  wa_message text not null default '',
  updated_at timestamptz not null default now()
);

create table public.price_lists (
  id text primary key,
  name text not null,
  position int not null default 0
);

-- ---------------------------------------------------------------- products

create table public.products (
  id text primary key,
  code text not null default '',
  name text not null,
  variant text not null default '',
  category text not null default '',
  unit text not null default '',
  price numeric(14, 2) not null default 0,
  photo text not null default '',
  description text not null default '',
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A product's price in the other price lists. The standard price lives on the product itself.
create table public.product_prices (
  product_id text not null references public.products (id) on delete cascade,
  price_list_id text not null,
  price numeric(14, 2) not null,
  primary key (product_id, price_list_id)
);
create index product_prices_list on public.product_prices (price_list_id);

-- A deleted price list takes its prices with it.
create or replace function public.drop_list_prices() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.product_prices where price_list_id = old.id;
  return old;
end;
$$;
create trigger on_price_list_deleted after delete on public.price_lists for each row execute function public.drop_list_prices();

-- ---------------------------------------------------------------- customers

create table public.customers (
  id text primary key,
  name text not null,
  contact text not null default '',
  tel text not null default '',
  email text not null default '',
  address1 text not null default '',
  address2 text not null default '',
  reg_no text not null default '',
  is_sample boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- quotations

create table public.quotations (
  id text primary key,
  number text not null,
  status text not null default 'Draft' check (status in ('Draft', 'Sent')),
  date date not null,
  valid_days int not null default 0,
  bill_name text not null default '',
  bill_contact text not null default '',
  bill_tel text not null default '',
  bill_email text not null default '',
  bill_address1 text not null default '',
  bill_address2 text not null default '',
  bill_reg_no text not null default '',
  same_delivery boolean not null default true,
  ship_name text not null default '',
  ship_contact text not null default '',
  ship_tel text not null default '',
  ship_email text not null default '',
  ship_address1 text not null default '',
  ship_address2 text not null default '',
  ship_reg_no text not null default '',
  price_list_id text not null default 'standard',
  delivery text not null default '',
  payment text not null default '',
  notes text not null default '',
  tax_rate numeric(6, 3) not null default 0,
  -- the customer's message when Add with AI built the quotation
  source_kind text check (source_kind in ('screenshot', 'photo', 'text')),
  source_text text,
  source_image text,
  source_matched int,
  source_total int,
  source_not_carried text[],
  source_customer_name text,
  source_customer_matched boolean,
  source_at timestamptz,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quotations_date on public.quotations (date desc);

create table public.quote_lines (
  id text primary key,
  quotation_id text not null references public.quotations (id) on delete cascade,
  position int not null default 0,
  product_id text, -- no foreign key on purpose: a quotation keeps its lines when a product is deleted
  code text not null default '',
  name text not null default '',
  variant text not null default '',
  unit text not null default '',
  photo text not null default '',
  qty numeric(14, 3) not null default 0,
  unit_price numeric(14, 2) not null default 0,
  discount numeric(6, 3) not null default 0,
  price_list text not null default 'custom'
);
create index quote_lines_quotation on public.quote_lines (quotation_id, position);

-- ---------------------------------------------------------------- row level security

alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.settings enable row level security;
alter table public.price_lists enable row level security;
alter table public.products enable row level security;
alter table public.product_prices enable row level security;
alter table public.customers enable row level security;
alter table public.quotations enable row level security;
alter table public.quote_lines enable row level security;

create policy "members see the team" on public.members for select to authenticated using (public.is_member());
create policy "owner removes others" on public.members for delete to authenticated using (public.is_owner() and user_id <> auth.uid());

create policy "owner sees invites" on public.invites for select to authenticated using (public.is_owner());
create policy "owner invites" on public.invites for insert to authenticated with check (public.is_owner());
create policy "owner cancels invites" on public.invites for delete to authenticated using (public.is_owner());

create policy "members use settings" on public.settings for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members use price lists" on public.price_lists for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members use products" on public.products for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members use product prices" on public.product_prices for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members use customers" on public.customers for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members use quotations" on public.quotations for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members use quote lines" on public.quote_lines for all to authenticated using (public.is_member()) with check (public.is_member());

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.drop_list_prices() from public, anon, authenticated;
grant execute on function public.has_owner() to anon, authenticated;
grant execute on function public.is_member() to authenticated;
grant execute on function public.is_owner() to authenticated;
revoke all on function public.accept_invite() from public, anon;
grant execute on function public.accept_invite() to authenticated;

-- ---------------------------------------------------------------- pictures (product photos, logo)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pictures', 'pictures', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "members read pictures" on storage.objects for select to authenticated using (bucket_id = 'pictures' and public.is_member());
create policy "members add pictures" on storage.objects for insert to authenticated with check (bucket_id = 'pictures' and public.is_member());
create policy "members change pictures" on storage.objects for update to authenticated using (bucket_id = 'pictures' and public.is_member());
create policy "members remove pictures" on storage.objects for delete to authenticated using (bucket_id = 'pictures' and public.is_member());
