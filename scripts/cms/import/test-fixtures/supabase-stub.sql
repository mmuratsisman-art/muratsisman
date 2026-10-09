-- TEST-ONLY: minimal Supabase stand-ins (roles anon/authenticated, auth.users, auth.uid()) for a LOCAL throwaway PostgreSQL. Never run on Supabase.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, aud text, role text, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',''), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
