-- Private bucket for skin/consult photos (signed URLs only, no public access)
insert into storage.buckets (id, name, public)
values ('health-photos', 'health-photos', false)
on conflict (id) do nothing;

-- Allow-all access scoped to this bucket (single-user app, anon key trust model)
drop policy if exists "Allow all health-photos" on storage.objects;
create policy "Allow all health-photos" on storage.objects
  for all using (bucket_id = 'health-photos') with check (bucket_id = 'health-photos');
