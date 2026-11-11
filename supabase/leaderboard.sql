-- HEON ARCHIVE · 과목별 22학번 공용 리더보드 초기 설치용 SQL (v1.0.2)
-- 한 테이블에서 subject_id + exam_year로 독립 관리합니다.
-- 지원 과목: hematology-1, hematology-2, maternal-newborn, growth-aging
-- 현재 정답 데이터는 hematology-1만 제공됩니다. 다른 과목은 문제 등록 시 별도 추가해야 합니다.
-- Supabase > SQL Editor > New query : paste this entire file and Run.
-- Server-owned answer keys are not readable by client roles.
create table if not exists public.heon_exam_keys (
  subject_id text not null,
  exam_year text not null,
  question_id text not null,
  correct_answer jsonb,
  primary key(subject_id,exam_year,question_id)
);
alter table public.heon_exam_keys enable row level security;
revoke all on public.heon_exam_keys from public, anon, authenticated;

create table if not exists public.heon_leaderboard (
  subject_id text not null,
  exam_year text not null,
  user_id uuid not null,
  nickname text not null check (char_length(nickname) between 1 and 24),
  score integer not null check (score >= 0),
  total integer not null check (total > 0),
  achieved_at timestamptz not null default now(),
  primary key(subject_id,exam_year,user_id)
);
create index if not exists heon_leaderboard_top_idx on public.heon_leaderboard(subject_id,exam_year,score desc,achieved_at asc);
alter table public.heon_leaderboard enable row level security;
revoke all on public.heon_leaderboard from public, anon, authenticated;
grant select on public.heon_leaderboard to anon, authenticated;
drop policy if exists "everyone can read public rank" on public.heon_leaderboard;
create policy "everyone can read public rank" on public.heon_leaderboard
  for select to anon,authenticated using (true);
-- NO client INSERT/UPDATE/DELETE policies. Writing is only through score-checking RPC.

-- Seed known 22학번 question keys in this database. For unknown/manual essays: null key, zero points.

insert into public.heon_exam_keys(subject_id,exam_year,question_id,correct_answer) values
  ('hematology-1','22','park-murim:22-3','[2]'::jsonb),
  ('hematology-1','22','park-murim:22-4','[5]'::jsonb),
  ('hematology-1','22','park-murim:22-5','[4]'::jsonb),
  ('hematology-1','22','park-murim:22-6','[5]'::jsonb),
  ('hematology-1','22','park-murim:22-7','[2]'::jsonb),
  ('hematology-1','22','park-murim:22-8','[1,2,4]'::jsonb),
  ('hematology-1','22','park-murim:22-9','[1]'::jsonb),
  ('hematology-1','22','park-murim:22-10','[1]'::jsonb),
  ('hematology-1','22','park-murim:22-11','[4]'::jsonb),
  ('hematology-1','22','park-murim:22-12','[3]'::jsonb),
  ('hematology-1','22','park-murim:22-13','[4]'::jsonb),
  ('hematology-1','22','park-murim:22-14','[5]'::jsonb),
  ('hematology-1','22','park-murim:22-15','[4]'::jsonb),
  ('hematology-1','22','park-murim:22-16','[2]'::jsonb),
  ('hematology-1','22','park-murim:22-17','[3]'::jsonb),
  ('hematology-1','22','park-murim:22-18','[2]'::jsonb),
  ('hematology-1','22','park-murim:22-19','[4]'::jsonb),
  ('hematology-1','22','park-murim:22-20','[5]'::jsonb),
  ('hematology-1','22','park-murim:22-21','[3]'::jsonb),
  ('hematology-1','22','park-murim:22-22','[4]'::jsonb),
  ('hematology-1','22','park-murim:22-23','[3]'::jsonb),
  ('hematology-1','22','park-murim:22-25','[1]'::jsonb),
  ('hematology-1','22','park-murim:22-26','[2]'::jsonb),
  ('hematology-1','22','park-murim:22-27','[5]'::jsonb),
  ('hematology-1','22','park-murim:22-주1',null),
  ('hematology-1','22','park-murim:22-주2',null),
  ('hematology-1','22','won-taewan:22-24','[2]'::jsonb),
  ('hematology-1','22','lee-seoul:22-59','[1]'::jsonb),
  ('hematology-1','22','lee-seoul:22-60','[2]'::jsonb),
  ('hematology-1','22','lee-seoul:22-61','[2]'::jsonb),
  ('hematology-1','22','lee-seoul:22-62','[4]'::jsonb),
  ('hematology-1','22','lee-seoul:22-63','[5]'::jsonb),
  ('hematology-1','22','lee-seoul:22-64','[2]'::jsonb),
  ('hematology-1','22','lee-seoul:22-65','[2]'::jsonb),
  ('hematology-1','22','lee-seoul:22-66','[5]'::jsonb),
  ('hematology-1','22','lee-seoul:22-67','[4]'::jsonb),
  ('hematology-1','22','lee-seoul:22-68','[4]'::jsonb),
  ('hematology-1','22','kim-hyewon:22-1','[4]'::jsonb),
  ('hematology-1','22','kim-hyewon:22-2','[5]'::jsonb),
  ('hematology-1','22','choi-duyoung:22-50','[5]'::jsonb),
  ('hematology-1','22','choi-duyoung:22-51','[1]'::jsonb),
  ('hematology-1','22','choi-duyoung:22-52','[4]'::jsonb),
  ('hematology-1','22','choi-duyoung:22-53','[1]'::jsonb),
  ('hematology-1','22','choi-duyoung:22-54','[3]'::jsonb),
  ('hematology-1','22','choi-duyoung:22-55','[3]'::jsonb),
  ('hematology-1','22','choi-duyoung:22-56','[5]'::jsonb),
  ('hematology-1','22','choi-duyoung:22-57','[5]'::jsonb),
  ('hematology-1','22','choi-duyoung:22-58','[4]'::jsonb),
  ('hematology-1','22','lee-seungshin:22-40','[2]'::jsonb),
  ('hematology-1','22','lee-seungshin:22-41','[2]'::jsonb),
  ('hematology-1','22','lee-seungshin:22-주3',null),
  ('hematology-1','22','lee-kanggyu:22-37','[3]'::jsonb),
  ('hematology-1','22','lee-kanggyu:22-38','[4]'::jsonb),
  ('hematology-1','22','lee-kanggyu:22-39','[2]'::jsonb),
  ('hematology-1','22','lee-kanggyu:22-42','[5]'::jsonb),
  ('hematology-1','22','lee-kanggyu:22-44','[5]'::jsonb),
  ('hematology-1','22','lee-kanggyu:22-45','[4]'::jsonb),
  ('hematology-1','22','won-taewan:22-36','[4]'::jsonb),
  ('hematology-1','22','won-taewan:22-28','[4]'::jsonb),
  ('hematology-1','22','won-taewan:22-29','[2]'::jsonb),
  ('hematology-1','22','won-taewan:22-30','[2]'::jsonb),
  ('hematology-1','22','won-taewan:22-33','[1]'::jsonb),
  ('hematology-1','22','won-taewan:22-34','[4]'::jsonb),
  ('hematology-1','22','won-taewan:22-35','[4]'::jsonb),
  ('hematology-1','22','won-taewan:22-43','[4]'::jsonb),
  ('hematology-1','22','choi-geumha:22-31','[4]'::jsonb),
  ('hematology-1','22','choi-geumha:22-32','[3]'::jsonb),
  ('hematology-1','22','choi-geumha:22-46','[3]'::jsonb),
  ('hematology-1','22','choi-geumha:22-47','[4]'::jsonb),
  ('hematology-1','22','choi-geumha:22-48','[5]'::jsonb),
  ('hematology-1','22','choi-geumha:22-49','[2]'::jsonb)
