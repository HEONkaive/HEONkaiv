
"use strict";
// Stable question IDs, not array indices, are used for all persisted records.
const STORAGE_KEY = "acorn-professor-quiz-v1";

// Cache decoded source images as Blob URLs. Repeated question navigation reuses
// the same browser resource instead of reparsing long data URLs in every render.
const imageCache = new Map();
function imageSrc(uri){
 if(!uri?.startsWith("data:"))return uri;
 if(imageCache.has(uri))return imageCache.get(uri);
 const comma=uri.indexOf(","),mime=uri.slice(5,uri.indexOf(";"));
 const binary=atob(uri.slice(comma+1)),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 const url=URL.createObjectURL(new Blob([bytes],{type:mime}));
 imageCache.set(uri,url);return url;
}

const PROFESSORS = [...new Set(QUESTIONS.map(q=>q.professor))];
const byId = Object.fromEntries(QUESTIONS.map(q=>[q.id,q]));
const $ = s=>document.querySelector(s);
const esc = s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const attr = esc;
const fresh = ()=>({version:1,theme:"dark",subject:META.subjects[0],records:{},lastView:{kind:"home"}});
let store=fresh(), storageError="", storageUsable=true, view={kind:"home"}, filter="", search="", resultFilter="all", toastTimer;
try{
  const raw=localStorage.getItem(STORAGE_KEY);
  if(raw) store=validateStore(JSON.parse(raw));
}catch(e){
  storageUsable=false;
  storageError="이 브라우저의 저장소를 사용할 수 없거나 기존 기록을 읽지 못했습니다. 현재 기록은 임시로만 유지됩니다. 백업 내보내기를 이용하세요.";
}
function validateStore(raw){
  if(!raw||raw.version!==1||typeof raw.records!=="object"||!raw.records||Array.isArray(raw.records))throw Error("지원하지 않는 백업 형식입니다.");
  const clean=fresh();
  clean.theme=raw.theme==="light"?"light":"dark";
  clean.subject=META.subjects.includes(raw.subject)?raw.subject:META.subjects[0];
  for(const p of PROFESSORS){
    const r=raw.records[p];
    if(!r)continue;
    const out={started:!!r.started,current:null,answers:{},drafts:{},notes:{},bookmarks:{},updated:typeof r.updated==="string"?r.updated:""};
    if(byId[r.current]?.professor===p)out.current=r.current;
    for(const q of QUESTIONS.filter(q=>q.professor===p)){
      const a=r.answers?.[q.id];
      if(a&&typeof a==="object"){
        const selected=Array.isArray(a.selected)?[...new Set(a.selected.filter(n=>Number.isInteger(n)&&n>=1&&n<=q.options.length))]:[];
        // Recompute automatic grades; never trust imported correctness values for objective items.
        const correct=q.manual?(typeof a.correct==="boolean"?a.correct:null):same(selected,q.answer);
        if(q.type==="written" || selected.length>0){
          out.answers[q.id]={selected,text:typeof a.text==="string"?a.text.slice(0,20000):"",correct,manual:q.manual,time:typeof a.time==="string"?a.time:""};
        }
      }
      const d=r.drafts?.[q.id];
      if(Array.isArray(d))out.drafts[q.id]=[...new Set(d.filter(n=>Number.isInteger(n)&&n>=1&&n<=q.options.length))];
      else if(typeof d==="string")out.drafts[q.id]=d.slice(0,20000);
      if(typeof r.notes?.[q.id]==="string")out.notes[q.id]=r.notes[q.id].slice(0,30000);
      if(r.bookmarks?.[q.id]===true)out.bookmarks[q.id]=true;
    }
    clean.records[p]=out;
  }
  if(raw.lastView&&["home","quiz","results"].includes(raw.lastView.kind)){
    const v=raw.lastView;
    if(v.kind==="home")clean.lastView={kind:"home"};
    else if(PROFESSORS.includes(v.professor)){
      if(v.kind==="results")clean.lastView={kind:"results",professor:v.professor};
      else if(byId[v.id]?.professor===v.professor)clean.lastView={kind:"quiz",professor:v.professor,id:v.id};
    }
  }
  return clean;
}
function same(a,b){return !!b&&a.length===b.length&&[...a].sort().join(",")===[...b].sort().join(",")}
function persist(){
  if(!storageUsable)return;
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(store))}
  catch(e){storageError="기록을 기기에 저장하지 못했습니다(저장 공간 부족 또는 브라우저 제한). 지금 백업을 내보내세요. 이 화면을 닫으면 최근 기록이 사라질 수 있습니다.";storageUsable=false;renderStorageError()}
}
function record(p){
 return store.records[p]??(store.records[p]={started:false,current:null,answers:{},drafts:{},notes:{},bookmarks:{},updated:""});
}
function qs(p){return QUESTIONS.filter(q=>q.professor===p&&q.subject===store.subject)}
function stats(p){
 const list=qs(p),r=record(p);
 const answers=list.map(q=>r.answers[q.id]).filter(Boolean);
 const correct=answers.filter(a=>a.correct===true).length,wrong=answers.filter(a=>a.correct===false).length;
 const pending=answers.filter(a=>a.correct===null).length;
 return {total:list.length,answered:answers.length,correct,wrong,pending,remaining:list.length-answers.length,completed:list.length>0&&correct+wrong===list.length};
}
function status(p){
 const s=stats(p);
 return s.completed?"completed":record(p).started||s.answered>0?"in-progress":"not-started";
}
function toast(text){
 let t=$("#toast");
 if(!t){t=document.createElement("div");t.id="toast";t.className="toast";t.setAttribute("role","status");document.body.append(t)}
 t.textContent=text;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.hidden=true,2800);
}
function renderStorageError(){
 $("#storage-error").textContent=storageError;
}
function setView(v,save=true){
 view=v;search="";filter="";resultFilter="all";
 if(v.professor){const q=QUESTIONS.find(q=>q.professor===v.professor);if(q)store.subject=q.subject}
 if(save){store.lastView=v;persist()}
 render();window.scrollTo(0,0);
}
function goQuestion(p,id){
 const list=qs(p);
 if(!list.length)return;
 if(!list.some(q=>q.id===id))id=list[0].id;
 const r=record(p);r.started=true;r.current=id;r.updated=new Date().toISOString();
 setView({kind:"quiz",professor:p,id});
}
function start(p){
 const r=record(p),list=qs(p);
 if(!list.length)return;
 if(stats(p).completed){setView({kind:"results",professor:p});return}
 goQuestion(p,r.current||list.find(q=>!r.answers[q.id])?.id||list[0].id);
}
function stateTag(q){
 const a=record(q.professor).answers[q.id];
 return !a?["미응답",""]:a.correct===null?["직접 채점 대기","pending"]:a.correct?["맞음","correct"]:["틀림","wrong"];
}
function statBar(p){
 const s=stats(p);
 return `<div class="scorebar" aria-label="풀이 통계"><div class="counts"><span>맞음 <strong class="goodtext">${s.correct}</strong></span><span>틀림 <strong class="badtext">${s.wrong}</strong></span><span>미응답 <strong>${s.remaining}</strong></span>${s.pending?`<span>직접 채점 대기 <strong>${s.pending}</strong></span>`:""}</div><button data-action="results" data-prof="${attr(p)}">문제별 결과 보기</button></div>`;
}
function render(){
 document.documentElement.dataset.theme=store.theme;
 renderStorageError();
 $("#subjects").innerHTML=META.subjects.map(s=>`<button class="subject ${s===store.subject?"active":""}" data-action="subject" data-subject="${attr(s)}" ${s===store.subject?'aria-current="page"':""}>${esc(s)}</button>`).join("");
 $("#crumb").textContent=view.kind==="home"?`${store.subject} / 교수님별 학습`:`${store.subject} / ${view.professor} 교수님 / ${view.kind==="results"?"풀이 결과":"문제 풀이"}`;
 $("#theme").textContent=store.theme==="dark"?"라이트 모드":"다크 모드";
 $("#saved-label").textContent=storageUsable?"이 브라우저에 자동 저장":"임시 저장 · 백업 필요";
 $("#app").innerHTML=view.kind==="quiz"?renderQuiz():view.kind==="results"?renderResults():renderHome();
 if(view.kind==="home")renderLibrary();
}
function renderHome(){
 const list=QUESTIONS.filter(q=>q.subject===store.subject);
 const profs=[...new Set(list.map(q=>q.professor))];
 return `<section class="hero"><div><div class="eyebrow">YOUR PERSONAL STUDY ARCHIVE</div><h1>${esc(store.subject)}</h1><p class="muted">교수님별로 차근차근.<br>풀던 곳부터 이어서, 헷갈린 문제는 다시 한 번.</p></div><div class="count-badge"><span class="muted small">수록 문항</span><strong>${list.length}<span class="small"> 문항</span></strong></div></section>
 <div class="notice"><strong style="color:var(--text)">교수님별 진도 관리</strong><br>연도별 시험 선택 없이 교수님 단위로 풀이합니다. 문제 순서는 PDF 수록 순서이며, 17-1 같은 원래 문항 번호는 그대로 표시합니다. ${list.length?"첨부 PDF의 범위 표기에 따라 교수님을 구분했습니다.":"이 과목은 아직 자료가 등록되지 않았습니다."}</div>
 <div class="flex between"><h2 style="margin:0">교수님 선택</h2><div class="legend"><span><i class="dot"></i>시작 전</span><span><i class="dot orange"></i>진행 중</span><span><i class="dot green"></i>전체 완료</span></div></div>
 ${profs.length?`<section class="prof-grid">${profs.map(p=>{
  const s=stats(p),r=record(p),st=status(p),count=s.correct+s.wrong;
  return `<article class="card prof-card ${st}"><div class="flex"><span class="avatar">${esc(p[0])}</span><span class="prof-name">${esc(p)} <small>교수님</small></span></div>
  <div class="status ${st}">${st==="completed"?"✓ 전체 완료":st==="in-progress"?"진행 중":"시작 전"}</div>
  <div><div class="flex between small muted" style="margin-bottom:8px"><span>채점 완료 ${count} / ${s.total}</span><span>${Math.round(count/s.total*100)}%</span></div><div class="progress"><div style="width:${count/s.total*100}%"></div></div></div>
  <div class="flex small"><span class="goodtext">맞음 ${s.correct}</span><span class="badtext">틀림 ${s.wrong}</span><span class="muted">미응답 ${s.remaining}${s.pending?` · 채점 대기 ${s.pending}`:""}</span></div>
  <button class="primary" data-action="start" data-prof="${attr(p)}">${s.completed?"전체 결과 · 해설 보기":st==="in-progress"?"이어 풀기 →":"문제 풀기 →"}</button>
  <div class="flex between small muted"><span>${r.current&&!s.completed?`최근 문항 ${esc(byId[r.current]?.label||"")}`:`총 ${s.total}문항`}</span><button data-action="results" data-prof="${attr(p)}" style="padding:4px 8px;font-size:11px">풀이 기록</button></div></article>`
 }).join("")}</section>`:`<div class="card empty"><h3>아직 등록된 문제가 없어요.</h3><p class="muted">다른 과목의 문제를 복제해 넣지 않았습니다.<br>해당 과목 PDF를 추가한 뒤 문제 데이터를 등록할 수 있습니다.</p></div>`}
 ${list.length?`<section><div class="flex between"><h2 style="margin:0">문제 찾아보기</h2><span class="muted small">검색 · 오답 · 북마크</span></div><div class="searchbox"><input class="input" id="search" aria-label="문제 검색" placeholder="문제 번호, 교수님, 키워드 검색"><select id="filter" aria-label="문제 필터"><option value="">모든 문제</option><option value="wrong">틀린 문제</option><option value="bookmark">북마크한 문제</option><option value="unanswered">미응답 문제</option><option value="review">정답 검토 필요</option></select></div><div id="library" class="library"></div></section>`:""}
 <div class="footer">학습용 아카이브 · 출처: ${esc(META.source)} 13쪽 전체 · 변형 선지 개별 분리 / 18-46 중복 1건 통합<br>문제·해설은 과거 자료입니다. 현재 임상 지침을 대신하지 않으며, 자동채점 기준은 공식 정답표가 아닙니다. 공개 배포 전 자료의 저작권과 공유 권한을 확인하세요.</div>`;
}
function renderLibrary(){
 const target=$("#library");if(!target)return;
 const items=QUESTIONS.filter(q=>{
  if(q.subject!==store.subject)return false;
  const r=record(q.professor),a=r.answers[q.id];
  if(filter==="wrong"&&a?.correct!==false)return false;
  if(filter==="bookmark"&&!r.bookmarks[q.id])return false;
  if(filter==="unanswered"&&a)return false;
  if(filter==="review"&&!(q.manual&&q.type==="choice"))return false;
  return !search||`${q.label} ${q.professor} ${q.question} ${q.options.join(" ")}`.toLowerCase().includes(search.toLowerCase());
 });
 target.innerHTML=`<div class="muted small">${items.length}문항</div>`+items.map(q=>{
 const [label,cl]=stateTag(q),book=record(q.professor).bookmarks[q.id];
 return `<button class="library-row" data-action="question" data-prof="${attr(q.professor)}" data-id="${attr(q.id)}"><span><span class="label">${book?"★ ":""}${esc(q.label)} · ${esc(q.professor)} 교수님</span><span class="preview">${esc(q.question.slice(0,95))}${q.question.length>95?"…":""}</span></span><span class="tag ${cl}">${label}</span></button>`;
 }).join("")+(items.length?"":`<div class="empty muted">해당하는 문제가 없습니다.</div>`);
}
function renderQuiz(){
 const p=view.professor,list=qs(p),q=byId[view.id];
 if(!q)return renderHome();
 const r=record(p),a=r.answers[q.id],index=list.findIndex(x=>x.id===q.id),selected=a?.selected||(Array.isArray(r.drafts[q.id])?r.drafts[q.id]:[]);
 const draftText=a?.text||(typeof r.drafts[q.id]==="string"?r.drafts[q.id]:"");
 const multi=q.answer?.length>1;
 return `<div class="backline"><button data-action="home">← 교수님 목록</button><span class="muted small">${esc(p)} 교수님 · PDF 수록 순서</span><button class="danger" data-action="reset" data-prof="${attr(p)}">이 교수님 풀이 초기화</button></div>
 ${statBar(p)}
 <div class="quiz-grid">
 <section class="question-panel" aria-label="문제">
 <div class="flex between"><span class="label">QUESTION ${String(index+1).padStart(2,"0")} / ${list.length}</span><div class="flex"><select id="jump" aria-label="문제 이동">${list.map((x,i)=>`<option value="${attr(x.id)}" ${x.id===q.id?"selected":""}>${i+1}. ${esc(x.label)} · ${stateTag(x)[0]}</option>`).join("")}</select><button class="bookmark ${r.bookmarks[q.id]?"active":""}" data-action="bookmark" aria-label="이 문제 북마크" aria-pressed="${!!r.bookmarks[q.id]}">${r.bookmarks[q.id]?"★":"☆"}</button></div></div>
 <div class="flex" style="margin-top:20px"><span class="tag">${esc(q.label)}</span><span class="muted small">${q.type==="written"?"서술형 · 직접 채점":multi?`${q.answer.length}개 선택 · 모두 일치해야 정답`:q.manual?"정답 검토 필요 · 직접 채점":"객관식 · 1개 선택"}</span></div>
 ${q.manual&&q.type==="choice"?`<div class="warn">원문 정답 또는 문항에 검토 사항이 있습니다. 답안을 제출한 뒤 해설을 확인하고 직접 채점해주세요.</div>`:""}
 ${q.context?`<details open><summary>앞 문항 환자 정보 (19-6)</summary><p class="source-text">${esc(q.context)}</p></details>`:""}
 <div class="question-text">${esc(q.question)}</div>
 ${q.figure?`<img class="qfigure" src="${imageSrc(q.figure)}" alt="${esc(q.label)} 원문에 포함된 그림" data-action="image">`:""}
 ${q.type==="written"?`<label for="written" class="muted small">내 답안</label><textarea id="written" class="written" placeholder="답안을 작성한 뒤 모범답안과 비교하세요." ${a?"readonly":""}>${esc(draftText)}</textarea>`:`<div role="group" aria-label="선지">${q.options.map((opt,i)=>{
  const n=i+1;let cl=selected.includes(n)?"selected":"";
  if(a&&!q.manual){if(q.answer.includes(n))cl+=" correct";else if(a.selected.includes(n))cl+=" wrong"}
  return `<button class="option ${cl}" data-action="option" data-number="${n}" ${a?"disabled":""} aria-pressed="${selected.includes(n)}"><span class="num">${n}</span><span>${esc(opt)}</span></button>`;
 }).join("")}</div>`}
 ${!a?`<div class="submit-row"><button class="primary" data-action="submit" ${q.type==="choice"&&selected.length===0?"disabled":""}>${q.manual?"답안 제출 · 해설 확인":"답안 제출 · 채점하기"}</button></div>`:`<p class="muted small" style="margin:15px 0 0">제출한 답안은 고정됩니다. 오답·메모를 보존한 채 다시 검토할 수 있습니다.</p>`}
 <div class="nav-buttons"><button data-action="previous" ${index===0?"disabled":""}>← 이전 문제</button><button data-action="next" ${index===list.length-1?"disabled":""}>다음 문제 →</button></div>
 <details><summary>전체 문제 지도 · ${list.length}문항</summary><div class="question-map">${list.map((x,i)=>`<button class="qcell ${stateTag(x)[1]} ${x.id===q.id?"current":""}" data-action="question" data-id="${attr(x.id)}" data-prof="${attr(p)}" aria-label="${esc(x.label)} ${stateTag(x)[0]}">${i+1}<br>${esc(x.label)}</button>`).join("")}</div></details>
 </section>
 <aside class="explanation-panel" aria-label="해설 및 메모">
 ${a?renderExplanation(q,a):`<div class="card locked"><div><div class="eyebrow">EXPLANATION</div><h3>먼저 답을 골라보세요.</h3><p class="small">답안을 제출하면 정답과 PDF 원문 해설이 열립니다.<br>해설 속 정답 표시가 미리 보이지 않도록 숨겼습니다.</p></div></div>`}
 <div class="card"><h3>내 학습 메모</h3><textarea id="memo" aria-label="이 문제 학습 메모" placeholder="헷갈린 개념이나 다시 볼 내용을 적어두세요.">${esc(r.notes[q.id]||"")}</textarea><span class="memo-label">문제별 자동 저장 · 풀이 초기화 시에도 메모와 북마크는 유지됩니다.</span></div>
 </aside></div>`;
}
function renderExplanation(q,a){
 const [text,cl]=stateTag(q),isManual=q.manual;
 return `<div class="verdict ${a.correct===false?"wrong":a.correct===null?"pending":""}">${a.correct===null?"해설 확인 후 직접 채점해주세요.":a.correct?"맞았습니다.":"틀렸습니다."}${isManual&&a.correct!==null?' <span class="small">(직접 채점)</span>':""}
 ${!isManual?`<div class="small" style="font-weight:500;margin-top:5px">정답 ${q.answer.join(", ")}번 · 내 답 ${a.selected.join(", ")}번</div>`:""}</div>
 ${isManual?`<div class="card"><h3>${q.type==="written"?"모범답안과 비교":"원문을 확인하고 직접 채점"}</h3>${q.modelAnswer?`<p class="source-text" style="color:var(--text)">${esc(q.modelAnswer)}</p>`:""}<p class="muted small">직접 채점 결과는 통계에 포함되며 결과 목록에 별도로 표시됩니다. 검토가 끝나지 않았다면 채점을 보류해도 됩니다.</p><div class="flex"><button class="primary" data-action="selfgrade" data-value="true">${a.correct===true?"선택됨 · ":""}맞음으로 기록</button><button data-action="selfgrade" data-value="false">${a.correct===false?"선택됨 · ":""}틀림으로 기록</button></div></div>`:""}
 ${q.note?`<div class="warn"><strong>원문 검토 메모</strong><br>${esc(q.note)}</div>`:""}
 <div class="card"><div class="eyebrow">ORIGINAL PDF EXPLANATION</div><h3>자료 원문 해설</h3><p class="muted small">원본 캡처에는 강조, 필기, 첨부 그림을 함께 보존했습니다. 이미지를 누르면 확대됩니다.</p>
 ${q.sources.map((n,i)=>`<div><span class="label">${esc(META.source)} · ${SOURCES[n].page}쪽${i?" · 중복 수록 해설":""}</span><img class="original" src="${imageSrc(SOURCES[n].explanationImage)}" alt="${esc(q.label)} ${SOURCES[n].page}쪽 원문 해설" data-action="image" loading="lazy"></div>`).join("")}
 <details><summary>해설 텍스트 보기</summary><div class="source-text">${esc(q.explanation)}</div></details>
 <details><summary>문제 원본 · 필기 · 함께 수록된 변형 선지</summary>${q.sources.map(n=>`<img class="original" src="${imageSrc(SOURCES[n].questionImage)}" alt="${esc(q.label)} 문제 원본" data-action="image" loading="lazy">`).join("")}</details>
 <p class="muted small" style="margin:15px 0 0">과거 기출 자료의 문구를 보존했습니다. 원문 오류와 최신 의학 지침은 별도 확인이 필요합니다.</p>
 </div>`;
}
function renderResults(){
 const p=view.professor,list=qs(p),s=stats(p),r=record(p);
 const automatic=list.filter(q=>!q.manual&&r.answers[q.id]?.correct!==undefined).length;
 const manual=list.filter(q=>q.manual&&typeof r.answers[q.id]?.correct==="boolean").length;
 const filtered=list.filter(q=>resultFilter==="all"||(resultFilter==="wrong"&&r.answers[q.id]?.correct===false)||(resultFilter==="correct"&&r.answers[q.id]?.correct===true)||(resultFilter==="unanswered"&&!r.answers[q.id])||(resultFilter==="pending"&&r.answers[q.id]?.correct===null));
 return `<div class="backline"><button data-action="home">← 교수님 목록</button><button class="danger" data-action="reset" data-prof="${attr(p)}">이 교수님 풀이 초기화</button></div>
 <div class="eyebrow">LEARNING REPORT</div><h1>${esc(p)} 교수님 · 풀이 결과</h1>
 <p class="muted">${s.completed?"모든 문제 풀이를 마쳤어요. 수고하셨습니다!":"아직 풀이 또는 직접 채점이 남아 있어요."} 각 문제를 누르면 제출한 답과 해설을 다시 볼 수 있습니다.</p>
 <div class="report-summary"><div class="metric"><span class="muted small">맞은 문제</span><strong class="goodtext">${s.correct}</strong></div><div class="metric"><span class="muted small">틀린 문제</span><strong class="badtext">${s.wrong}</strong></div><div class="metric"><span class="muted small">미응답 / 채점 대기</span><strong>${s.remaining}<small style="font-size:16px"> / ${s.pending}</small></strong></div><div class="metric"><span class="muted small">채점 문항 정답률</span><strong>${s.correct+s.wrong?Math.round(s.correct/(s.correct+s.wrong)*100):0}<small style="font-size:16px">%</small></strong></div></div>
 <div class="notice">전체 ${s.total}문항 · 자동 채점 ${automatic}문항 · 직접 채점 완료 ${manual}문항<br>미응답과 직접 채점 대기는 정답률의 분모에 포함하지 않습니다. 직접 채점 결과도 맞음·틀림 개수에는 포함됩니다.</div>
 <div class="flex between" style="margin-bottom:20px"><div class="flex"><button class="primary" data-action="resume-unanswered" data-prof="${attr(p)}">${s.completed?"문제 다시 살펴보기":"남은 문제 이어 풀기"}</button><button data-action="export">전체 기록 백업</button></div><select id="result-filter" aria-label="결과 필터">${[["all","전체 문제"],["correct","맞은 문제"],["wrong","틀린 문제"],["unanswered","미응답"],["pending","직접 채점 대기"]].map(([v,t])=>`<option value="${v}" ${resultFilter===v?"selected":""}>${t}</option>`).join("")}</select></div>
 <div>${filtered.map(q=>{
 const a=r.answers[q.id],[label,cl]=stateTag(q);
 return `<button class="result-row" data-action="question" data-prof="${attr(p)}" data-id="${attr(q.id)}"><span class="label">${esc(q.label)}</span><span>${esc(q.question.slice(0,110))}${q.question.length>110?"…":""}<small>${a?`${q.type==="written"?"서술형 답안 제출":`내 답: ${a.selected.join(", ")}번`}${q.manual?" · 직접 채점":` · 정답: ${q.answer.join(", ")}번`}`:"아직 풀지 않은 문제"}</small></span><span class="tag ${cl}">${label}${q.manual&&a?.correct!==null&&a?" · 직접":""} →</span></button>`;
 }).join("")||`<div class="card empty muted">해당하는 문제가 없습니다.</div>`}</div>`;
}
function choose(n){
 const q=byId[view.id],r=record(view.professor);
 if(r.answers[q.id])return;
 const old=Array.isArray(r.drafts[q.id])?r.drafts[q.id]:[];
 // Source multi-answer items enforce multiple selection; disputed single-choice items remain single choice.
 r.drafts[q.id]=q.answer?.length>1?(old.includes(n)?old.filter(x=>x!==n):[...old,n]):[n];
 persist();const y=window.scrollY;render();window.scrollTo(0,y);
}
function submit(){
 const q=byId[view.id],r=record(view.professor);
 if(r.answers[q.id])return;
 const selected=Array.isArray(r.drafts[q.id])?r.drafts[q.id]:[],text=typeof r.drafts[q.id]==="string"?r.drafts[q.id]:"";
 if(q.type==="choice"&&!selected.length){toast("선지를 먼저 선택해주세요.");return}
 if(q.type==="written"&&!text.trim()){toast("답안을 입력해주세요. 모르겠다면 ‘모르겠음’을 적고 해설을 확인할 수 있습니다.");return}
 if(q.answer?.length>1&&selected.length!==q.answer.length){toast(`${q.answer.length}개의 선지를 선택해주세요.`);return}
 r.answers[q.id]={selected:[...selected],text,correct:q.manual?null:same(selected,q.answer),manual:q.manual,time:new Date().toISOString()};
 r.updated=new Date().toISOString();persist();
 if(stats(view.professor).completed){setView({kind:"results",professor:view.professor});toast("모든 문제 풀이를 마쳤습니다.");return}
 const y=window.scrollY;render();window.scrollTo(0,y);toast(q.manual?"해설을 확인하고 직접 채점해주세요.":"채점 결과와 해설을 저장했습니다.");
}
function selfGrade(value){
 const r=record(view.professor),q=byId[view.id],a=r.answers[q.id];
 if(!a||!q.manual)return;
 a.correct=value;r.updated=new Date().toISOString();persist();
 if(stats(view.professor).completed){setView({kind:"results",professor:view.professor});toast("모든 문제 풀이를 마쳤습니다.");return}
 const y=window.scrollY;render();window.scrollTo(0,y);
}
function reset(p){
 if(!confirm(`${p} 교수님의 제출 답안과 풀이 진도를 초기화할까요?\n메모와 북마크, 다른 교수님의 기록은 유지됩니다.\n이 작업은 되돌릴 수 없으므로 필요하면 먼저 백업하세요.`))return;
 const r=record(p);r.answers={};r.drafts={};r.current=null;r.started=false;r.updated=new Date().toISOString();
 setView({kind:"home"});toast("풀이 진도만 초기화했습니다. 메모와 북마크는 유지됩니다.");
}
function exportBackup(){
 const blob=new Blob([JSON.stringify({format:"acorn-professor-quiz",exportedAt:new Date().toISOString(),data:store},null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`acorn_backup_${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 toast("전체 교수님 기록과 메모를 백업했습니다.");
}
function modal(content,image=false){
 $(".modal")?.remove();
 const el=document.createElement("div");el.className=`modal${image?" image-view":""}`;el.setAttribute("role","dialog");el.setAttribute("aria-modal","true");el.setAttribute("aria-label",image?"원본 이미지 확대":"사용 안내");
 el.innerHTML=`<div class="modal-box"><div class="flex between" style="margin-bottom:15px"><strong>${image?"원본 이미지":"사용 안내"}</strong><button data-action="close">닫기 ×</button></div>${content}</div>`;
 el.addEventListener("click",e=>{if(e.target===el)closeModal()});document.body.append(el);el.querySelector("button").focus();document.body.style.overflow="hidden";
}
let previousFocus=null;
function closeModal(){$(".modal")?.remove();document.body.style.overflow="";previousFocus?.focus()}
function help(){
 previousFocus=document.activeElement;
 modal(`<h2>공부 기록은 이렇게 남아요.</h2>
 <p><strong>교수님 단위</strong>로 PDF 수록 순서대로 풀이합니다. 17-1은 원문 문항 번호이지 별도의 시험 메뉴가 아닙니다.</p>
 <p>시작 전은 회색, 시작했으나 완료하지 않으면 <strong>체크 없는 주황색</strong>, 모든 문항 채점까지 마치면 <strong>초록색 ✓</strong>입니다.</p>
 <p>선지를 고르고 제출하면 답안이 고정되며 해설이 열립니다. 서술형과 검토 필요 문항은 해설을 보고 직접 채점합니다. 북마크와 메모는 문제별로 저장됩니다.</p>
 <p>완료 시 전체 결과 화면으로 이동합니다. 문제를 클릭하면 제출한 답안과 원문 해설을 다시 확인할 수 있습니다.</p>
 <p><strong>저장 범위:</strong> 현재 브라우저·기기·사이트 주소에만 저장됩니다. 로그인·서버 저장·기기 간 자동 동기화는 없습니다. 시크릿 모드 종료, 브라우저 데이터 삭제, 사이트 주소 변경 시 기록을 잃을 수 있습니다. 정기적으로 JSON 백업을 내보내세요.</p>
 <p>백업 불러오기는 현재 기록을 <strong>교체</strong>합니다. 다른 기기로 옮길 때 내보낸 JSON 파일을 사용하세요. 예전 제미나이 HTML의 5문항 기록은 문항 데이터가 달라 자동 이전하지 않습니다.</p>
 <p><strong>등록 범위:</strong> PDF 13쪽 전체 → 원문 66개 문제 묶음, 연도별 변형을 분리하고 중복 18-46을 통합하여 총 73문항. 박무림 54 / 이석영 11 / 이승신 8문항입니다.</p>
 <p>${esc(META.policy)}<br>정답 오류·정답 논란은 검토 메모에 표시했습니다. 원본 해설·문제 캡처는 제출 후 확인할 수 있습니다.</p>
 <p class="muted small">실제 진료를 위한 도구가 아닙니다. 자료 공개 권한을 확인한 후 배포하세요. 프로젝트 폴더의 README.md에 개설 방법과 데이터 구조가 있습니다.</p>`);
}
document.addEventListener("click",e=>{
 const btn=e.target.closest("[data-action]");if(!btn||btn.disabled)return;
 const action=btn.dataset.action,p=btn.dataset.prof;
 switch(action){
 case "home":setView({kind:"home"});break;
 case "subject":store.subject=btn.dataset.subject;setView({kind:"home"});break;
 case "start":start(p);break;
 case "question":goQuestion(p,btn.dataset.id);break;
 case "option":choose(Number(btn.dataset.number));break;
 case "submit":submit();break;
 case "selfgrade":selfGrade(btn.dataset.value==="true");break;
 case "previous":
 case "next":{
 const list=qs(view.professor),i=list.findIndex(q=>q.id===view.id)+(action==="next"?1:-1);
 if(list[i])goQuestion(view.professor,list[i].id);break}
 case "bookmark":{
 const r=record(view.professor);r.bookmarks[view.id]=!r.bookmarks[view.id];persist();const y=window.scrollY;render();window.scrollTo(0,y);break}
 case "results":setView({kind:"results",professor:p||view.professor});break;
 case "resume-unanswered":{
 const list=qs(p),r=record(p);
 const q=list.find(q=>!r.answers[q.id])||list.find(q=>r.answers[q.id].correct===null)||list[0];
 if(q)goQuestion(p,q.id);break}
 case "reset":reset(p);break;
 case "theme":store.theme=store.theme==="dark"?"light":"dark";persist();document.documentElement.dataset.theme=store.theme;$("#theme").textContent=store.theme==="dark"?"라이트 모드":"다크 모드";break;
 case "export":exportBackup();break;
 case "import":$("#import-file").click();break;
 case "help":help();break;
 case "image":previousFocus=document.activeElement;modal(`<img src="${attr(btn.src)}" alt="${attr(btn.alt)}">`,true);break;
 case "close":closeModal();break;
 }
});
document.addEventListener("input",e=>{
 if(e.target.id==="search"){search=e.target.value;renderLibrary()}
 if(e.target.id==="memo"&&view.kind==="quiz"){record(view.professor).notes[view.id]=e.target.value;persist()}
 if(e.target.id==="written"&&view.kind==="quiz"&&!record(view.professor).answers[view.id]){record(view.professor).drafts[view.id]=e.target.value;persist()}
});
document.addEventListener("change",async e=>{
 if(e.target.id==="filter"){filter=e.target.value;renderLibrary()}
 if(e.target.id==="jump")goQuestion(view.professor,e.target.value);
 if(e.target.id==="result-filter"){resultFilter=e.target.value;$("#app").innerHTML=renderResults()}
 if(e.target.id==="import-file"){
  const f=e.target.files[0];e.target.value="";if(!f)return;
  try{
   if(f.size>10000000)throw Error("백업 파일이 너무 큽니다(최대 10MB).");
   const raw=JSON.parse(await f.text());
   if(raw.format!=="acorn-professor-quiz")throw Error("이 사이트에서 내보낸 기록 백업 JSON을 선택하세요.");
   const incoming=validateStore(raw.data);
   if(!confirm("현재 모든 교수님의 기록을 백업 파일의 기록으로 교체할까요?\n먼저 현재 기록을 내보내 두는 것을 권장합니다."))return;
   store=incoming;persist();setView({kind:"home"});toast("백업 기록을 불러왔습니다.");
  }catch(err){toast("불러오기 실패: "+err.message)}
 }
});
document.addEventListener("keydown",e=>{
 const m=$(".modal");if(!m)return;
 if(e.key==="Escape"){closeModal();return}
 if(e.key==="Tab"){
  const focusable=[...m.querySelectorAll('button,a[href],input,textarea,select,[tabindex="0"]')],first=focusable[0],last=focusable.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
 }
});
window.addEventListener("storage",e=>{
 if(e.key!==STORAGE_KEY||!e.newValue)return;
 try{store=validateStore(JSON.parse(e.newValue));render();toast("다른 탭에서 변경한 기록을 반영했습니다.")}
 catch(err){toast("다른 탭의 기록을 읽지 못했습니다. 백업을 확인하세요.")}
});
view=store.lastView;
render();
