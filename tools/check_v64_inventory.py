#!/usr/bin/env python3
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
park=json.loads((root/'data/professors/park-murim.json').read_text(encoding='utf-8'))['questions']
seoul=json.loads((root/'data/professors/lee-seoul.json').read_text(encoding='utf-8'))['questions']
assert len(park)==93 and len(seoul)==33
assert len({q['id'] for q in park})==len(park)
assert len({q['id'] for q in seoul})==len(seoul)
for q in park+seoul:
 assert (root/q['source']['image']).is_file(),q['id']
 for im in q.get('figureImages',[]): assert (root/im['src']).is_file(),(q['id'],im)
 for ev in q.get('evidence',[])+q.get('candidateEvidence',[]):assert (root/ev['image']).is_file(),(q['id'],ev)
 if q['validation']['stage']=='accepted':assert q['answer'] is not None and q['evidence'],q['id']

# The original 17-20 PDF contains 73 distinct printed question IDs.
manifest=json.loads((root/'data/park-murim-17-20-inventory.json').read_text(encoding='utf-8'))
assert manifest['sourcePageCount']==13 and len(manifest['questions'])==73
for entry in manifest['questions']:
 q=next(x for x in park if x['id']==entry['questionId'])
 assert q['label']==entry['label'] and q['source']['page'] in entry['originalPdfPages']
 assert q['professor']=='park-murim'

print('OK: Park 93 + Lee 33 = 126; 73 unique source-PDF IDs covered; images valid')