on conflict (subject_id,exam_year,question_id) do update set correct_answer=excluded.correct_answer;

-- All scoring and ranking is done here; callers cannot submit an arbitrary score.
create or replace function public.heon_submit_score(
  p_subject_id text, p_exam_year text, p_nickname text, p_answers jsonb
) returns table(rank integer, saved_score integer, saved_total integer)
language plpgsql security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  expected_count integer;
  received_count integer;
  actual_score integer;
  safe_name text := btrim(p_nickname);
  existing_score integer;
  saved_entry public.heon_leaderboard%rowtype;
begin
  if current_user_id is null then raise exception '로그인된 사용자가 없습니다.'; end if;
  if p_exam_year is distinct from '22'
     or p_subject_id is null
     or p_subject_id not in ('hematology-1','hematology-2','maternal-newborn','growth-aging') then
    raise exception '등록 대상이 아닌 과목 또는 학번입니다.';
  end if;
  if safe_name is null or char_length(safe_name) < 1 or char_length(safe_name) > 24
     or safe_name ~ '[[:cntrl:]]' then
    raise exception '닉네임을 1~24자로 입력해주세요.';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers)>40000 then
    raise exception '문제별 답안 형식이 올바르지 않습니다.';
  end if;
  select count(*) into expected_count from public.heon_exam_keys k
   where k.subject_id=p_subject_id and k.exam_year=p_exam_year;
  select count(*) into received_count from jsonb_object_keys(p_answers);
  if expected_count=0 then
    raise exception '해당 과목의 22학번 시험은 아직 공용 정답 데이터가 등록되지 않았습니다.';
  end if;
  if expected_count<>received_count then
    raise exception '전체 문제를 제출해야 점수가 등록됩니다.';
  end if;
  if exists (
      select 1 from jsonb_each(p_answers) a
      left join public.heon_exam_keys k
      on k.subject_id=p_subject_id and k.exam_year=p_exam_year and k.question_id=a.key
      where k.question_id is null
         or (k.correct_answer is not null and jsonb_typeof(a.value)<>'array')
    ) then raise exception '답안의 문제 번호 또는 형식이 올바르지 않습니다.'; end if;
  select count(*) filter(where k.correct_answer is not null
          and (p_answers->k.question_id) = k.correct_answer)
    into actual_score
    from public.heon_exam_keys k
    where k.subject_id=p_subject_id and k.exam_year=p_exam_year;
  -- One best score per verified anonymous-auth user; ties keep the earlier submission.
  insert into public.heon_leaderboard(subject_id,exam_year,user_id,nickname,score,total)
  values (p_subject_id,p_exam_year,current_user_id,safe_name,actual_score,expected_count)
  on conflict (subject_id,exam_year,user_id) do update
    set nickname=excluded.nickname,score=excluded.score,total=excluded.total,achieved_at=now()
    where excluded.score>public.heon_leaderboard.score;
  select * into saved_entry from public.heon_leaderboard l
    where l.subject_id=p_subject_id and l.exam_year=p_exam_year and l.user_id=current_user_id;
  return query select (1+count(*) filter(where l.score>saved_entry.score
    or (l.score=saved_entry.score and l.achieved_at<saved_entry.achieved_at)))::integer,
    saved_entry.score,saved_entry.total
    from public.heon_leaderboard l
    where l.subject_id=p_subject_id and l.exam_year=p_exam_year;
end;
$$;
revoke execute on function public.heon_submit_score(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.heon_submit_score(text,text,text,jsonb) to authenticated;
