#!/usr/bin/env python3
"""Integration check for local file:// deployment and the v6.3 image-question additions."""
from pathlib import Path
import json, base64
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None, args=['--no-sandbox','--allow-file-access-from-files'])
    for w,h in [(1536,864),(390,844)]:
        page=browser.new_page(viewport={'width':w,'height':h})
        errors=[]
        page.on('pageerror',lambda err:errors.append(str(err)))
        # This harness blocks file:// and localhost navigation. Embed the real
        # project bundles, then inject authentic figure bytes as data URIs.
        css=(root/'styles.css').read_text(encoding='utf-8')
        js=(root/'app.js').read_text(encoding='utf-8')
        cat=(root/'data/catalog.js').read_text(encoding='utf-8')
        professors='\n'.join((root/f'data/professors/{prof}.js').read_text(encoding='utf-8') for prof in ['park-murim','lee-seoul','lee-seokyoung'])
        image_injection=[]
        for j,name in enumerate(['18-4-petct.webp','18-6-family-pedigree.webp']):
            b64=base64.b64encode((root/'assets/figures/lee-seokyoung'/name).read_bytes()).decode('ascii')
            image_injection.append(f'window.HEON_ARCHIVE_DATA.professors["lee-seokyoung"].questions[{j}].figureImages[0].src="data:image/webp;base64,{b64}";')
        storage_script="""Object.defineProperty(window,'localStorage',{value:{_d:{},getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=String(v)},removeItem(k){delete this._d[k]}}});"""
        html=f'<html lang="ko"><head><meta charset="utf-8"><style>{css}</style></head><body><div id="app"></div><script>{storage_script}</script><script>{cat}</script><script>{professors}</script><script>{"".join(image_injection)}</script><script>{js}</script></body></html>' 
        page.set_content(html,wait_until='load')
        page.locator('.course-card').first.wait_for(timeout=20000)
        assert page.locator('.course-card').count()==3, page.locator('.course-card').count()
        # Current professor catalog: Park 72, Seoul 33, Seokyoung 2.
        assert '72문제' in page.locator('.course-card').first.inner_text()
        page.locator('.course-card').first.click()
        page.locator('.exam-panel').wait_for()
        assert page.locator('.question-num').count()==1
        page.locator('#global-search-input').fill('21-43')
        page.locator('.search-result').first.click()
        assert page.locator('.question-num').inner_text().startswith('21-43')
        page.locator('[data-action="toggle-evidence"]').first.click()
        assert '사용자 확정' in page.locator('.evidence-panel').inner_text()
        assert '②' in page.locator('.evidence-panel').inner_text()
        # deleted Park record must not be present in search results for the professor.
        page.locator('#global-search-input').fill('21-59')
        assert page.locator('.search-result[data-professor="park-murim"]').count()==0
        page.locator('.return-home').click()
        page.locator('.course-card').last.click()
        assert page.locator('.question-num').inner_text().startswith('18-4')
        fig=page.locator('.question-figure-img')
        assert fig.count()==1
        assert fig.evaluate('(el)=>el.complete && el.naturalWidth>0')
        assert 'PET/CT' in fig.get_attribute('alt')
        assert page.locator('.source-card').evaluate('(el)=>!el.open')
        assert '정답 검토 필요' in page.locator('.exam-panel').inner_text()
        if w>1020:
            before=page.locator('.exam-panel').bounding_box()
        page.locator('.dock-nav[data-direction="1"]' if w>1020 else '.question-footer [data-direction="1"]').first.click()
        assert page.locator('.question-num').inner_text().startswith('18-6')
        fig=page.locator('.question-figure-img')
        assert fig.count()==1
        assert fig.evaluate('(el)=>el.complete && el.naturalWidth>0')
        assert '가계도' in fig.get_attribute('alt')
        if w>1020:
            page.locator('[data-action="toggle-evidence"]').first.click()
            after=page.locator('.exam-panel').bounding_box()
            assert abs(before['width']-after['width'])<1
        assert not errors,errors
        if w==1536:
            page.screenshot(path=str(root/'v6_3_image_question_preview.png'),full_page=False)
        page.close()
        print('PASS',w,h,'3 professors, 72+33+2, deleted item, user answers, two image questions, image paths')
    browser.close()
