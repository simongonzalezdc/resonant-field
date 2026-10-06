import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(process.env.RESONANT_PLAYWRIGHT_ROOT ? path.join(process.env.RESONANT_PLAYWRIGHT_ROOT,'package.json') : new URL('./package.json',import.meta.url));
const {chromium}=require('playwright');
const root=path.resolve(process.argv[2]||'.');
const receipt=path.resolve(process.argv[3]||'.verification-output/navigation.json');
await mkdir(path.dirname(receipt),{recursive:true});
const server=spawn('python3',['-u','-c',"import http.server,functools,sys;s=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=sys.argv[1]));print(s.server_port,flush=True);s.serve_forever()",root],{stdio:['ignore','pipe','ignore']});
const out={passed:false,transitions:[],errors:[],checks:[]};let browser;
const routes={workspace:'[data-surface="workspace"]',combined:'[data-surface="combined"]',augmentor:'[data-surface="augmentor"]',proposal:'#readProposal',library:'#appLibrary'};
try{
 const port=await new Promise((resolve,reject)=>{server.stdout.once('data',b=>resolve(Number(b.toString().trim())));server.once('error',reject);});
 browser=await chromium.launch({headless:true,executablePath:process.env.RESONANT_CHROMIUM_EXECUTABLE,args:['--disable-dev-shm-usage']});
 const page=await browser.newPage();page.on('pageerror',e=>out.errors.push(String(e)));
 await page.addInitScript(()=>{window.__fullRenders=0;document.addEventListener('click',e=>window.__lastNavClick=e.target.closest('button')?.id||e.target.closest('button')?.dataset.surface);addEventListener('resonant-volume-rendered',e=>{if(!e.detail?.target)window.__fullRenders++;});});
 const url=`http://127.0.0.1:${port}/proposal/resonant-field-proposal.html?fieldVideo=1#app`;
 await page.goto(url,{waitUntil:'networkidle'});
 const settled=async()=>{await page.waitForFunction(()=>ResonantWorldSampler.isCurrent(),{},{timeout:15000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const go=async route=>{await page.locator('#appHeader '+routes[route]).click();await settled();};
 await settled();
 for(const width of [320,390,768,1024,1440]){
  await page.setViewportSize({width,height:1000});await settled();
  for(const from of Object.keys(routes)){
   await go(from);
   for(const to of Object.keys(routes).filter(r=>r!==from)){
    await go(from);const before=await page.evaluate(()=>({renders:__fullRenders,generation:ResonantWorldSampler.inspect().generation}));
    await go(to);
    const row=await page.evaluate(()=>{
     const nav=document.querySelector('#appHeader .surface-nav');const active=[...nav.querySelectorAll('[aria-current="page"]')];
     const navRect=nav.getBoundingClientRect();
     return {lastClick:window.__lastNavClick,hash:location.hash,view:document.documentElement.dataset.view,surface:document.documentElement.dataset.surface,active:active.map(e=>e.id||e.dataset.surface),pressed:nav.querySelectorAll('[aria-pressed="true"]').length,headerVisible:!!document.querySelector('#appHeader').getClientRects().length,overflow:document.documentElement.scrollWidth>innerWidth+1,navVisible:navRect.left>=0&&navRect.right<=innerWidth+1,fullRenders:__fullRenders,generation:ResonantWorldSampler.inspect().generation,encoded:ResonantWorldSampler.inspect().scene.encodedWidth};
    });
    assert.equal(row.view,['proposal','library'].includes(to)?to:'app');if(row.view==='app')assert.equal(row.surface,to,JSON.stringify({width,from,to,row}));
    assert.equal(row.active.length,1);assert.equal(row.active[0],to==='proposal'?'readProposal':to==='library'?'appLibrary':to);
    assert.equal(row.pressed,1);assert.ok(row.headerVisible&&row.navVisible&&!row.overflow);
    assert.equal(row.generation,before.generation);assert.equal(row.encoded,1);
    assert.ok(row.fullRenders-before.renders<=1,'Duplicate navigation render');
    out.transitions.push({width,from,to,fullRenders:row.fullRenders-before.renders});
   }
  }
 }
 out.checks.push('100 directed transitions; one active destination, stable plain scene, at most one full render');
 const radius=await page.evaluate(async()=>{const parent=document.createElement('div');parent.dataset.cornerRole='frame';parent.dataset.volumeRole='workplane';parent.style.cssText='position:absolute;left:0;top:0;width:100px;height:60px;padding:12px;box-sizing:border-box;opacity:0;pointer-events:none';const child=document.createElement('button');child.dataset.cornerEdgeFollowing='true';child.style.cssText='width:50px;height:20px;min-height:0;padding:0;margin:0;display:block';parent.append(child);document.body.append(parent);ResonantGeometry.configure(2);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const result=Number(child.dataset.cornerRadius);parent.remove();return result;});assert.equal(radius,4);out.checks.push('New nested corners follow the first measured parent radius');
 await page.setViewportSize({width:1440,height:1000});await go('workspace');await go('combined');await go('augmentor');
 await page.goBack();await settled();assert.equal(await page.evaluate(()=>document.documentElement.dataset.surface),'combined');
 await page.goForward();await settled();assert.equal(await page.evaluate(()=>document.documentElement.dataset.surface),'augmentor');
 await page.locator('#appHeader .brand').click();await settled();assert.equal(await page.evaluate(()=>document.documentElement.dataset.surface),'augmentor');
 out.checks.push('Back, Forward, and brand retain the selected surface');
 await page.evaluate(()=>{for(const selector of ['#readProposal','#appLibrary','[data-surface="combined"]','[data-surface="workspace"]','[data-surface="augmentor"]'])document.querySelector('#appHeader '+selector).click();});await settled();assert.equal(await page.evaluate(()=>document.documentElement.dataset.surface),'augmentor');assert.equal(await page.locator('#appHeader [aria-current="page"]').count(),1);
 out.checks.push('Rapid navigation settles on the final selected route');
 const inner=await page.locator('#augThread').evaluate(e=>{e.scrollTop=150;return e.scrollTop;});
 await go('proposal');await page.evaluate(()=>window.scrollTo({top:800,behavior:'instant'}));await page.waitForTimeout(60);
 const proposalScroll=await page.evaluate(()=>scrollY);await go('library');await go('proposal');assert.equal(await page.evaluate(()=>scrollY),proposalScroll);
 await go('augmentor');assert.equal(await page.locator('#augThread').evaluate(e=>e.scrollTop),inner);
 out.checks.push('Document and inner thread scroll survive navigation');
 for(const route of Object.keys(routes)){
  await go(route);await page.locator('#appearanceOpen').click();await page.waitForSelector('#appearance[open]');await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#appearance').open);
 }
 out.checks.push('Shared Appearance control works from all five destinations');
 await go('proposal');await page.locator('#openAtomicComparison').click();assert.ok(await page.locator('#atomicComparison').evaluate(e=>e.getBoundingClientRect().top<innerHeight&&e.getBoundingClientRect().top>=document.querySelector('#appHeader').getBoundingClientRect().bottom));
 out.checks.push('ROSI comparison remains accessible below the persistent header');
 await go('library');await page.locator('.library-index a[href="#libraryType"]').click();await settled();assert.ok(await page.locator('#libraryType').evaluate(e=>e.getBoundingClientRect().top>=document.querySelector('#appHeader').getBoundingClientRect().bottom));out.checks.push('Library anchors remain visible below the persistent header');
 await go('workspace');await page.locator('#appearanceOpen').click();await page.locator('.plate-disclosure > summary').click();await page.locator('#plateGrid [data-plate="animal-kingfisher"]').click();await settled();await page.keyboard.press('Escape');await settled();
 const photo=await page.evaluate(()=>ResonantWorldSampler.inspect().scene);assert.ok(photo.encodedWidth>1&&photo.encodedHeight>1);
 const photoGeneration=await page.evaluate(()=>ResonantWorldSampler.inspect().generation);
 await go('proposal');await page.waitForTimeout(5500);await go('workspace');
 const valid=await page.evaluate(async()=>{const s=ResonantWorldSampler.snapshot();const images=await Promise.all(s.samples.map(src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i.naturalWidth>1);i.onerror=()=>resolve(false);i.src=src;})));return images.every(Boolean)&&s.current;});assert.ok(valid);
 assert.equal(await page.evaluate(()=>ResonantWorldSampler.inspect().generation),photoGeneration+1);
 const cached=await page.evaluate(()=>ResonantWorldSampler.inspect().resources);assert.ok(cached.cacheHits>0&&cached.cachedScenes<=3&&cached.activeUrls+cached.cachedUrls<=18);
 out.checks.push('Photo samples retain full dimensions and valid URLs after delayed cached return; three-scene bound');
 await page.screenshot({path:receipt+'.desktop.png'});await page.setViewportSize({width:390,height:900});await settled();await page.screenshot({path:receipt+'.mobile.png'});
 const release=await page.evaluate(()=>{ResonantWorldSampler.release();return ResonantWorldSampler.inspect().resources;});assert.equal(release.activeUrls,0);assert.equal(release.pendingScenes,0);assert.equal(release.cachedUrls,0);assert.equal(release.cachedScenes,0);
 out.checks.push('Teardown releases scene resources');out.passed=out.errors.length===0;
}catch(e){out.errors.push(String(e));}finally{await browser?.close();server.kill('SIGTERM');await writeFile(receipt,JSON.stringify(out,null,2)+'\n');}
console.log(JSON.stringify({passed:out.passed,transitions:out.transitions.length,checks:out.checks,errors:out.errors}));process.exitCode=out.passed?0:1;
