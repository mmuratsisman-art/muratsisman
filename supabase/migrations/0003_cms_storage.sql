-- MURAT/LAB CMS foundation (Phase 3A) — 0003: storage bucket + policies
--
-- 'site-media' is a PUBLIC bucket: objects are readable by URL (CDN) without any policy.
-- Therefore: never upload anything confidential. Uploads are admin-only; anonymous users cannot list the bucket.
-- SVG is deliberately NOT allowed (scriptable). Limit: 5 MB per file.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy site_media_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'site-media' and public.is_admin());

create policy site_media_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-media' and public.is_admin());

create policy site_media_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'site-media' and public.is_admin())
  with check (bucket_id = 'site-media' and public.is_admin());

create policy site_media_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-media' and public.is_admin());
