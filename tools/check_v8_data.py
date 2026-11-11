#!/usr/bin/env python3
"""HEON ARCHIVE v8: static catalog, question and file integrity regression.

Checks only measurable structural integrity, not medical validity of a claim;
medical source/choice audit decisions are in the professor-specific AUDIT files.
"""
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
load = lambda relative: json.loads((ROOT / relative).read_text(encoding='utf-8'))
CAT = load('data/catalog.json')
expected = {'park-murim': 93, 'lee-seoul': 33, 'kim-hyewon': 9, 'choi-duyoung': 44}
professors = {prof['id']: prof for subject in CAT['subjects'] for prof in subject.get('professors', [])}
assert set(professors) == set(expected), (set(professors), set(expected))
ids = set()
num_refs = 0
all_questions = {}
for pid, count in expected.items():
    meta = professors[pid]
    data = load(meta['data'])
    assert data['professor']['id'] == pid
    qs = data['questions']
    assert len(qs) == count == meta['questionCount'], (pid,len(qs), meta['questionCount'])
    assert sum(q['answer'] is None for q in qs) == meta['pendingCount'],pid
    labels = set()
    for q in qs:
        assert q['id'].startswith(pid+':') and q['id'].split(':',1)[1] == q['label'],q['id']
        assert q['id'] not in ids, f'Duplicate question ID: {q["id"]}'
        ids.add(q['id'])
        assert q['label'] not in labels,(pid,q['label'])
        labels.add(q['label'])
        all_questions[q['id']] = q
        assert isinstance(q['number'],int) and isinstance(q['year'],int),(pid,q['label'])
        assert q['source']['page'] > 0 and (ROOT / q['source']['image']).is_file(),q['id']
        if q['type'] != 'short':
            assert len(q['choices']) == 5,q['id']
            assert {ch['number'] for ch in q['choices']} == {1,2,3,4,5},q['id']
        for fig in q.get('figureImages', []):
            assert (ROOT / fig['src']).is_file(),(q['id'],fig['src'])
            num_refs += 1
        if q.get('figureRequired') and pid in ('choi-duyoung','kim-hyewon'):
            assert q.get('figureImages'),q['id']
        for e in q.get('evidence', []) + q.get('candidateEvidence', []):
            assert (ROOT / e['image']).is_file(),(q['id'],e['image'])
            assert e['page'] > 0 and e['file'],q['id']
            num_refs += 1
        stage = q['validation']['stage']
        if stage == 'accepted':
            assert q['answer'] is not None and q['evidence'] and not q.get('candidateEvidence'),q['id']
        elif stage == 'user_confirmed':
            assert q['answer'] is not None and ('user' in str(q.get('answerSource','')).lower()),q['id']
        else:
            assert stage in ('pending','review_required') and q['answer'] is None and not q.get('evidence'),q['id']
        # Do not let pending answers appear as proven evidence.
    print(pid, len(qs), dict(Counter(q['validation']['stage'] for q in qs)), 'inline figures',sum(bool(q.get('figureImages')) for q in qs))

corrections = {'17-67':5,'18-02':2,'18-05':4,'18-41':3,'19-56':4,
               '19-57':1,'19-59':4,'20-67':4,'20-68':1,'20-70':4,'21-65':2,
               '21-69':2,'21-70':5}
for label,answer in corrections.items():
    q=all_questions['lee-seoul:'+label]
    assert q['answer'] == answer and q['validation']['stage']=='user_confirmed',label
assert '(17학번 선지)' not in all_questions['lee-seoul:17-67']['prompt']
choi = [q for id,q in all_questions.items() if id.startswith('choi-duyoung:')]
assert sum(q['year']==21 for q in choi) == 10
assert sum(q['year'] in (17,18,19,20) for q in choi) == 34
assert {'21-'+str(i) for i in range(11,21)}.issubset({q['label'] for q in choi})
assert sum(q['validation']['stage']=='accepted' for q in choi)==16
assert sum(q['answer'] is None for q in choi)==28
assert sum(bool(q.get('figureImages')) for q in choi) >= 20
assert len(ids)==179
assert (ROOT/'index.html').is_file() and (ROOT/'app.js').is_file() and (ROOT/'styles.css').is_file()
print('PASS:',len(ids),'unique questions across four professors;',num_refs,'validated referenced figure/evidence paths')
