-- HEON ARCHIVE v1.1.1 — change ONLY the login-session limit.
-- Run in Supabase SQL Editor if v1.1.0 study_accounts.sql has ALREADY been run.
-- Learners: at most 2 registered sessions; master: unlimited.
-- Server checks public.heon_study_profiles.role for the authenticated user.
-- No existing user, session, study snapshot, leaderboard, or audit row is deleted.
-- Do not put a password or service_role key in this script.

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
  -- Check the server-side profile role before enforcing the device cap.
  -- Never accept a role from the client; only a Supabase admin can promote a master.
  select username,role into v_existing,v_role
    from public.heon_study_profiles where user_id=v_uid;
  if v_existing is null then
    if v_username !~ '^[A-Za-z0-9_]{3,24}$' or lower(v_username)='ssk8181' then
      raise exception '아이디는 영문, 숫자, 밑줄 3~24자이며 예약된 아이디는 사용할 수 없습니다.';
    end if;
    insert into public.heon_study_profiles(user_id,username) values (v_uid,v_username);
    v_existing := v_username;
    v_role := 'learner';
  end if;
  -- Forget sessions inactive for 90 days. Active devices refresh last_seen.
  delete from public.heon_study_sessions where user_id=v_uid and last_seen < now()-interval '90 days';
  if not exists(select 1 from public.heon_study_sessions where session_id=v_session and user_id=v_uid) then
    if v_role <> 'master' then
      select count(*) into v_count from public.heon_study_sessions where user_id=v_uid;
      if v_count>=2 then raise exception 'DEVICE_LIMIT_2: 기존 기기에서 로그아웃하거나 등록된 기기를 해제해주세요.'; end if;
    end if;
    insert into public.heon_study_sessions(session_id,user_id,device_label)
      values(v_session,v_uid,left(btrim(coalesce(p_device_label,'기기')),60));
  else
    update public.heon_study_sessions set last_seen=now() where session_id=v_session and user_id=v_uid;
  end if;
  return jsonb_build_object('username',v_existing,'role',v_role,
    'maxDevices',case when v_role='master' then null else 2 end);
end;
$$;
revoke all on function public.heon_study_claim_session(text,text) from public,anon,authenticated;
grant execute on function public.heon_study_claim_session(text,text) to authenticated;
