-- ============================================================
-- CleanCam – Supabase database setup
-- Run this in Supabase > SQL Editor
-- ============================================================

-- Enable PostGIS
create extension if not exists postgis;

-- ── users ────────────────────────────────────────────────────
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  role text default 'citizen' check (role in ('citizen','agent','clerk','collector','officer','admin','analyst')),
  language text default 'fr' check (language in ('fr','en','pcm')),
  created_at timestamptz default now()
);

-- ── reports ──────────────────────────────────────────────────
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid unique not null,
  reference text unique,
  user_id uuid,
  channel text not null default 'pwa' check (channel in ('web','pwa','voice_call','agent','clerk','sms')),
  type text not null,
  severity smallint default 3 check (severity between 1 and 5),
  description text,
  transcript text,
  lat double precision,
  lng double precision,
  location_source text default 'pin' check (location_source in ('exif','gps','pin','quarter')),
  quarter text,
  district text default 'douala' check (district in ('douala','yaounde','other')),
  status text not null default 'submitted' check (status in ('submitted','assigned','in_progress','resolved','rejected')),
  ai_result jsonb,
  needs_human_review boolean default false,
  caller_phone text,
  incomplete boolean default false,
  case_id uuid,
  created_at timestamptz default now(),
  synced_at timestamptz
);

create index if not exists reports_status_idx on reports(status);
create index if not exists reports_district_idx on reports(district);
create index if not exists reports_created_idx on reports(created_at desc);

-- ── report_media ─────────────────────────────────────────────
create table if not exists report_media (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  kind text check (kind in ('photo','voice')),
  storage_path text not null,
  duration_s int,
  created_at timestamptz default now()
);

-- ── report_messages ──────────────────────────────────────────
create table if not exists report_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  sender_id uuid,
  sender_role text default 'citizen',
  body text,
  media_id uuid,
  created_at timestamptz default now()
);

-- ── status_log ───────────────────────────────────────────────
create table if not exists status_log (
  id bigserial primary key,
  report_id uuid references reports(id) on delete cascade,
  from_status text,
  to_status text,
  actor_id uuid,
  reason text,
  created_at timestamptz default now()
);

-- ── devices (sensors) ────────────────────────────────────────
create table if not exists devices (
  id text primary key,
  name text,
  lat double precision,
  lng double precision,
  kind text default 'air' check (kind in ('drain','air')),
  api_key_hash text,
  last_seen timestamptz,
  status text default 'online' check (status in ('online','offline')),
  district text
);

-- ── sensor_readings ──────────────────────────────────────────
create table if not exists sensor_readings (
  id bigserial primary key,
  device_id text references devices(id),
  ts timestamptz not null default now(),
  water_level_cm real,
  water_present boolean,
  pm1 real, pm25 real, pm10 real,
  temperature_c real,
  battery_v real,
  signal_dbm int,
  simulated boolean default false
);

create index if not exists readings_device_ts on sensor_readings(device_id, ts desc);

-- ── drain_scores ─────────────────────────────────────────────
create table if not exists drain_scores (
  id bigserial primary key,
  device_id text references devices(id),
  ts timestamptz default now(),
  blockage_score smallint check (blockage_score between 0 and 4),
  blockage_confidence real,
  flood_risk real,
  band text
);

-- ── hotspot_cells ────────────────────────────────────────────
create table if not exists hotspot_cells (
  cell_id text primary key,
  district text,
  lat double precision,
  lng double precision,
  score real,
  band text,
  is_estimated boolean default false,
  reports_7d int default 0,
  pm25_avg real,
  top_types text[],
  drivers text,
  quarter text,
  computed_at timestamptz default now()
);

-- ── traffic_counts ───────────────────────────────────────────
create table if not exists traffic_counts (
  junction text primary key,
  lat double precision,
  lng double precision,
  vehicles_per_hour int,
  source text
);

-- ── alerts ───────────────────────────────────────────────────
create table if not exists alerts (
  id bigserial primary key,
  device_id text,
  metric text,
  value real,
  threshold text,
  created_at timestamptz default now(),
  acknowledged_by uuid
);

-- ── price_config (future pickup module) ──────────────────────
create table if not exists price_config (
  material text primary key,
  price_fcfa_per_kg real,
  effective_from date default current_date,
  set_by uuid
);

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================

alter table reports       enable row level security;
alter table report_media  enable row level security;
alter table report_messages enable row level security;
alter table status_log    enable row level security;
alter table devices       enable row level security;
alter table sensor_readings enable row level security;
alter table hotspot_cells enable row level security;
alter table alerts        enable row level security;

