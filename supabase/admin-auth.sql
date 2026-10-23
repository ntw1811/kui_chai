-- Run AFTER schema.sql. Transaction preserves existing records and revokes browser access.
begin;
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.app_users (
 id uuid primary key default gen_random_uuid(), username text not null unique,
 password_hash text not null, enabled boolean not null default true,
 failed_attempts integer not null default 0, locked_until timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.app_sessions (
 token_hash text primary key, user_id uuid not null references public.app_users(id),
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
insert into public.app_users(id,username,password_hash,enabled)
select distinct owner_id,'legacy_'||owner_id::text,'disabled',false from (
 select owner_id from public.locations union select owner_id from public.periods union select owner_id from public.daily_records
 union select owner_id from public.stock_items union select owner_id from public.stock_movements
) owners on conflict(id) do nothing;
insert into public.app_users(id,username,password_hash)
values ('a0338aa6-728f-4ff5-9b71-8212adb12712','admin',extensions.crypt('12345678',extensions.gen_salt('bf',12)))
on conflict(username) do nothing;
do $$ declare t text; begin
 foreach t in array array['locations','periods','daily_records','stock_items','stock_movements'] loop
  execute format('alter table public.%I drop constraint if exists %I',t,t||'_owner_id_fkey');
  execute format('alter table public.%I alter column owner_id drop default',t);
  execute format('alter table public.%I add constraint %I foreign key(owner_id) references public.app_users(id)',t,t||'_owner_id_fkey');
  execute format('drop policy if exists owner_access on public.%I',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end $$;
alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
revoke all on public.app_users,public.app_sessions from anon,authenticated;
grant select,insert,update,delete on public.app_users,public.app_sessions to service_role;
create index if not exists app_sessions_expiry on public.app_sessions(expires_at);
create or replace function public.app_login(login_name text,login_password text)
returns table(id uuid,username text) language plpgsql security definer set search_path=public,extensions as $$
declare account public.app_users;
begin
 select * into account from public.app_users u where u.username=login_name for update;
 if not found then perform extensions.crypt(login_password,extensions.gen_salt('bf',12)); return; end if;
 if not account.enabled or account.locked_until>now() then return; end if;
 if extensions.crypt(login_password,account.password_hash)<>account.password_hash then
  update public.app_users set failed_attempts=case when account.failed_attempts>=4 then 0 else account.failed_attempts+1 end,
  locked_until=case when account.failed_attempts>=4 then now()+interval '15 minutes' else null end where app_users.id=account.id;
  return;
 end if;
 update public.app_users set failed_attempts=0,locked_until=null where app_users.id=account.id;
 delete from public.app_sessions where expires_at<now();
 return query select account.id,account.username;
end $$;
revoke all on function public.app_login(text,text) from public,anon,authenticated;
grant execute on function public.app_login(text,text) to service_role;
commit;
-- Existing owner IDs are retained under disabled legacy accounts. Do not relabel historical
-- ownership automatically. If you already have data, explicitly choose its migration to admin.
