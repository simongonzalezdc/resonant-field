(function(){
  'use strict';
  let material=null,current='document',blobKey='',localUrls=[],sharedUrls=[],paintedKey='',paintedEpoch=0,materialEpoch=0;
  const retiredUrls=new Map();
  function retire(urls){if(!urls.length)return;const id=setTimeout(()=>{urls.forEach(u=>URL.revokeObjectURL(u));retiredUrls.delete(id)},5000);retiredUrls.set(id,urls);while(retiredUrls.size>1){const [timer,old]=retiredUrls.entries().next().value;clearTimeout(timer);old.forEach(u=>URL.revokeObjectURL(u));retiredUrls.delete(timer);}}
  const urlsIdentical=(a,b)=>a.length===b.length&&a.every((u,i)=>u===b[i]);
  function sharedSamplesGate(origin,list){
    if(origin===''||origin==='null')return null;
    if(!Array.isArray(list)||!list.length||!list.every(u=>typeof u==='string'))return null;
    try{if(!list.every(u=>{const parsed=new URL(u);return parsed.protocol==='blob:'&&parsed.origin===origin;}))return null;}
    catch{return null;}
    return list.slice();
  }
  const activeUrls=()=>sharedUrls.length?sharedUrls:localUrls;
  window.ResonantBlackboardMaterialResources={inspect:()=>({activeUrls:sharedUrls.length+localUrls.length,sharedUrls:sharedUrls.length,ownedUrls:localUrls.length,sharedMode:sharedUrls.length>0,retiredBatches:retiredUrls.size,paintedKey,paintedEpoch,materialEpoch})};
  const setCss=(e,k,v,p='')=>{if(e.style.getPropertyValue(k)!==v||e.style.getPropertyPriority(k)!==p)e.style.setProperty(k,v,p)};
  const surface=document.getElementById('blackboard-surface');
  function tell(action,extra={}){parent.postMessage({kind:'compound-board-result',action,...extra},location.origin);}
  function materialPaint(){
    if(!material)return;
    const {snapshot,offset}=material;
    document.querySelectorAll('[data-volume-rendered],.rv-semantic-host').forEach(e=>{
      const depth=Number(e.dataset.volumeDepth),r=e.getBoundingClientRect();
      const ink=snapshot.scene?.readability?.[depth]?.ink;
      if(ink&&!snapshot.appearance.solid){setCss(e,'--color-text',ink);setCss(e,'--color-text-secondary',ink);setCss(e,'color',ink,'important');e.dataset.volumeInkOwner='shared-parent-scene';}
      else if(e.dataset.volumeInkOwner==='shared-parent-scene'){for(const name of ['--color-text','--color-text-secondary','color'])e.style.removeProperty(name);delete e.dataset.volumeInkOwner;}
      if(snapshot.appearance.solid || matchMedia('(forced-colors:active)').matches || matchMedia('(prefers-reduced-transparency:reduce)').matches){e.style.removeProperty('background-image');e.style.removeProperty('background-color');return;}
      if(!snapshot.samples[depth]||!snapshot.scene)return;
      setCss(e,'background-image','url("'+snapshot.samples[depth]+'")','important');
      setCss(e,'background-size',snapshot.scene.width+'px '+snapshot.scene.height+'px','important');
      setCss(e,'background-position',(offset.x-r.left)+'px '+(offset.y-r.top)+'px','important');
      setCss(e,'background-repeat','no-repeat','important');
      e.dataset.volumeBackgroundOwner='shared-parent-scene';
      e.querySelectorAll(':scope>.rv-surface').forEach(f=>f.style.display='none');
    });
  }
  function stamp(){
    document.body.dataset.volumeRole='workplane';document.body.dataset.cornerRole='joined';
    document.querySelectorAll('#blackboard-toolbar').forEach(e=>{e.dataset.volumeRole='workplane';e.dataset.cornerRole='joined';});
    document.querySelector('.compound-frame-foot').dataset.volumeRole='context';document.querySelector('.compound-frame-foot').dataset.cornerRole='joined';
    surface.dataset.volumeRole='workplane';surface.dataset.cornerRole='joined';
    document.querySelectorAll('#bb-document-wrap,#bb-table-wrap,#bb-present-wrap,#bb-image-wrap,#bb-canvas-wrap').forEach(e=>{e.dataset.volumeRole='reading';e.dataset.cornerRole='joined';});
    document.querySelectorAll('button').forEach(e=>{e.dataset.volumeRole='control';e.dataset.volumeBaseState=e.classList.contains('active')?'selected':'resting';});
    window.ResonantVolume.mount(document);
    document.querySelectorAll('[data-volume-role]').forEach(e=>window.ResonantVolume.setState(e,e.dataset.volumeBaseState||'resting'));
    document.querySelectorAll('button').forEach(e=>{
      if(e.dataset.compoundBound)return;e.dataset.compoundBound='true';
      for(const [type,state] of [['pointerenter','hover'],['pointerdown','pressed'],['focus','focus'],['pointerleave',null],['blur',null]])e.addEventListener(type,()=>{if(!e.disabled){ResonantVolume.setState(e,state||e.dataset.volumeBaseState);materialPaint();}});
    });
    materialPaint();
    ResonantGeometry.refresh();
  }
  function show(mode){
    if(!['canvas','document','table','image','present','annotate'].includes(mode))return;
    current=mode;
    const ink=getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim()||'#d9e5de';
    const fixtures={
      document:{command:'document',payload:{markdown:'# A shared foundation.\nRoom to make it yours.\n\nConversations, documents and review share one work surface. Sources remain visible and decisions stay explicit.\n\n## Keep the foundation\n\n**ROSI** supplies familiar atom definitions, semantic roles, and native control conventions. Its pinned guide and tokens are an implementation reference.\n\n## Extend the material\n\n**Resonant Field** adds five related material paths. Reading wells recede; actionable controls rise; the final review action occupies the fifth level. Color, coverage, and diffusion accumulate beneath sharp text.\n\n> Different depth describes the work. It does not grant trust, permission, or approval.\n\n## Keep the boundaries visible\n\n- Blackboard: preserved experimental renderer\n- Augmentor: local conversation and explicit source labels\n- Review: editable draft and local human decision\n\nThis combined view is an implemented design prototype. No extension host or provider is connected.'}},
      canvas:{command:'draw',payload:{shapes:[{type:'text',x:62,y:74,text:'SOURCE → VISUAL WORK → HUMAN DECISION',fontSize:18,color:ink},{type:'rect',x:70,y:160,w:185,h:110,label:'Source',color:ink,fill:false},{type:'arrow',x1:265,y1:215,x2:345,y2:215,color:ink},{type:'rect',x:355,y:160,w:185,h:110,label:'Blackboard',color:ink,fill:false},{type:'arrow',x1:550,y1:215,x2:630,y2:215,color:ink},{type:'rect',x:640,y:160,w:185,h:110,label:'Review',color:ink,fill:false},{type:'text',x:70,y:330,text:'A local diagram, drawn by the preserved Blackboard renderer.',fontSize:14,color:ink}]}},
      table:{command:'table',payload:{title:'Foundation / extension boundary',headers:['Surface','Foundation','Extension'],rows:[['Augmentor','Control and source semantics','Contextual material'],['Blackboard','Document / canvas renderer','Shared material setting'],['Review','Human decision stays explicit','Raised decision and review action']]}},
      image:{command:'image',payload:{src:document.getElementById('compoundSampleImage').src,alt:'Local Blackboard illustration. Content colors are illustration content, separate from pane colors.'}},
      present:{command:'present',payload:{slides:[{title:'01 · Foundation',content:'## Keep ROSI atoms\n\nNative controls. Explicit source labels. Stable semantic roles.'},{title:'02 · Extension',content:'## Add Resonant Field material\n\nOne shared setting. Five cumulative paths. Component and state hierarchy.'},{title:'03 · Boundary',content:'## A local prototype\n\nThe renderer is real. Host/provider integration remains unconnected.'}]}},
      annotate:{command:'annotate',payload:{annotations:[{type:'label',x:80,y:90,text:'LOCAL ANNOTATION EXAMPLE',color:ink,fontSize:22}]}}
    };
    const f=fixtures[mode];window.__resonantBlackboardTest.send(f.command,f.payload);stamp();tell('mode',{mode});
  }
  function init(){
    document.querySelector('[data-mode=embed]').disabled=true;
    document.querySelector('[data-mode=embed]').title='Remote embeds require the extension host; unavailable here';
    document.getElementById('bb-send-to-augmentor').disabled=true;
    document.querySelectorAll('.bb-mode-tabs button').forEach(e=>e.addEventListener('click',()=>show(e.dataset.mode)));
    document.getElementById('bb-clear').addEventListener('click',stamp);
    surface.addEventListener('click',()=>setTimeout(stamp,0));
    surface.addEventListener('scroll',materialPaint,{passive:true});
    show(current);tell('ready');
  }
  addEventListener('message',e=>{
    if(e.origin!==location.origin||e.source!==parent||e.data?.kind!=='compound-board')return;
    const d=e.data;
    if(d.action==='hello' && window.__resonantBlackboardTest){tell('ready');tell('mode',{mode:current});}
    if(d.action==='reveal-depth'){if(Number.isInteger(d.depth)&&d.depth>=0&&d.depth<=4)document.documentElement.dataset.revealDepth=String(d.depth);else delete document.documentElement.dataset.revealDepth;}
    if(d.action==='geometry'){ResonantGeometry.configure(d.cornerProfile);if(material)material.cornerProfile=d.cornerProfile;}
    if(d.action==='material'){
      const shared=sharedSamplesGate(location.origin,d.snapshot.samples);
      if(shared){
        if(!urlsIdentical(shared,sharedUrls)){retire(localUrls);localUrls=[];sharedUrls=shared;}
        blobKey=d.snapshot.key;
      }else if(d.snapshot.blobs?.length && (d.snapshot.key!==blobKey || !localUrls.length)){
        const old=localUrls;localUrls=d.snapshot.blobs.map(b=>URL.createObjectURL(b));blobKey=d.snapshot.key;sharedUrls=[];retire(old);
      }
      if(d.snapshot.appearance.solid)sharedUrls=[];
      const active=activeUrls();
      if(active.length)d.snapshot.samples=active;
      material=d;const root=document.documentElement;
      root.dataset.mode=d.snapshot.appearance.mode;root.dataset.solid=String(d.snapshot.appearance.solid);
      for(const [k,v] of Object.entries(d.tokens||{}))if(/^--(?:color|material|tone|accent)-/.test(k))root.style.setProperty(k,String(v));
      ResonantGeometry.configure(d.cornerProfile);
      ResonantVolume.configure(d.snapshot.appearance);materialPaint();
      const epoch=Number.isInteger(d.epoch)?d.epoch:0;materialEpoch=epoch;
      const decodePending=d.snapshot.appearance.solid?[]:activeUrls();
      const decoded=Promise.all(decodePending.map(src=>{const image=new Image();image.src=src;return image.decode().finally(()=>image.removeAttribute('src'));}));
      decoded.then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{if(epoch!==materialEpoch)return;paintedKey=d.snapshot.key;paintedEpoch=epoch;tell('material-painted',{key:paintedKey,epoch});}))).catch(()=>tell('material-error',{epoch,message:'Shared material image could not be decoded'}));
    }
    if(d.action==='reload')show(current);
    if(d.action==='capture'){const body=surface.innerText.trim();tell('capture',{text:body||'Local Blackboard '+current+' visual example attached as a reference. No image or provider data was sent.'});}
  });
  addEventListener('resize',materialPaint);
  addEventListener('pagehide',e=>{if(!e.persisted){localUrls.forEach(u=>URL.revokeObjectURL(u));localUrls=[];sharedUrls=[];retiredUrls.forEach((urls,t)=>{clearTimeout(t);urls.forEach(u=>URL.revokeObjectURL(u))});retiredUrls.clear();}});
  addEventListener('resonant-volume-rendered',materialPaint);
  addEventListener('blackboard:preview-ready',init,{once:true});
  if(window.__resonantBlackboardTest)init();
})();