-- Everyone can read hotspot_cells (public map)
create policy "public read hotspots" on hotspot_cells for select using (true);

-- Everyone can read devices / sensor readings (public sensor panel)
create policy "public read devices" on devices for select using (true);
create policy "public read readings" on sensor_readings for select using (true);

-- Anyone can insert a report (citizen submission)
create policy "anyone insert report" on reports for insert with check (true);

-- Users can read their own reports; anon can't
create policy "user reads own reports" on reports for select
  using (auth.uid() = user_id or user_id is null);

-- Officers (authenticated) can read ALL reports
create policy "officer reads all reports" on reports for select
  using (auth.role() = 'authenticated');

-- Officers can update status
create policy "officer update status" on reports for update
  using (auth.role() = 'authenticated');

-- Public insert on report_messages (citizen replies)
create policy "anyone insert message" on report_messages for insert with check (true);
create policy "anyone read messages" on report_messages for select using (true);

-- Public read alerts
create policy "public read alerts" on alerts for select using (true);

-- ================================================================
-- SEED DATA
-- ================================================================

-- Demo devices
insert into devices (id, name, lat, lng, kind, status, district, last_seen) values
  ('drain-akwa-001',    'Akwa – Capteur PM2.5',    4.0511,  9.7679,  'air',   'online',  'douala',  now()),
  ('drain-bonanjo-001', 'Bonanjo – Capteur eau',   4.0481,  9.6965,  'drain', 'online',  'douala',  now()),
  ('drain-mokolo-001',  'Mokolo – Capteur PM2.5',  3.8724, 11.5143,  'air',   'online',  'yaounde', now())
on conflict (id) do nothing;

-- Demo sensor readings (simulated)
insert into sensor_readings (device_id, ts, pm25, pm10, temperature_c, battery_v, simulated) values
  ('drain-akwa-001',    now() - interval '1 hour',  58.2, 71.1, 29.3, 3.9, true),
  ('drain-akwa-001',    now() - interval '2 hours', 62.4, 78.0, 28.9, 3.9, true),
  ('drain-akwa-001',    now() - interval '3 hours', 71.8, 88.3, 30.1, 3.8, true),
  ('drain-bonanjo-001', now() - interval '1 hour',  28.1, 34.4, 27.4, 3.9, true),
  ('drain-bonanjo-001', now() - interval '2 hours', 24.6, 30.2, 27.1, 3.9, true),
  ('drain-mokolo-001',  now() - interval '1 hour',  45.3, 62.0, 28.7, 3.9, true),
  ('drain-mokolo-001',  now() - interval '2 hours', 52.1, 68.4, 29.2, 3.8, true)
on conflict do nothing;

-- Demo hotspot cells
insert into hotspot_cells (cell_id, district, lat, lng, score, band, is_estimated, reports_7d, pm25_avg, top_types, drivers, quarter, computed_at) values
  ('d-akwa',       'douala',  4.0511,  9.7679,  82, 'critical', false, 9,  58.2, array['burning_waste','plastic_waste'],  'PM2.5 élevé · Brûlage de déchets · Fort trafic', 'Akwa',         now()),
  ('d-bonanjo',    'douala',  4.0481,  9.6965,  47, 'moderate', false, 5,  28.1, array['plastic_waste','drain_blockage'], 'Plastiques · Caniveaux bouchés',                'Bonanjo',      now()),
  ('d-deido',      'douala',  4.0771,  9.7417,  65, 'high',     false, 7,  42.0, array['open_dump','air_smoke'],          'Décharge · PM2.5 modéré',                       'Deido',        now()),
  ('d-newbell',    'douala',  4.0384,  9.7147,  38, 'moderate', false, 3,  21.0, array['plastic_waste'],                  'Faible densité de signalements',                'New Bell',     now()),
  ('d-bonamoussadi','douala', 4.0921,  9.7641,  28, 'low',      true,  0,  18.0, array[]::text[],                         'Cellule estimée – données interpolées',         'Bonamoussadi', now()),
  ('d-bonaberi',   'douala',  4.0576,  9.6852,  53, 'high',     false, 6,  35.0, array['water_contamination','drain_blockage'],'Contamination eau · Caniveaux bouchés',   'Bonabéri',     now()),
  ('y-mokolo',     'yaounde', 3.8724, 11.5143,  71, 'high',     false, 8,  45.3, array['dust','open_dump'],               'Poussière · Décharge sauvage · Trafic',         'Mokolo',       now()),
  ('y-briqueterie','yaounde', 3.8841, 11.5172,  22, 'low',      true,  0,  14.0, array[]::text[],                         'Cellule estimée – aucune donnée directe',       'Briqueterie',  now()),
  ('y-mvogada',    'yaounde', 3.8541, 11.5101,  44, 'moderate', false, 4,  26.0, array['plastic_waste'],                  'Plastiques · PM2.5 modéré',                     'Mvog-Ada',     now()),
  ('y-nlongkak',   'yaounde', 3.8781, 11.5054,  59, 'high',     false, 6,  38.0, array['burning_waste','dust'],           'Brûlage · Poussière · Plusieurs signalements',  'Nlongkak',     now())
