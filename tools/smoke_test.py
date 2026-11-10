from pathlib import Path
from playwright.sync_api import sync_playwright
r=Path(__file__).resolve().parents[1]
css=(r/'styles.css').read_text()
cat=(r/'data/catalog.js').read_text()
prof=(r/'data/professors/park-murim.js').read_text()
app=(r/'app.js').read_text()
# Browser network is restricted in this execution environment: load real app and
# generated script data inline to verify the UI and persistence logic.
setup="""Object.defineProperty(window,'localStorage',{value:{_d:{},getItem(k){return this._d[k]||null},setItem(k,v){this._d[k]=v},removeItem(k){delete this._d[k]}},configurable:true});window.scrollTo=()=>{};"""
html=f'<html lang="ko"><head><meta charset="utf-8"><style>{css}</style></head><body><div id="app"></div><script>{setup}</script><script>{cat}</script><script>{prof}</script><script>{app}</script></body></html>'
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1280,'height':900})
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html,wait_until='domcontentloaded');page.wait_for_timeout(150)
 assert page.locator('.course-list').count()==1, page.locator('body').inner_text()[:500]
 page.locator('[data-action="professor"]').first.click()
 assert page.locator('.stat-number').first.inner_text()=='73'
 assert page.locator('.exam-panel').count()==1
 page.locator('[data-action="choose"]').nth(1).click()
 assert page.evaluate('JSON.parse(localStorage.getItem("heon.archive.learning.v1")).records["park-murim:17-1"].selected[0]')==2
 page.locator('[data-action="submit"]').click()
 assert page.locator('.stat-number').nth(1).inner_text()=='1'
 page.locator('[data-action="open-review"]').first.click()
 assert page.locator('.review-q').count()==73
 assert not errors,errors
 print('PASS: 73 questions rendered; selected and submitted answer saved; 73 review cards; no JS errors')
 mobile=b.new_page(viewport={'width':390,'height':844})
 mobile.set_content(html,wait_until='domcontentloaded')
 assert mobile.evaluate('document.documentElement.scrollWidth<=window.innerWidth'), 'horizontal overflow'
 print('PASS: mobile responsive width')
 b.close()
