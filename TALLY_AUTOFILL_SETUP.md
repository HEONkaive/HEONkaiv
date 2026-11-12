# Tally 자동 문항 정보 입력 — 설정 1회 필요

Tally `6DjZg5` 팝업을 오른쪽 아래에 유지하면서, 문제별 제보 버튼에서 다음 값들이 전달됩니다.

- `questionId`: `choi-duyoung:22-55` 등 내부 고유 문항 ID
- `questionNumber`: `22-55` 등 화면 문항 번호
- `professor`: 교수님 이름
- `subject`: 과목 이름
- `studyMode`: 풀이 방식
- `siteVersion`: `1.1.0`

**필수 — Tally 양식 편집기:**
1. 기존 오류 제보 폼을 편집합니다.
2. `/hidden` 블록을 추가해 이름을 정확하게 `questionId`, `questionNumber`, `professor`, `subject`, `studyMode`, `siteVersion`으로 만듭니다. 대소문자가 중요합니다.
3. 실제 텍스트 입력 필드 `문항 번호 및 오류 내용`에 문제 번호를 **눈에 보이게 미리 채우고 싶다면**, 해당 필드의 `Default answer`를 켜고 숨김 필드 `questionNumber` 또는 `questionId`를 선택하세요. 이렇게 해도 이용자가 오류 설명을 추가할 수 있습니다.
4. 저장·Publish 한 다음 `22-55` 문항의 '제보하기'를 눌러 제출 테스트합니다. Submissions에서 숨김 필드가 접수됐는지 확인합니다.

코드 수정만으로 Tally 서버에 존재하지 않는 숨김 필드가 자동 생성되지는 않습니다.

참고: https://tally.so/help/hidden-fields , https://tally.so/help/pre-populate-form-fields
