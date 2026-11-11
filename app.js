/* HEON ARCHIVE · browser-only, GitHub Pages compatible.
 * Stable question IDs, per-question localStorage, isolated professor JSON.
 */
(() => {
  'use strict';
  const KEY = 'heon.archive.learning.v1';
  const root = document.getElementById('app');
  const $ = (s, ctx = document) => ctx.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const circles = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];
  // Keep the underlying provenance, but omit internal answer-approval workflow from study copy.
  function studyCopy(v) {
    return String(v == null ? '' : v)
      .replace(/사용자의 요청으로 정답을 확정했으며 채점과 Review에 반영됩니다\.?/g,'')
      .replace(/강의안 이중검증 채택 결과는 아닙니다\.?/g,'')
      .replace(/사용자가? \d+번을 정답으로 확정했습니다\.?/g,'')
      .replace(/사용자가? [①②③④⑤⑥⑦⑧⑨⑩]을 정답으로 확정했습니다\.?/g,'')
      .replace(/강의안 이중검증을 통과한 답안이라고 표시하지 않습니다\.?/g,'')
      .replace(/강의안 이중검증 정답과는 별도로 사용자 확정 정답으로 표시합니다\.?/g,'')
      .replace(/강의안 이중검증을 통과한 것으로 표시하지 않습니다\.?/g,'')
      .replace(/기출 원본 강조 표시로 지정된 잠정 사용자 정답\.?/g,'')
      .replace(/정답은 사용자가 직접 지정\.?/g,'')
      .replace(/사용자가? [①②③④⑤⑥⑦⑧⑨⑩]번 정답을 직접 확정했습니다\.?/g,'')
      .replace(/사용자 (?:확정|지정) 정답/g,'정답')
      .replace(/사용자 (?:확정|지정) 답안/g,'정답')
      .replace(/사용자 정답/g,'정답')
      .replace(/사용자 지정/g,'정답')
      .replace(/사용자 확정/g,'정답 확인')
      .replace(/사용자의 요청/g,'정답 기준')
      .replace(/사용자가 확인한/g,'확인한')
      .trim();
  }
  function studyAiExplanation(q) {
    const txt=studyCopy(q.aiExplanation||'');
    if(q.choiceExplanations && (/사용자 요청|정답 확정|형광펜|이 문항\(/.test(txt) || txt.startsWith('판단 포인트:')))return ''; 
    // Old automatically generated placeholders contradict the newer sourced answer and per-choice analysis.
    if(/현재 해당 문항에 검증된 단일 정답 해설이 없으므로/.test(txt)||/이 문항\([^)]*\)의 판단에서는/.test(txt))return '';
    return txt;
  }
  function studyNote(q) {
    const raw=String(q.notes||'');
    if (/사용자 요청|형광펜 선택지 대조|잠정 고정|정답으로 확정|정답 기준에 따라|사용자가/.test(raw)) return ''; 
    if(/^(사용자가? .*정답으로 확정했습니다|기출 원본 강조 표시로 지정된 잠정 사용자 정답|정답은 사용자가 직접 지정)/.test(raw)&&raw.length<145)return '';
    return studyCopy(raw);
  }
  function choiceReasonList(q) {
    if (!q.choiceExplanations || !q.choices?.length) return '';
    return `<section class="choice-reason-list"><h4>선택지별 해설</h4>${q.choices.map(ch=>{
       const answer=effectiveAnswer(q), right=answer!=null && (Array.isArray(answer)?answer.includes(ch.number):answer===ch.number);
       const reason=q.choiceExplanations[String(ch.number)] || '이 선택지를 판단할 직접 근거를 충분히 확보하지 못했습니다.';
       return `<div class="choice-reason ${right?'right':''}"><b>${circles[ch.number-1]||ch.number} ${right?'정답 이유':'선택지 해설'}</b><p>${esc(studyCopy(reason))}</p></div>`;
    }).join('')}</section>`;
  }

  const emptyState = () => ({version:1,records:{},yearExamRecords:{},predictionRecords:{},unitRecords:{},bookmarks:{},yearExamBookmarks:{},predictionBookmarks:{},unitBookmarks:{},customAnswers:{},customMulti:{},lastVisited:{},lastProfessor:null,prefs:{theme:'dark',explanationWidth:450}});
  let state = emptyState();
  let catalog = null;
  const professorCache = new Map();
  let currentProfessor = null;
  let selectedSubject = 'hematology-1';
  let view = 'home';
  let currentYear = 'all';
  let currentId = null;
  let studyMode = 'professor'; // 'professor', 'year-exam', 'unit', 'prediction'
  let selectedExamYear = null;
  let homeStudyType = 'professor';
  let chosenUnitProfessor = null;
  let selectedUnitId = null;
  let selectedReviewId = null;
  let examDuplicateLabels = [];
  let filter = 'all';
  let reviewFilter = 'all';
  let infoExpanded = false;
  let lastRenderedQuizId = null;
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
          yearExamRecords:raw.yearExamRecords || {},predictionRecords:raw.predictionRecords || {},unitRecords:raw.unitRecords || {},
          yearExamBookmarks:raw.yearExamBookmarks || {},predictionBookmarks:raw.predictionBookmarks || {},unitBookmarks:raw.unitBookmarks || {},
          bookmarks:raw.bookmarks || {},customAnswers:raw.customAnswers || {},
          customMulti:raw.customMulti || {},lastVisited:raw.lastVisited || {},
          prefs:{...emptyState().prefs,...(raw.prefs||{})}};
        // v10.1: modern course ownership correction — non-emergency questions
        // previously listed under Lee Seungshin are now Park Murim questions.
        // Copy, never remove, historical submissions so users cannot lose work.
        // The year-exam records remain independently stored from professor records.
        if (!state.prefs.v10_1_lee_nonemergency_to_park) {
          const transferred=['17-18','17-19','17-20','17-21','17-22',
              '17-주3','17-주4','17-주5','18-19','18-20','18-61',
              '19-50','19-51','20-3','20-4','21-7','21-주1','21-주3','21-주4'];
          const sameQuestionAlreadyInPark=new Set(['17-18','17-19','17-21','20-3','20-4']);
          for (const label of transferred) {
            const oldId='lee-seungshin:'+label, newId='park-murim:'+label;
            for (const group of ['records','yearExamRecords']) {
              const bucket=state[group];
              const previous=bucket[oldId], dest=bucket[newId];
              if (!previous) continue;
              if (!dest || (previous.submitted && !dest.submitted)) {
                bucket[newId]=JSON.parse(JSON.stringify(previous));
              }
            }
            for (const group of ['bookmarks','yearExamBookmarks']) {
              const bucket=state[group];
              if (bucket[oldId]) bucket[newId]=true;
            }
            // Where Park has already confirmed the answer, it takes precedence.
            // For genuinely new Park IDs, preserve the student's custom key.
            if (!sameQuestionAlreadyInPark.has(label)) {
              for (const group of ['customAnswers','customMulti']) {
                const bucket=state[group];
                if (Object.prototype.hasOwnProperty.call(bucket,oldId) &&
                    !Object.prototype.hasOwnProperty.call(bucket,newId)) {
                  bucket[newId]=JSON.parse(JSON.stringify(bucket[oldId]));
                }
              }
            }
            for (const key of Object.keys(state.lastVisited)) {
              if (state.lastVisited[key]===oldId) {
                if (key.startsWith('exam:')) state.lastVisited[key]=newId;
                if (key==='lee-seungshin' && !state.lastVisited['park-murim'])
                  state.lastVisited['park-murim']=newId;
              }
            }
          }
          state.prefs.v10_1_lee_nonemergency_to_park=true;
          try {localStorage.setItem(KEY,JSON.stringify(state));}
          catch(err){console.warn('v10.1 기존 학습기록 이전을 저장하지 못했습니다.',err);}
        }
        // v10: Choi 20-14 is user-confirmed as option ②. Clear only an
        // outdated browser-local answer override once, never student submissions.
        if (!state.prefs.v10_choi_20_14_answer) {
          delete state.customAnswers['choi-duyoung:20-14'];
          delete state.customMulti['choi-duyoung:20-14'];
          state.prefs.v10_choi_20_14_answer=true;
          try {localStorage.setItem(KEY,JSON.stringify(state));}catch(e){console.warn(e);}
        }
        // v9: respect the user's corrections for Kim Hyewon without deleting submitted records.
        if (!state.prefs.v9_kim_user_answers) {
          for (const label of ['20-6','21-2']) {
            delete state.customAnswers['kim-hyewon:'+label];
            delete state.customMulti['kim-hyewon:'+label];
          }
          state.prefs.v9_kim_user_answers = true;
          try {localStorage.setItem(KEY,JSON.stringify(state));} catch(err) {console.warn(err);}
        }
        // v8: when the 13 Lee Seoul keys are updated by the user, clear only
        // their obsolete locally overridden answer keys once. Preserve all
        // submitted selections, bookmarks, and other professors' records.
        if (!state.prefs.v8_lee_answer_corrections) {
          for (const label of ['17-67','18-02','18-05','18-41','19-56','19-57',
                               '19-59','20-67','20-68','20-70','21-65','21-69','21-70']) {
            delete state.customAnswers['lee-seoul:'+label];
            delete state.customMulti['lee-seoul:'+label];
          }
          state.prefs.v8_lee_answer_corrections = true;
          try { localStorage.setItem(KEY, JSON.stringify(state)); }
          catch (err) { console.warn('v8 이서울 사용자 확정 답안 상태 저장 실패',err); }
        }
        // v7: apply the user's ten new Park answer corrections once, without
        // altering submitted choices, bookmark flags, question IDs, or other professors.
        if (!state.prefs.v7_park_user_answer_corrections) {
          for (const label of ['17-15','17-19','17-21','17-56','19-10','19-11','19-14','19-49','20-3','21-39']) {
            delete state.customAnswers['park-murim:'+label];
            delete state.customMulti['park-murim:'+label];
          }
          state.prefs.v7_park_user_answer_corrections = true;
          try { localStorage.setItem(KEY,JSON.stringify(state)); }
          catch (err) { console.warn('v7 답안 갱신 기록을 저장하지 못했습니다.',err); }
        }
        // v6.4: migrate two historically separate entries to Park's present-day course.
        // Never overwrite an already-existing Park record or custom answer.
        if (!state.prefs.v6_4_merge_past_professor) {
          for (const label of ['18-4','18-6']) {
            const oldId='lee-seokyoung:'+label, newId='park-murim:'+label;
            for (const field of ['records','bookmarks','customAnswers','customMulti']) {
              const bucket=state[field];
              if (Object.prototype.hasOwnProperty.call(bucket,oldId) && !Object.prototype.hasOwnProperty.call(bucket,newId))
                bucket[newId]=bucket[oldId];
            }
            if (state.lastVisited['lee-seokyoung']===oldId && !state.lastVisited['park-murim'])
              state.lastVisited['park-murim']=newId;
          }
          if (state.lastProfessor==='lee-seokyoung')state.lastProfessor='park-murim';
          state.prefs.v6_4_merge_past_professor=true;
          try { localStorage.setItem(KEY,JSON.stringify(state)); } catch(err) { console.warn(err); }
        }
        // v6.4: user-confirmed answer 20-37 replaces old browser-local guess once;
        // selected answers and completed progress stay untouched.
        if (!state.prefs.v6_4_park_20_37_confirmed) {
          delete state.customAnswers['park-murim:20-37'];
          delete state.customMulti['park-murim:20-37'];
          state.prefs.v6_4_park_20_37_confirmed=true;
          try { localStorage.setItem(KEY,JSON.stringify(state)); } catch(err) { console.warn(err); }
        }
        // v6 answer correction takes precedence over old browser-local guesses once.
        // Preserve all submitted choices/bookmarks; later user edits remain possible.
        if (!state.prefs.v6_park_18_39_confirmed) {
          delete state.customAnswers['park-murim:18-39'];
          delete state.customMulti['park-murim:18-39'];
          state.prefs.v6_park_18_39_confirmed = true;
          try { localStorage.setItem(KEY, JSON.stringify(state)); }
          catch (err) { console.warn('18-39 정답 기준 마이그레이션을 저장하지 못했습니다.',err); }
        }
        // v6.3: newly user-confirmed answers should replace previous local guesses.
        // Existing submitted selections, bookmarks and progress remain unchanged.
        if (!state.prefs.v6_3_park_21_answer_update) {
          for (const id of ['park-murim:21-43','park-murim:21-49','park-murim:21-52']) {
            delete state.customAnswers[id];
            delete state.customMulti[id];
          }
          state.prefs.v6_3_park_21_answer_update = true;
          try { localStorage.setItem(KEY, JSON.stringify(state)); }
          catch (err) { console.warn('v6.3 사용자 지정 정답 마이그레이션 실패',err); }
        }
        if (!state.prefs.v6_2_park_answer_update) {
          for (const id of ['park-murim:17-13','park-murim:18-23','park-murim:18-50','park-murim:18-74']) {
            delete state.customAnswers[id];
            delete state.customMulti[id];
          }
          state.prefs.v6_2_park_answer_update = true;
          try { localStorage.setItem(KEY, JSON.stringify(state)); }
          catch (err) { console.warn('v6.2 사용자 확정 정답 변경을 기록하지 못했습니다.',err); }
        }
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
  const yearName = y => String(y)==='predicted' ? 'AI 예상문제' : yearSortValue(y) === Number.MAX_SAFE_INTEGER ? '연도미상' : `${y}학번`;
  // Professor, class-year exam and AI practice are separate learning sessions.
  // Global answer-key corrections remain shared; student answers never leak across modes.
  function recordBucket(mode=studyMode) { return mode==='year-exam' ? state.yearExamRecords : mode==='prediction' ? state.predictionRecords : mode==='unit' ? state.unitRecords : state.records; }
  function bookmarkBucket(mode=studyMode) { return mode==='year-exam' ? state.yearExamBookmarks : mode==='prediction' ? state.predictionBookmarks : mode==='unit' ? state.unitBookmarks : state.bookmarks; }
  function record(q,mode=studyMode) { return recordBucket(mode)[q.id] || {selected:[],submitted:false}; }
  function isBookmark(q,mode=studyMode) { return !!bookmarkBucket(mode)[q.id]; }
  function submission(q,mode=studyMode) { return !!record(q,mode).submitted; }
  function effectiveAnswer(q) { if(q.validation?.stage==='exam_answer_key')return q.answer;return Object.prototype.hasOwnProperty.call(state.customAnswers,q.id) ? state.customAnswers[q.id] : q.answer; }
  const normalizeText = s => String(s||'').toLowerCase().replace(/[\s.!?,'"’‘“”\-_:;]+/g,'');
  function arraysEqual(a,b) { const sa=[...(Array.isArray(a)?a:[a])].map(String).sort();const sb=[...(Array.isArray(b)?b:[b])].map(String).sort();return sa.length===sb.length && sa.every((x,i)=>x===sb[i]); }
  function evaluation(q,mode=studyMode) {
    if (!submission(q,mode)) return 'not-started';
    const known = effectiveAnswer(q);
    if (known === null || known === undefined || (Array.isArray(known) && !known.length)) return 'pending';
    const picked = record(q,mode).selected;
    if (q.type === 'short') {
      if (q.gradingMode==='manual') return 'pending'; // essay answers are not automatically marked wrong
      const typed=normalizeText(picked);
      if (q.shortRequiredTerms?.length) return q.shortRequiredTerms.every(term=>typed.includes(normalizeText(term)))?'correct':'wrong';
      const aliases=Array.isArray(known)?known:[known];
      return aliases.some(item=>typed===normalizeText(item)) ? 'correct':'wrong';
    }
    if (picked==null || (Array.isArray(picked) && !picked.length)) return 'pending';
    return arraysEqual(picked,known) ? 'correct':'wrong';
  }
  function stats(list,mode=studyMode) {
    const result={total:list.length,completed:0,correct:0,wrong:0,pending:0};
    for(const q of list) {
      if(submission(q,mode)) {
        result.completed++;
        const e=evaluation(q,mode);
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
    if (loaded) { const qs=(loaded.questions||[]).filter(q=>!q.isPrediction); const a=stats(qs,'professor'); return {...a, unresolved:qs.filter(q=>effectiveAnswer(q)==null).length}; }
    const total=Number(meta.questionCount)||0;
    const completed=Object.entries(state.records).filter(([id,r])=>id.startsWith(meta.id+':') && r?.submitted).length;
    return {total,completed,unresolved:Number(meta.pendingCount)||0};
  }
  function professorCourseStage(meta,loaded) {
    const s=professorCourseStats(meta,loaded);
    return !s.total||!s.completed?'empty':(s.completed>=s.total?'complete':'partial');
  }
  function subjectById(id) { return catalog.subjects.find(s=>s.id===id); }
  function yearExamTeacherLabel(id) { return id === "won-taewan" ? "원태완(최운정 기출)" : id === "choi-geumha" ? "최금하(김헌수 기출)" : (profMeta(id)?.name||""); }
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
      await addDataScript(jsPath+(jsPath.includes('?')?'&':'?')+'v=12.8.0');
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
      currentProfessor={...prof,questions:prof.questions.filter(q=>!q.isPrediction)};selectedSubject=meta.subjectId;state.lastProfessor=id;studyMode='professor';selectedExamYear=null;examDuplicateLabels=[];
      if(!keepYear)currentYear='all';filter='all';view='quiz';infoExpanded=false;restoringReview=false;
      const candidate=state.lastVisited[id];
      currentId=questions(currentProfessor).some(q=>q.id===candidate && (currentYear==='all'||String(q.year)===currentYear)) ? candidate : (questions(currentProfessor)[0]?.id||null);
      saveState();mobileMenuOpen=false;render();window.scrollTo({top:0,behavior:'instant'});
    } catch(err){toast(`문제 데이터를 불러올 수 없습니다: ${err.message}`);console.error(err);}
  }
  // Exam mode keeps stable question IDs but its submissions/bookmarks are isolated from professor records.
  function yearQuestionsForSubject(subjectId,year) {
    const subject=subjectById(subjectId);if(!subject)return {items:[],duplicates:[]};
    const collected=[], duplicate=[];
    for(const meta of subject.professors){
      const prof=professorCache.get(meta.id);if(!prof)continue;
      for(const q of prof.questions||[]){
        if(q.isPrediction || String(q.year)!==String(year))continue;
        const prev=collected.find(other=>other.label===q.label && normalizeText(other.prompt).slice(0,42)===normalizeText(q.prompt).slice(0,42));
        if(prev) {duplicate.push({label:q.label,kept:prev.id,other:q.id});continue;}
        // Different questions sharing a number remain separate. Never silently drop a professor's material.
        collected.push(q);
      }
    }
    const items=collected.sort((a,b)=>(a.number-b.number)||a.professor.localeCompare(b.professor));
    return {items,duplicates:duplicate};
  }
  async function selectSubjectExam(year){
    try{
      const subject=subjectById(selectedSubject);
      await Promise.all(subject.professors.map(meta=>loadProfessor(meta.id)));
      const result=yearQuestionsForSubject(subject.id,year);
      if(!result.items.length){toast('이 학번에 등록된 문항이 없습니다.');return;}
      studyMode='year-exam';selectedExamYear=String(year);examDuplicateLabels=result.duplicates;
      const id='exam:'+subject.id+':'+year;
      currentProfessor={professor:{id,name:`${subject.name} · ${yearName(year)} 통합 시험`,subjectId:subject.id,description:'교수님 전체 · 해당 학번 기출만 순서대로'},questions:result.items};
      currentYear='all';filter='all';reviewFilter='all';view='quiz';restoringReview=false;infoExpanded=false;
      const previous=state.lastVisited[id];
      currentId=result.items.some(q=>q.id===previous)?previous:(result.items.find(q=>!submission(q))||result.items[0]).id;
      state.lastProfessor=id;saveState();render();window.scrollTo(0,0);
    }catch(err){console.error(err);toast('학번별 문제를 불러오지 못했습니다: '+err.message);}
  }
  // Unit selection: identical question IDs, entirely different submission/bookmark stores.
  function unitGroups(profId) {
    const data=professorCache.get(profId);
    if(!data)return [];
    const map=new Map();
    for (const q of (data.questions||[]).filter(q=>!q.isPrediction)){
      const title=q.unitTitle||'기타 · 단원 검토';
      const id=q.unitId||title;
      if(!map.has(id))map.set(id,{id,title,items:[]});
      map.get(id).items.push(q);
    }
    return [...map.values()].sort((a,b)=>a.title.localeCompare(b.title,'ko'));
  }
  async function startUnit(profId,unitId){
    try{
      await loadProfessor(profId);
      const group=unitGroups(profId).find(g=>g.id===unitId);
      if(!group||!group.items.length){toast('해당 단원에 문제가 없습니다.');return;}
      const meta=profMeta(profId);
      studyMode='unit';selectedUnitId=unitId;chosenUnitProfessor=profId;
      selectedExamYear=null;examDuplicateLabels=[];
      currentProfessor={professor:{...meta,id:'unit:'+profId+':'+unitId,name:meta.name+' 교수님 · '+group.title,description:'단원별 학습 · 교수님별·학번별 기록과 완전히 분리'},questions:group.items};
      currentYear='all';filter='all';reviewFilter='all';view='quiz';restoringReview=false;
      const key='unit:'+profId+':'+unitId;
      const old=state.lastVisited[key];
      currentId=group.items.some(q=>q.id===old)?old:(group.items.find(q=>!submission(q,'unit'))||group.items[0]).id;
      infoExpanded=submission(group.items.find(q=>q.id===currentId),'unit');
      state.lastProfessor=key;saveState();render();window.scrollTo(0,0);
    }catch(err){console.error(err);toast('단원 불러오기 실패: '+err.message);}
  }
  async function startPredictions(){
    try {
      const prof=await loadProfessor('lee-kanggyu');
      const items=prof.questions.filter(q=>q.isPrediction);
      if(!items.length){toast('예상문제가 준비되지 않았습니다.');return;}
      studyMode='prediction';selectedExamYear=null;
      currentProfessor={professor:{...prof.professor,id:'practice-lee-kanggyu',name:'이강규 예상문제',description:'AI 제작 연습문제 · 실제 기출이나 교수님 출제예고가 아닙니다.'},questions:items};
      selectedSubject='hematology-1';currentYear='all';filter='all';reviewFilter='all';view='quiz';restoringReview=false;
      currentId=items.find(q=>!submission(q))?.id||items[0].id;
      infoExpanded=submission(items.find(q=>q.id===currentId));render();window.scrollTo(0,0);
    } catch(err){console.error(err);toast('예상문제를 불러오지 못했습니다: '+err.message);}
  }
  function renderYearHeader(){
    const all=questions(), s=stats(all), pct=s.total?Math.round(100*s.completed/s.total):0;
    const teachers=new Set(all.map(q=>q.professor)).size;
    return `<div class="course-header compact-course-header exam-mode-header"><div class="course-identity"><div class="eyebrow">YEAR EXAM · ${esc(selectedExamYear)} CLASS</div><div class="course-title-line"><h1>${esc(subjectById(selectedSubject)?.name||'')} · ${esc(yearName(selectedExamYear))} 모의고사</h1><p>여러 교수님 문항을 통합 · 문제번호 중복 제외 · ${teachers}명</p></div></div><div class="course-header-right"><div class="header-pills"><span class="pill blue">${all.length}문항</span><span class="pill ok">제출 ${s.completed}</span><span class="pill warn">채점 보류 ${s.pending}</span><button class="button secondary small" data-action="open-review">${s.completed===s.total?'최종 결과':'현재 결과'} ↗</button></div><div class="header-study-controls"><button class="button secondary small" data-action="reset-year-exam">이 학번 시험 기록 초기화</button><div class="study-progress"><span>시험 진행률</span><div class="progress-track"><div class="progress-fill ${s.completed===s.total?'done':''}" style="width:${pct}%"></div></div><strong>${pct}%</strong></div></div></div></div>`;
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
    infoExpanded=Boolean(questions().find(q=>q.id===id && submission(q)));
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
        if(q.isPrediction)continue;
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
      if(!prof.questions.some(q=>q.id===qId&&!q.isPrediction)) throw Error('검색 결과의 문항이 없습니다.');
      currentProfessor={...prof,questions:prof.questions.filter(q=>!q.isPrediction)};studyMode='professor';selectedExamYear=null;examDuplicateLabels=[];
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
    if(studyMode==='prediction') {
      if(!confirm('이강규 예상문제 풀이 기록만 초기화할까요?'))return;
      for(const q of questions()){delete state.predictionRecords[q.id];delete state.predictionBookmarks[q.id];}
      view='quiz';currentId=questions()[0]?.id;infoExpanded=false;saveState();render();return;
    }
    if(!confirm(`${name} 교수님의 학습 기록만 초기화할까요?\n\n제출 답안, 풀이 진행률, 북마크, 직접 지정한 정답, 마지막 문제 위치가 초기화됩니다.\n다른 교수님의 기록은 그대로 유지됩니다.\n(문제 데이터에 등록된 정답 기준은 변경되지 않습니다.)`))return;
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
    const quizQuestion = view==='quiz' ? currentQuestion() : null;
    const nextQuizId = quizQuestion?.id || null;
    if (nextQuizId && nextQuizId !== lastRenderedQuizId) {
      infoExpanded = restoringReview || submission(quizQuestion);
    }
    lastRenderedQuizId = nextQuizId;
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
    root.innerHTML=`<div class="site ${view==='quiz'?'quiz-mode':view==='home'?'home-mode':'review-mode'}">
      <main class="workspace">
        <header class="topbar">
          <div class="topbar-navigation"><button class="topbar-brand" data-action="home" aria-label="HEON ARCHIVE 처음 화면"><span class="topbar-mark">H</span><span>HEON <b>ARCHIVE</b></span></button>
            <nav class="quick-nav" aria-label="빠른 메뉴">
              <button data-action="nav-quiz" class="nav-tab ${view==='quiz'?'active':''}">문제 풀이</button>
              <button data-action="home" class="nav-tab ${view==='home'?'active':''}">문제집</button>
              <button data-action="nav-wrong" class="nav-tab ${view==='review'&&reviewFilter==='wrong'?'active':''}">오답 노트</button><button data-action="print-collection" data-kind="wrong" class="nav-tab print-nav" title="틀린 문제를 모아 PDF로 저장">오답 PDF</button><button data-action="print-collection" data-kind="bookmarks" class="nav-tab print-nav" title="북마크를 모아 PDF로 저장">북마크 PDF</button><a class="nav-tab report-nav" href="https://tally.so/r/6DjZg5" target="_blank" rel="noopener noreferrer" title="문항 번호와 설명, 10MB 이하 이미지 파일을 첨부해 오류를 제보할 수 있어요">✎ 오류 제보하기</a>
              <button data-action="nav-stats" class="nav-tab ${view==='review'&&reviewFilter!=='wrong'?'active':''}">학습 통계</button>
            </nav>
          </div>
          <div class="topbar-tools"><div class="global-search" role="search"><label class="search-shell" for="global-search-input"><span class="search-icon" aria-hidden="true">⌕</span><input type="search" id="global-search-input" autocomplete="off" spellcheck="false" value="${esc(searchText)}" placeholder="문제 번호, 키워드, 약물명 검색..." aria-label="모든 교수님 문제 검색" aria-controls="search-suggestions" aria-expanded="${searchOpen}"/><span class="search-shortcut" aria-hidden="true">/</span></label><div id="search-suggestions" class="search-suggestions" role="listbox" ${searchOpen?'':'hidden'}>${searchOpen?searchSuggestionsHTML():''}</div></div>
            <div class="header-actions">${view!=='home'?'<button class="button secondary small return-home" data-action="home" title="과목·교수님 선택 화면으로 돌아가기">← 교수님 선택</button>':''}<span class="autosave-indicator" title="기록은 브라우저에 자동 저장됩니다"><span class="autosave-dot"></span><span class="desktop-label">자동 저장</span></span><button class="icon-btn theme-btn" data-action="theme" title="라이트 / 다크모드 변경" aria-label="테마 전환">${state.prefs.theme==='dark'?'☀':'☾'}</button></div>
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
    const profs=selected?.professors||[];
    const yrs=[...new Set(profs.flatMap(p=>(professorCache.get(p.id)?.questions||[]).filter(q=>!q.isPrediction && Number.isFinite(Number(q.year))).map(q=>Number(q.year))))].sort((a,b)=>a-b);
    return `<section class="home-heading"><div class="eyebrow">YOUR PERSONAL STUDY SPACE</div><h1>Knowledge, <em>archived.</em> <span>Progress, remembered.</span></h1><p>왼쪽에서 과목을 선택한 다음, 오른쪽에서 <b>교수님별</b>·<b>단원별</b>·<b>학번별</b>로 학습하세요.</p></section>
      <div class="home-selector-layout"><aside class="home-subjects"><div class="eyebrow">SUBJECTS · ${subs.length}</div>
      ${subs.map((s,i)=>`<button class="home-subject ${s.id===selectedSubject?'selected':''}" data-action="subject-home" data-id="${esc(s.id)}"><span class="home-subject-index">0${i+1}</span><span class="home-subject-label"><strong>${esc(s.name)}</strong><small>${s.professors.length?`${s.professors.length}명의 교수님`:'등록 예정'}</small></span><span class="home-subject-arrow">${s.id===selectedSubject?'●':'›'}</span></button>`).join('')}</aside>
      <section class="home-pick-panel"><div class="home-pick-heading"><div><div class="eyebrow">${esc(selected?.name||'')} · SELECT STUDY MODE</div><h2>어떻게 공부할까요?</h2></div><span class="pill blue">${profs.length}명 등록</span></div>
      <div class="study-mode-tabs" role="tablist" aria-label="문제풀이 방식"><button role="tab" aria-selected="${homeStudyType==='professor'}" class="mode-tab ${homeStudyType==='professor'?'active':''}" data-action="home-mode" data-mode="professor">교수님별로 풀기</button><button role="tab" aria-selected="${homeStudyType==='unit'}" class="mode-tab ${homeStudyType==='unit'?'active':''}" data-action="home-mode" data-mode="unit">단원별로 풀기</button><button role="tab" aria-selected="${homeStudyType==='year'}" class="mode-tab ${homeStudyType==='year'?'active':''}" data-action="home-mode" data-mode="year">학번별로 풀기</button></div>
      ${!profs.length?`<div class="empty home-empty">아직 등록된 문제가 없는 과목입니다.</div>`:
       homeStudyType==='professor'?`<p class="home-pick-hint">교수님을 선택하면 전체 또는 특정 학번 문제를 풀 수 있습니다.</p><div class="home-course-list">${profs.map(p=>courseCard(p)+(p.id==='lee-kanggyu'?predictionCard():'' )).join('')}</div>`:homeStudyType==='unit'?`<p class="home-pick-hint">교수님을 선택하면 하단에 해당 강의안 주제별 단원이 나타납니다. 단원별 기록은 독립적으로 저장됩니다.</p><div class="home-unit-prof-grid">${profs.map(p=>`<button class="home-unit-prof ${chosenUnitProfessor===p.id?'selected':''}" data-action="choose-unit-professor" data-id="${esc(p.id)}"><strong>${esc(p.name)} 교수님</strong><small>${unitGroups(p.id).length}개 단원</small></button>`).join('')}</div>${chosenUnitProfessor&&profs.some(p=>p.id===chosenUnitProfessor)?`<div class="unit-results-heading"><h3>${esc(profMeta(chosenUnitProfessor).name)} 교수님 단원 선택</h3><small>같은 교수님 전체 학습과는 별도 저장</small></div><div class="home-unit-grid">${unitGroups(chosenUnitProfessor).map(g=>{const a=stats(g.items,'unit');const pct=a.total?Math.round(100*a.completed/a.total):0;return `<button class="unit-card" data-action="start-unit" data-id="${esc(chosenUnitProfessor)}" data-unit="${esc(g.id)}"><strong>${esc(g.title)}</strong><small>${a.completed}/${a.total} 문제 · ${pct}% ${a.completed===a.total&&a.total?'✓':''}</small><span class="progress-track"><span class="progress-fill" style="width:${pct}%"></span></span></button>`}).join('')}</div>`:''}`:
       `<p class="home-pick-hint">해당 학번의 모든 교수님 기출을 통합하여 풉니다. 완료하면 시험 결과를 확인할 수 있습니다.</p><div class="home-year-list">${yrs.map(year=>{const r=yearQuestionsForSubject(selectedSubject,year);const s=stats(r.items,'year-exam');const pct=s.total?Math.round(s.completed/s.total*100):0;return `<button class="home-year-card ${s.total&&s.completed===s.total?'complete':s.completed?'partial':''}" data-action="start-year-exam" data-year="${year}" ${s.total?'':'disabled'}><span class="home-year-label"><strong>${year}학번 통합 기출</strong><small>${s.total}문항 · ${s.completed}문항 풀이 완료</small></span><span class="home-year-right"><strong>${pct}%${s.total&&s.completed===s.total?' ✓':''}</strong><span>${s.total?'시험 시작 →':'문항 없음'}</span></span><span class="home-year-progress"><i style="width:${pct}%"></i></span></button>`}).join('')}</div>`}
      <p class="home-disclaimer">학습 기록은 브라우저에 자동 저장됩니다. 교수님별·단원별·학번별·AI 예상문제의 제출 답안과 북마크는 모두 독립 저장됩니다.</p></section></div>`;
  }
  function courseCard(p) {
    const data=professorCache.get(p.id);
    const s=professorCourseStats(p,data);
    const pct=s.total?Math.round(s.completed/s.total*100):0;
    return `<button class="course-card" data-action="professor" data-id="${esc(p.id)}"><div class="course-big-icon">${esc(p.name.slice(0,1))}</div><div class="course-main"><h3>${esc(p.name)} 교수님 ${statusDot(professorCourseStage(p,data))}</h3><p>${s.total}문제 · ${s.unresolved}문항 정답 검토 필요</p><div class="progress-track"><div class="progress-fill ${s.total&&s.completed>=s.total?'done':''}" style="width:${pct}%"></div></div></div><div class="course-right"><strong>${pct}%</strong>${s.completed} / ${s.total} 완료</div></button>`;
  }
  function predictionCard(){
    const data=professorCache.get('lee-kanggyu');
    const items=(data?.questions||[]).filter(q=>q.isPrediction);
    const a=stats(items,'prediction');const pct=a.total?Math.round(a.completed/a.total*100):0;
    return `<button class="prediction-home-card" data-action="start-predictions"><strong>✦ 이강규 교수님 AI 예상문제 25제</strong><small>기출·학번별 시험과 분리 · ${a.completed}/${a.total||25} 풀이 완료 · ${pct}% →</small><span class="progress-track"><i class="progress-fill" style="width:${pct}%"></i></span></button>`;
  }
  function renderCourseHeader() {
    if(studyMode==='year-exam')return renderYearHeader();
    const l=questions();const s=stats(l);const pending=l.filter(q=>effectiveAnswer(q)==null).length;
    const verified=l.filter(q=>q.validation?.stage==='accepted').length;
    const manual=l.filter(q=>q.validation?.stage==='user_confirmed').length;
    const percentage=s.total ? Math.round(s.completed/s.total*100) : 0;
    const subjectTitle=({ 'hematology-1':'HEMATOLOGY I', 'hematology-2':'HEMATOLOGY II', 'maternal-newborn':'MATERNAL · NEWBORN', 'growth-aging':'GROWTH · AGING' })[currentProfessor.professor.subjectId]||'MEDICAL';
    return `<div class="course-header compact-course-header"><div class="course-identity"><div class="eyebrow">${studyMode==='prediction'?'AI GENERATED PRACTICE · NOT PAST EXAMS':esc(subjectTitle)+' · EXAM LIBRARY'}</div><div class="course-title-line"><h1>${esc(currentProfessor.professor.name)}${['prediction','unit','year-exam'].includes(studyMode)?'':' 교수님'}</h1><p>${esc(currentProfessor.professor.description||'교수님별 기출 문제')} &nbsp; / &nbsp; 연도별 또는 전체 문항 풀이</p></div></div>
      <div class="course-header-right"><div class="header-pills"><span class="pill blue">${s.total}문제</span><span class="pill ok">근거 검증 ${verified}건</span>${manual?`<span class="pill blue">정답 확인 ${manual}건</span>`:''}<span class="pill warn">미확정 ${pending}건</span><button class="button secondary small" data-action="open-review">Review ↗</button></div>
      <div class="header-study-controls"><div class="study-progress" aria-label="${esc(currentProfessor.professor.name)} 교수님 학습 진행률 ${percentage}%"><span>진행률</span><div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}" aria-label="교수님별 진행률"><div class="progress-fill ${s.total&&s.completed===s.total?'done':''}" style="width:${percentage}%"></div></div><strong>${percentage}%</strong></div>
        <button class="study-reset" data-action="${studyMode==='unit'?'reset-unit':'reset-professor'}" title="${esc(currentProfessor.professor.name)} ${studyMode==='unit'?'단원':'교수님'} 기록만 초기화 · 다른 교수님 기록 유지" aria-label="${esc(currentProfessor.professor.name)} 교수님 학습 기록 초기화">↺ <span>기록 초기화</span></button></div></div>
    </div>`;
  }
  function years() {return [...new Set(questions().map(q=>q.year))].sort((a,b)=>yearSortValue(a)-yearSortValue(b));}
  function renderFilterbar() {
    if(studyMode==='year-exam'){const q=scopedQuestions();return `<div class="filterbar year-exam-filterbar"><div class="year-chips"><span class="pill blue">${esc(yearName(selectedExamYear))} 전체</span><span class="fine">${q.length}문항 · 중복번호 ${examDuplicateLabels.length}건 통합</span></div><div class="filter-actions"><button class="chip ${filter==='wrong'?'active':''}" data-action="filter" data-filter="wrong">↺ 오답만</button><select class="select" data-action="number-select" aria-label="학번별 문제 선택">${q.map(item=>`<option value="${esc(item.id)}" ${currentQuestion()?.id===item.id?'selected':''}>${esc(item.label)} · ${esc(yearExamTeacherLabel(item.professor))} · ${submission(item)?'풀이완료':'미완료'}</option>`).join('')}</select></div></div>`;}
    const q=scopedQuestions();
    return `<div class="filterbar"><div class="year-chips"><button class="chip ${currentYear==='all'?'active':''}" data-action="year" data-year="all">전체 <span class="count">${questions().length}</span>${stage(questions())==='complete'?'<span class="check">✓</span>':''}</button>${years().map(y=>{const yy=questions().filter(q=>q.year===y);return `<button class="chip ${currentYear===String(y)?'active':''}" data-action="year" data-year="${y}">${esc(yearName(y))} <span class="count">${yy.length}</span>${stage(yy)==='complete'?'<span class="check">✓</span>':''}</button>`}).join('')}</div>
      <div class="filter-actions"><button class="chip ${filter==='bookmarked'?'active':''}" data-action="filter" data-filter="bookmarked">☆ 북마크</button><button class="chip ${filter==='wrong'?'active':''}" data-action="filter" data-filter="wrong">↺ 오답만</button><select class="select" data-action="number-select" aria-label="문제 번호 선택">${q.length?q.map(item=>`<option value="${esc(item.id)}" ${currentQuestion()?.id===item.id?'selected':''}>${esc(item.label)} · ${submission(item)?'풀이완료':'미완료'}</option>`).join(''):'<option>해당 문항 없음</option>'}</select></div></div>`;
  }
  function renderQuiz() {
    if(!currentProfessor)return `<div class="empty">교수님을 선택해주세요.</div>`;
    const l=questions();const qs=scopedQuestions();const q=currentQuestion();const s=stats(l);
    return `${renderCourseHeader()}${studyMode==='prediction'?'<div class="prediction-notice">✦ AI가 강의안을 바탕으로 작성한 연습문제입니다. <b>실제 기출·교수님 출제 예고가 아니며 학번별 시험에는 포함되지 않습니다.</b></div>':''}${renderFilterbar()}
    ${q?`<div class="exam-layout">${renderQuestionPanel(q,qs)}<div class="divider-grip fixed-divider" aria-hidden="true"></div>${infoExpanded?renderEvidencePanel(q):renderEvidenceClosed()}</div>${renderQuizDock(q,qs)}`:`<div class="empty"><p>조건에 맞는 문제가 없습니다.</p><button class="button secondary small" data-action="clear-filter">전체 문제로 돌아가기</button></div>`}
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
      ${restoringReview?'<button class="button ghost small" data-action="back-review">← Review</button>':''}${studyMode==='year-exam'&&(index===scope.length-1||stats(scope).completed===scope.length)?'<button class="button secondary small" data-action="open-review">시험 결과 보기 ↗</button>':''}
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
  // Real exam figures are displayed *inside the question*, not hidden behind
  // the collapsible full-source screenshot. Original images are never AI-generated.
  // New professors can use figureImages: [{src,alt,caption}, ...] in JSON.
  function renderInlineQuestionFigures(q) {
    const files=Array.isArray(q.figureImages)?q.figureImages:
      q.figureImage?[{src:q.figureImage,alt:q.figureAlt,caption:q.figureCaption}]:[];
    const figures=files.filter(item=>item && (item.src||item.image));
    if (!figures.length) return '';
    return `<div class="inline-question-figures" aria-label="문제 원본 그림">
      ${figures.map((f,i)=>`<figure class="question-figure">
        <img class="question-figure-img" src="${esc(f.src||f.image)}" alt="${esc(f.alt||q.label+'번 기출문제 원본 그림 '+(i+1))}" loading="eager" decoding="async" data-action="zoom" data-caption="${esc(f.caption||q.label+'번 기출 원본 그림')}" />
        <figcaption>${esc(f.caption||'기출 원본 이미지')}</figcaption>
      </figure>`).join('')}
    </div>`;
  }
  function renderQuestionPanel(q,scope) {
    const curr=scope.findIndex(x=>x.id===q.id);const r=record(q);const grading=evaluation(q);
    const checked=Array.isArray(r.selected)?r.selected:r.selected?[r.selected]:[];
    const answer=effectiveAnswer(q);const answers=answer==null?[]:Array.isArray(answer)?answer:[answer];
    const maxSelection=Number(q.maxSelections)||1;
    return `<section class="exam-panel" data-question-id="${esc(q.id)}"><div class="question-header"><div><div class="question-id">${studyMode==='year-exam'?esc(yearExamTeacherLabel(q.professor))+' 교수님 · ':''}QUESTION / ${esc(q.label)}</div><h2 class="question-num">${esc(q.label)} <span class="question-index">${curr+1} / ${scope.length}</span></h2><div class="question-meta"><span class="pill ${q.isPrediction?'blue':q.validation.stage==='accepted'?'ok':['user_confirmed','highlight_reviewed','exam_answer_key'].includes(q.validation.stage)?'ok':'warn'}">${q.isPrediction?'✦ AI 예상문제 · 강의안 기반':q.validation.stage==='accepted'?'✓ 강의안 이중 검증':q.validation.stage==='exam_answer_key'?'● 22학번 공식 정답표 · 강의안 검증과 별개':q.validation.stage==='highlight_reviewed'?'✓ 정답 확인':q.validation.stage==='user_confirmed'?(q.validation?.supplemental2026?.status==='match'?'✓ 정답 확인 · 2026 강의안 비교':q.validation?.supplemental2026?.status==='conflict'?'✓ 정답 확인 · 강의안과 해설 비교 필요':'✓ 정답 확인'):'! 정답 검토 필요'}</span><span class="pill">${esc(yearName(q.year))}</span>${submission(q)?`<span class="pill blue">제출 완료</span>`:''}</div></div>
      <div class="row"><button class="bookmark ${isBookmark(q)?'saved':''}" data-action="bookmark" data-id="${esc(q.id)}" title="북마크" aria-pressed="${isBookmark(q)}">${isBookmark(q)?'★':'☆'}</button><a class="icon-btn report-question-btn" href="https://tally.so/r/6DjZg5" target="_blank" rel="noopener noreferrer" title="문항 번호·설명·이미지를 첨부해 오류 제보" aria-label="${esc(q.label)}번 문제 오류 제보하기">✎ 제보하기</a><button class="icon-btn" data-action="toggle-evidence">${infoExpanded?'해설 접기':'해설 열기'}</button></div></div>
      <div class="prompt">${esc(q.prompt||'원본 이미지에서 문제 본문을 확인하세요.')}</div>
      ${renderInlineQuestionFigures(q)}
      ${q.type==='short'?`<label class="muted" for="short-answer">주관식 답안</label><textarea class="short-input" id="short-answer" data-question="${esc(q.id)}" placeholder="답안을 입력하세요. 입력하는 즉시 저장됩니다.">${esc(typeof r.selected==='string'?r.selected:'')}</textarea>`:
      q.choices?.length?`<div class="options">${q.choices.map(ch=>{const selected=checked.includes(ch.number);const correct=submission(q)&&answer!=null&&answers.includes(ch.number);const wrong=submission(q)&&selected&&!answers.includes(ch.number)&&answer!=null;return `<button class="option ${selected?'selected':''} ${correct?'correct-choice':''} ${wrong?'wrong-choice':''}" data-action="choose" data-number="${ch.number}" aria-pressed="${selected}"><span class="option-letter">${circles[ch.number-1]||ch.number}</span><span class="option-text">${esc(ch.text)}</span>${correct?'<span class="option-flag">정답</span>':wrong?'<span class="option-flag">선택 오답</span>':''}</button>`}).join('')}</div>${maxSelection>1?`<p class="help-text">이 문항은 정답 ${maxSelection}개를 선택합니다.</p>`:''}`:
      `<p class="review-note">텍스트 선택지의 판독이 불완전합니다. 아래 원본에서 선택지 번호와 문장을 확인한 후 답 번호를 선택하세요.</p><div class="options">${circles.map((v,i)=>`<button class="option ${checked.includes(i+1)?'selected':''} ${submission(q)&&answer!=null&&answers.includes(i+1)?'correct-choice':''}" data-action="choose" data-number="${i+1}"><span class="option-letter">${v}</span><span class="option-text">${i+1}번 선택지 — 원본 캡처 확인</span></button>`).join('')}</div>`}
      ${renderResult(q,grading)}
      ${q.source?.image?`<details class="source-card"><summary>기출 원본 이미지 보기 · ${esc(q.source.name)}${q.source.page?' · PDF '+q.source.page+'페이지':''}</summary><img class="source-image" src="${esc(q.source.image)}" alt="${esc(q.label)} 기출 원본 캡처" loading="lazy" data-action="zoom" data-caption="${esc(q.source.name)}${q.source.page?' · PDF '+q.source.page+'페이지':''}"><p class="source-warning">기출 원본에는 기존 필기와 정답 표기가 포함되어 있을 수 있습니다. 채점 기준과 해설은 오른쪽 정답 근거 영역에서 확인할 수 있습니다.</p>${q.transcriptionWarning?`<p class="source-warning">${esc(q.transcriptionWarning)}</p>`:''}</details>`:`<div class="review-note" style="margin-top:15px">기출 원본 파일의 별도 이미지가 제공되지 않았습니다. 문제와 선택지는 사용자가 제공한 원문을 기준으로 입력했습니다.</div>`}
      <div class="question-footer"><div class="quiz-actions"><div class="row"><button class="button secondary small" data-action="step" data-direction="-1" ${curr<=0?'disabled':''}>← 이전</button><button class="button secondary small" data-action="step" data-direction="1" ${curr===scope.length-1?'disabled':''}>다음 →</button></div><div class="row">${restoringReview?'<button class="button ghost small" data-action="back-review">← Review</button>':''}<button class="button ${r.submitted?'secondary':''}" data-action="submit" ${q.type==='short'?(!String(r.selected||'').trim()?'disabled':''):(!checked.length?'disabled':'')}>${r.submitted?'다시 제출':'답안 제출'} &nbsp; ✓</button></div></div>${saysAllCompleted()?`<div class="result-box correct"><b>전체 문항 풀이가 완료되었습니다.</b><p>정답 검토 필요 문항을 제외한 결과는 Review에서 확인할 수 있습니다.</p><button class="button small review-button" data-action="open-review" style="margin-top:11px">최종 Review 열기 →</button></div>`:''}</div>
    </section>`;
  }
  function saysAllCompleted() {const s=stats(questions());return !!s.total&&s.completed===s.total;}
  function renderResult(q,grade) {
    if(!submission(q))return '';
    const label=grade==='correct'?'정답입니다':grade==='wrong'?'오답입니다':q.gradingMode==='manual'?'채점 보류 · 서술형 수동 채점':'채점 보류 · 정답 미확정';
    const description=grade==='pending'?(q.gradingMode==='manual'?'강의안 모범답안과 비교할 수 있지만 서술형은 문자열 자동 채점하지 않습니다.':'강의안에서 정답을 확정하지 못했습니다. 해설창을 열고 직접 지정할 수 있습니다.'):grade==='correct'?'제출한 선택지가 현재 확정된 정답과 일치합니다.':q.validation?.stage==='user_confirmed'?'정답과 다른 답안을 선택했습니다.':'강의안에 근거한 정답과 다른 답안을 선택했습니다.';
    return `<div class="result-box ${grade==='not-started'?'':grade}"><b>${label}</b><p>${description}</p></div>`;
  }
  function renderEvidencePanel(q) {
    const accepted=q.validation.stage==='accepted';const officialKey=q.validation.stage==='exam_answer_key';const highlighted=q.validation.stage==='highlight_reviewed';const userConfirmed=q.validation.stage==='user_confirmed';const ans=effectiveAnswer(q);const audit2026=q.validation?.supplemental2026;const sourceMatch2026=userConfirmed&&audit2026?.status==='match';
    const usedCustom=Object.prototype.hasOwnProperty.call(state.customAnswers,q.id);
    const userEvidence=Array.isArray(q.evidence)&&q.evidence.length>0;
    const refs=(accepted||sourceMatch2026||userConfirmed&&userEvidence)?q.evidence:q.candidateEvidence||[];
    const confirmed=(accepted||sourceMatch2026)&&!usedCustom;const userDesignated=userConfirmed||usedCustom;const originalAccepted=accepted&&!usedCustom;
    const answerText=(a)=>q.type==='short'?String(a):[...(Array.isArray(a)?a:[a])].map(n=>{
      const item=q.choices.find(c=>c.number===n);return `${circles[n-1]||n} ${item?item.text:''}`;
    }).join(' / ');
    return `<aside class="evidence-panel"><div class="evidence-head"><div><div class="evidence-kicker">EVIDENCE & EXPLANATION</div><h3>정답 근거 및 해설</h3></div><button class="icon-btn" data-action="toggle-evidence" title="해설 접기">✕</button></div>
      <div class="question-meta" style="margin-top:12px">${confirmed?(sourceMatch2026?'<span class="pill ok">✓ 2026 강의안 대조 완료</span>':'<span class="pill ok">✓ 1차 원문 확인</span><span class="pill ok">✓ 2차 보기 검증</span>'):audit2026?.status==='conflict'?'<span class="pill ok">✓ 정답 확인 · 강의안 내용 비교 필요</span>':audit2026?.status==='partial'?'<span class="pill ok">✓ 정답 확인 · 관련 강의안 참고</span>':userDesignated?'<span class="pill ok">✓ 정답 확인</span>':highlighted?'<span class="pill ok">✓ 기출·해설 정답 확인</span>':officialKey?'<span class="pill blue">● 22학번 시험지 정답표 확인 · 강의안 근거 별도</span>':'<span class="pill warn">! 근거 미채택</span>'}</div>
      ${ans!=null?`<div class="result-box ${confirmed||userDesignated||highlighted||officialKey?'correct':'pending'}"><b>${userDesignated?'정답':officialKey?'시험 정답표':highlighted?'정답':'강의안 검증 정답'} · ${esc(answerText(ans))}</b><p>${userDesignated?(usedCustom?'현재 정답 기준으로 채점하며, 직접 변경한 답은 이 브라우저에 저장됩니다.':sourceMatch2026?'2026년 강의안의 관련 내용을 다시 확인했습니다.':'아래 강의안과 선택지별 해설을 함께 확인하세요.'):officialKey?'22학번 시험지의 공식 정답표에 기재된 답안입니다.':highlighted?'기출 원본과 별도 해설의 정답 표시를 비교했습니다.':'강의안 원문을 대조해 채택한 답안입니다.'}</p></div>`:
      '<div class="review-note">정답 검토 필요: 강의안에서 확실한 정답 근거를 확인하지 못하여 정답을 지정하지 않았습니다.</div>'}
      ${studyAiExplanation(q)?`<div class="ai-study-explanation"><b>✦ AI 학습 해설 · 강의안 검증 근거와 구분</b><p>${esc(studyAiExplanation(q))}</p></div>`:''}${q.explanation?`<p class="evidence-explanation">${!accepted&&!sourceMatch2026?'<b>'+(officialKey?'22학번 시험지 정답표 기준 · 강의안 검증과 구분':highlighted?'형광펜·별도 해설 대조 · 강의안 검증과 구분':userConfirmed?'선택지 및 근거 해설':'검토용 해설 · 정답 미확정')+'</b> · ':''}${esc(studyCopy(q.explanation))}</p>`:''}${choiceReasonList(q)}${!accepted&&!sourceMatch2026&&studyNote(q)?`<p class="review-note">${esc(studyNote(q))}</p>`:''}${audit2026&&audit2026.status!=='match'?`<p class="review-note">2026 강의안 재검토: ${esc(studyCopy(audit2026.decisionReason))}</p>`:''}
      ${officialKey&&q.answerKey?.image?`<details class="source-card exam-answer-key"><summary>22학번 공식 정답표 원본 · PDF 마지막 7페이지 (클릭하여 보기)</summary><p class="source-warning">왼쪽 1~5번·오른쪽 6~10번을 묶어 읽는 표입니다. 8번은 ①·②·④ 복수 정답입니다. 강의안 근거 이미지와는 별개입니다.</p><img class="source-image" src="${esc(q.answerKey.image)}" alt="22학번 시험지 7쪽 공식 정답표" loading="lazy" data-action="zoom" data-caption="22학번 시험지 PDF 7쪽 · 객관식 1~68번 공식 정답표"></details>`:''}
      <div class="section-head"><h4 class="section-title" style="font-size:14px">${confirmed?'채택된 강의안 원본':userConfirmed&&userEvidence?'해설 참고 강의안':'검토용 강의안 원본'}</h4><span class="fine">${refs.length}페이지</span></div>
      ${refs.length?refs.map(e=>`<article class="evidence-item"><div class="evidence-meta"><span class="file-page">PDF ${e.page}페이지 ${confirmed?'· 채택 근거':'· 검토 자료 (미채택)'}</span>${e.lectureOwner?`<p class="fine" style="font-weight:800;color:var(--blue);margin:5px 0 0">출처: ${esc(e.lectureOwner)}</p>`:''}<p class="file-name">${esc(e.file)}</p>${confirmed&&e.quote?`<div class="quote">원문 확인 기준: ${esc(e.quote)}</div>`:''}</div><img class="evidence-image" src="${esc(e.image)}" alt="${esc(e.file)} ${e.page}페이지 ${confirmed?'검증 근거':'검토용 자료'}" loading="lazy" data-action="zoom" data-caption="${esc(e.file)} · PDF ${e.page}페이지"><div class="zoom-label">이미지를 누르면 확대됩니다 ⤢</div></article>`).join(''):'<div class="empty" style="padding:21px">일치하는 강의안 페이지를 확보하지 못했습니다. 관련 없는 이미지로 근거를 대체하지 않았습니다.</div>'}
      ${!confirmed&&!officialKey?`<section class="user-answer"><h4>직접 정답 지정</h4><p>강의안을 확인한 후 정답을 직접 지정할 수 있습니다. 선택 즉시 자동 저장되며 제출한 답안의 채점 상태가 변경됩니다.</p>${q.type==='short'?`<input class="search" id="custom-short" type="text" placeholder="정답 문장을 입력하세요" value="${esc(usedCustom?String(ans):'')}" style="width:100%;margin-bottom:8px"><button class="button small secondary" data-action="save-custom-short">정답 저장</button>`:
      `<div class="custom-answers">${Array.from({length:Math.max(5,q.choices?.length||5)},(_,i)=>{const a=i+1;const sel=ans!=null&&(Array.isArray(ans)?ans.includes(a):ans===a);return `<button class="number-pill ${sel?'active':''}" data-action="custom-answer" data-number="${a}" aria-pressed="${sel}">${circles[i]||i+1}</button>`}).join('')}</div><div class="row" style="margin-top:12px"><label class="fine"><input type="checkbox" data-action="custom-multi" ${state.customMulti[q.id]?'checked':''}> 복수 정답 지정</label></div>`}
      ${usedCustom?`<button class="button ghost tiny" data-action="remove-custom" style="margin-top:11px">내 지정 정답 해제</button>`:''}</section>`:''}
      <div class="help-text">강의안 파일명과 페이지 번호는 PDF 파일의 실제 1부터 시작하는 페이지를 기준으로 기록했습니다. 원본 확인에 사용된 이미지 자체가 그대로 포함되어 있습니다.</div>
    </aside>`;
  }
  function renderReviewQuestion(q){
    const status=evaluation(q),r=record(q),a=effectiveAnswer(q);
    const answerArr=a===null||a===undefined?[]:Array.isArray(a)?a:[a];
    const chosen=Array.isArray(r.selected)?r.selected:(r.selected==null?[]:[r.selected]);
    const symbol={correct:'정답',wrong:'오답',pending:'채점 보류','not-started':'미제출'}[status];
    const answerText=answerArr.length?answerArr.map(n=>q.type==='short'?String(n):(circles[n-1]||n)).join(' · '):'미확정';
    const imgs=(q.figureImages||[]).filter(x=>x.src||x.image);
    const refs=q.validation?.stage==='accepted'||(q.validation?.supplemental2026?.status==='match')?q.evidence||[]:q.candidateEvidence||[];
    return `<article class="review-detail" aria-live="polite"><div class="review-detail-head"><div><small>${esc(yearExamTeacherLabel(q.professor))} 교수님 · ${esc(q.label)}</small><h2>${studyMode==='year-exam'?(q.type==='short'?esc('주'+q.label.split('주').pop()):esc(String(q.number))):esc(q.label)}번 문제 <span class="review-status-badge ${status}">${symbol}</span></h2></div><a class="button secondary small" href="https://tally.so/r/6DjZg5" target="_blank" rel="noopener noreferrer" title="문항 번호·설명·이미지를 첨부할 수 있어요">✎ 오류 제보하기</a><button class="button secondary small" data-action="review-question" data-id="${esc(q.id)}">문제풀이로 ↗</button></div>
      <div class="review-detail-prompt">${esc(q.prompt)}</div>
      ${imgs.map(f=>`<img class="review-detail-figure" src="${esc(f.src||f.image)}" alt="${esc(f.alt||'문제 원본')}" loading="lazy" data-action="zoom" data-caption="${esc(f.caption||q.label+' 문제 원본')}"/>`).join('')}
      ${q.type==='short'?`<div class="review-readonly-choice"><b>내 답안</b> ${esc(chosen.join('')||'미제출')}</div>`:`<div class="review-readonly-choices">${(q.choices||[]).map(ch=>`<div class="review-readonly-choice ${answerArr.includes(ch.number)?'correct':chosen.includes(ch.number)?'wrong':''}"><span>${circles[ch.number-1]||ch.number}</span>${esc(ch.text)} ${answerArr.includes(ch.number)?' ✓ 정답':''}${chosen.includes(ch.number)?' · 내 선택':''}</div>`).join('')}</div>`}
      <div class="review-key-line"><strong>정답: ${esc(answerText)}</strong> <span>내 답안: ${esc(chosen.length?chosen.map(n=>typeof n==='number'?(circles[n-1]||n):String(n)).join(', '):'미제출')}</span></div>
      <section class="review-detail-explanation"><h3>해설 및 근거</h3><p>${esc(q.explanation||'등록된 해설이 없습니다. 관련 강의안과 기출 원본을 직접 대조해야 합니다.')}</p>${studyAiExplanation(q)?`<div class="ai-study-explanation"><b>✦ AI 학습 보충 (검증된 강의안과 구분)</b><p>${esc(studyAiExplanation(q))}</p></div>`:''}
      ${refs.map(e=>`<div class="review-evidence-card"><small>${q.validation?.stage==='accepted'?'채택된 강의안 근거':'검토용 강의안 · 미채택'} · ${esc(e.file||'')} · PDF ${esc(e.page)}쪽</small><img src="${esc(e.image||'')}" alt="${esc(e.file||'강의안')} ${esc(e.page||'')}쪽" loading="lazy" data-action="zoom" data-caption="${esc(e.file||'')} · PDF ${esc(e.page)}쪽"/></div>`).join('')}
      ${choiceReasonList(q)}${q.answerKey?.image?`<details class="source-card exam-answer-key"><summary>시험지 마지막 PDF 7페이지 정답표 (원본 보기)</summary><img class="source-image" src="${esc(q.answerKey.image)}" alt="공식 정답표" loading="lazy" data-action="zoom" data-caption="22학번 기출 공식 정답표 · 7페이지"/></details>`:''}
      ${q.source?.image?`<details class="source-card"><summary>기출 원본 확인</summary><img class="source-image" src="${esc(q.source.image)}" alt="기출 원본" loading="lazy" data-action="zoom" data-caption="${esc(q.label)} 원본"/></details>`:''}</section></article>`;
  }
  function renderReview() {
    const all=questions(),s=stats(all),icons={correct:'✓',wrong:'✕',pending:'!', 'not-started':'–'};
    const list=all.filter(q=>reviewFilter==='wrong'?evaluation(q)==='wrong':reviewFilter==='pending'?evaluation(q)==='pending'||effectiveAnswer(q)==null:reviewFilter==='bookmarks'?isBookmark(q):true);
    if(!list.some(q=>q.id===selectedReviewId))selectedReviewId=list[0]?.id||null;
    const focus=list.find(q=>q.id===selectedReviewId);
    return `${renderCourseHeader()}<div class="review-compact-title"><div><div class="eyebrow">${studyMode==='year-exam'?'YEAR EXAM RESULTS':'LEARNING REVIEW'}</div><h1>${studyMode==='year-exam'?esc(selectedExamYear)+'학번 시험 결과':'최종 Review'}</h1><p>문제 번호를 누르면 오른쪽에 지문·정답·내 선택·해설·강의안 근거가 표시됩니다.</p></div><div class="review-export-actions"><button class="button secondary small" data-action="print-collection" data-kind="wrong">오답 전체 PDF</button><button class="button secondary small" data-action="print-collection" data-kind="bookmarks">북마크 전체 PDF</button><button class="button secondary small" data-action="back-quiz">← 문제풀이로 돌아가기</button></div></div>
      <div class="review-score-strip">${[['전체',s.total],['제출',s.completed],['정답',s.correct],['오답',s.wrong],['채점 보류',s.pending],['미제출',s.total-s.completed]].map(([name,n])=>`<span>${name} <b>${n}</b></span>`).join('')}</div>
      <div class="review-layout"><aside class="review-number-sidebar"><div class="review-side-heading"><b>문제 번호</b><small>${list.length}문항</small></div><div class="review-side-filters">${[['all','전체'],['wrong','오답'],['pending','보류'],['bookmarks','북마크']].map(([f,l])=>`<button class="chip ${reviewFilter===f?'active':''}" data-action="review-filter" data-filter="${f}">${l}</button>`).join('')}</div><div class="review-number-grid">${list.map(q=>{const status=evaluation(q);return `<button class="review-number-button ${status} ${q.id===selectedReviewId?'active':''}" data-action="review-select" data-id="${esc(q.id)}" title="${esc(yearExamTeacherLabel(q.professor))} · ${esc(q.label)} · ${status}" aria-pressed="${q.id===selectedReviewId}"><strong>${studyMode==='year-exam'?(q.type==='short'?esc('주'+q.label.split('주').pop()):esc(String(q.number))):esc(q.label)}</strong><span>${icons[status]}</span>${studyMode==='year-exam'?`<small>${esc(yearExamTeacherLabel(q.professor))}</small>`:''}</button>`}).join('')}</div></aside>
      <section class="review-detail-pane">${focus?renderReviewQuestion(focus):'<div class="empty">선택한 조건에 해당하는 문제가 없습니다.</div>'}</section></div>`;
  }

  // v12.7: export ALL wrong or bookmarked questions to one print-to-PDF document.
  // No upload, third-party JS PDF library, server, or login is needed.
  function printRecordsMode() {
    return studyMode === 'year-exam' ? 'year-exam'
      : studyMode === 'unit' ? 'unit'
      : studyMode === 'prediction' ? 'prediction' : 'professor';
  }
  async function exportCollection(kind) {
    // Open the window before awaiting file loads, so popup blockers preserve the click.
    const popup=window.open('','_blank');
    if(!popup){toast('브라우저 팝업 차단을 해제한 후 PDF 출력 버튼을 다시 눌러주세요.');return;}
    popup.document.write('<p style="font:16px sans-serif;padding:30px">PDF 출력 문항을 준비하고 있습니다…</p>');
    const mode = printRecordsMode();
    const subj = subjectById(selectedSubject);
    const metas = subj?.professors || [];
    const docs = await Promise.all(metas.map(p=>loadProfessor(p.id).catch(()=>null)));
    let all = docs.flatMap(x=>x?.questions||[]);
    if(mode==='prediction') all=all.filter(q=>q.isPrediction);
    else all=all.filter(q=>!q.isPrediction);
    // A question is eligible only if its respective mode saved a matching record.
    // Year/unit/professor bookmarks and answers NEVER bleed into another mode.
    const bucket = mode==='year-exam'?state.yearExamRecords
      :mode==='unit'?state.unitRecords
      :mode==='prediction'?state.predictionRecords:state.records;
    const bm = mode==='year-exam'?state.yearExamBookmarks
      :mode==='unit'?state.unitBookmarks
      :mode==='prediction'?state.predictionBookmarks:state.bookmarks;
    const unique=new Map();
    for(const q of all) unique.set(q.id,q);
    const selected=[...unique.values()].filter(q=>{
      if(kind==='bookmarks')return !!bm[q.id];
      const record=bucket[q.id];
      if(!record?.submitted) return false;
      const ans=effectiveAnswer(q);
      if(ans===null || ans===undefined || q.gradingMode==='manual')return false;
      if(q.type==='short')return false; // not marked wrong by manual review
      const want=Array.isArray(ans)?ans:[ans];
      const chosen=Array.isArray(record.selected)?record.selected:[record.selected];
      return !(want.length===chosen.length&&want.every(n=>chosen.includes(n)));
    }).sort((a,b)=>Number(a.year)-Number(b.year)||Number(a.number)-Number(b.number)||a.professor.localeCompare(b.professor));
    if(!selected.length){popup.close();toast(kind==='wrong'?'현재 학습 모드에 저장된 오답이 없습니다.':'현재 학습 모드에 저장된 북마크가 없습니다.');return;}
    const teacherMap=new Map(metas.map(p=>[p.id,p.name]));
    const title=(kind==='wrong'?'오답노트':'북마크')+' · '+(subj?.name||'혈액과 종양 1차');
    const modeLabel={'professor':'교수님별 학습','year-exam':'학번별 시험','unit':'단원별 학습','prediction':'AI 예상문제'}[mode];
    const display=(t,max)=>esc(studyCopy(String(t||'').replace(/\s+/g,' ').trim()).slice(0,max));
    const answerLine=q=>{
      const a=effectiveAnswer(q);if(a===null||a===undefined)return '정답 미확정';
      return (Array.isArray(a)?a:[a]).map(n=>q.type==='short'?String(n):circles[n-1]||String(n)).join(' / ');
    };
    const image=(src,klass,alt)=>src?`<img src="${esc(src)}" alt="${esc(alt)}" class="${klass}">`:'';
    const pages=selected.map((q,index)=>{
      const picked=bucket[q.id]?.selected||[];
      const pickedList=Array.isArray(picked)?picked:[picked];
      const wanted=effectiveAnswer(q);
      const correctList=wanted==null?[]:Array.isArray(wanted)?wanted:[wanted];
      const grade=kind==='bookmarks'?'북마크': '오답';
      const promptLength=(q.prompt||'').length+(q.choices||[]).reduce((v,c)=>v+c.text.length,0);
      const compact=promptLength>1200?'very-compact':promptLength>700?'compact':'';
      const lecture=(q.validation?.stage==='accepted'?q.evidence:q.candidateEvidence||q.evidence||[])||[];
      const f=(q.figureImages||[]).filter(x=>x.src||x.image);
      const explanation=studyAiExplanation(q)||studyCopy(q.explanation)||'관련 강의안과 원본 문제를 비교해 확인하세요.';
      const reason=q.choiceExplanations||{};
      const perChoice=(q.choices||[]).map(c=>reason[String(c.number)]?`<div class="reason"><b>${circles[c.number-1]||c.number}</b> ${display(reason[String(c.number)],270)}</div>`:'').filter(Boolean).join('');
      const figure=f.length?`<section class="figures">${f.slice(0,2).map(x=>image(x.src||x.image,'question-fig',x.alt||'기출 그림')).join('')}</section>`:'';
      const evidence=lecture[0]?.image && promptLength<1250?`<div class="lecture"><small>강의안 참고: ${display(lecture[0].file||'',110)} · PDF ${lecture[0].page||'?'}쪽</small>${image(lecture[0].image,'lecture-img','강의안 캡처')}</div>`:lecture[0]?`<small>강의안 참고: ${display(lecture[0].file||'',110)} · PDF ${lecture[0].page||'?'}쪽</small>`:'';
      const options=q.type==='short'?`<div>주관식 답안: ${display(pickedList.join(''),200)}</div>`:(q.choices||[]).map(c=>`<div class="option ${correctList.includes(c.number)?'is-correct':''}"><strong>${circles[c.number-1]||c.number}</strong><span>${display(c.text,700)}</span>${correctList.includes(c.number)?'<b>✓</b>':''}</div>`).join('');
      return `<section class="sheet ${compact}"><header><div><b>HEON ARCHIVE</b><span> ${display(title,75)} · ${display(modeLabel,30)}</span></div><div>${index+1} / ${selected.length}</div></header><div class="qid">${display(teacherMap.get(q.professor)||q.professor,50)} 교수님 · ${display(q.label,20)} <span>${grade}</span></div><h2>${display(q.prompt,3500)}</h2>${figure}<div class="options">${options}</div><div class="keyline"><b>정답 ${esc(answerLine(q))}</b><span>내 답안: ${display(pickedList.map(n=>typeof n==='number'?(circles[n-1]||n):n).join(', ')||'미제출',100)}</span></div><div class="explain"><h3>핵심 해설</h3><p>${display(explanation,promptLength>1000?480:700)}</p>${perChoice?`<div class="reasons">${perChoice}</div>`:''}</div>${evidence}<footer>HEON ARCHIVE · 브라우저 학습 기록 기준 · 문제별 1페이지</footer></section>`;
    }).join('');
    const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><base href="${esc(document.baseURI)}"><title>${esc(title)} PDF</title><style>
      @page{size:A4 portrait;margin:8mm}
      *{box-sizing:border-box}body{font-family:Arial,'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#12223b;background:#edf2f9;margin:0}
      .controls{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:15px;padding:13px 18px;background:white;border-bottom:1px solid #cbd7e6;font-size:13px}
      .controls button{background:#2563eb;color:white;border:0;border-radius:9px;padding:11px 17px;font-weight:800;cursor:pointer}
      .sheet{position:relative;background:white;width:194mm;height:277mm;overflow:hidden;margin:15px auto;padding:8mm;box-shadow:0 4px 16px #cbd5e1;font-size:10.4px;line-height:1.37;break-after:page;page-break-after:always}
      .sheet:last-child{break-after:auto;page-break-after:auto}
      .sheet header{display:flex;justify-content:space-between;border-bottom:2px solid #2563eb;padding-bottom:8px;font-size:10px;color:#45627e}
      .sheet header b{letter-spacing:1.5px;color:#1748af;margin-right:12px}
      .qid{margin:10px 0 7px;color:#2563eb;font-weight:bold;font-size:12px}.qid span{color:#be123c;margin-left:10px}
      .sheet h2{font-size:12px;line-height:1.55;white-space:normal;overflow-wrap:anywhere;margin:0 0 9px}
      .options{display:grid;gap:4px;margin:8px 0}
      .option{display:flex;gap:8px;padding:4px 7px;white-space:normal;border:1px solid #dce5ef;border-radius:6px;overflow-wrap:anywhere}
      .option strong{color:#45627e;min-width:16px}.option b{margin-left:auto}.option.is-correct{border-color:#8bc8b2;background:#eaf8f1}
      .figures{display:flex;gap:8px;margin:5px 0}.question-fig{object-fit:contain;max-width:45%;max-height:130px}
      .keyline{display:flex;gap:20px;padding:8px;background:#eaf8f1;border:1px solid #8bc8b2;border-radius:7px;margin:8px 0;color:#0a7d50}
      .explain{margin-top:7px}.explain h3{font-size:11px;margin:0 0 5px;color:#1748af}.explain p{margin:0 0 7px;white-space:normal}
      .reasons{display:grid;grid-template-columns:1fr 1fr;gap:3px 8px}.reason{background:#f2f6fa;border-radius:4px;padding:3px 5px;font-size:9px}
      .reason b{color:#2563eb;margin-right:3px}.lecture{display:flex;align-items:flex-start;gap:8px;margin-top:7px}.lecture small{width:40%;font-size:8px;color:#526683}.lecture-img{max-height:145px;max-width:58%;object-fit:contain}
      footer{position:absolute;bottom:7mm;right:8mm;color:#8897ac;border-top:1px solid #e2e8f0;font-size:8px;padding-top:4px}
      .sheet.compact{font-size:9.2px;padding:6mm}.sheet.compact h2{font-size:10px}.sheet.compact .option{padding:3px 5px}.sheet.compact .question-fig{max-height:90px}.sheet.compact .lecture-img{max-height:90px}.sheet.compact .reasons{font-size:8px}
      .sheet.very-compact{font-size:8.3px;padding:5mm;line-height:1.3}.sheet.very-compact h2{font-size:9px}.sheet.very-compact .option{padding:2px 4px}.sheet.very-compact .question-fig{max-height:70px}.sheet.very-compact .lecture-img{max-height:65px}.sheet.very-compact .reasons{font-size:7.5px}
      @media print{body{background:white}.controls{display:none}.sheet{margin:0;padding:6mm;width:194mm;height:277mm;box-shadow:none}.sheet header{margin-top:0}}
    </style></head><body><div class="controls"><span><b>${esc(title)} · ${selected.length}문항</b> (${esc(modeLabel)} 기록)</span><button onclick="window.print()">PDF로 저장 / 인쇄</button></div>${pages}</body></html>`;
    popup.document.open();popup.document.write(html);popup.document.close();
    popup.focus();
  }

  // Event delegation: no inline JavaScript handlers inside content.
  root.addEventListener('click',async(e)=>{
    const btn=e.target.closest('[data-action]');if(!btn)return;
    if(btn.matches('input[type=checkbox]'))return; // change listener handles checkbox
    const action=btn.dataset.action;
    switch(action) {
      case 'print-collection':await exportCollection(btn.dataset.kind==='bookmarks'?'bookmarks':'wrong');break;
      case 'mobile-menu':mobileMenuOpen=!mobileMenuOpen;render();break;
      case 'home':view='home';mobileMenuOpen=false;render();window.scrollTo(0,0);break;
      case 'scroll-courses':root.querySelector('#professor-picker')?.scrollIntoView({behavior:'smooth',block:'start'});break;
      case 'subject':selectedSubject=btn.dataset.id;currentProfessor=null;view='home';mobileMenuOpen=false;render();break;
      case 'subject-home':selectedSubject=btn.dataset.id;currentProfessor=null;view='home';render();window.scrollTo(0,0);break;
      case 'home-mode':homeStudyType=['professor','unit','year'].includes(btn.dataset.mode)?btn.dataset.mode:'professor';render();break;
      case 'start-year-exam':await selectSubjectExam(btn.dataset.year);break;
      case 'choose-unit-professor':chosenUnitProfessor=btn.dataset.id;await loadProfessor(chosenUnitProfessor);render();break;
      case 'start-unit':await startUnit(btn.dataset.id,btn.dataset.unit);break;
      case 'start-predictions':await startPredictions();break;
      case 'professor':await selectProfessor(btn.dataset.id);break;
      case 'theme':state.prefs.theme=state.prefs.theme==='dark'?'light':'dark';saveState();render();break;
      case 'reset-professor':resetProfessorProgress();break;
      case 'reset-unit':{if(studyMode!=='unit')break;if(!confirm('현재 단원만 초기화할까요? 교수님별·학번별 기록은 보존됩니다.'))break;for(const q of questions()){delete state.unitRecords[q.id];delete state.unitBookmarks[q.id];}currentId=questions()[0]?.id;view='quiz';infoExpanded=false;saveState();render();break;}
      case 'reset-year-exam':{
        if(studyMode!=='year-exam')break;
        if(!confirm(selectedExamYear+'학번 시험의 답안·북마크만 초기화할까요? 교수님별 기록은 보존됩니다.'))break;
        for(const q of questions()){delete state.yearExamRecords[q.id];delete state.yearExamBookmarks[q.id];}
        delete state.lastVisited[currentProfessor.professor.id];
        currentId=questions()[0]?.id;view='quiz';infoExpanded=false;saveState();render();break;
      }
      case 'nav-quiz':{
        if(!currentProfessor){view='home';render();toast('첫 화면에서 과목과 교수님을 선택해주세요.');}
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
        if(isBookmark(q))delete bookmarkBucket()[q.id];else bookmarkBucket()[q.id]=true;
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
        r.selected=selected;r.submitted=false;infoExpanded=false;r.updatedAt=new Date().toISOString();recordBucket()[q.id]=r;saveState();render();break;
      }
      case 'submit':{
        const q=currentQuestion();if(!q)break;const r={...record(q)};
        if(q.type==='short'&&!String(r.selected||'').trim())break;
        if(q.type!=='short'&&!r.selected?.length)break;
        r.submitted=true;r.submittedAt=new Date().toISOString();recordBucket()[q.id]=r;infoExpanded=true;saveState();
        if(studyMode==='year-exam'&&scopedQuestions().at(-1)?.id===q.id&&scopedQuestions().every(submission)) {view='review';reviewFilter='all';restoringReview=false;}
        render();
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
      case 'open-review':reviewFilter='all';selectedReviewId=null;view='review';restoringReview=false;render();window.scrollTo(0,0);break;
      case 'review-filter':reviewFilter=btn.dataset.filter;selectedReviewId=null;render();break;
      case 'review-select':{const side=root.querySelector('.review-number-sidebar'),pane=root.querySelector('.review-detail-pane');const position=side?.scrollTop||0;selectedReviewId=btn.dataset.id;render();const next=root.querySelector('.review-number-sidebar');if(next)next.scrollTop=position;const detail=root.querySelector('.review-detail-pane');if(detail)detail.scrollTop=0;break;}
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
        if(q&&value){state.customAnswers[q.id]=value;saveState();render();toast('정답을 저장했습니다.');}break;
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
      recordBucket()[q.id]=r;saveState();
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
      // Always start with the course/professor selector. Never discard existing records.
      // Previously visited question stays in lastVisited and resumes on professor click.
      view='home'; currentProfessor=null; infoExpanded=false;
      const chosen=subjectById(selectedSubject) || catalog.subjects.find(s=>s.professors.length);
      if(chosen) {
        selectedSubject=chosen.id;
        await Promise.allSettled(chosen.professors.map(p=>loadProfessor(p.id)));
      }
      render();
    }catch(err){
      root.innerHTML=`<div style="max-width:680px;margin:9vh auto;padding:30px;border:1px solid #35465d;border-radius:18px;background:#101d30;color:#ecf2fb"><h2>HEON ARCHIVE 데이터를 불러오지 못했습니다</h2><p>${esc(err.message)}</p><p>ZIP 전체를 먼저 압축 해제한 후, <code>heon-archive/index.html</code>을 열어주세요. <code>data/catalog.js</code> 및 <code>data/professors/</code> 폴더가 같은 위치에 있어야 합니다.</p></div>`;
      console.error(err);
    }
  }
  init();
})();
