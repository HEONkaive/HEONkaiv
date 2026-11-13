/* HEON ARCHIVE v1.2.0 — per-question stylus notes.
 * Local-first IndexedDB. Saved strokes are vector geometry, not screenshots.
 * Perfect Freehand v1.2.3 is loaded opportunistically as an ESM module;
 * a local pressure-aware polygon renderer remains available offline.
 */
(()=>{'use strict';
  const DB='heon.archive.ink.v1', STORE='notes', W=1000, H=1050;
  let dbPromise=null, active=null, loadToken=0, owner='guest', cloudTimer=null, cloudError='';
  let perfect=null;
  import('https://cdn.jsdelivr.net/npm/perfect-freehand@1.2.3/dist/esm/index.mjs')
    .then(m=>{if(typeof m.getStroke==='function')perfect=m.getStroke;}).catch(()=>{});
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function db(){return dbPromise ||= new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){reject(Error('IndexedDB 미지원'));return;}
    const req=indexedDB.open(DB,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};
    req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result);
  });}
  async function storage(key,value){
    const database=await db();return new Promise((resolve,reject)=>{
      const tx=database.transaction(STORE,value===undefined?'readonly':'readwrite');
      const req=value===undefined?tx.objectStore(STORE).get(key):tx.objectStore(STORE).put(value,key);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
  }
  const account=()=>window.HeonStudyAccount;
  const key=q=>`${owner}::${q}`;
  function empty(){return {strokes:[],updatedAt:null};}
  function fallback(points,opts){
    const size=opts.size||5, poly=[];
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
    const points=(stroke.points||[]).map(p=>[p[0],p[1],p[2]??.5]);
    try{return perfect?perfect(points,opts):fallback(points,opts);}catch(_){return fallback(points,opts);}
  }
  function path(stroke){
    const shape=outline(stroke);
    if(!shape.length)return '';
    if(shape.length===1){const p=shape[0];return `M${p[0]-2},${p[1]}a2,2 0 1,0 4,0a2,2 0 1,0 -4,0`;}
    return 'M'+shape.map(p=>`${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')+'Z';
  }
  function asSvg(stroke){
    return `<path d="${path(stroke)}" fill="${esc(stroke.color||'#2457bb')}" opacity="${stroke.tool==='marker'?.27:1}"/>`;
  }
  function controls(questionId){
    return `<div class="ink-tools" role="toolbar" aria-label="필기 도구" data-ink-tools="${esc(questionId)}">
      <button type="button" data-ink-tool="pen" class="active" title="펜">✎ 펜</button>
      <button type="button" data-ink-tool="marker" title="형광펜">▰ 형광</button>
      <button type="button" data-ink-tool="erase" title="획 지우개">⌫</button>
      <button type="button" data-ink-tool="hand" title="손가락 이동">✋</button>
      <input type="color" value="#2457bb" aria-label="펜 색상" data-ink-color>
      <button type="button" data-ink-action="undo" title="실행 취소">↶</button>
      <button type="button" data-ink-action="redo" title="다시 실행">↷</button>
      <button type="button" data-ink-action="expand" title="필기 여백 확대">⛶</button>
    </div>`;
  }
  function board(questionId){
    return `<section class="ink-section" data-ink-question="${esc(questionId)}" aria-label="문항별 필기 여백">
      <div class="ink-title"><strong>✎ 내 필기 여백</strong><span>애플펜슬로 작성 · 자동 저장</span><button type="button" data-ink-action="expand">확대 ⛶</button></div>
      <div class="ink-paper"><svg class="ink-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-label="필기 입력 영역"><g class="ink-saved"></g><g class="ink-live"></g></svg></div>
      <small class="ink-status" aria-live="polite">준비 중…</small>
    </section>`;
  }
  function sessionData(){return active?.data||null;}
  async function getExport(q){
    const data=await storage(key(q)).catch(()=>null);
    return data?.strokes?.length?{width:W,height:H,strokes:data.strokes}:null;
  }
  function attach(container){
    const q=container?.dataset.inkQuestion;
    if(!q)return;
    const token=++loadToken;
    if(active?.controller)active.controller.abort();
    const controller=new AbortController(),signal=controller.signal;
    const svg=container.querySelector('.ink-svg'),saved=svg.querySelector('.ink-saved'),live=svg.querySelector('.ink-live');
    const storedKey=key(q),data=empty(),undo=[],redo=[];
    active={q,container,controller,data,undo,redo};
    let tool='pen',color='#2457bb',drawing=null,frame=0,saving=null;
    const status=container.querySelector('.ink-status');
    const refresh=()=>{saved.innerHTML=data.strokes.map(asSvg).join('');};
    const schedule=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;live.innerHTML=drawing?asSvg(drawing):'';});};
    const persist=()=>{
      data.updatedAt=new Date().toISOString();
      if(saving)clearTimeout(saving);
      saving=setTimeout(async()=>{
        try{await storage(storedKey,{strokes:data.strokes,updatedAt:data.updatedAt});status.textContent='✓ 이 기기에 저장됨';scheduleCloud(q);}
        catch(e){status.textContent='저장 실패 · 브라우저 저장 공간 확인';console.warn(e);}
      },180);
    };
    const putAction=()=>{undo.push(JSON.stringify(data.strokes));if(undo.length>45)undo.shift();redo.length=0;};
    function pos(e){const r=svg.getBoundingClientRect();return [Math.max(0,Math.min(W,Math.round((e.clientX-r.left)/r.width*W*10)/10)),Math.max(0,Math.min(H,Math.round((e.clientY-r.top)/r.height*H*10)/10)),Math.round((e.pressure||.5)*100)/100];}
    function eraseAt(p){
      const index=data.strokes.findLastIndex(s=>(s.points||[]).some(t=>Math.hypot(t[0]-p[0],t[1]-p[1])<18));
      if(index>=0){putAction();data.strokes.splice(index,1);refresh();persist();}
    }
    svg.addEventListener('pointerdown',e=>{
      if(e.pointerType==='touch'||tool==='hand')return;
      if(e.button!==0 && e.pointerType!=='pen')return;
      const p=pos(e);e.preventDefault();
      if(tool==='erase'){eraseAt(p);return;}
      putAction();drawing={tool:tool==='marker'?'marker':'pen',color:tool==='marker'?'#ecc345':color,width:tool==='marker'?30:5,points:[p]};
      svg.setPointerCapture?.(e.pointerId);schedule();
    },{signal});
    svg.addEventListener('pointermove',e=>{
      if(!drawing)return;
      e.preventDefault();
      const events=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():[e];
      for(const ev of events){const p=pos(ev),last=drawing.points.at(-1);if(drawing.points.length<2800&&Math.hypot(p[0]-last[0],p[1]-last[1])>=2.0)drawing.points.push(p);}
      schedule();
    },{signal});
    const finish=e=>{
      if(!drawing)return;
      if(drawing.points.length===1){const [x,y,p]=drawing.points[0];drawing.points.push([x+.5,y+.5,p]);}
      const ended=drawing;data.strokes.push(ended);drawing=null;schedule();
      saved.insertAdjacentHTML('beforeend',asSvg(ended));persist();
      try{if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);}catch(_){}
    };
    svg.addEventListener('pointerup',finish,{signal});svg.addEventListener('pointercancel',finish,{signal});
    // Pen can draw without disabling native one-finger scrolling across the rest of the page.
    let finger=null;
    svg.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')finger={y:e.clientY,scroll:container.closest('.exam-panel')||document.scrollingElement};},{signal});
    svg.addEventListener('pointermove',e=>{if(e.pointerType==='touch'&&finger){const delta=finger.y-e.clientY;finger.scroll.scrollTop+=delta;finger.y=e.clientY;}},{signal});
    svg.addEventListener('pointerup',e=>{if(e.pointerType==='touch')finger=null;},{signal});
    function changeTool(next){tool=next;document.querySelectorAll('[data-ink-tool]').forEach(b=>b.classList.toggle('active',b.dataset.inkTool===tool));}
    for(const toolbar of document.querySelectorAll(`[data-ink-tools="${CSS.escape(q)}"]`)){
      toolbar.querySelectorAll('[data-ink-tool]').forEach(b=>b.addEventListener('click',()=>changeTool(b.dataset.inkTool),{signal}));
      toolbar.querySelector('[data-ink-color]')?.addEventListener('input',e=>{color=e.target.value;changeTool('pen');},{signal});
    }
    // Listener is on the closest app root, with AbortController to avoid duplicate events.
    document.getElementById('app')?.addEventListener('click',e=>{
      const b=e.target.closest('[data-ink-action]');if(!b||!active||active.q!==q)return;
      const action=b.dataset.inkAction;
      if(action==='expand'){container.classList.toggle('ink-expanded');b.setAttribute('aria-pressed',container.classList.contains('ink-expanded'));return;}
      if(action==='undo'&&undo.length){redo.push(JSON.stringify(data.strokes));data.strokes=JSON.parse(undo.pop());refresh();persist();}
      if(action==='redo'&&redo.length){undo.push(JSON.stringify(data.strokes));data.strokes=JSON.parse(redo.pop());refresh();persist();}
    },{signal});
    storage(storedKey).then(found=>{
      if(loadToken!==token)return;
      if(found?.strokes){data.strokes=found.strokes;data.updatedAt=found.updatedAt;refresh();}
      status.textContent='필기 준비 완료 · 문항별 저장';
    }).catch(err=>{status.textContent='IndexedDB를 사용할 수 없습니다';console.warn(err);});
  }
  function mount(){const el=document.querySelector('.ink-section');if(el)attach(el);else {loadToken++;if(active?.controller)active.controller.abort();active=null;}}
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
