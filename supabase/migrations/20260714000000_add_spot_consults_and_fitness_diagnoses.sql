create table if not exists skin_spot_consults (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  user_note text,
  photo_paths text[],
  ai_advice jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_skin_spot_date on skin_spot_consults(date);
alter table skin_spot_consults enable row level security;
drop policy if exists "Allow all" on skin_spot_consults;
create policy "Allow all" on skin_spot_consults for all using (true) with check (true);

create table if not exists fitness_diagnoses (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  period_days integer not null,
  reliable_day_count integer,
  excluded_day_count integer,
  threshold_calories numeric,
  ai_diagnosis jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_fitness_diagnoses_created on fitness_diagnoses(created_at);
alter table fitness_diagnoses enable row level security;
drop policy if exists "Allow all" on fitness_diagnoses;
create policy "Allow all" on fitness_diagnoses for all using (true) with check (true);
