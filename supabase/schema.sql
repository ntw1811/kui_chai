-- Run once in Supabase SQL Editor. No service-role key is needed in the website.
create table public.locations (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id),
 name text not null check(length(trim(name))>0), created_at timestamptz not null default now(), unique(id,owner_id), unique(owner_id,name)
);
create table public.periods (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id),
 location_id uuid not null, name text not null check(length(trim(name))>0), starts_on date not null, ends_on date not null,
 daily_rent numeric(12,2) not null default 0 check(daily_rent>=0), daily_wage numeric(12,2) not null default 0 check(daily_wage>=0),
 check(ends_on>=starts_on), foreign key(location_id,owner_id) references public.locations(id,owner_id), unique(id,owner_id)
);
create table public.daily_records (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id), period_id uuid not null,
 sale_date date not null, revenue numeric(12,2) not null default 0 check(revenue>=0),
 items jsonb not null default '[]'::jsonb check(jsonb_typeof(items)='array'),
 expenses jsonb not null default '[]'::jsonb check(jsonb_typeof(expenses)='array'), note text not null default '',
 updated_at timestamptz not null default now(), foreign key(period_id,owner_id) references public.periods(id,owner_id), unique(period_id,sale_date)
);
create table public.stock_items (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id),
 name text not null check(length(trim(name))>0), unit text not null default 'ชิ้น', unique(id,owner_id), unique(owner_id,name)
);
create table public.stock_movements (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id),
 stock_item_id uuid not null, location_id uuid not null, moved_on date not null,
 quantity numeric(12,3) not null check(quantity<>0), reason text not null check(length(trim(reason))>0),
 foreign key(stock_item_id,owner_id) references public.stock_items(id,owner_id), foreign key(location_id,owner_id) references public.locations(id,owner_id)
);
create function public.validate_daily_record() returns trigger language plpgsql set search_path=public as $$
declare p public.periods; entry jsonb;
begin
 select * into p from public.periods where id=new.period_id and owner_id=new.owner_id for share;
 if not found or new.sale_date<p.starts_on or new.sale_date>p.ends_on then raise exception 'วันที่อยู่นอกรอบขาย'; end if;
 for entry in select value from jsonb_array_elements(new.items) loop
  if nullif(trim(entry->>'name'),'') is null or (entry->>'quantity') is null or (entry->>'cost') is null or (entry->>'price') is null
   or (entry->>'quantity')::numeric<0 or (entry->>'cost')::numeric<0 or (entry->>'price')::numeric<0 then raise exception 'รายการสินค้าไม่ถูกต้อง'; end if;
 end loop;
 for entry in select value from jsonb_array_elements(new.expenses) loop
  if nullif(trim(entry->>'name'),'') is null or (entry->>'amount') is null or (entry->>'amount')::numeric<0 then raise exception 'ค่าใช้จ่ายไม่ถูกต้อง'; end if;
 end loop;
 new.updated_at=now(); return new;
end $$;
create trigger validate_daily before insert or update on public.daily_records for each row execute function public.validate_daily_record();
create function public.validate_period_update() returns trigger language plpgsql set search_path=public as $$
begin
 if exists(select 1 from public.daily_records where period_id=new.id and (sale_date<new.starts_on or sale_date>new.ends_on)) then raise exception 'มีบัญชีรายวันอยู่นอกช่วงวันที่ใหม่'; end if;
 return new;
end $$;
create trigger validate_period before update on public.periods for each row execute function public.validate_period_update();
-- Every table is private to its owner; unauthenticated requests cannot access shop records.
do $$ declare t text; begin
 foreach t in array array['locations','periods','daily_records','stock_items','stock_movements'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy owner_access on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('revoke all on public.%I from anon',t);
 end loop;
end $$;
create index daily_owner_date on public.daily_records(owner_id,sale_date);
create index periods_owner on public.periods(owner_id);
create index movements_owner on public.stock_movements(owner_id,stock_item_id,location_id);
