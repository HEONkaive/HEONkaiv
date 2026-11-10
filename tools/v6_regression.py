"""Integration checks for the v6 GitHub Pages app (run from this folder)."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE = Path(__file__).resolve().parents[1]
# Inline the genuine app and two data bundles because the test browser blocks localhost navigation.
css=(BASE/'styles.css').read_text()
cat=(BASE/'data/catalog.js').read_text()
profs='\n'.join((BASE/f'data/professors/{x}.js').read_text() for x in ('park-murim','lee-seoul'))
app=(BASE/'app.js').read_text()
def build_html(stored=None):
    initial=json.dumps(stored or {},ensure_ascii=False)
    setup=f"""Object.defineProperty(window,'localStorage',{{value:{{_d:{initial},getItem(k){{return this._d[k]||null}},setItem(k,v){{this._d[k]=v}},removeItem(k){{delete this._d[k]}}}},configurable:true}});window.scrollTo=()=>{{}};"""
    return f'<html lang="ko"><head><meta charset="utf-8"><style>{css}</style></head><body><div id="app"></div><script>{setup}</script><script>{cat}</script><script>{profs}</script><script>{app}</script></body></html>' 
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None,args=['--no-sandbox'])
    for width,height in ((1920,1080),(1536,864),(1366,768),(1024,768),(390,844)):
        page=browser.new_page(viewport={'width':width,'height':height})
        errors=[]
        page.on('pageerror',lambda err:errors.append(str(err)))
        page.set_content(build_html(),wait_until='domcontentloaded')
        page.locator('.subject-card').first.wait_for()
        assert page.locator('.side').count()==0
        assert page.locator('.course-card').count()==2, page.locator('.course-card').count()
        assert page.locator('.exam-panel').count()==0
        page.locator('.course-card').first.click()
        page.locator('.exam-panel').wait_for()
        assert page.locator('.mini-stat-0 strong').inner_text()=='73'
        assert not page.locator('.source-card').evaluate('(el)=>el.open')
        assert page.locator('.return-home').count()==1
        assert page.locator('.side').count()==0
        if width>=1021:
            before=page.locator('.exam-panel').bounding_box()
            d=page.locator('.quiz-dock').bounding_box()
            assert d and d['y']+d['height']<=height+1,(width,d,height)
            assert before['y']<285,(width,before)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),(width,page.evaluate('document.documentElement.scrollWidth'))
        page.locator('[data-action="toggle-evidence"]').first.click()
        if width>=1021:
            after=page.locator('.exam-panel').bounding_box()
            assert abs(before['x']-after['x'])<1 and abs(before['width']-after['width'])<1,(width,before,after)
        # Search into 18-39 to inspect the requested editorial change.
        page.locator('#global-search-input').fill('18-39')
        page.locator('.search-result').first.click()
        assert page.locator('.question-num').inner_text().startswith('18-39')
        assert '연령표준화 발생률' in page.locator('.option[data-number="2"] .option-text').inner_text()
        assert '강의안에는 없지만' not in page.locator('.option[data-number="2"]').inner_text()
        page.locator('.option[data-number="5"]').click()
        page.locator('.dock-submit' if width>=1021 else '.question-footer [data-action="submit"]').click()
        assert '정답입니다' in page.locator('.exam-panel').inner_text()
        assert '사용자 확정 정답' in page.locator('.evidence-panel').inner_text()
        assert not page.locator('.source-card').evaluate('(el)=>el.open')
        if width>=1021:
            after=page.locator('.exam-panel').bounding_box()
            assert abs(before['width']-after['width'])<1,(width,before,after)
        # Explicit return must show professor selection and preserve saved record.
        page.locator('.return-home').click()
        assert page.locator('.course-card').count()==2
        assert page.locator('.exam-panel').count()==0
        stored=page.evaluate('localStorage._d');page.set_content(build_html(stored),wait_until='domcontentloaded')
        assert page.locator('.course-card').count()==2
        page.locator('.course-card').first.click()
        assert '18-39' in page.locator('.question-num').inner_text()  # resume last seen problem
        assert '정답입니다' in page.locator('.exam-panel').inner_text()
        assert page.locator('.mini-stat-1 strong').inner_text()=='1'
        # Other professor should remain isolated.
        page.locator('.return-home').click()
        page.locator('.course-card').nth(1).click()
        assert page.locator('.mini-stat-0 strong').inner_text()=='33'
        assert page.locator('.mini-stat-1 strong').inner_text()=='0'
        assert not errors,errors
        print('PASS',width,height,'home/quiz, layout stability, user answer, persistence, course switching')
        if width==1536:
            page.locator('.return-home').click()
            page.screenshot(path=str(BASE/'v6_home_test.png'),full_page=True)
            page.locator('.course-card').first.click()
            page.screenshot(path=str(BASE/'v6_quiz_test.png'),full_page=False)
        page.close()
    browser.close()
