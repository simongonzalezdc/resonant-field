(function(global){
  'use strict';
  const stops=[{name:'Precise',scale:.25},{name:'Crisp',scale:.5},{name:'Balanced',scale:1},{name:'Soft',scale:1.5},{name:'Round',scale:2}];
  const factors={joined:0,badge:.5,control:1,field:1,inset:1.5,frame:2,overlay:3};
  const indexOf=value=>Math.max(0,Math.min(4,Math.round(Number.isFinite(Number(value))?Number(value):2)));
  function resolve(role,index=2,width=Infinity,height=Infinity,parentRadius=null,inset=0,{edgeFollowing=false}={}){
    const stop=stops[indexOf(index)],factor=factors[role]??factors.control;
    const short=Math.max(0,Math.min(width,height));
    let radius=role==='circle'?short/2:Math.min(8*stop.scale*factor,short/2);
    if(edgeFollowing===true && parentRadius!==null)radius=Math.min(radius,Math.max(0,parentRadius-inset));
    return Number(radius.toFixed(3));
  }
  const doc=global.document;let index=2,pending=0;
  function excluded(e){return Boolean(e.closest('.aug-source-panel,#sourcePaper,#proposalBaselines'));}
  function roleFor(e){
    if(e.dataset.cornerRole)return e.dataset.cornerRole;
    if(e.matches('.icon-button,.aug-icon-button,.compound-icon'))return 'circle';
    if(e.matches('.tag,.badge,.compound-badge'))return 'badge';
    if(e.matches('dialog,[data-volume-role=overlay]'))return 'overlay';
    if(e.matches('input,select,textarea'))return 'field';
    if(e.matches('button,summary,[role=button]'))return 'control';
    if(e.matches('[data-volume-role=reading],[data-volume-role=editor],[data-volume-role=context],.compound-editor-well'))return 'inset';
    return 'frame';
  }
  function apply(){
    if(!doc)return;
    const root=doc.documentElement;root.style.setProperty('--corner-unit',String(8*stops[index].scale)+'px');root.dataset.cornerProfile=String(index);
    const selector='[data-volume-role],button,select,textarea,input[type=text],.tag,.badge,.compound-badge,.compound-editor-well,.optical-sample,.sample-card';
    const measures=[];
    for(const e of doc.querySelectorAll(selector)){
      if(excluded(e)||e.matches('input[type=range],input[type=checkbox],input[type=file],svg'))continue;
      const w=e.offsetWidth,h=e.offsetHeight;if(!w||!h)continue;
      const role=roleFor(e),edgeFollowing=e.dataset.cornerEdgeFollowing==='true';
      const parent=edgeFollowing?e.parentElement.closest('[data-corner-radius]'):null;
      measures.push({e,w,h,role,edgeFollowing,parent,rect:parent?e.getBoundingClientRect():null,parentRect:parent?parent.getBoundingClientRect():null});
    }
    // New ancestors have no radius attribute until the write phase.
    const measured=new Set(measures.map(m=>m.e));
    for(const m of measures)if(m.edgeFollowing){
      let parent=m.e.parentElement;
      while(parent && !measured.has(parent) && !parent.hasAttribute('data-corner-radius'))parent=parent.parentElement;
      m.parent=parent;m.rect=parent?m.e.getBoundingClientRect():null;m.parentRect=parent?parent.getBoundingClientRect():null;
    }
    const radii=new Map(),updates=[];
    for(const m of measures){
      const {e,w,h,role,edgeFollowing,parent,rect:a,parentRect:b}=m;
      const parentRadius=parent?(radii.get(parent)??Number(parent.dataset.cornerRadius)):null;
      const inset=parent?Math.max(0,Math.min(a.left-b.left,a.top-b.top,b.right-a.right,b.bottom-a.bottom)):0;
      const radius=resolve(role,index,w,h,parentRadius,inset,{edgeFollowing});radii.set(e,radius);updates.push({e,role,radius});
    }
    for(const {e,role,radius} of updates){
      const value=radius+'px';
      if(e.dataset.cornerKind!==role)e.dataset.cornerKind=role;
      if(e.dataset.cornerRadius!==String(radius))e.dataset.cornerRadius=String(radius);
      if(e.dataset.cornerOwner!=='harmonic-geometry')e.dataset.cornerOwner='harmonic-geometry';
      if(e.style.getPropertyValue('border-radius')!==value)e.style.setProperty('border-radius',value,'important');
    }
  }
  function schedule(){if(pending||!doc)return;pending=global.requestAnimationFrame(()=>{pending=0;apply();});}
  function configure(value){const next=indexOf(value);if(next===index)schedule();else{index=next;apply();}return stops[index];}
  const api={resolve,configure,refresh:schedule,stops,factors,inspect:()=>({index,name:stops[index].name,unit:8*stops[index].scale,factors})};
  global.ResonantGeometry=api;if(typeof module==='object'&&module.exports)module.exports=api;
  if(doc){global.addEventListener('resize',schedule);global.addEventListener('resonant-volume-rendered',schedule);doc.addEventListener('DOMContentLoaded',schedule,{once:true});}
})(typeof window==='undefined'?globalThis:window);
