-- Skin advice: AI cosmetics/supplement recommendations shown on /skin dashboard

create table if not exists skin_advice (
  id uuid primary key default gen_random_uuid(),
  ai_advice jsonb,
  product_count integer,
  created_at timestamptz default now()
);

create index if not exists idx_skin_advice_created on skin_advice(created_at);

-- RLS (allow-all single-user pattern)
alter table skin_advice enable row level security;

drop policy if exists "Allow all" on skin_advice;

create policy "Allow all" on skin_advice for all using (true) with check (true);
