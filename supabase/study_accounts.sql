-- HEON ARCHIVE v1.1.0 — learning accounts, private sync, two active sessions,
-- and an audit ledger. Run AFTER the existing leaderboard.sql.
-- This SQL DOES NOT modify heon_leaderboard or heon_exam_keys.
-- Important: never paste account passwords/service_role keys into SQL or GitHub.

create table if not exists public.heon_study_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  role text not null default 'learner' check (role in ('learner','master')),
  created_at timestamptz not null default now()
);
create unique index if not exists heon_study_profiles_username_lower on public.heon_study_profiles (lower(username));
alter table public.heon_study_profiles enable row level security;
revoke all on public.heon_study_profiles from public, anon, authenticated;

create table if not exists public.heon_study_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_label text not null default '기기',
  registered_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists heon_study_sessions_user on public.heon_study_sessions(user_id,last_seen desc);
alter table public.heon_study_sessions enable row level security;
revoke all on public.heon_study_sessions from public, anon, authenticated;

create table if not exists public.heon_study_revoked_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  revoked_at timestamptz not null default now()
);
alter table public.heon_study_revoked_sessions enable row level security;
revoke all on public.heon_study_revoked_sessions from public,anon,authenticated;

create table if not exists public.heon_study_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint heon_study_snapshot_object check (jsonb_typeof(snapshot)='object')
);
alter table public.heon_study_snapshots enable row level security;
revoke all on public.heon_study_snapshots from public, anon, authenticated;

