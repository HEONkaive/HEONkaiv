# 문항 검증·수정관리 (v1.1.0)

문항 492개를 `tools/validate_question_bank.py`로 자동 검사했습니다.

```bash
python tools/validate_question_bank.py
```

검사 항목: 교수님별 `JSON`과 `.js` 미러 데이터 일치, 중복 질문 ID, 비어 있는 지문, 존재하지 않는 선택지 정답 번호, 참조 이미지 경로 존재 여부. `data/verification-report.json`에 결과가 저장됩니다.

현재 점검 결과: **오류 0건, 이미지 경로 경고 2건**:
- `lee-seungshin:17-주8` — `assets/figures/lee-seungshin/17-주8-user-2026.webp` 없음
- `lee-seungshin:21-주2` — `assets/figures/lee-seungshin/21-주2-user-2026.webp` 없음

존재하지 않는 이미지를 임의 이미지로 대체하지 않았습니다.

문항 옆 검증 이력에는 (1) 문제 데이터 `validation.stage` 상태, (2) `data/correction-ledger.js`에 기록된 이전 수정 4건, (3) Supabase `heon_question_audits`의 공개 이력을 보여줍니다.

**문항 정답 수정 절차**
1. 제보 및 강의안 근거 페이지 확인 (검증되지 않은 근거를 채택된 근거로 표시하지 않기).
2. 마스터 계정으로 이력에 '검토 중' 등록.
3. JSON 데이터의 정답·문항·해설 수정, 데이터 미러 JS 동기화.
4. 22학번 연도별 시험 정답이 바뀌면 Supabase `heon_exam_keys`도 함께 수정하고, 리더보드 재채점 정책을 결정.
5. 자동 검증 도구 실행 후 배포, 수정 이력 '수정 완료'로 공개.

**주의:** Supabase의 이력 테이블은 변경을 기록하고 표기할 뿐, GitHub 저장소의 문제 파일을 자동 수정하거나 과거 랭킹을 자동 재채점하지 않습니다.
