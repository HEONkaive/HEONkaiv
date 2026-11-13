-- HEON ARCHIVE v1.2.0: private per-user vector handwriting.
-- Run once in Supabase SQL Editor. Without this migration, handwriting is
-- still saved in the user's browser via IndexedDB, but cloud sync is unavailable.
create table if not exists public.heon_ink_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null check (char_length(question_id) between 1 and 200),
  payload jsonb not null default '{"strokes":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id,question_id)
);
create index if not exists heon_ink_notes_user_time_idx on public.heon_ink_notes(user_id,updated_at desc);
alter table public.heon_ink_notes enable row level security;
revoke all on public.heon_ink_notes from anon;
grant select,insert,update,delete on public.heon_ink_notes to authenticated;
drop policy if exists heon_ink_read_own on public.heon_ink_notes;
drop policy if exists heon_ink_insert_own on public.heon_ink_notes;
drop policy if exists heon_ink_update_own on public.heon_ink_notes;
drop policy if exists heon_ink_delete_own on public.heon_ink_notes;
create policy heon_ink_read_own on public.heon_ink_notes for select to authenticated
  using (user_id = auth.uid());
create policy heon_ink_insert_own on public.heon_ink_notes for insert to authenticated
  with check (user_id = auth.uid());
create policy heon_ink_update_own on public.heon_ink_notes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy heon_ink_delete_own on public.heon_ink_notes for delete to authenticated
  using (user_id = auth.uid());
