import json,re,os
from pathlib import Path
P=Path(__file__).resolve().parents[1]
cat=json.loads((P/'data/catalog.json').read_text())
seen=set();refcount=0
for subj in cat['subjects']:
 for meta in subj['professors']:
  data=json.loads((P/meta['data']).read_text());qs=data['questions']
  assert len(qs)==meta['questionCount'],meta
  assert sum(x['answer']==None for x in qs)==meta['pendingCount'],meta
  print(meta['id'],len(qs),'verified',sum(x['validation']['stage']=='accepted' for x in qs),'user',sum(x['validation']['stage']=='user_confirmed' for x in qs),'pending',sum(x['answer'] is None for x in qs))
  for q in qs:
   assert q['id'] not in seen,q['id'];seen.add(q['id'])
   assert q['id'].split(':')[0]==meta['id']
   assert q['source']['image'] and (P/q['source']['image']).is_file(),q['id']
   for e in q.get('evidence',[])+q.get('candidateEvidence',[]):
    assert (P/e['image']).is_file(),(q['id'],e['image'])
    assert isinstance(e['page'],int) and e['page']>0
    refcount+=1
   for fig in q.get('figureImages',[]):assert (P/fig['src']).is_file(),fig
   if q['validation']['stage']=='accepted':
    assert q['answer'] is not None and len(q['evidence'])>0,q['id']
   if q['validation']['stage']=='review_required':
    assert q['answer'] is None,q['id']
print('TOTAL',len(seen),'VALID references',refcount)
assert len(seen)==sum(m['questionCount'] for s in cat['subjects'] for m in s['professors'])
park=json.loads((P/'data/professors/park-murim.json').read_text())
ans={'17-15':3,'17-19':1,'17-21':4,'17-56':2,'19-10':5,'19-11':2,'19-14':2,'19-49':4,'20-3':5,'21-39':4}
for l,n in ans.items():
 q=next(x for x in park['questions'] if x['label']==l)
 assert q['answer']==n and q['validation']['stage']=='user_confirmed' and q['answerSource']=='user_confirmed',l
assert '서남' not in next(x for x in park['questions'] if x['label']=='17-56')['prompt']
kim=json.loads((P/'data/professors/kim-hyewon.json').read_text())
assert len(kim['questions'])>=9
assert all(x['source']['name']=='김혜원pf_21-18_영상_보팡.pdf' for x in kim['questions'] if x['label'] in {'18-24','18-51','18-68','19-4','19-5','20-5','20-6','21-1','21-2'})
assert {'18-24','18-51','18-68','19-4','19-5','20-5','20-6','21-1','21-2'}.issubset({x['label'] for x in kim['questions']})
assert sum(bool(x.get('figureImages')) for x in kim['questions'])>=4
print('PASS all schema and asset checks')
