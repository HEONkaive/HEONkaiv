/* HEON ARCHIVE · browser-only, GitHub Pages compatible.
 * Stable question IDs, per-question localStorage, isolated professor JSON.
 */
(() => {
  'use strict';
  const KEY = 'heon.archive.learning.v1';
  const root = document.getElementById('app');
  const $ = (s, ctx = document) => ctx.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const circles = ['①','②','③','④','⑤'];
  const emptyState = () => ({version:1,records:{},bookmarks:{},customAnswers:{},customMulti:{},lastVisited:{},lastProfessor:null,prefs:{theme:'dark',explanationWidth:450}});
  let state = emptyState();
  let catalog = null;
  const professorCache = new Map();
  let currentProfessor = null;
  let selectedSubject = 'hematology-1';
  let view = 'home';
  let currentYear = 'all';
  let currentId = null;
  let filter = 'all';
  let reviewFilter = 'all';
  let infoExpanded = false;
  let mobileMenuOpen = false;
  let restoringReview = false;
  let toastTimer = null;
  // Search is a UI preference only: it never alters or overwrites saved answers.
  let searchText = '';
  let searchOpen = false;
  let searchLoading = false;
  let searchIndexLoaded = false;
  let searchIndexPromise = null;
  let searchLoadErrors = 0;

  function readState() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && typeof raw === 'object') {
        state = {...emptyState(),...raw,
          records:raw.records && typeof raw.records==='object' ? raw.records : {},
          bookmarks:raw.bookmarks || {},customAnswers:raw.customAnswers || {},
          customMulti:raw.customMulti || {},lastVisited:raw.lastVisited || {},
          prefs:{...emptyState().prefs,...(raw.prefs||{})}};
      }
    } catch (err) { console.warn('기록을 읽지 못했습니다.',err); }
  }
  function saveState() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (err) { toast('저장 공간 문제로 기록을 저장하지 못했습니다. 브라우저 저장 공간을 확인하세요.'); console.error(err); }
  }
  function theme() {
    document.documentElement.dataset.theme = state.prefs.theme === 'light' ? 'light' : 'dark';
    document.documentElement.style.setProperty('--evidence-width', `${Math.min(690,Math.max(340,Number(state.prefs.explanationWidth)||450))}px`);
  }
  function toast(message) {
    document.querySelector('.toast')?.remove();
    const el=document.createElement('div');el.className='toast';el.textContent=message;
    document.body.append(el);clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.remove(),3000);
  }
  function questions(prof = currentProfessor) { return prof ? (prof.questions||[]) : []; }
  const yearSortValue = y => (y == null || y === 'unknown' || y === '연도미상') ? Number.MAX_SAFE_INTEGER : (Number.isFinite(Number(y)) ? Number(y) : Number.MAX_SAFE_INTEGER);
  const yearName = y => yearSortValue(y) === Number.MAX_SAFE_INTEGER ? '연도미상' : `${y}학번`;
  function record(q) {
    return state.records[q.id] || {selected:[],submitted:false};
  }
  function isBookmark(q) { return !!state.bookmarks[q.id]; }
  function submission(q) { return !!record(q).submitted; }
  function effectiveAnswer(q) { return Object.prototype.hasOwnProperty.call(state.customAnswers,q.id) ? state.customAnswers[q.id] : q.answer; }
  const normalizeText = s => String(s||'').toLowerCase().replace(/[\s.!?,'"’‘“”\-_:;]+/g,'');
  function arraysEqual(a,b) { const sa=[...(Array.isArray(a)?a:[a])].map(String).sort();const sb=[...(Array.isArray(b)?b:[b])].map(String).sort();return sa.length===sb.length && sa.every((x,i)=>x===sb[i]); }
  function evaluation(q) {
    if (!submission(q)) return 'not-started';
    const known = effectiveAnswer(q);
    if (known === null || known === undefined || (Array.isArray(known) && !known.length)) return 'pending';
    const picked = record(q).selected;
    if (q.type === 'short') return normalizeText(picked)===normalizeText(known) ? 'correct':'wrong';
    if (picked==null || (Array.isArray(picked) && !picked.length)) return 'pending';
    return arraysEqual(picked,known) ? 'correct':'wrong';
  }
  function stats(list) {
    const result={total:list.length,completed:0,correct:0,wrong:0,pending:0};
    for(const q of list) {
      if(submission(q)) {
        result.completed++;
        const e=evaluation(q);
        if(e==='correct')result.correct++;
        else if(e==='wrong')result.wrong++;
        else result.pending++;
      }
    }
    return result;
  }
  function stage(list) {
    const s=stats(list);
    if(!s.total || !s.completed)return 'empty';
    return s.completed===s.total?'complete':'partial';
  }
  function statusDot(s) { return `<span class="status-dot ${s==='complete'?'complete':s==='partial'?'partial':''}">${s==='complete'?'✓':''}</span>`; }
  function professorCourseStats(meta,loaded) {
    if (loaded) { const a=stats(loaded.questions||[]); return {...a, unresolved:(loaded.questions||[]).filter(q=>effectiveAnswer(q)==null).length}; }
    const total=Number(meta.questionCount)||0;
    const completed=Object.entries(state.records).filter(([id,r])=>id.startsWith(meta.id+':') && r?.submitted).length;
    return {total,completed,unresolved:Number(meta.pendingCount)||0};
  }
  function professorCourseStage(meta,loaded) {
    const s=professorCourseStats(meta,loaded);
    return !s.total||!s.completed?'empty':(s.completed>=s.total?'complete':'partial');
  }
  function subjectById(id) { return catalog.subjects.find(s=>s.id===id); }
  function profMeta(id) {
    for (const sub of catalog.subjects) for(const p of sub.professors)if(p.id===id)return {...p,subjectId:sub.id,subjectName:sub.name};
    return null;
  }
  // Plain script files load from both GitHub Pages (https:) and a local file (file:).
  // PDF/exam data stays in separate professor files, so adding new professors
  // does not require editing this HTML or application logic.
  function addDataScript(src) {
    return new Promise((resolve,reject) => {
      const script=document.createElement('script');
      script.src=src;
      script.onload=()=>resolve();
      script.onerror=()=>reject(new Error(`문제 파일을 찾지 못했습니다: ${src}`));
      document.head.appendChild(script);
    });
  }
  async function getProfessorData(meta) {
    const registry=window.HEON_ARCHIVE_DATA;
    if (!registry?.professors?.[meta.id]) {
      // Mirrors of JSON files are generated by tools/sync_offline_data.py.
      // Script loading, unlike fetch(JSON), also works when index.html is double-clicked.
      const jsPath=meta.data.replace(/\.json(?=\?|$)/i,'.js');
      await addDataScript(jsPath);
    }
    const data=window.HEON_ARCHIVE_DATA?.professors?.[meta.id];
    if(!data)throw Error(`문제 데이터가 비어 있습니다: ${meta.id}`);
    return data;
  }
  async function loadProfessor(id) {
    if(professorCache.has(id)) return professorCache.get(id);
    const meta=profMeta(id);if(!meta)throw Error('교수님 정보를 찾을 수 없습니다.');
    const data=await getProfessorData(meta);
    if(!Array.isArray(data.questions))throw Error('교수님 JSON에 questions 배열이 없습니다.');
    const ids=new Set();
    for(const q of data.questions){if(ids.has(q.id))throw Error(`중복 문제 ID: ${q.id}`);ids.add(q.id);}
    data.questions.sort((a,b)=>(yearSortValue(a.year)-yearSortValue(b.year))||(a.number-b.number)||a.id.localeCompare(b.id));
    professorCache.set(id,data);return data;
  }
  async function selectProfessor(id, keepYear=false) {
    try {
      const prof=await loadProfessor(id);const meta=profMeta(id);
      currentProfessor=prof;selectedSubject=meta.subjectId;state.lastProfessor=id;
      if(!keepYear)currentYear='all';filter='all';view='quiz';infoExpanded=false;restoringReview=false;
      const candidate=state.lastVisited[id];
      currentId=questions(prof).some(q=>q.id===candidate && (currentYear==='all'||String(q.year)===currentYear)) ? candidate : (questions(prof)[0]?.id||null);
      saveState();mobileMenuOpen=false;render();window.scrollTo({top:0,behavior:'instant'});
    } catch(err){toast(`문제 데이터를 불러올 수 없습니다: ${err.message}`);console.error(err);}
  }
  function scopedQuestions() {
    let arr=questions().filter(q=>currentYear==='all'||String(q.year)===currentYear);
    if(filter==='bookmarked')arr=arr.filter(isBookmark);
    if(filter==='wrong')arr=arr.filter(q=>evaluation(q)==='wrong');
    return arr;
  }
  function currentQuestion() {
    const items=scopedQuestions();
    return items.find(q=>q.id===currentId)||items[0]||null;
  }
  function goQuestion(id) {
    const q=questions().find(q=>q.id===id);if(!q)return;
    currentId=id;currentYear='all';filter='all';view='quiz';infoExpanded=false;state.lastVisited[currentProfessor.professor.id]=id;saveState();
    render();window.scrollTo({top:0,behavior:'instant'});
  }
  function selectCurrent(id) {
    infoExpanded=false;
    currentId=id;
    if(currentProfessor)state.lastVisited[currentProfessor.professor.id]=id;
    saveState();render();window.scrollTo({top:0,behavior:'instant'});
  }
  function selectYear(y) {infoExpanded=false;currentYear=y;filter='all';currentId=scopedQuestions()[0]?.id||null;view='quiz';render();}
  function searchEntries() {
    const query=searchText.trim();
    if(!query || !catalog)return [];
    const terms=query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const compressed=normalizeText(query);
    const found=[];
    for(const sub of catalog.subjects)for(const meta of sub.professors){
      const data=professorCache.get(meta.id);
      if(!data)continue;
      for(const q of data.questions){
        const choices=(q.choices||[]).map(c=>c.text).join(' ');
        const label=String(q.label||'').toLocaleLowerCase();
        const prompt=String(q.prompt||'');
        const material=[label,meta.name,sub.name,prompt,choices].join(' ').toLocaleLowerCase();
        const simple=normalizeText(material);
        const fullMatch=terms.every(term=>material.includes(term)||simple.includes(normalizeText(term)));
        if(!fullMatch && !(compressed && simple.includes(compressed)))continue;
        const numberExact=label===query.toLocaleLowerCase();
        const numberStart=label.startsWith(query.toLocaleLowerCase());
        const promptMatch=normalizeText(prompt).includes(compressed);
        const choiceMatch=normalizeText(choices).includes(compressed);
        const score=(numberExact?1200:0)+(numberStart?600:0)+(promptMatch?120:0)+(choiceMatch?80:0)+
          (meta.id===currentProfessor?.professor.id?25:0);
        found.push({q,meta,score});
      }
    }
    return found.sort((a,b)=>b.score-a.score||(yearSortValue(a.q.year)-yearSortValue(b.q.year))||(a.q.number-b.q.number)).slice(0,30);
  }
  function searchSuggestionsHTML(){
    if(!searchText.trim()) return '<div class="search-message"><strong>문항 빠른 검색</strong><p>문제 번호(예: 17-8), 지문 키워드 또는 선택지·약물명을 입력하세요. 등록된 모든 교수님에서 찾습니다.</p></div>';
    const hits=searchEntries();
    const pending=searchLoading?'<span class="fine"> · 다른 교수님 자료 검색 중…</span>':'';
    const header=`<div class="search-results-head">검색 결과 ${hits.length>=30?'30개 이상':hits.length+'개'}${pending}</div>`;
    const rows=hits.slice(0,12).map(({q,meta})=>{
      const preview=String(q.prompt||q.choices?.map(c=>c.text).join(' / ')||'원본 이미지 참고').replace(/\s+/g,' ').slice(0,92);
      return `<button class="search-result" type="button" role="option" data-action="search-result" data-professor="${esc(meta.id)}" data-id="${esc(q.id)}"><span class="search-result-top"><strong>${esc(q.label)}</strong><span>${esc(meta.name)} 교수님 · ${esc(yearName(q.year))}</span></span><span class="search-result-text">${esc(preview)}</span></button>`;
    }).join('');
    if(!hits.length) return header+`<div class="search-message"><strong>${searchLoading?'검색 범위를 확장하고 있습니다':'일치하는 문제가 없습니다'}</strong><p>${searchLoading?'등록 교수님 데이터를 불러오는 중입니다.':'번호나 다른 키워드로 다시 검색해 보세요.'}${searchLoadErrors?' 일부 교수님 파일을 읽지 못했습니다.':''}</p></div>`;
    return header+rows+(hits.length>12?`<div class="search-foot">상위 12개 결과를 표시 중입니다. 검색어를 더 구체적으로 입력하세요.</div>`:'');
  }
  function updateSearchSuggestions(){
    const panel=root.querySelector('#search-suggestions');
    const field=root.querySelector('#global-search-input');
    if(!panel)return;
    panel.hidden=!searchOpen;
    panel.innerHTML=searchOpen?searchSuggestionsHTML():'';
    field?.setAttribute('aria-expanded',String(searchOpen));
  }
  function loadSearchIndex(){
    if(searchIndexPromise || !catalog)return searchIndexPromise;
    searchLoading=true;
    updateSearchSuggestions();
    const ids=catalog.subjects.flatMap(s=>s.professors.map(p=>p.id));
    searchIndexPromise=Promise.allSettled(ids.map(id=>loadProfessor(id))).then(results=>{
      searchLoadErrors=results.filter(r=>r.status==='rejected').length;
      searchIndexLoaded=true;
    }).finally(()=>{searchLoading=false;updateSearchSuggestions();});
    return searchIndexPromise;
  }
  async function openSearchQuestion(profId,qId){
    try{
      const prof=await loadProfessor(profId);
      if(!prof.questions.some(q=>q.id===qId)) throw Error('검색 결과의 문항이 없습니다.');
      currentProfessor=prof;
      selectedSubject=profMeta(profId).subjectId;
      currentYear='all';filter='all';view='quiz';infoExpanded=false;restoringReview=false;
      currentId=qId;state.lastProfessor=profId;state.lastVisited[profId]=qId;
      searchText='';searchOpen=false;mobileMenuOpen=false;
      saveState();render();window.scrollTo({top:0,behavior:'instant'});
    }catch(err){toast('검색한 문제를 열지 못했습니다: '+err.message);}
  }
  function resetProfessorProgress(){
    if(!currentProfessor)return;
    const name=currentProfessor.professor.name;
    const profId=currentProfessor.professor.id;
    if(!confirm(`${name} 교수님의 학습 기록만 초기화할까요?\n\n제출 답안, 풀이 진행률, 북마크, 직접 지정한 정답, 마지막 문제 위치가 초기화됩니다.\n다른 교수님의 기록은 그대로 유지됩니다.\n(문제 데이터 자체의 사용자 확정 정답은 변경되지 않습니다.)`))return;
    const ids=new Set(questions().map(q=>q.id));
    for(const group of [state.records,state.bookmarks,state.customAnswers,state.customMulti]){
      for(const id of ids)delete group[id];
    }
    delete state.lastVisited[profId];
    currentYear='all';filter='all';reviewFilter='all';view='quiz';
    currentId=questions()[0]?.id||null;infoExpanded=false;restoringReview=false;
    saveState();render();window.scrollTo({top:0,behavior:'instant'});
    toast(`${name} 교수님의 학습 기록만 초기화했습니다.`);
  }
  function render() {
    if(!catalog)return;
    // When a user changes a selection, keep the reading position in long questions.
    // Going to another question deliberately starts at that new question's top.
    const previousPanel=root.querySelector('.exam-panel');
    const previousId=previousPanel?.dataset.questionId;
    const keepPanelScroll=!!previousId && view==='quiz' && previousId===currentQuestion()?.id;
    const questionScroll=keepPanelScroll?previousPanel.scrollTop:0;
    const evidenceScroll=keepPanelScroll?root.querySelector('.evidence-panel')?.scrollTop||0:0;
    theme();
    const meta=currentProfessor?profMeta(currentProfessor.professor.id):null;
    const currSubject=subjectById(selectedSubject);
    root.innerHTML=`<div class="site ${view==='quiz'?'quiz-mode':''}">
      <aside class="side ${mobileMenuOpen?'open':''}" id="sidebar">
        <div class="brand" data-action="home" role="button" tabindex="0"><div class="logo-mark">H<span>.</span></div><div><div class="brand-name">HEON ARCHIVE</div><div class="brand-sub">MEDICAL LEARNING</div></div></div>
        <nav aria-label="과목 및 교수님 메뉴"><div class="side-kicker">YOUR LIBRARY</div>${catalog.subjects.map((s,i)=>{
          const sel=selectedSubject===s.id;return `<div class="subject-wrap">
            <button type="button" class="subject-btn ${sel?'active':''}" data-action="subject" data-id="${esc(s.id)}" aria-expanded="${sel}"><span class="subject-ico">${String(i+1).padStart(2,'0')}</span><span class="subject-name">${esc(s.name)}</span><span class="chev">${sel?'▾':'▸'}</span></button>
            ${sel?`<div class="prof-list">${s.professors.length?s.professors.map(p=>{const loaded=professorCache.get(p.id);return `<button type="button" class="prof-btn ${currentProfessor&&currentProfessor.professor.id===p.id&&view!=='home'?'active':''}" data-action="professor" data-id="${esc(p.id)}"><span class="prof-avatar">${esc(p.name.slice(0,1))}</span><span class="prof-label">${esc(p.name)} 교수님</span>${statusDot(professorCourseStage(p,loaded))}</button>`}).join(''):`<p class="fine">등록 예정</p>`}</div>`:''}
          </div>`}).join('')}</nav>
        <div class="side-bottom"><strong>STUDY, REMEMBER, REPEAT.</strong><p>답안을 선택하는 즉시 이 브라우저에 저장됩니다. 별도 계정이나 서버는 필요하지 않습니다.</p></div>
      </aside>
      <main class="workspace">
        <header class="topbar">
          <div class="topbar-navigation"><button class="icon-btn mobile-menu" data-action="mobile-menu" aria-label="과목 메뉴 열기">☰</button>
            <nav class="quick-nav" aria-label="빠른 메뉴">
              <button data-action="nav-quiz" class="nav-tab ${view==='quiz'?'active':''}">문제 풀이</button>
              <button data-action="home" class="nav-tab ${view==='home'?'active':''}">문제집</button>
              <button data-action="nav-wrong" class="nav-tab ${view==='review'&&reviewFilter==='wrong'?'active':''}">오답 노트</button>
              <button data-action="nav-stats" class="nav-tab ${view==='review'&&reviewFilter!=='wrong'?'active':''}">학습 통계</button>
            </nav>
          </div>
          <div class="topbar-tools"><div class="global-search" role="search"><label class="search-shell" for="global-search-input"><span class="search-icon" aria-hidden="true">⌕</span><input type="search" id="global-search-input" autocomplete="off" spellcheck="false" value="${esc(searchText)}" placeholder="문제 번호, 키워드, 약물명 검색..." aria-label="모든 교수님 문제 검색" aria-controls="search-suggestions" aria-expanded="${searchOpen}"/><span class="search-shortcut" aria-hidden="true">/</span></label><div id="search-suggestions" class="search-suggestions" role="listbox" ${searchOpen?'':'hidden'}>${searchOpen?searchSuggestionsHTML():''}</div></div>
            <div class="header-actions"><span class="autosave-indicator" title="기록은 브라우저에 자동 저장됩니다"><span class="autosave-dot"></span><span class="desktop-label">자동 저장</span></span><button class="icon-btn theme-btn" data-action="theme" title="라이트 / 다크모드 변경" aria-label="테마 전환">${state.prefs.theme==='dark'?'☀':'☾'}</button></div>
          </div>
        </header>
        <div class="content ${view==='quiz'?'quiz-content':''}">${view==='home'?renderHome():view==='review'?renderReview():renderQuiz()}</div>
      </main>
    </div>`;
    if(keepPanelScroll) {
      const nextPanel=root.querySelector('.exam-panel');
      const nextEvidence=root.querySelector('.evidence-panel');
      if(nextPanel)nextPanel.scrollTop=questionScroll;
      if(nextEvidence)nextEvidence.scrollTop=evidenceScroll;
    }
  }
  function renderHome() {
    const subs=catalog.subjects;
    const selected=subjectById(selectedSubject);
    return `<section class="hero"><div class="eyebrow">YOUR PERSONAL STUDY SPACE</div><h1 class="headline">Knowledge, <em>archived.</em><br>Progress, remembered.</h1><p class="subtitle">교수님별 기출문제, 검증된 강의안 근거, 나만의 학습 기록을 한곳에서. 무엇을 공부했는지 기억하는 의학 아카이브.</p>${selected?.professors?.length?`<button class="button hero-btn" data-action="professor" data-id="${esc(selected.professors[0].id)}">이어서 학습하기 &nbsp; →</button>`:''}</section>
      <div class="section-head"><h2 class="section-title">Explore subjects</h2><span class="fine">총 ${subs.length}개 과목</span></div>
      <div class="subject-grid">${subs.map((s,i)=>`<button class="subject-card" data-action="subject-home" data-id="${esc(s.id)}"><span class="index">0${i+1} / SUBJECT</span><h3>${esc(s.name)}</h3><p>${s.professors.length?`${s.professors.length}명의 교수님 등록`:'교수님 등록 예정'}</p><span class="arr">↗</span></button>`).join('')}</div>
      <section style="margin-top:29px"><div class="section-head"><h2 class="section-title">${esc(selected?.name||'')} · 교수님</h2><span class="fine">${selected?.professors.length||0}명</span></div>
        ${selected?.professors.length?`<div class="course-list">${selected.professors.map(p=>courseCard(p)).join('')}</div>`:`<div class="empty">이 과목에 등록된 교수님이 없습니다. 새로운 교수님 데이터 파일을 추가하면 이곳에 표시됩니다.</div>`}</section>`;
  }
  function courseCard(p) {
    const data=professorCache.get(p.id);
    const s=professorCourseStats(p,data);
    const pct=s.total?Math.round(s.completed/s.total*100):0;
    return `<button class="course-card" data-action="professor" data-id="${esc(p.id)}"><div class="course-big-icon">${esc(p.name.slice(0,1))}</div><div class="course-main"><h3>${esc(p.name)} 교수님 ${statusDot(professorCourseStage(p,data))}</h3><p>${s.total}문제 · ${s.unresolved}문항 정답 검토 필요</p><div class="progress-track"><div class="progress-fill ${s.total&&s.completed>=s.total?'done':''}" style="width:${pct}%"></div></div></div><div class="course-right"><strong>${pct}%</strong>${s.completed} / ${s.total} 완료</div></button>`;
  }
  function renderCompactStats(s){
    const items=[['전체 문제',s.total,'▤'],['풀이 완료',s.completed,'◉'],['정답',s.correct,'✓'],['오답',s.wrong,'✕'],['채점 보류',s.pending,'◷']];
    const percentage=s.total?Math.round(s.completed/s.total*100):0;
    return `<div class="overview-strip">
      <div class="mini-stat-group">${items.map(([label,num,icon],i)=>`<div class="mini-stat mini-stat-${i}"><span class="mini-icon" aria-hidden="true">${icon}</span><span class="mini-label">${label}</span><strong>${num}</strong></div>`).join('')}</div>
      <div class="mini-progress" aria-label="전체 진행률 ${percentage}%"><span>전체 진행률</span><div class="progress-track"><div class="progress-fill ${s.total&&s.completed===s.total?'done':''}" style="width:${percentage}%"></div></div><b>${percentage}%</b></div>
      <button class="prof-reset" data-action="reset-professor" title="${esc(currentProfessor.professor.name)} 교수님의 학습 기록만 초기화합니다"><span aria-hidden="true">↺</span><span>${esc(currentProfessor.professor.name)} 교수님 기록 초기화<small>다른 교수님 기록은 유지</small></span></button>
    </div>`;
  }
  function renderCourseHeader() {
    const l=questions();const s=stats(l);const pending=l.filter(q=>effectiveAnswer(q)==null).length;
    const verified=l.filter(q=>q.validation?.stage==='accepted').length;
    const manual=l.filter(q=>q.validation?.stage==='user_confirmed').length;
    return `<div class="course-header compact-course-header"><div class="course-identity"><div class="eyebrow">${esc(({ 'hematology-1':'HEMATOLOGY I', 'hematology-2':'HEMATOLOGY II', 'maternal-newborn':'MATERNAL · NEWBORN', 'growth-aging':'GROWTH · AGING' })[currentProfessor.professor.subjectId]||'MEDICAL')} · EXAM LIBRARY</div><div class="course-title-line"><h1>${esc(currentProfessor.professor.name)} 교수님</h1><p>${esc(currentProfessor.professor.description||'교수님별 기출 문제')} &nbsp; / &nbsp; 연도별 또는 전체 문항 풀이</p></div></div>
      <div class="header-pills"><span class="pill blue">${s.total}문제</span><span class="pill ok">근거 검증 ${verified}건</span>${manual?`<span class="pill blue">사용자 확정 ${manual}건</span>`:''}<span class="pill warn">미확정 ${pending}건</span><button class="button secondary small" data-action="open-review">Review ↗</button></div></div>`;
  }
  function years() {return [...new Set(questions().map(q=>q.year))].sort((a,b)=>yearSortValue(a)-yearSortValue(b));}
  function renderFilterbar() {
    const q=scopedQuestions();
    return `<div class="filterbar"><div class="year-chips"><button class="chip ${currentYear==='all'?'active':''}" data-action="year" data-year="all">전체 <span class="count">${questions().length}</span>${stage(questions())==='complete'?'<span class="check">✓</span>':''}</button>${years().map(y=>{const yy=questions().filter(q=>q.year===y);return `<button class="chip ${currentYear===String(y)?'active':''}" data-action="year" data-year="${y}">${esc(yearName(y))} <span class="count">${yy.length}</span>${stage(yy)==='complete'?'<span class="check">✓</span>':''}</button>`}).join('')}</div>
      <div class="filter-actions"><button class="chip ${filter==='bookmarked'?'active':''}" data-action="filter" data-filter="bookmarked">☆ 북마크</button><button class="chip ${filter==='wrong'?'active':''}" data-action="filter" data-filter="wrong">↺ 오답만</button><select class="select" data-action="number-select" aria-label="문제 번호 선택">${q.length?q.map(item=>`<option value="${esc(item.id)}" ${currentQuestion()?.id===item.id?'selected':''}>${esc(item.label)} · ${submission(item)?'풀이완료':'미완료'}</option>`).join(''):'<option>해당 문항 없음</option>'}</select></div></div>`;
  }
  function renderQuiz() {
    if(!currentProfessor)return `<div class="empty">교수님을 선택해주세요.</div>`;
    const l=questions();const qs=scopedQuestions();const q=currentQuestion();const s=stats(l);
    return `${renderCourseHeader()}${renderCompactStats(s)}${renderFilterbar()}
    ${q?`<div class="exam-layout ${infoExpanded?'':'collapsed'}">${renderQuestionPanel(q,qs)}<div class="divider-grip" id="resizer" title="드래그하여 해설 너비 조절" aria-hidden="true"></div>${infoExpanded?renderEvidencePanel(q):renderEvidenceClosed()}</div>${renderQuizDock(q,qs)}`:`<div class="empty"><p>조건에 맞는 문제가 없습니다.</p><button class="button secondary small" data-action="clear-filter">전체 문제로 돌아가기</button></div>`}
    <p class="help-text">정답 검토 필요 문항은 사용자가 정답을 지정하기 전까지 정오답 통계에 포함되지 않습니다. 학습 기록과 북마크는 이 브라우저에만 저장됩니다.</p>`;
  }
  // Separate desktop action dock: navigation and submit stay on screen for long questions.
  // Mobile retains the original in-card actions and page scrolling.
  function renderQuizDock(q,scope) {
    const index=scope.findIndex(x=>x.id===q.id);
    const r=record(q);
    const ready=q.type==='short'?!!String(r.selected||'').trim():!!(Array.isArray(r.selected)?r.selected.length:r.selected);
    return `<div class="quiz-dock" role="group" aria-label="문제 이동 및 답안 제출">
      <div class="dock-position"><span class="dock-heading">NOW STUDYING</span><strong>${esc(q.label)}</strong><span>${index+1} / ${scope.length}</span></div>
      <div class="dock-controls"><button class="button secondary small dock-nav" data-action="step" data-direction="-1" ${index===0?'disabled':''}>← 이전 문제</button><button class="button secondary small dock-nav" data-action="step" data-direction="1" ${index===scope.length-1?'disabled':''}>다음 문제 →</button>
      ${restoringReview?'<button class="button ghost small" data-action="back-review">← Review</button>':''}
      <button class="button dock-submit ${r.submitted?'secondary':''}" data-action="submit" ${ready?'':'disabled'}>${r.submitted?'다시 제출':'답안 제출'} ✓</button></div>
    </div>`;
  }
  function renderEvidenceClosed() {
    return `<aside class="evidence-placeholder" aria-label="해설창 닫힘">
      <div class="closed-evidence-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="10" width="13" height="10.5" rx="2"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/></svg></div>
      <div class="evidence-kicker">EXPLANATION LOCKED</div>
      <h3>아직 문제를 풀지 않았습니다.</h3>
      <p>답안을 제출하면 정답과 해설, 검증된 강의안 원본을 이곳에서 확인할 수 있습니다.</p>
      <button class="button ghost small" data-action="toggle-evidence">해설 직접 열기 ↗</button>
    </aside>`;
  }
  function renderQuestionPanel(q,scope) {
    const curr=scope.findIndex(x=>x.id===q.id);const r=record(q);const grading=evaluation(q);
    const checked=Array.isArray(r.selected)?r.selected:r.selected?[r.selected]:[];
    const answer=effectiveAnswer(q);const answers=answer==null?[]:Array.isArray(answer)?answer:[answer];
    const maxSelection=Number(q.maxSelections)||1;
    return `<section class="exam-panel" data-question-id="${esc(q.id)}"><div class="question-header"><div><div class="question-id">QUESTION / ${esc(q.label)}</div><h2 class="question-num">${esc(q.label)} <span class="question-index">${curr+1} / ${scope.length}</span></h2><div class="question-meta"><span class="pill ${q.validation.stage==='accepted'?'ok':q.validation.stage==='user_confirmed'?'blue':'warn'}">${q.validation.stage==='accepted'?'✓ 강의안 이중 검증':q.validation.stage==='user_confirmed'?'● 사용자 확정 정답':'! 정답 검토 필요'}</span><span class="pill">${esc(yearName(q.year))}</span>${submission(q)?`<span class="pill blue">제출 완료</span>`:''}</div></div>
      <div class="row"><button class="bookmark ${isBookmark(q)?'saved':''}" data-action="bookmark" data-id="${esc(q.id)}" title="북마크" aria-pressed="${isBookmark(q)}">${isBookmark(q)?'★':'☆'}</button><button class="icon-btn" data-action="toggle-evidence">${infoExpanded?'해설 접기':'해설 열기'}</button></div></div>
      <div class="prompt">${esc(q.prompt||'원본 이미지에서 문제 본문을 확인하세요.')}</div>
      ${q.type==='short'?`<label class="muted" for="short-answer">주관식 답안</label><textarea class="short-input" id="short-answer" data-question="${esc(q.id)}" placeholder="답안을 입력하세요. 입력하는 즉시 저장됩니다.">${esc(typeof r.selected==='string'?r.selected:'')}</textarea>`:
      q.choices?.length?`<div class="options">${q.choices.map(ch=>{const selected=checked.includes(ch.number);const correct=submission(q)&&answer!=null&&answers.includes(ch.number);const wrong=submission(q)&&selected&&!answers.includes(ch.number)&&answer!=null;return `<button class="option ${selected?'selected':''} ${correct?'correct-choice':''} ${wrong?'wrong-choice':''}" data-action="choose" data-number="${ch.number}" aria-pressed="${selected}"><span class="option-letter">${circles[ch.number-1]||ch.number}</span><span class="option-text">${esc(ch.text)}</span>${correct?'<span class="option-flag">정답</span>':wrong?'<span class="option-flag">선택 오답</span>':''}</button>`}).join('')}</div>${maxSelection>1?`<p class="help-text">이 문항은 정답 ${maxSelection}개를 선택합니다.</p>`:''}`:
      `<p class="review-note">텍스트 선택지의 판독이 불완전합니다. 아래 원본에서 선택지 번호와 문장을 확인한 후 답 번호를 선택하세요.</p><div class="options">${circles.map((v,i)=>`<button class="option ${checked.includes(i+1)?'selected':''} ${submission(q)&&answer!=null&&answers.includes(i+1)?'correct-choice':''}" data-action="choose" data-number="${i+1}"><span class="option-letter">${v}</span><span class="option-text">${i+1}번 선택지 — 원본 캡처 확인</span></button>`).join('')}</div>`}
      ${renderResult(q,grading)}
      <details class="source-card"><summary>기출 원본 이미지 보기 · ${esc(q.source.name)} · PDF ${q.source.page}페이지</summary><img class="source-image" src="${esc(q.source.image)}" alt="${esc(q.label)} 기출 원본 캡처" loading="lazy" data-action="zoom" data-caption="${esc(q.source.name)} · PDF ${q.source.page}페이지"><p class="source-warning">기출 원본에는 기존 필기와 정답 표기가 포함되어 있을 수 있습니다. 최종 채점 기준은 강의안 검증 정답 또는 명시적으로 사용자 확정된 정답입니다.</p>${q.transcriptionWarning?`<p class="source-warning">${esc(q.transcriptionWarning)}</p>`:''}</details>
      <div class="question-footer"><div class="quiz-actions"><div class="row"><button class="button secondary small" data-action="step" data-direction="-1" ${curr<=0?'disabled':''}>← 이전</button><button class="button secondary small" data-action="step" data-direction="1" ${curr===scope.length-1?'disabled':''}>다음 →</button></div><div class="row">${restoringReview?'<button class="button ghost small" data-action="back-review">← Review</button>':''}<button class="button ${r.submitted?'secondary':''}" data-action="submit" ${q.type==='short'?(!String(r.selected||'').trim()?'disabled':''):(!checked.length?'disabled':'')}>${r.submitted?'다시 제출':'답안 제출'} &nbsp; ✓</button></div></div>${saysAllCompleted()?`<div class="result-box correct"><b>전체 문항 풀이가 완료되었습니다.</b><p>정답 검토 필요 문항을 제외한 결과는 Review에서 확인할 수 있습니다.</p><button class="button small review-button" data-action="open-review" style="margin-top:11px">최종 Review 열기 →</button></div>`:''}</div>
    </section>`;
  }
  function saysAllCompleted() {const s=stats(questions());return !!s.total&&s.completed===s.total;}
  function renderResult(q,grade) {
    if(!submission(q))return '';
    const label=grade==='correct'?'정답입니다':grade==='wrong'?'오답입니다':'채점 보류 · 정답 미확정';
    const description=grade==='pending'?'강의안에서 정답을 확정하지 못했습니다. 해설창을 열고 직접 지정할 수 있습니다.':grade==='correct'?'제출한 선택지가 현재 확정된 정답과 일치합니다.':q.validation?.stage==='user_confirmed'?'사용자가 확정한 정답과 다른 답안을 선택했습니다.':'강의안에 근거한 정답과 다른 답안을 선택했습니다.';
    return `<div class="result-box ${grade==='not-started'?'':grade}"><b>${label}</b><p>${description}</p></div>`;
  }
  function renderEvidencePanel(q) {
    const accepted=q.validation.stage==='accepted';const userConfirmed=q.validation.stage==='user_confirmed';const ans=effectiveAnswer(q);
    const usedCustom=Object.prototype.hasOwnProperty.call(state.customAnswers,q.id);
    const refs=accepted?q.evidence:q.candidateEvidence||[];
    const confirmed=accepted&&!usedCustom;const userDesignated=userConfirmed||usedCustom;
    const answerText=(a)=>q.type==='short'?String(a):[...(Array.isArray(a)?a:[a])].map(n=>{
      const item=q.choices.find(c=>c.number===n);return `${circles[n-1]||n} ${item?item.text:''}`;
    }).join(' / ');
    return `<aside class="evidence-panel"><div class="evidence-head"><div><div class="evidence-kicker">EVIDENCE & EXPLANATION</div><h3>정답 근거 및 해설</h3></div><button class="icon-btn" data-action="toggle-evidence" title="해설 접기">✕</button></div>
      <div class="question-meta" style="margin-top:12px">${confirmed?'<span class="pill ok">✓ 1차 원문 확인</span><span class="pill ok">✓ 2차 보기 검증</span>':userDesignated?'<span class="pill blue">● 사용자 지정 정답 · 강의안 미검증</span>':'<span class="pill warn">! 근거 미채택</span>'}</div>
      ${ans!=null?`<div class="result-box ${confirmed?'correct':'pending'}"><b>${userDesignated?'사용자 확정 정답':'강의안 검증 정답'} · ${esc(answerText(ans))}</b><p>${userDesignated?(usedCustom?'이 브라우저에서 직접 지정한 정답으로 채점과 Review에 반영됩니다.':'사용자의 요청으로 정답을 확정했으며 채점과 Review에 반영됩니다. 강의안 이중검증 채택 결과는 아닙니다.'):'업로드한 강의안 원문을 대조해 채택한 답안입니다.'}</p></div>`:
      '<div class="review-note">정답 검토 필요: 강의안에서 확실한 정답 근거를 확인하지 못하여 정답을 지정하지 않았습니다.</div>'}
      ${accepted?`<p class="evidence-explanation">${esc(q.explanation)}</p>`:`<p class="review-note">${esc(q.notes||'근거가 불충분합니다. 아래 참고 이미지는 정답 증거로 채택하지 않았습니다.')}</p>`}
      <div class="section-head"><h4 class="section-title" style="font-size:14px">${confirmed?'채택된 강의안 원본':'검토용 강의안 원본'}</h4><span class="fine">${refs.length}페이지</span></div>
      ${refs.length?refs.map(e=>`<article class="evidence-item"><div class="evidence-meta"><span class="file-page">PDF ${e.page}페이지 ${confirmed?'· 채택 근거':'· 검토 자료 (미채택)'}</span><p class="file-name">${esc(e.file)}</p>${confirmed&&e.quote?`<div class="quote">원문 확인 기준: ${esc(e.quote)}</div>`:''}</div><img class="evidence-image" src="${esc(e.image)}" alt="${esc(e.file)} ${e.page}페이지 ${confirmed?'검증 근거':'검토용 자료'}" loading="lazy" data-action="zoom" data-caption="${esc(e.file)} · PDF ${e.page}페이지"><div class="zoom-label">이미지를 누르면 확대됩니다 ⤢</div></article>`).join(''):'<div class="empty" style="padding:21px">일치하는 강의안 페이지를 확보하지 못했습니다. 관련 없는 이미지로 근거를 대체하지 않았습니다.</div>'}
      ${!confirmed?`<section class="user-answer"><h4>직접 정답 지정</h4><p>강의안을 확인한 후 정답을 직접 지정할 수 있습니다. 선택 즉시 자동 저장되며 제출한 답안의 채점 상태가 변경됩니다.</p>${q.type==='short'?`<input class="search" id="custom-short" type="text" placeholder="정답 문장을 입력하세요" value="${esc(usedCustom?String(ans):'')}" style="width:100%;margin-bottom:8px"><button class="button small secondary" data-action="save-custom-short">정답 저장</button>`:
      `<div class="custom-answers">${Array.from({length:5},(_,i)=>{const a=i+1;const sel=ans!=null&&(Array.isArray(ans)?ans.includes(a):ans===a);return `<button class="number-pill ${sel?'active':''}" data-action="custom-answer" data-number="${a}" aria-pressed="${sel}">${circles[i]}</button>`}).join('')}</div><div class="row" style="margin-top:12px"><label class="fine"><input type="checkbox" data-action="custom-multi" ${state.customMulti[q.id]?'checked':''}> 복수 정답 지정</label></div>`}
      ${usedCustom?`<button class="button ghost tiny" data-action="remove-custom" style="margin-top:11px">내 지정 정답 해제</button>`:''}</section>`:''}
      <div class="help-text">강의안 파일명과 페이지 번호는 PDF 파일의 실제 1부터 시작하는 페이지를 기준으로 기록했습니다. 원본 확인에 사용된 이미지 자체가 그대로 포함되어 있습니다.</div>
    </aside>`;
  }
  function renderReview() {
    const all=questions();const s=stats(all);
    const ordered=all.filter(q=>{
      if(reviewFilter==='wrong')return evaluation(q)==='wrong';
      if(reviewFilter==='pending')return evaluation(q)==='pending'||effectiveAnswer(q)==null;
      if(reviewFilter==='bookmarks')return isBookmark(q);
      return true;
    });
    const labels={correct:'정답',wrong:'오답',pending:'채점 보류','not-started':'미제출'};
    const symbols={correct:'✓',wrong:'✕',pending:'!', 'not-started':'–'};
    return `${renderCourseHeader()}<div class="eyebrow">LEARNING RESULTS</div><h1 class="headline" style="font-size:31px">${s.completed===s.total&&s.total?'Final Review':'Progress Review'}<em>.</em></h1><p class="subtitle">각 문제를 누르면 선택한 답안, 해설 및 강의안 원본 캡처를 다시 확인할 수 있습니다.</p>
      <div class="review-summary">${[['풀이 완료',s.completed],['정답',s.correct],['오답',s.wrong],['채점 보류',s.pending]].map(([name,n],i)=>`<div class="stat"><div class="stat-label">${name}</div><div class="stat-number" style="color:${['var(--text)','var(--green)','var(--red)','var(--orange)'][i]}">${n}</div></div>`).join('')}</div>
      <section class="review-panel"><div class="review-heading"><h2>문제별 학습 기록</h2><p>미제출 ${s.total-s.completed}문항 · 전체 ${s.total}문항 · 정답 미확정은 정오답 통계에서 제외됩니다.</p><div class="review-toolbar">${[['all','전체'],['wrong','오답만 복습'],['pending','검토 필요'],['bookmarks','북마크']].map(([type,name])=>`<button class="chip ${reviewFilter===type?'active':''}" data-action="review-filter" data-filter="${type}">${name}</button>`).join('')}<button class="button secondary small" data-action="back-quiz">문제풀이로 돌아가기 →</button></div></div>
      ${ordered.length?`<div class="review-grid">${ordered.map(q=>{const status=evaluation(q);return `<button class="review-q ${status==='not-started'?'':status}" data-action="review-question" data-id="${esc(q.id)}"><div class="review-qnum">${esc(q.label)}</div><div class="review-status"><b>${symbols[status]}</b> ${labels[status]}</div>${isBookmark(q)?'<div class="fine">★ 북마크</div>':''}</button>`}).join('')}</div>`:'<div class="empty" style="margin:20px">현재 필터에 해당하는 문제가 없습니다.</div>'}</section>`;
  }
  // Event delegation: no inline JavaScript handlers inside content.
  root.addEventListener('click',async(e)=>{
    const btn=e.target.closest('[data-action]');if(!btn)return;
    if(btn.matches('input[type=checkbox]'))return; // change listener handles checkbox
    const action=btn.dataset.action;
    switch(action) {
      case 'mobile-menu':mobileMenuOpen=!mobileMenuOpen;render();break;
      case 'home':view='home';mobileMenuOpen=false;render();window.scrollTo(0,0);break;
      case 'subject':selectedSubject=btn.dataset.id;currentProfessor=null;view='home';mobileMenuOpen=false;render();break;
      case 'subject-home':selectedSubject=btn.dataset.id;currentProfessor=null;view='home';render();window.scrollTo(0,0);break;
      case 'professor':await selectProfessor(btn.dataset.id);break;
      case 'theme':state.prefs.theme=state.prefs.theme==='dark'?'light':'dark';saveState();render();break;
      case 'reset-professor':resetProfessorProgress();break;
      case 'nav-quiz':{
        if(!currentProfessor){const first=catalog.subjects.find(s=>s.professors.length)?.professors[0];if(first)await selectProfessor(first.id);}
        else{view='quiz';reviewFilter='all';restoringReview=false;infoExpanded=false;render();window.scrollTo(0,0);}
        break;
      }
      case 'nav-wrong':{
        if(!currentProfessor){toast('오답을 보려면 먼저 교수님을 선택해주세요.');break;}
        reviewFilter='wrong';view='review';restoringReview=false;render();window.scrollTo(0,0);break;
      }
      case 'nav-stats':{
        if(!currentProfessor){toast('학습 통계를 보려면 먼저 교수님을 선택해주세요.');break;}
        reviewFilter='all';view='review';restoringReview=false;render();window.scrollTo(0,0);break;
      }
      case 'search-result':await openSearchQuestion(btn.dataset.professor,btn.dataset.id);break;
      case 'year':selectYear(btn.dataset.year);break;
      case 'filter':infoExpanded=false;filter=filter===btn.dataset.filter?'all':btn.dataset.filter;currentId=scopedQuestions()[0]?.id||null;render();break;
      case 'clear-filter':infoExpanded=false;filter='all';currentYear='all';currentId=scopedQuestions()[0]?.id||null;render();break;
      case 'bookmark':{
        const q=questions().find(x=>x.id===btn.dataset.id);if(!q)break;
        if(isBookmark(q))delete state.bookmarks[q.id];else state.bookmarks[q.id]=true;
        saveState();render();break;
      }
      case 'choose':{
        const q=currentQuestion();if(!q)break;const n=Number(btn.dataset.number);
        const r={...record(q)};let selected=Array.isArray(r.selected)?[...r.selected]:[];
        if((q.maxSelections||1)>1) {
          if(selected.includes(n)) selected=selected.filter(x=>x!==n);
          else if(selected.length<(q.maxSelections||1))selected.push(n);
          else {selected.shift();selected.push(n);}
        } else selected=selected.length===1&&selected[0]===n?[]:[n];
        r.selected=selected;r.submitted=false;infoExpanded=false;r.updatedAt=new Date().toISOString();state.records[q.id]=r;saveState();render();break;
      }
      case 'submit':{
        const q=currentQuestion();if(!q)break;const r={...record(q)};
        if(q.type==='short'&&!String(r.selected||'').trim())break;
        if(q.type!=='short'&&!r.selected?.length)break;
        r.submitted=true;r.submittedAt=new Date().toISOString();state.records[q.id]=r;infoExpanded=true;saveState();render();
        // On mobile, the right-side explanation becomes a card below the question.
        // Move it into view after the submitted result is displayed.
        if(matchMedia('(max-width:1020px)').matches){requestAnimationFrame(()=>root.querySelector('.evidence-panel')?.scrollIntoView({behavior:'smooth',block:'start'}));}
        break;
      }
      case 'step':{
        const arr=scopedQuestions();const idx=arr.findIndex(q=>q.id===currentQuestion()?.id);const nx=arr[idx+Number(btn.dataset.direction)];if(nx)selectCurrent(nx.id);break;
      }
      case 'toggle-evidence':infoExpanded=!infoExpanded;render();break;
      case 'zoom':openModal(btn.getAttribute('src'),btn.dataset.caption||btn.alt);break;
      case 'open-review':reviewFilter='all';view='review';restoringReview=false;render();window.scrollTo(0,0);break;
      case 'review-filter':reviewFilter=btn.dataset.filter;render();break;
      case 'review-question':goQuestion(btn.dataset.id);restoringReview=true;infoExpanded=true;render();break;
      case 'back-review':view='review';restoringReview=false;render();break;
      case 'back-quiz':view='quiz';restoringReview=false;render();break;
      case 'custom-answer':{
        const q=currentQuestion();if(!q)break;const n=Number(btn.dataset.number);
        if(state.customMulti[q.id]) {
          let a=state.customAnswers[q.id];a=Array.isArray(a)?[...a]:a===null||a===undefined?[]:[a];
          a=a.includes(n)?a.filter(x=>x!==n):[...a,n];
          if(a.length)state.customAnswers[q.id]=a;else delete state.customAnswers[q.id];
        } else state.customAnswers[q.id]=n;
        saveState();render();break;
      }
      case 'remove-custom':{
        const q=currentQuestion();if(!q)break;delete state.customAnswers[q.id];saveState();render();break;
      }
      case 'save-custom-short':{
        const q=currentQuestion();const value=$('#custom-short')?.value.trim();
        if(q&&value){state.customAnswers[q.id]=value;saveState();render();toast('사용자 지정 정답을 저장했습니다.');}break;
      }
      default:break;
    }
  });
  root.addEventListener('change',(e)=>{
    const el=e.target;
    if(el.dataset.action==='number-select'&&el.value)selectCurrent(el.value);
    if(el.dataset.action==='custom-multi'){
      const q=currentQuestion();if(!q)return;state.customMulti[q.id]=el.checked;
      if(!el.checked&&Array.isArray(state.customAnswers[q.id]))state.customAnswers[q.id]=state.customAnswers[q.id][0]||null;
      saveState();render();
    }
  });
  root.addEventListener('input', e=>{
    const el=e.target;
    if(el.id==='global-search-input'){
      searchText=el.value;searchOpen=true;updateSearchSuggestions();loadSearchIndex();return;
    }
    if(el.id==='short-answer'){
      const q=currentQuestion();if(!q)return;
      const r={...record(q),selected:el.value,submitted:false,updatedAt:new Date().toISOString()};
      state.records[q.id]=r;saveState();
      if(infoExpanded){infoExpanded=false;render();return;}
      root.querySelectorAll('[data-action=submit]').forEach(btn=>btn.disabled=!el.value.trim());
    }
  });
  root.addEventListener('focusin',e=>{
    if(e.target?.id==='global-search-input'){
      searchOpen=true;updateSearchSuggestions();loadSearchIndex();
    }
  });
  root.addEventListener('keydown',e=>{
    if(e.target?.id==='global-search-input'){
      if(e.key==='Escape'){e.preventDefault();searchOpen=false;updateSearchSuggestions();e.target.blur();}
      if(e.key==='ArrowDown'){
        const first=root.querySelector('.search-result');if(first){e.preventDefault();first.focus();}
      }
      if(e.key==='Enter'){
        const first=searchEntries()[0];if(first){e.preventDefault();openSearchQuestion(first.meta.id,first.q.id);}
      }
    }
    if(e.target?.matches('.search-result')&&e.key==='Escape'){
      e.preventDefault();searchOpen=false;updateSearchSuggestions();root.querySelector('#global-search-input')?.focus();
    }
  });
  document.addEventListener('pointerdown',e=>{
    if(searchOpen&&!e.target.closest('.global-search')){searchOpen=false;updateSearchSuggestions();}
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!['INPUT','TEXTAREA'].includes(e.target?.tagName)&&!e.target?.isContentEditable){
      const input=root.querySelector('#global-search-input');if(input){e.preventDefault();input.focus();}
    }
  });
  // Pointer-based resizable evidence panel. Persists its width in the same local record.
  let moving=false;
  root.addEventListener('pointerdown',e=>{
    const grip=e.target.closest('#resizer');if(!grip||matchMedia('(max-width:1020px)').matches)return;
    e.preventDefault();moving=true;grip.setPointerCapture?.(e.pointerId);
  });
  root.addEventListener('pointermove',e=>{
    if(!moving)return;
    const container=$('.exam-layout');if(!container)return;
    const box=container.getBoundingClientRect();
    const w=Math.max(340,Math.min(690,box.right-e.clientX));
    document.documentElement.style.setProperty('--evidence-width',`${Math.round(w)}px`);state.prefs.explanationWidth=Math.round(w);
  });
  root.addEventListener('pointerup',()=>{if(moving){moving=false;saveState();}});
  root.addEventListener('pointercancel',()=>{moving=false;});
  function openModal(src,caption) {
    document.querySelector('.image-modal')?.remove();
    const modal=document.createElement('div');modal.className='image-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
    const close=document.createElement('button');close.type='button';close.textContent='닫기 ✕';close.addEventListener('click',()=>modal.remove());
    const image=document.createElement('img');image.src=src;image.alt=caption;
    const captionEl=document.createElement('div');captionEl.className='image-caption';captionEl.textContent=caption;
    modal.append(close,image,captionEl);modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});document.body.append(modal);close.focus();
  }
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){document.querySelector('.image-modal')?.remove();if(mobileMenuOpen){mobileMenuOpen=false;render();}}
    if(e.key==='Enter'&&e.target.matches('.brand')){view='home';render();}
  });
  window.addEventListener('storage',e=>{if(e.key===KEY){readState();render();toast('다른 탭에서 변경된 학습 기록을 반영했습니다.');}});
  async function init() {
    readState();theme();
    try {
      catalog=window.HEON_ARCHIVE_DATA?.catalog;
      if(!catalog?.subjects?.length)throw Error('data/catalog.js를 불러올 수 없습니다. 압축 해제된 폴더 안의 파일을 모두 보존해주세요.');
      const id=state.lastProfessor;
      if(id&&profMeta(id)){
        try { currentProfessor=await loadProfessor(id);selectedSubject=profMeta(id).subjectId;
          currentId=questions().find(q=>q.id===state.lastVisited[id])?.id||questions()[0]?.id||null;view='quiz';infoExpanded=false; }
        catch(err){console.warn(err);view='home';}
      }else{
        const first=catalog.subjects.find(s=>s.professors.length)?.professors[0];
        if(first)await Promise.allSettled(catalog.subjects.find(s=>s.id===selectedSubject).professors.map(p=>loadProfessor(p.id))); // dashboard counts, records isolated
      }
      render();
    }catch(err){
      root.innerHTML=`<div style="max-width:680px;margin:9vh auto;padding:30px;border:1px solid #35465d;border-radius:18px;background:#101d30;color:#ecf2fb"><h2>HEON ARCHIVE 데이터를 불러오지 못했습니다</h2><p>${esc(err.message)}</p><p>ZIP 전체를 먼저 압축 해제한 후, <code>heon-archive/index.html</code>을 열어주세요. <code>data/catalog.js</code> 및 <code>data/professors/</code> 폴더가 같은 위치에 있어야 합니다.</p></div>`;
      console.error(err);
    }
  }
  init();
})();
