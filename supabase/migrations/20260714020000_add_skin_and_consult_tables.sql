-- Skincare module tables

create table if not exists skin_profile (
  id uuid primary key default gen_random_uuid(),
  self_description text,
  ai_skin_type text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists skin_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in
    ('cleanser','toner','serum','moisturizer','sunscreen','treatment','supplement','other')),
  brand text,
  ingredients text,
  usage_timing text,
  started_on date,
  ended_on date,
  notes text,
  created_at timestamptz default now()
);

create table if not exists skin_checkins (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  front_photo_path text,
  left_photo_path text,
  right_photo_path text,
  self_note text,
  score_acne numeric,
  score_pores numeric,
  score_redness numeric,
  score_oiliness numeric,
  score_texture numeric,
  score_overall numeric,
  ai_analysis jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_skin_checkins_date on skin_checkins(date);

-- Consult module tables

create table if not exists consult_cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body_area text not null,
  status text not null default 'active' check (status in ('active','monitoring','resolved')),
  started_on date,
  summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists consult_entries (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references consult_cases(id) on delete cascade,
  date date not null default current_date,
  user_note text,
  photo_paths text[],
  ai_response jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_consult_entries_case on consult_entries(case_id, date);

-- RLS (allow-all single-user pattern)
alter table skin_profile enable row level security;
alter table skin_products enable row level security;
alter table skin_checkins enable row level security;
alter table consult_cases enable row level security;
alter table consult_entries enable row level security;

drop policy if exists "Allow all" on skin_profile;
drop policy if exists "Allow all" on skin_products;
drop policy if exists "Allow all" on skin_checkins;
drop policy if exists "Allow all" on consult_cases;
drop policy if exists "Allow all" on consult_entries;

create policy "Allow all" on skin_profile for all using (true) with check (true);
create policy "Allow all" on skin_products for all using (true) with check (true);
create policy "Allow all" on skin_checkins for all using (true) with check (true);
create policy "Allow all" on consult_cases for all using (true) with check (true);
create policy "Allow all" on consult_entries for all using (true) with check (true);
