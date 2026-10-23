-- Run once in Supabase SQL Editor; existing equipment and daily records are preserved.
begin;
alter table public.stock_items add column if not exists kind text not null default 'equipment' check(kind in ('product','equipment'));
alter table public.stock_items add column if not exists cost numeric(12,2) not null default 0 check(cost>=0);
alter table public.stock_items add column if not exists price numeric(12,2) not null default 0 check(price>=0);
commit;
