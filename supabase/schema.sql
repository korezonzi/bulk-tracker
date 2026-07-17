-- Lean Bulk Tracker Schema

-- User profile (single row)
create table if not exists user_profile (
  id uuid primary key default gen_random_uuid(),
  weight numeric not null,
  body_fat_pct numeric not null,
  lean_mass numeric not null,
  target_weight numeric not null default 63,
  activity_level numeric not null default 1.55,
  target_calories numeric not null,
  target_protein numeric not null,
  target_fat numeric not null,
  target_carbs numeric not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Meals
create table if not exists meals (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  description text,
  calories numeric not null default 0,
  protein numeric not null default 0,
  fat numeric not null default 0,
  carbs numeric not null default 0,
  photo_url text,
  is_ai_estimated boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_meals_date on meals(date);

-- Body measurements
create table if not exists body_measurements (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  weight numeric not null,
  body_fat_pct numeric,
  muscle_mass numeric,
  lean_mass numeric,
  bmr numeric,
  source text not null default 'manual' check (source in ('fitdays_ocr', 'manual')),
  created_at timestamptz default now()
);

-- Workout presets
create table if not exists workout_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('youtube', 'chocozap', 'home')),
  youtube_url text,
  youtube_title text,
  thumbnail_url text,
  duration_min integer,
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- Workout logs
create table if not exists workout_logs (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  preset_id uuid not null references workout_presets(id) on delete cascade,
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_workout_logs_date on workout_logs(date);

-- Daily summary (auto-aggregated)
create table if not exists daily_summary (
  date date primary key,
  total_calories numeric default 0,
  total_protein numeric default 0,
  total_fat numeric default 0,
  total_carbs numeric default 0,
  meal_count integer default 0,
  workout_count integer default 0
);

-- Trigger: auto-update daily_summary on meals change
create or replace function update_daily_summary()
returns trigger as $$
declare
  target_date date;
begin
  target_date := coalesce(new.date, old.date);

  insert into daily_summary (date, total_calories, total_protein, total_fat, total_carbs, meal_count, workout_count)
  select
    target_date,
    coalesce(sum(calories), 0),
    coalesce(sum(protein), 0),
    coalesce(sum(fat), 0),
    coalesce(sum(carbs), 0),
    count(*),
    (select count(*) from workout_logs where workout_logs.date = target_date)
  from meals
  where meals.date = target_date
  on conflict (date) do update set
    total_calories = excluded.total_calories,
    total_protein = excluded.total_protein,
    total_fat = excluded.total_fat,
    total_carbs = excluded.total_carbs,
    meal_count = excluded.meal_count,
    workout_count = excluded.workout_count;

  return coalesce(new, old);
end;
$$ language plpgsql;

create or replace trigger trg_meals_summary
after insert or update or delete on meals
for each row execute function update_daily_summary();

-- Trigger: auto-update daily_summary workout_count on workout_logs change
create or replace function update_daily_workout_count()
returns trigger as $$
declare
  target_date date;
begin
  target_date := coalesce(new.date, old.date);

  insert into daily_summary (date, total_calories, total_protein, total_fat, total_carbs, meal_count, workout_count)
  values (target_date, 0, 0, 0, 0, 0,
    (select count(*) from workout_logs where workout_logs.date = target_date))
  on conflict (date) do update set
    workout_count = (select count(*) from workout_logs where workout_logs.date = target_date);

  return coalesce(new, old);
end;
$$ language plpgsql;

create or replace trigger trg_workout_summary
after insert or update or delete on workout_logs
for each row execute function update_daily_workout_count();

-- Enable RLS but allow all for single-user app
alter table user_profile enable row level security;
alter table meals enable row level security;
alter table body_measurements enable row level security;
alter table workout_presets enable row level security;
alter table workout_logs enable row level security;
alter table daily_summary enable row level security;

-- Allow all operations (single user, no auth)
create policy "Allow all" on user_profile for all using (true) with check (true);
create policy "Allow all" on meals for all using (true) with check (true);
create policy "Allow all" on body_measurements for all using (true) with check (true);
create policy "Allow all" on workout_presets for all using (true) with check (true);
create policy "Allow all" on workout_logs for all using (true) with check (true);
create policy "Allow all" on daily_summary for all using (true) with check (true);

-- ═══════════════════════════════════════════
-- Fitness diagnosis (on-demand issue analysis)
-- ═══════════════════════════════════════════

create table if not exists fitness_diagnoses (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  period_days integer not null,
  reliable_day_count integer,
  excluded_day_count integer,
  threshold_calories numeric,     -- reliability threshold used (null = all recorded days)
  ai_diagnosis jsonb,             -- FitnessDiagnosis JSON
  created_at timestamptz default now()
);

create index if not exists idx_fitness_diagnoses_created on fitness_diagnoses(created_at);

alter table fitness_diagnoses enable row level security;
create policy "Allow all" on fitness_diagnoses for all using (true) with check (true);

-- ═══════════════════════════════════════════
-- Skincare module
-- ═══════════════════════════════════════════

-- Skin profile (single row, same pattern as user_profile)
create table if not exists skin_profile (
  id uuid primary key default gen_random_uuid(),
  self_description text,          -- self-reported skin type / concerns (free text)
  ai_skin_type text,              -- AI-determined skin type (updated per check-in)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Cosmetics / supplements registry
create table if not exists skin_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in
    ('cleanser','toner','serum','moisturizer','sunscreen','treatment','supplement','other')),
  brand text,
  ingredients text,               -- key ingredients (free text)
  usage_timing text,              -- e.g. 朝 / 夜 / 朝晩
  started_on date,
  ended_on date,                  -- null = currently in use
  notes text,
  created_at timestamptz default now()
);

-- Skin check-ins (one per day, same unique-date pattern as body_measurements)
create table if not exists skin_checkins (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  front_photo_path text,          -- path inside private bucket (not a URL)
  left_photo_path text,
  right_photo_path text,
  self_note text,                 -- condition notes (sleep, alcohol, etc.)
  score_acne numeric,             -- severity 0-10 (higher = worse)
  score_pores numeric,
  score_redness numeric,
  score_oiliness numeric,
  score_texture numeric,
  score_overall numeric,          -- overall condition 0-100 (higher = better)
  ai_analysis jsonb,              -- full SkinAnalysis JSON
  created_at timestamptz default now()
);

create index if not exists idx_skin_checkins_date on skin_checkins(date);

-- Spot consults: ad-hoc zoomed photos for immediate care advice.
-- Separate from skin_checkins so tracking scores stay consistent (fixed 3-angle photos).
create table if not exists skin_spot_consults (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  user_note text,
  photo_paths text[],             -- paths inside private bucket
  ai_advice jsonb,                -- SkinSpotAdvice JSON
  created_at timestamptz default now()
);

create index if not exists idx_skin_spot_date on skin_spot_consults(date);

-- AI cosmetics/supplement advice (on-demand, latest shown on /skin dashboard)
create table if not exists skin_advice (
  id uuid primary key default gen_random_uuid(),
  ai_advice jsonb,                -- SkinAdvice JSON
  product_count integer,          -- number of active products at generation time
  created_at timestamptz default now()
);

create index if not exists idx_skin_advice_created on skin_advice(created_at);

-- ═══════════════════════════════════════════
-- Consult module (body concern cases)
-- ═══════════════════════════════════════════

-- Consult cases (long-running tracking unit per body area)
create table if not exists consult_cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,            -- e.g. 足裏の点状皮むけ
  body_area text not null,
  status text not null default 'active' check (status in ('active','monitoring','resolved')),
  started_on date,                -- symptom onset (can be years ago)
  summary text,                   -- latest AI case summary
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Case entries (progress notes over time)
create table if not exists consult_entries (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references consult_cases(id) on delete cascade,
  date date not null default current_date,
  user_note text,
  photo_paths text[],             -- paths inside private bucket (multiple allowed)
  ai_response jsonb,              -- ConsultAiResponse JSON
  created_at timestamptz default now()
);

create index if not exists idx_consult_entries_case on consult_entries(case_id, date);

-- RLS for new tables (same allow-all single-user pattern)
alter table skin_profile enable row level security;
alter table skin_products enable row level security;
alter table skin_checkins enable row level security;
alter table skin_spot_consults enable row level security;
alter table skin_advice enable row level security;
alter table consult_cases enable row level security;
alter table consult_entries enable row level security;

create policy "Allow all" on skin_profile for all using (true) with check (true);
create policy "Allow all" on skin_products for all using (true) with check (true);
create policy "Allow all" on skin_checkins for all using (true) with check (true);
create policy "Allow all" on skin_spot_consults for all using (true) with check (true);
create policy "Allow all" on skin_advice for all using (true) with check (true);
create policy "Allow all" on consult_cases for all using (true) with check (true);
create policy "Allow all" on consult_entries for all using (true) with check (true);

-- Storage buckets (run in Supabase dashboard or via API)
-- insert into storage.buckets (id, name, public) values ('meal-photos', 'meal-photos', true);
-- insert into storage.buckets (id, name, public) values ('body-screenshots', 'body-screenshots', true);

-- Private bucket for skin/consult photos (public = false → signed URLs only)
-- insert into storage.buckets (id, name, public) values ('health-photos', 'health-photos', false);
-- create policy "Allow all health-photos" on storage.objects
--   for all using (bucket_id = 'health-photos') with check (bucket_id = 'health-photos');