on conflict (cell_id) do nothing;

-- Demo traffic junctions
insert into traffic_counts (junction, lat, lng, vehicles_per_hour, source) values
  ('Carrefour Akwa',       4.0530,  9.7700,  1850, 'demo'),
  ('Rond-point Deido',     4.0780,  9.7430,  1200, 'demo'),
  ('Carrefour Bonanjo',    4.0490,  9.6980,   980, 'demo'),
  ('Marché Mokolo',        3.8740, 11.5160,  1400, 'demo'),
  ('Carrefour Nlongkak',   3.8790, 11.5060,  1100, 'demo')
on conflict (junction) do nothing;

-- Demo alerts
insert into alerts (device_id, metric, value, threshold, created_at) values
  ('drain-akwa-001',   'pm25', 58.2, '35', now() - interval '30 minutes'),
  ('drain-akwa-001',   'pm25', 71.8, '35', now() - interval '3 hours'),
  ('drain-mokolo-001', 'pm25', 52.1, '35', now() - interval '2 hours')
on conflict do nothing;

-- Demo reports
insert into reports (client_id, reference, channel, type, severity, description, lat, lng, location_source, quarter, district, status, needs_human_review, created_at) values
  (gen_random_uuid(), 'CC-1001', 'pwa',        'burning_waste',       4, 'Brûlage de déchets derrière le marché',          4.0511,  9.7679,  'pin',     'Akwa',      'douala',  'submitted',   false, now() - interval '2 hours'),
  (gen_random_uuid(), 'CC-1002', 'voice_call', 'drain_blockage',      3, 'Caniveau complètement bouché rue principale',    4.0481,  9.6965,  'quarter', 'Bonanjo',   'douala',  'assigned',    false, now() - interval '5 hours'),
  (gen_random_uuid(), 'CC-1003', 'pwa',        'plastic_waste',       2, 'Plastiques accumulés près de la rivière',        4.0771,  9.7417,  'pin',     'Deido',     'douala',  'in_progress', false, now() - interval '1 day'),
  (gen_random_uuid(), 'CC-1004', 'clerk',      'open_dump',           4, 'Décharge sauvage reportée par un riverain',      4.0384,  9.7147,  'quarter', 'New Bell',  'douala',  'resolved',    false, now() - interval '3 days'),
  (gen_random_uuid(), 'CC-1005', 'pwa',        'water_contamination', 5, 'Eau noire dans le drain – odeur forte',          4.0576,  9.6852,  'pin',     'Bonabéri',  'douala',  'submitted',   true,  now() - interval '1 hour'),
  (gen_random_uuid(), 'CC-1006', 'pwa',        'dust',                3, 'Nuage de poussière depuis le chantier voisin',   3.8724, 11.5143,  'pin',     'Mokolo',    'yaounde', 'assigned',    false, now() - interval '6 hours'),
  (gen_random_uuid(), 'CC-1007', 'agent',      'plastic_waste',       2, 'Plastiques dans le caniveau principal',          3.8541, 11.5101,  'quarter', 'Mvog-Ada',  'yaounde', 'submitted',   false, now() - interval '4 hours'),
  (gen_random_uuid(), 'CC-1008', 'voice_call', 'burning_waste',       4, 'Brûlage nocturne près de l''école',              3.8781, 11.5054,  'quarter', 'Nlongkak',  'yaounde', 'in_progress', false, now() - interval '8 hours')
on conflict (client_id) do nothing;

-- Price config (future module)
insert into price_config (material, price_fcfa_per_kg, effective_from) values
  ('plastic',   75,  '2026-02-14'),
  ('paper',     50,  '2026-02-14'),
  ('glass',     50,  '2026-02-14'),
  ('metal',    100,  '2026-02-14'),
  ('aluminium',200,  '2026-02-14'),
  ('organic',   30,  '2026-11-12')
on conflict (material) do nothing;

-- ================================================================
-- REALTIME: enable for live dashboard updates
-- ================================================================
alter publication supabase_realtime add table reports;
alter publication supabase_realtime add table report_messages;
alter publication supabase_realtime add table alerts;
alter publication supabase_realtime add table sensor_readings;
