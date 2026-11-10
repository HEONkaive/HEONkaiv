"""HEON ARCHIVE v3 기본 회귀 검사.

Usage: python tools/smoke_test.py
Requires: playwright (Python) and a locally installed chromium browser.
This harness injects actual app.js, styles.css, catalog.js and professor JS inline,
so it can run in test environments that prohibit localhost/file navigation.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

base=Path(__file__).resolve().parents[1]
css=(base/'styles.css').read_text(encoding='utf-8')
cat=(base/'data/catalog.js').read_text(encoding='utf-8')
prof=(base/'data/professors/park-murim.js').read_text(encoding='utf-8')
app=(base/'app.js').read_text(encoding='utf-8')
setup="Object.defineProperty(window,'localStorage',{value:{_d:{},getItem(k){return this._d[k]||null},setItem(k,v){this._d[k]=v},removeItem(k){delete this._d[k]}},configurable:true});window.scrollTo=()=>{};"
html=f'<html lang="ko"><head><meta charset="utf-8"><style>{css}</style></head><body><div id="app"></div><script>{setup}</script><script>{cat}</script><script>{prof}</script><script>{app}</script></body></html>'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width,height in [(1440,900),(390,844)]:
        page=browser.new_page(viewport={'width':width,'height':height})
        errors=[]
        page.on('pageerror',lambda err:errors.append(str(err)))
        page.set_content(html,wait_until='domcontentloaded')
        page.locator('.course-card').first.click()
        assert page.locator('.mini-stat').count()==5
        assert page.locator('.mini-stat-0 strong').inner_text()=='73'
        assert not page.locator('.source-card').evaluate('(el)=>el.open')
        assert page.locator('.exam-layout.collapsed').count()==1
        page.locator('#global-search-input').fill('17-8')
        page.locator('.search-result').first.click()
        assert page.locator('.question-num').inner_text().startswith('17-8')
        page.locator('[data-action="choose"][data-number="1"]').click()
        page.locator('[data-action="submit"]').click()
        assert page.locator('.mini-stat-1 strong').inner_text()=='1'
        assert page.locator('.result-box.correct').count()>0
        assert page.locator('.evidence-panel').count()==1
        page.once('dialog',lambda dialog:dialog.accept())
        page.locator('.prof-reset').click()
        assert page.locator('.mini-stat-1 strong').inner_text()=='0'
        assert page.locator('.header-pills').inner_text().find('사용자 확정 1건')>=0
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        assert not errors,errors
        print(f'PASS {width}x{height}: 73문항 / 검색 / 원본 기본 닫힘 / 자동 저장 / 채점 / 교수님 기록 초기화')
        page.close()
    browser.close()
