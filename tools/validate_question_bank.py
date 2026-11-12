#!/usr/bin/env python3
"""Validate the canonical JSON and its browser JS twin, question IDs and media.
Outputs data/verification-report.json for maintainers. Exit nonzero on critical errors.
"""
import json,re,collections,datetime
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
DIR=BASE/'data'/'professors'
ISSUES=[]; COUNTS=collections.Counter(); VERIFICATION=collections.Counter()
VALID={'accepted','user_confirmed','exam_answer_key','highlight_reviewed','pending','candidate','unverified','user_reviewed','related_only'}
def issue(level,code,ref,message): ISSUES.append(dict(level=level,code=code,ref=ref,message=message))
for file in sorted(DIR.glob('*.json')):
    raw=file.read_text('utf8')
    data=json.loads(raw)
    id=file.stem
    js=file.with_suffix('.js')
    if not js.exists(): issue('error','missing_js',id,'브라우저용 JS 파일이 없습니다.');continue
    content=js.read_text('utf8')
    m=re.search(r'HEON_ARCHIVE_DATA\.professors\[[^]]+\]\s*=\s*',content)
    if not m: issue('error','wrong_js_format',id,'JS 문제 데이터 형식을 인식하지 못했습니다.');continue
    try: twin=json.loads(content[m.end():].strip().rstrip(';'))
    except Exception as err: issue('error','js_parse',id,str(err));continue
    if twin!=data: issue('error','mirror_mismatch',id,'JSON과 JS 파일의 문제 데이터가 서로 다릅니다.')
    seen=set()
    for q in data.get('questions',[]):
        qid=q.get('id','');COUNTS['questions']+=1
        if not qid or qid in seen: issue('error','duplicate_id',qid or id,'문항 ID가 없거나 중복되었습니다.')
        seen.add(qid)
        stage=(q.get('validation') or {}).get('stage')
        VERIFICATION[stage or 'unknown']+=1
        if q.get('type') not in ('short',) and q.get('choices'):
            numbers={ch.get('number') for ch in q['choices']}
            answer=q.get('answer')
            ans=answer if isinstance(answer,list) else [answer] if isinstance(answer,int) else []
            if any(x not in numbers for x in ans):issue('error','answer_outside_options',qid,'정답 번호가 선택지에 존재하지 않습니다.')
        for field in ('figureImages','explanationImages','evidence','candidateEvidence'):
            for item in (q.get(field) or []):
                if not isinstance(item,dict):continue
                src=item.get('src') or item.get('image')
                if src and not src.startswith(('http:','https:','data:')) and not (BASE/src).exists():
                    issue('warning','missing_media',qid,f'{field}: {src}')
        if not q.get('prompt'):issue('error','empty_prompt',qid,'문항 지문이 없습니다.')
report={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'totals':dict(COUNTS),'validationStages':dict(VERIFICATION),'errors':sum(i['level']=='error' for i in ISSUES),'warnings':sum(i['level']=='warning' for i in ISSUES),'issues':ISSUES}
(BASE/'data'/'verification-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8')
print(f"Questions {COUNTS['questions']}; errors {report['errors']}; warnings {report['warnings']}")
for i in ISSUES[:15]:print(f"  {i['level']} {i['code']} {i['ref']}: {i['message'][:120]}")
raise SystemExit(bool(report['errors']))
