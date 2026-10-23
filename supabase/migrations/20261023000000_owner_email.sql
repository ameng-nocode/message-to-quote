-- The owner's email, written by `npm run setup:supabase -- --owner-email you@example.com`.
-- Once it is set, only that email can create the owner account, so nobody else can claim an empty project
-- (for example after the app is put online but before the owner signed up).
-- Without it (a local test database), the first account is the owner, as before.

create table public.owner_email (
  id int primary key default 1 check (id = 1),
  email text not null check (email = lower(email))
);
alter table public.owner_email enable row level security;
-- no policies on purpose: only the setup (service key) and the sign-up trigger below read or write it

-- For the login page and `npm run setup:check`: is the owner email set? (yes / no, never the email itself)
create or replace function public.owner_locked() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.owner_email);
$$;
grant execute on function public.owner_locked() to anon, authenticated;

-- Every new account: the owner email (or, when none is set, the first account) becomes the owner,
-- an invited email becomes a member, anyone else is refused.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('message-to-quote:first-owner'));
  if not exists (select 1 from public.members where role = 'owner') then
    if exists (select 1 from public.owner_email) and not exists (select 1 from public.owner_email where email = lower(new.email)) then
      raise exception 'NOT_OWNER_EMAIL: only the email given at setup can create the owner account';
    end if;
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
revoke all on function public.handle_new_user() from public, anon, authenticated;
