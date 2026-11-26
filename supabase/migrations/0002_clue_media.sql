-- HuntX 0002: optional image per clue/challenge (private bucket, served via signed URLs)
alter table public.clues add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clue-media', 'clue-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;
