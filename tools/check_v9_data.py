"""HEON ARCHIVE v9 static data QA: IDs, catalog, asset paths, user-corrected answers."""
import json
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
cat=json.loads((ROOT/'data/catalog.json').read_text(encoding='utf-8'))
ids=set(); counts=Counter(); missing=[]; qa={}; assets=set()
for sub in cat['subjects']:
 for p in sub.get('professors',[]):
  prof=json.loads((ROOT/p['data']).read_text(encoding='utf-8'))
  qs=prof['questions']
  assert p['questionCount']==len(qs),(p['id'],p['questionCount'],len(qs))
  pending=sum(q.get('validation',{}).get('stage')=='pending' for q in qs)
  assert p['pendingCount']==pending,(p['id'],'pending count',p['pendingCount'],pending)
  for q in qs:
   assert q['id'] not in ids,f'duplicate ID {q["id"]}'
   ids.add(q['id']); qa[q['id']]=q
   counts[q.get('validation',{}).get('stage','unknown')]+=1
   for field in ['source']:
    if isinstance(q.get(field),dict):
     v=q[field].get('image')
     if v:assets.add(v)
   for field in ['evidence','candidateEvidence','figureImages']:
    for v in q.get(field,[]):
     im=v.get('image') or v.get('src') if isinstance(v,dict) else v
     if im:assets.add(im)
  print(p['id'],len(qs),'pending',pending)
for a in assets:
 if not (ROOT/a).is_file():missing.append(a)
assert not missing,f'Asset references missing: {missing[:10]}'
assert len(ids)==215
assert counts=={'accepted':137,'user_confirmed':35,'pending':43},counts
for label in ('20-6','21-2'):
 q=qa[f'kim-hyewon:{label}']; assert q['answer']==3 and q['answerSource']=='user_confirmed' and q['validation']['stage']=='user_confirmed'
for x in qa.values():
 if x['professor']=='lee-seungshin' and x['validation']['stage']=='accepted':
  assert x.get('answer') is not None and len(x['evidence'])>=1,x['id']
 if x['professor']=='lee-seungshin' and x['validation']['stage']=='pending':
  assert x.get('answer') is None and not x.get('evidence'),x['id']
print(f'PASS: {len(ids)} unique questions; {len(assets)} referenced images all present; statuses {dict(counts)}')