-- Public, read-only correction history; master additions go through a checked RPC.
create table if not exists public.heon_question_audits (
  id bigint generated always as identity primary key,
  question_id text not null check (length(question_id) between 3 and 120),
  kind text not null check (kind in ('source','answer','explanation','figure','typo','other')),
  status text not null check (status in ('under_review','verified','corrected','rejected')),
  summary text not null check (length(summary) between 5 and 600),
  evidence_reference text not null default '' check (length(evidence_reference)<=500),
  version_tag text not null default '',
  published boolean not null default false,
  editor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists heon_question_audits_question_idx on public.heon_question_audits(question_id,created_at desc);
alter table public.heon_question_audits enable row level security;
revoke all on public.heon_question_audits from public, anon, authenticated;
grant select on public.heon_question_audits to anon,authenticated;
drop policy if exists heon_audit_public_read on public.heon_question_audits;
create policy heon_audit_public_read on public.heon_question_audits for select to anon,authenticated using (published=true);

create or replace function public.heon_study_identity_ok()
returns boolean language sql stable security definer set search_path=''
as $$
  select auth.uid() is not null
    and coalesce((auth.jwt()->>'is_anonymous')::boolean,true)=false
    and (auth.jwt()->>'session_id') is not null;
$$;
revoke all on function public.heon_study_identity_ok() from public,anon,authenticated;

create or replace function public.heon_study_session_ok()
returns boolean language sql stable security definer set search_path=''
as $$
  select public.heon_study_identity_ok()
    and exists(select 1 from public.heon_study_sessions s
      where s.user_id=auth.uid()
        and s.session_id=(auth.jwt()->>'session_id')::uuid);
$$;
revoke all on function public.heon_study_session_ok() from public,anon,authenticated;

-- Logged-in permanent users register their current Auth session. A separate
-- session ID is used instead of an easily spoofed browser-generated device ID.
create or replace function public.heon_study_claim_session(p_username text,p_device_label text default '기기')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_session uuid;
  v_username text := btrim(coalesce(p_username,''));
  v_existing text;
  v_count integer;
  v_role text;
begin
  if not public.heon_study_identity_ok() then raise exception '이메일 계정 로그인이 필요합니다.'; end if;
  v_session := (auth.jwt()->>'session_id')::uuid;
  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  if exists(select 1 from public.heon_study_revoked_sessions where session_id=v_session) then
    raise exception 'REVOKED_SESSION: 이 기기의 로그인은 해제되었습니다. 로그아웃 후 다시 로그인하세요.';
  end if;
  select username into v_existing from public.heon_study_profiles where user_id=v_uid;
  if v_existing is null then
    if v_username !~ '^[A-Za-z0-9_]{3,24}$' or lower(v_username)='ssk8181' then
      raise exception '아이디는 영문, 숫자, 밑줄 3~24자이며 예약된 아이디는 사용할 수 없습니다.';
    end if;
    insert into public.heon_study_profiles(user_id,username) values (v_uid,v_username);
  end if;
  -- Forget sessions inactive for 90 days. Active devices refresh last_seen.
  delete from public.heon_study_sessions where user_id=v_uid and last_seen < now()-interval '90 days';
  if not exists(select 1 from public.heon_study_sessions where session_id=v_session and user_id=v_uid) then
    select count(*) into v_count from public.heon_study_sessions where user_id=v_uid;
    if v_count>=2 then raise exception 'DEVICE_LIMIT_2: 기존 기기에서 로그아웃하거나 등록된 기기를 해제해주세요.'; end if;
    insert into public.heon_study_sessions(session_id,user_id,device_label)
      values(v_session,v_uid,left(btrim(coalesce(p_device_label,'기기')),60));
  else
    update public.heon_study_sessions set last_seen=now() where session_id=v_session and user_id=v_uid;
  end if;
  select role,username into v_role,v_existing from public.heon_study_profiles where user_id=v_uid;
  return jsonb_build_object('username',v_existing,'role',v_role,'maxDevices',2);
end;
$$;
revoke all on function public.heon_study_claim_session(text,text) from public,anon,authenticated;
grant execute on function public.heon_study_claim_session(text,text) to authenticated;

create or replace function public.heon_study_list_sessions()
returns table(session_id uuid,device_label text,registered_at timestamptz,last_seen timestamptz,is_current boolean)
language sql stable security definer set search_path=''
as $$
  select s.session_id,s.device_label,s.registered_at,s.last_seen,
    s.session_id=(auth.jwt()->>'session_id')::uuid
  from public.heon_study_sessions s
  where public.heon_study_identity_ok() and s.user_id=auth.uid()
  order by s.last_seen desc;
$$;
revoke all on function public.heon_study_list_sessions() from public,anon,authenticated;
grant execute on function public.heon_study_list_sessions() to authenticated;

create or replace function public.heon_study_revoke_session(p_session_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
  if not public.heon_study_identity_ok() then raise exception '로그인이 필요합니다.'; end if;
  if exists(select 1 from public.heon_study_sessions
      where user_id=auth.uid() and session_id=p_session_id) then
    insert into public.heon_study_revoked_sessions(session_id,user_id)
      values(p_session_id,auth.uid()) on conflict do nothing;
    delete from public.heon_study_sessions where user_id=auth.uid() and session_id=p_session_id;
    return true;
  end if;
  return false;
end;
$$;
revoke all on function public.heon_study_revoke_session(uuid) from public,anon,authenticated;
grant execute on function public.heon_study_revoke_session(uuid) to authenticated;

create or replace function public.heon_study_get_snapshot()
returns table(snapshot jsonb,revision bigint)
language plpgsql security definer set search_path=''
as $$
begin
  if not public.heon_study_session_ok() then raise exception 'DEVICE_NOT_ALLOWED: 등록된 두 기기만 동기화할 수 있습니다.'; end if;
  update public.heon_study_sessions set last_seen=now()
    where session_id=(auth.jwt()->>'session_id')::uuid;
  return query
    select s.snapshot,s.revision from public.heon_study_snapshots s where s.user_id=auth.uid();
end;
$$;
revoke all on function public.heon_study_get_snapshot() from public,anon,authenticated;
grant execute on function public.heon_study_get_snapshot() to authenticated;

create or replace function public.heon_study_put_snapshot(p_snapshot jsonb,p_revision bigint)
returns table(snapshot jsonb,revision bigint)
language plpgsql security definer set search_path=''
as $$
declare v_revision bigint; v_uid uuid:=auth.uid();
begin
  if not public.heon_study_session_ok() then raise exception 'DEVICE_NOT_ALLOWED: 등록된 두 기기만 동기화할 수 있습니다.'; end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' or pg_column_size(p_snapshot)>1500000 then
    raise exception '학습 기록 형식 오류 또는 1.5 MB 용량 초과';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  insert into public.heon_study_snapshots(user_id) values (v_uid) on conflict do nothing;
  select s.revision into v_revision from public.heon_study_snapshots s where s.user_id=v_uid for update;
  if v_revision is distinct from p_revision then raise exception 'REVISION_CONFLICT'; end if;
  update public.heon_study_snapshots s set snapshot=p_snapshot,revision=s.revision+1,updated_at=now() where s.user_id=v_uid;
  update public.heon_study_sessions set last_seen=now() where session_id=(auth.jwt()->>'session_id')::uuid;
  return query select s.snapshot,s.revision from public.heon_study_snapshots s where s.user_id=v_uid;
end;
$$;
revoke all on function public.heon_study_put_snapshot(jsonb,bigint) from public,anon,authenticated;
grant execute on function public.heon_study_put_snapshot(jsonb,bigint) to authenticated;

-- Only a master may publish audit records. This is an audit log, NOT a way to
-- change question JSON or public leaderboard answer keys without code review.
create or replace function public.heon_master_add_audit(
  p_question_id text,p_kind text,p_status text,p_summary text,
  p_evidence_reference text default '',p_version_tag text default '',p_published boolean default false
) returns bigint language plpgsql security definer set search_path=''
as $$
declare v_new_id bigint;
begin
  if not public.heon_study_session_ok() or not exists(
      select 1 from public.heon_study_profiles p where p.user_id=auth.uid() and p.role='master') then
    raise exception '마스터 계정만 접근할 수 있습니다.';
  end if;
  insert into public.heon_question_audits(question_id,kind,status,summary,evidence_reference,version_tag,published,editor_id)
    values(btrim(p_question_id),p_kind,p_status,btrim(p_summary),left(coalesce(p_evidence_reference,''),500),left(coalesce(p_version_tag,''),50),p_published,auth.uid())
    returning id into v_new_id;
  return v_new_id;
end;
$$;
revoke all on function public.heon_master_add_audit(text,text,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.heon_master_add_audit(text,text,text,text,text,text,boolean) to authenticated;

-- IMPORTANT master provisioning instructions:
-- 1) Create a NORMAL account on the website with a real email address + a NEW
--    password (do not paste passwords into SQL or checked-in JS).
-- 2) Confirm that email, then run the following in Supabase SQL Editor,
--    replacing <YOUR_VERIFIED_EMAIL> with the real address:
--
-- update public.heon_study_profiles p set username='ssk8181', role='master'
-- from auth.users u
-- where p.user_id=u.id and lower(u.email)=lower('<YOUR_VERIFIED_EMAIL>');
--
-- At present, login uses verified email + password; 'ssk8181' is the master
-- account username shown in HEON ARCHIVE. No password is embedded in source.
