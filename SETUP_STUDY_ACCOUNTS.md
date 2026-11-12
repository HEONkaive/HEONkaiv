# HEON ARCHIVE v1.1.1 — 학습 계정 / 기기 동기화 설치 안내

## 기존 리더보드 유지
- 기존 `supabase/leaderboard.sql`은 다시 실행하지 마세요.
- 공용 리더보드는 **기존 익명 인증** 그대로 유지합니다.
- 새 학습 기록 계정은 **완전히 별도 Supabase Auth 클라이언트 저장소** (`heon.study.auth.session.v1`)를 사용하므로 리더보드의 닉네임/참가 기록과 계정은 연결되지 않습니다.

## 새 SQL 설치 (필수)
1. Supabase 프로젝트 → SQL Editor → New query.
2. **`supabase/study_accounts.sql`** 전체 내용을 붙여넣고 Run.
3. Success 표시를 확인. 추가되는 표: `heon_study_profiles`, `heon_study_sessions`, `heon_study_revoked_sessions`, `heon_study_snapshots`, `heon_question_audits`.
4. Supabase Authentication → Sign In / Providers → **Email** 로그인을 활성화하고 `Confirm email` 유지 권장.
5. Authentication → URL Configuration → Site URL 및 Redirect URLs에 실제 GitHub Pages 주소를 넣으세요 (예: `https://username.github.io/repo/`).
6. GitHub에 새 파일 업로드. `leaderboard-config.js`는 기존 공개 URL·Publishable Key를 유지하세요. 비밀키는 업로드하지 마세요.

## 학습 계정 사용
- 학습 기록 계정 버튼 → **회원가입** → 표시할 학습용 아이디(영문·숫자·밑줄 3~24자) + 실제 이메일 + 비밀번호(8자 이상).
- 이메일 인증 후 **이메일과 비밀번호로 로그인**.
- 초기 로그인 시 기존 브라우저 데이터를 계정에 합칠지 직접 확인합니다. 이후 자동 동기화합니다.
- 같은 계정으로 다른 기기에 로그인하면 동일한 문제풀이/북마크/스마트 복습 일정이 동기화됩니다.
- 기기별 로그인 유지: Supabase 세션은 로컬 저장소에 보존됩니다. 직접 로그아웃, 브라우저 기록 삭제, 세션 철회 전까지 로그인 상태가 유지됩니다.
- **일반 학습 계정은 최대 2개 등록 세션**, **마스터 계정(role=master)은 등록 세션 수 제한 없음**입니다. 일반 계정은 세 번째 기기에서 로그인하더라도 서버 RPC가 동기화 접근을 차단합니다. '기기 관리'에서 오래된 세션을 해제해야 합니다.
- 인터넷이 끊기면 기존 기기 로컬 저장은 가능하고 연결 복귀 시 동기화됩니다. 두 기기에서 같은 문제를 동시에 수정한 경우 최종 수정 시간 우선으로 병합합니다. 충돌이 잦은 경우 JSON 백업을 별도로 보관하세요.
- 로그인 전에도 **기록 JSON 백업/복원** 버튼을 제공하려면 학습 계정 메뉴를 이용하세요 (계정 로그인 권장).

## 마스터 계정 (중요)
요청하신 마스터 **아이디 `ssk8181`은 예약돼 있습니다.** 다른 회원이 사용할 수 없습니다.

**현재 ZIP에는 계정 자체가 생성되어 있지 않습니다.** 실제 생성은 사용자 소유 Supabase Auth 프로젝트의 관리자 권한이 필요합니다. 비밀번호를 HTML/JS/SQL에 하드코딩하지 마세요.

1. 사이트에서 실제 본인 이메일로 일반 계정 하나를 가입하고 메일 인증 및 첫 로그인을 완료하세요. 표시 아이디는 임시로 `heonadmin_temp`처럼 설정하세요.
2. Supabase SQL Editor에서 아래 SQL을 **본인 이메일로 변경**하여 실행하세요.

```sql
update public.heon_study_profiles p
set username='ssk8181', role='master'
from auth.users u
where p.user_id=u.id
  and lower(u.email)=lower('본인의_인증된_이메일@example.com');
```

3. 사이트에서 새로 로그인하면 마스터 계정 표시 아이디는 `ssk8181`, 추가 메뉴에 **문항 검증 관리**가 나타납니다.
4. 마스터 승격 후 로그인(또는 새로고침)하면 세 번째 기기부터도 세션 등록·동기화가 가능합니다. 서버는 로그인 사용자의 `heon_study_profiles.role`을 직접 확인합니다.
5. **로그인은 현재 이메일+비밀번호 방식**입니다. `ssk8181`은 고유한 관리 아이디이며, 이메일 로그인 별칭을 자동으로 대체하지 않습니다.
6. 마스터 계정 비밀번호는 Supabase Auth에만 저장됩니다. 채팅으로 공유한 초기 비밀번호는 새롭고 강력한 비밀번호로 변경하기를 권장합니다.

마스터의 수정 콘솔은 **검토 이력 기록·공개**를 수행합니다. 문제가 되는 정답을 DB에서 직접 변경하지 않습니다. 실제 문항 수정 시 `data/professors/*.json` 및 JS 미러, 서버의 공식 정답표까지 검토/배포해야 랭킹과 오답 채점이 일치합니다.

## 점검
- 동일 계정 PC·iPad 로그인 후 한 문제 제출 → 다른 기기에서 새로고침 또는 '지금 동기화' → 답안 유지 확인.
- 일반 계정은 세 번째 기기로 로그인 → 기기 제한 안내 및 기록 동기화 불가 확인.
- 마스터 계정은 서로 다른 세 브라우저 이상에서 로그인 → 모두 동기화 가능, 기기 관리에 각 세션 표시 확인.
- 다른 학습 계정 로그인 → 이전 계정 데이터 자동 유입 없이 가져오기 확인창 표시.
- 익명 리더보드의 기존 계정 점수 영향이 없는지 확인.
- Supabase DB 작업과 실제 기기별 테스트를 **직접 완료하기 전에는 실서비스 검증 완료로 간주하지 마세요.**

## v1.1.1 기기 수 정책만 변경한 경우

- **이미 v1.1.0 SQL을 실행한 Supabase**: `supabase/upgrade_master_unlimited.sql`만 SQL Editor에서 실행하세요. 기존 학습 기록·기기 등록·리더보드는 유지됩니다. 전체 `study_accounts.sql`을 재실행할 필요가 없습니다.
- **아직 학습 계정 SQL을 실행하지 않았다면**: `supabase/study_accounts.sql` 한 번만 실행하세요. 업그레이드 SQL은 필요하지 않습니다.
- 마스터 계정은 `role='master'`로 승격된 실제 Auth 계정만 해당합니다. `ssk8181` 아이디가 예약되었다는 사실만으로 자동 승격되는 것은 아닙니다.
- 계정당 2기기 제한은 실제 하드웨어 개수가 아닌 **Supabase Auth 로그인 세션의 개수**를 의미합니다. 브라우저 프로필이 달라지면 세션도 달라질 수 있습니다.
