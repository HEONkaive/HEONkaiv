# HEON ARCHIVE — v1.0.2

## 모두에게 공개되는 과목별 22학번 공용 리더보드 설치 (필수)

정적 사이트(GitHub Pages)만으로는 다른 사용자와 점수를 공유할 수 없습니다. 이 버전은 Supabase 데이터베이스에 **실제 점수를 저장하고 공유하도록 작성된 코드**가 포함되어 있습니다. Supabase를 연결하기 전에는 랭킹을 로컬 기록으로 속여 표시하지 않습니다.

1. https://supabase.com 에서 프로젝트를 생성하세요.
2. Dashboard → Authentication → Providers → Anonymous Sign-Ins 를 **ON** 하세요. 이 설정이 없으면 닉네임 등록/점수 제출이 작동하지 않습니다. 공개 읽기는 로그인 불필요합니다.
3. Dashboard → SQL Editor → New query → `supabase/leaderboard.sql` 파일 **전체**를 붙여넣고 Run 하세요. 이렇게 하면 네 과목 공용 랭킹을 분리해 저장할 테이블, 혈액과 종양 1차의 71문항 정답 키, 접근 제어 정책, 서버 점수 계산 함수가 만들어집니다.
4. Dashboard → Project Settings → API Keys 에서 **Project URL** 과 **publishable key**(`sb_publishable_...`, 구버전 anon key도 가능)를 복사한 다음, 사이트 루트의 `leaderboard-config.js` 두 항목을 채우세요.
   ```js
   window.HEON_LEADERBOARD_CONFIG = {
     url: 'https://실제-프로젝트-ref.supabase.co',
     publishableKey: 'sb_publishable_실제키'
   };
   ```
5. GitHub Pages로 전체 사이트를 배포하고, 두 기기 또는 서로 다른 브라우저에서 같은 리더보드가 표시되는지 확인하세요.

**중요한 보안 주의:** `service_role` 키, `sb_secret_` 키, 데이터베이스 암호는 **절대로** GitHub에 올리지 마세요. 위 SQL은 익명·로그인 사용자의 직접 INSERT/UPDATE/DELETE를 막고, 인증된 사용자에게만 서버 채점을 통한 제출을 허용합니다. 익명 로그인이라 여러 기기로 옮기거나 브라우저 데이터를 삭제하면 사용자 신원이 달라집니다. 공개 기출 정답 자체는 누구나 볼 수 있으므로 부정행위를 완전히 차단할 수는 없습니다.

## 순위 / 점수 기준
- **22학번 통합 기출 71문항을 모두 제출한 경우에만** 서버 제출 가능.
- 객관식 68문항은 정확한 답과 비교하여 자동 채점. 서술형 3문항은 채점 보류(0점)로 기록. 최고 68점 / 71문항으로 표시.
- 각 사용자의 **최고 점수 한 건**을 서버에 보존. 등점이면 먼저 달성한 사람이 앞순위.
- 상위 3위에 진입 가능할 때 1등/2등/3등 축하 이미지와 닉네임 입력창 표시. 저장 시 서버가 제출 답안으로 점수를 직접 재계산합니다.
- 화면 왼쪽의 과목 목록 아래 TOP 3는 서버에서 공통으로 불러옵니다. 새로고침 버튼으로 즉시 갱신할 수 있습니다.

## PDF
- 기존 인쇄창 대신 기기에서 PDF Blob을 직접 생성합니다.
- `오답 PDF 저장` 또는 `북마크 PDF 저장` → 파일 준비 → iPad 공유 메뉴에서 `파일에 저장` / 다운로드 / 미리보기.
- 학습 모드별 독립 기록 보존; 기존 답안·북마크 `localStorage`는 지우지 않습니다.
- `pdf-export.js`를 포함한 **모든 파일**을 유지해야 동작합니다.

## 오류 제보 / 공지사항
- Tally 폼 `6DjZg5`는 웹사이트 내 팝업으로 표시(인터넷·Tally 스크립트 필요).
- 공지사항은 `app.js` 상단 `RELEASE_NOTICES` 배열에서 날짜, 버전, 변경사항을 추가할 수 있습니다.


## 네 과목별 리더보드 (v1.0.2)

단 하나의 Supabase 프로젝트 및 `heon_leaderboard` 테이블이 네 과목을 관리합니다. 기존 자료를 삭제하거나 네 개의 테이블을 따로 만들 필요가 없습니다.

| 과목 | subject_id | 현재 정답 데이터 |
|---|---|---|
| 혈액과 종양 1차 | `hematology-1` | 22학번 71문항 등록 |
| 혈액과 종양 2차 | `hematology-2` | 미등록 |
| 모성과 신생아 | `maternal-newborn` | 미등록 |
| 성장과 노화 | `growth-aging` | 미등록 |

프런트엔드는 과목별로 `subject_id`를 적용해 각각 TOP 3를 읽습니다. 서버 점수 등록 RPC도 네 과목을 허용하되, 해당 과목의 22학번 정답 키가 등록되지 않았으면 등록을 거절합니다.

새 과목 문항을 추가할 때, 교수님별 데이터에 22학번 문제가 들어가고 그 모든 문항 ID/정답이 `public.heon_exam_keys` 테이블에 **동일한 subject_id**로 등록돼야 실제 공용 점수 제출이 가능합니다. 수동 채점 보류 문항은 `correct_answer = NULL`로 등록합니다.

SQL Editor에서 예전 SQL을 이미 실행했어도 이번 `supabase/leaderboard.sql` 전체를 다시 실행할 수 있습니다. `CREATE TABLE IF NOT EXISTS`, `ON CONFLICT`, `CREATE OR REPLACE FUNCTION`을 사용하며, 기존 리더보드 점수를 지우는 명령은 없습니다. 이미 변경된 정답 기준은 재적용되는 시드 데이터와 충돌할 수 있으므로 향후 문제/정답을 수정한 이후에는 무작정 예전 전체 SQL을 재실행하지 마세요.
