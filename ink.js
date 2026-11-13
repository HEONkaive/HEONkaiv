/* HEON ARCHIVE v1.2.1 — on-page vector handwriting.
 * Notes are saved per question in IndexedDB, including independent question and
 * explanation overlays; existing v1.2.0 stroke data is retained unchanged.
 * Apple Pencil draws on the page itself. Solve mode restores native interaction.
 */
(()=>{'use strict';
  const DB='heon.archive.ink.v1', STORE='notes', W=1000;
  let dbPromise=null, active=null, loadToken=0, owner='guest', cloudTimer=null, cloudError='';
  let drawingMode=false, selectedTool='pen', penColor='#2457bb', perfect=null;
  import('https://cdn.jsdelivr.net/npm/perfect-freehand@1.2.3/dist/esm/index.mjs')
    .then(m=>{if(typeof m.getStroke==='function')perfect=m.getStroke;}).catch(()=>{});
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function db(){return dbPromise ||= new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){reject(Error('IndexedDB 미지원'));return;}
    const req=indexedDB.open(DB,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};
    req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result);
  });}
  async function storage(itemKey,value){
    const database=await db();return new Promise((resolve,reject)=>{
      const tx=database.transaction(STORE,value===undefined?'readonly':'readwrite');
      const req=value===undefined?tx.objectStore(STORE).get(itemKey):tx.objectStore(STORE).put(value,itemKey);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
  }
  const account=()=>window.HeonStudyAccount;
  const key=q=>`${owner}::${q}`;
  const empty=()=>({strokes:[],explanationStrokes:[],sizes:{},updatedAt:null});
  function fallback(points,opts){
    const size=opts.size||5,poly=[];
    if(!points.length)return poly;
    for(let i=0;i<points.length;i++){
      const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
      const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
      const radius=size*(.28+.26*(p[2]||.5));
      poly.push([p[0]-dy/len*radius,p[1]+dx/len*radius]);
    }
    for(let i=points.length-1;i>=0;i--){
      const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
      const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
      const radius=size*(.28+.26*(p[2]||.5));
      poly.push([p[0]+dy/len*radius,p[1]-dx/len*radius]);
    }
    return poly;
  }
  function outline(stroke){
    const opts={size:stroke.width||5,thinning:stroke.tool==='marker'?0:.5,
      smoothing:.55,streamline:.45,simulatePressure:false,last:true,start:{cap:true},end:{cap:true}};
    const pts=(stroke.points||[]).map(p=>[p[0],p[1],p[2]??.5]);
    try{return perfect?perfect(pts,opts):fallback(pts,opts);}catch(_){return fallback(pts,opts);}
  }
  function path(stroke){
    const shape=outline(stroke);
    if(!shape.length)return '';
    if(shape.length===1){const p=shape[0];return `M${p[0]-2},${p[1]}a2,2 0 1,0 4,0a2,2 0 1,0 -4,0`;}
    return 'M'+shape.map(p=>`${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')+'Z';
  }
  function asSvg(stroke){return `<path d="${path(stroke)}" fill="${esc(stroke.color||'#2457bb')}" opacity="${stroke.tool==='marker'?.27:1}"/>`;}
  function controls(q){
    return `<div class="ink-toolbar" role="toolbar" aria-label="문항 필기 도구" data-ink-tools="${esc(q)}">
      <button type="button" class="ink-mode-toggle" data-ink-action="mode" title="필기 모드 전환" aria-pressed="${drawingMode}">${drawingMode?'✓ 풀이모드':'✎ 필기모드'}</button>
      <div class="ink-tools" ${drawingMode?'':'hidden'}>
        <button type="button" data-ink-tool="pen" class="${selectedTool==='pen'?'active':''}" title="펜 (P)">✎ 펜</button>
        <button type="button" data-ink-tool="marker" class="${selectedTool==='marker'?'active':''}" title="형광펜 (H)">▰ 형광</button>
        <button type="button" data-ink-tool="erase" class="${selectedTool==='erase'?'active':''}" title="지우개 (E)" aria-label="지우개"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 15.5 14 22H7L2 17 14.8 4.2a2.8 2.8 0 0 1 4 0l1.7 1.7a2.8 2.8 0 0 1 0 4Z" transform="translate(-1 -1) scale(.95)"/><path d="m8 11 6 6M6 21h15"/></svg><span>지우개</span></button>
        <label class="ink-color-label" title="펜 색상"><input type="color" value="${esc(penColor)}" aria-label="펜 색상" data-ink-color></label>
        <button type="button" data-ink-action="undo" title="실행 취소 (Ctrl+Z)" aria-label="실행 취소">↶</button>
        <button type="button" data-ink-action="redo" title="다시 실행 (Ctrl+Shift+Z)" aria-label="다시 실행">↷</button>
      </div>
    </div>`;
  }
  // Kept as an empty compatibility hook; no separate writing area is rendered.
  function board(){return '';}
  async function getExport(q){
    if(active?.q===q && active.savePending)await active.savePending();
    const note=await storage(key(q)).catch(()=>null);
    if(!note)return null;
    const question=note.strokes||[],evidence=note.explanationStrokes||[];
    if(!question.length&&!evidence.length)return null;
    return {regions:{question:{width:W,height:note.sizes?.question?.height||1050,strokes:question},
      evidence:{width:W,height:note.sizes?.evidence?.height||1050,strokes:evidence}},
      width:W,height:note.sizes?.question?.height||1050,strokes:question};
  }
  function renderControls(){
    for(const t of document.querySelectorAll('.ink-toolbar')){
      const button=t.querySelector('[data-ink-action="mode"]');
      if(button){button.textContent=drawingMode?'✓ 풀이모드':'✎ 필기모드';button.setAttribute('aria-pressed',String(drawingMode));}
      const tools=t.querySelector('.ink-tools');if(tools)tools.hidden=!drawingMode;
      t.querySelectorAll('[data-ink-tool]').forEach(b=>b.classList.toggle('active',b.dataset.inkTool===selectedTool));
    }
    for(const region of active?.regions||[])region.layer.classList.toggle('is-writing',drawingMode);
    document.querySelector('.quiz-mode')?.classList.toggle('ink-writing-mode',drawingMode);
  }
  function useTool(value){if(!['pen','marker','erase'].includes(value))return;selectedTool=value;renderControls();}
  function toggleMode(){drawingMode=!drawingMode;renderControls();}
  async function attach(q){
    const token=++loadToken;
    const previous=active;
    if(previous?.controller)previous.controller.abort();
    if(previous?.savePending)await previous.savePending();
    if(token!==loadToken)return; // A newer question was opened while a save flushed.
    const controller=new AbortController(),signal=controller.signal;
    const data=empty(),history=[],redo=[];
    const session={q,data,controller,regions:[],history,redo,ready:false,savePending:null};active=session;
    const keyFor=key(q);
    const regionDefinitions=[['question',document.querySelector('.exam-panel')],['evidence',document.querySelector('.evidence-panel')]];
    let writeQueue=Promise.resolve(), saveTimer=0, frame=0;
    function queueSave(){
      data.updatedAt=new Date().toISOString();
      clearTimeout(saveTimer);
      saveTimer=setTimeout(()=>saveNow(),90);
    }
    function saveNow(){
      clearTimeout(saveTimer);saveTimer=0;
      const snapshot=structuredClone({strokes:data.strokes,explanationStrokes:data.explanationStrokes,sizes:data.sizes,updatedAt:data.updatedAt});
      writeQueue=writeQueue.catch(()=>{}).then(()=>storage(keyFor,snapshot));
      writeQueue.then(()=>scheduleCloud()).catch(err=>console.warn('필기 저장 실패',err));
      return writeQueue;
    }
    session.savePending=async()=>{if(saveTimer)await saveNow();return writeQueue.catch(()=>{});};
    function dataStrokes(name){return name==='question'?data.strokes:data.explanationStrokes;}
    function regionHeight(region){
      const h=Math.max(1,region.panel.scrollHeight-region.top);
      return Math.max(250,Math.round(h/Math.max(1,region.panel.clientWidth)*W));
    }
    function layout(region){
      const heading=region.panel.querySelector(region.name==='question'?'.question-header':'.evidence-head');
      region.top=heading?heading.offsetTop+heading.offsetHeight+8:0;
      const newHeight=regionHeight(region),current=data.sizes[region.name]?.height||newHeight;
      // Scale the saved vertical coordinates whenever content reflows to keep ink anchored proportionally.
      if(Math.abs(newHeight-current)>1){
        const ratio=newHeight/current;
        for(const stroke of dataStrokes(region.name))for(const p of stroke.points||[])p[1]*=ratio;
        data.sizes[region.name]={width:W,height:newHeight};queueSave();
        region.saved.innerHTML=dataStrokes(region.name).map(asSvg).join('');
      } else if(!data.sizes[region.name])data.sizes[region.name]={width:W,height:newHeight};
      region.layer.style.top=region.top+'px';
      region.layer.style.height=Math.max(1,region.panel.scrollHeight-region.top)+'px';
      region.svg.setAttribute('viewBox',`0 0 ${W} ${data.sizes[region.name].height}`);
    }
    function paint(region){region.saved.innerHTML=dataStrokes(region.name).map(asSvg).join('');}
    function pointerPos(e,region){
      const rect=region.svg.getBoundingClientRect(),height=data.sizes[region.name]?.height||1050;
      return [Math.max(0,Math.min(W,(e.clientX-rect.left)/rect.width*W)),
        Math.max(0,Math.min(height,(e.clientY-rect.top)/rect.height*height)),
        Math.max(.1,Math.min(1,e.pressure||.5))];
    }
    function pushHistory(name){history.push({name,strokes:JSON.stringify(dataStrokes(name))});if(history.length>40)history.shift();redo.length=0;}
    function refreshAll(){for(const region of session.regions)paint(region);}
    function undoAction(){
      if(!history.length)return;
      const old=history.pop(),current=dataStrokes(old.name);
      redo.push({name:old.name,strokes:JSON.stringify(current)});
      data[old.name==='question'?'strokes':'explanationStrokes']=JSON.parse(old.strokes);
      refreshAll();queueSave();
    }
    function redoAction(){
      if(!redo.length)return;
      const old=redo.pop(),current=dataStrokes(old.name);
      history.push({name:old.name,strokes:JSON.stringify(current)});
      data[old.name==='question'?'strokes':'explanationStrokes']=JSON.parse(old.strokes);
      refreshAll();queueSave();
    }
    for(const [name,panel] of regionDefinitions){
      if(!panel)continue;
      panel.classList.add('ink-overlay-parent');
      const layer=document.createElement('div');layer.className='ink-overlay';layer.setAttribute('data-ink-region',name);
      layer.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" class="ink-overlay-svg" preserveAspectRatio="none"><g class="ink-saved"></g><g class="ink-live"></g></svg>';
      panel.appendChild(layer);
      const svg=layer.querySelector('svg');
      const region={name,panel,layer,svg,saved:svg.querySelector('.ink-saved'),live:svg.querySelector('.ink-live'),drawing:null,finger:null,top:0};
      session.regions.push(region);layout(region);
      svg.addEventListener('pointerdown',e=>{
        if(!drawingMode||!session.ready)return;
        if(e.pointerType==='touch'){
          region.finger={y:e.clientY};svg.setPointerCapture?.(e.pointerId);e.preventDefault();return;
        }
        if(e.button!==0&&e.pointerType!=='pen')return;
        const point=pointerPos(e,region);e.preventDefault();
        if(selectedTool==='erase'){
          const strokes=dataStrokes(name);
          const idx=strokes.findLastIndex(s=>(s.points||[]).some(p=>Math.hypot(p[0]-point[0],p[1]-point[1])<19));
          if(idx>=0){pushHistory(name);strokes.splice(idx,1);paint(region);queueSave();}
          return;
        }
        pushHistory(name);
        region.drawing={tool:selectedTool==='marker'?'marker':'pen',color:selectedTool==='marker'?'#ecc345':penColor,
          width:selectedTool==='marker'?30:5,points:[point]};
        svg.setPointerCapture?.(e.pointerId);
      },{signal});
      svg.addEventListener('pointermove',e=>{
        if(region.finger&&e.pointerType==='touch'){
          region.panel.scrollTop+=region.finger.y-e.clientY;region.finger.y=e.clientY;e.preventDefault();return;
        }
        const drawing=region.drawing;if(!drawing)return;
        const events=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():[e];
        for(const ev of events){const point=pointerPos(ev,region),last=drawing.points.at(-1);
          if(drawing.points.length<7000&&Math.hypot(point[0]-last[0],point[1]-last[1])>=1.7)drawing.points.push(point);
        }
        if(!frame)frame=requestAnimationFrame(()=>{frame=0;for(const item of session.regions)item.live.innerHTML=item.drawing?asSvg(item.drawing):'';});
        e.preventDefault();
      },{signal});
      const finish=e=>{
        if(e.pointerType==='touch'){region.finger=null;return;}
        const drawing=region.drawing;if(!drawing)return;
        if(drawing.points.length===1){const p=drawing.points[0];drawing.points.push([p[0]+.5,p[1]+.5,p[2]]);}
        dataStrokes(name).push(drawing);region.drawing=null;region.live.innerHTML='';
        region.saved.insertAdjacentHTML('beforeend',asSvg(drawing));queueSave();
        try{if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);}catch(_){}
      };
      svg.addEventListener('pointerup',finish,{signal});svg.addEventListener('pointercancel',finish,{signal});
      // Images can expand explanation height after initial mount.
      panel.addEventListener('load',()=>requestAnimationFrame(()=>{if(active===session)layout(region);}),{capture:true,signal});
    }
    const app=document.getElementById('app');
    app?.addEventListener('click',e=>{
      const button=e.target.closest('[data-ink-action],[data-ink-tool]');if(!button||active!==session)return;
      if(button.dataset.inkTool){useTool(button.dataset.inkTool);return;}
      if(button.dataset.inkAction==='mode')toggleMode();
      if(button.dataset.inkAction==='undo')undoAction();
      if(button.dataset.inkAction==='redo')redoAction();
    },{signal});
    app?.addEventListener('input',e=>{
      if(e.target.matches('[data-ink-color]')){penColor=e.target.value;useTool('pen');}
    },{signal});
    document.addEventListener('keydown',e=>{
      if(active!==session||!drawingMode)return;
      if(e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
      const key=e.key.toLowerCase();
      if((e.ctrlKey||e.metaKey)&&key==='z'){
        e.preventDefault();e.shiftKey?redoAction():undoAction();return;
      }
      if(e.ctrlKey||e.altKey||e.metaKey)return;
      if(key==='p'||key==='h'||key==='e'){
        useTool({p:'pen',h:'marker',e:'erase'}[key]);e.preventDefault();
      }
    },{signal});
    window.addEventListener('resize',()=>{
      if(active!==session)return;
      for(const region of session.regions)layout(region);
    },{signal});
    try{
      const stored=await storage(keyFor);
      if(active!==session||token!==loadToken)return;
      if(stored){data.strokes=stored.strokes||[];data.explanationStrokes=stored.explanationStrokes||[];data.sizes=stored.sizes||{};data.updatedAt=stored.updatedAt||null;}
      for(const region of session.regions){layout(region);paint(region);}
      session.ready=true;renderControls();
    }catch(err){console.warn('필기를 불러오지 못했습니다',err);session.ready=false;}
  }
  function mount(){
    const q=document.querySelector('.exam-panel')?.dataset.questionId;
    if(!q){loadToken++;if(active?.controller)active.controller.abort();active?.savePending?.();active=null;return;}
    attach(q).catch(console.warn);
  }
  async function allLocal(ownerKey){
    const database=await db();return new Promise((resolve,reject)=>{
      const tx=database.transaction(STORE,'readonly'),req=tx.objectStore(STORE).openCursor(),out=[];
      req.onsuccess=()=>{const cursor=req.result;if(!cursor){resolve(out);return;}if(String(cursor.key).startsWith(ownerKey+'::'))out.push({q:String(cursor.key).slice(ownerKey.length+2),data:cursor.value});cursor.continue();};
      req.onerror=()=>reject(req.error);
    });
  }
  async function cloudSync(){
    const auth=account(),client=auth?.client,userId=auth?.userId;
    if(!auth?.active||!client||!userId)return;
    const currentOwner=owner;
    // Fetch first to avoid replacing more recent cloud strokes with an old device.
    const remote=[];
    for(let offset=0;;offset+=500){
      const {data,error}=await client.from('heon_ink_notes').select('question_id,payload,updated_at').range(offset,offset+499);
      if(error){cloudError=error.message;return;}
      remote.push(...(data||[]));if(!data||data.length<500)break;
    }
    if(owner!==currentOwner)return;
    const remoteMap=new Map(remote.map(row=>[row.question_id,row]));
    const notes=await allLocal(currentOwner).catch(()=>[]);
    const changes=[];let updatedActive=false;
    for(const note of notes){
      const r=remoteMap.get(note.q);
      const localTime=Date.parse(note.data.updatedAt||0)||0;
      const remoteTime=Date.parse(r?.updated_at||0)||0;
      if(remoteTime>localTime){await storage(currentOwner+'::'+note.q,r.payload);if(active?.q===note.q)updatedActive=true;}
      else if(!r||localTime>remoteTime)changes.push({user_id:userId,question_id:note.q,payload:note.data,updated_at:note.data.updatedAt||new Date().toISOString()});
      remoteMap.delete(note.q);
    }
    for(const row of remoteMap.values()){await storage(currentOwner+'::'+row.question_id,row.payload);if(active?.q===row.question_id)updatedActive=true;}
    for(let i=0;i<changes.length;i+=60){
      const {error}=await client.from('heon_ink_notes').upsert(changes.slice(i,i+60),{onConflict:'user_id,question_id'});
      if(error){cloudError=error.message;return;}
    }
    cloudError='';
    if(updatedActive&&active?.q&&owner===currentOwner)mount();
  }
  function scheduleCloud(){clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>cloudSync().catch(console.warn),2200);}
  function setAccount(){
    const auth=account(),next=auth?.active&&auth?.userId?auth.userId:'guest';
    if(owner!==next){
      const prior=owner;owner=next;mount();
      if(prior==='guest'&&next!=='guest'){
        const mark='heon.ink.guest.import.decision.'+next;
        if(!localStorage.getItem(mark)){
          allLocal('guest').then(async notes=>{
            if(!notes.length)return;
            const accept=window.confirm('로그인 전에 이 기기에 작성한 필기가 있습니다. 현재 계정의 필기로 가져오시겠습니까?');
            localStorage.setItem(mark,accept?'yes':'no');
            if(!accept)return;
            for(const note of notes){const dst=await storage(next+'::'+note.q);
              if(!dst||Date.parse(note.data.updatedAt||0)>Date.parse(dst.updatedAt||0))await storage(next+'::'+note.q,note.data);
            }
            scheduleCloud();if(active?.q)mount();
          }).catch(console.warn);
        }
      }
    }
    if(auth?.active)scheduleCloud();
  }
  window.HeonInk={controls,board,mount,getExport,setAccount,cloudSync,outline,get cloudError(){return cloudError;}};
  window.addEventListener('online',()=>scheduleCloud());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleCloud();});
})();
