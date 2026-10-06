import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const require=createRequire(process.env.RESONANT_PLAYWRIGHT_ROOT ? path.join(process.env.RESONANT_PLAYWRIGHT_ROOT,'package.json') : new URL('./package.json',import.meta.url));
const {chromium}=require('playwright');
const root=path.resolve(process.argv[2] || fileURLToPath(new URL('../../',import.meta.url)));
const receipt=path.resolve(process.argv[3] || path.join(root,'.verification-output','proposal.json'));
await mkdir(path.dirname(receipt),{recursive:true});
const server=spawn('python3',['-u','-c',"import http.server,functools,sys;s=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=sys.argv[1]));print(s.server_port,flush=True);s.serve_forever()",root],{stdio:['ignore','pipe','ignore']});
const result={passed:false,hashes:0,html_pages:[],plates:[],errors:[],network_failures:[],external_requests:[]};
let browser;
try{
 const port=await new Promise((resolve,reject)=>{server.stdout.once('data',b=>resolve(Number(b.toString().trim())));server.once('error',reject)});
 const origin=`http://127.0.0.1:${port}`;
 const manifest=JSON.parse(await readFile(path.join(root,'FILE-MANIFEST.json'),'utf8'));
 for(const [name,hash] of Object.entries(manifest)){
  const actual=createHash('sha256').update(await readFile(path.join(root,name))).digest('hex');
  if(actual!==hash)throw Error('Manifest mismatch: '+name);
  result.hashes++;
 }
 browser=await chromium.launch({headless:true,executablePath:process.env.RESONANT_CHROMIUM_EXECUTABLE,args:['--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',route=>{
  const u=route.request().url();
  if(u.startsWith('http')&&!u.startsWith(origin+'/')){result.external_requests.push(new URL(u).hostname);return route.abort();}
  return route.continue();
 });
 const page=await context.newPage();
 page.on('pageerror',e=>result.errors.push(String(e)));
 page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(origin))result.network_failures.push({file:new URL(r.url()).pathname,status:r.status()})});
 for(const name of Object.keys(manifest).filter(n=>n.endsWith('.html'))){
  await page.goto(origin+'/'+name,{waitUntil:'networkidle',timeout:30000});
  const check=await page.evaluate(()=>({title:document.title,body:document.body?.innerText.length||0,overflow:document.documentElement.scrollWidth>innerWidth+1,missingImages:[...document.images].filter(i=>i.currentSrc&&!i.complete||i.complete&&i.currentSrc&&i.naturalWidth===0).length}));
  result.html_pages.push({file:name,...check});
  if(check.missingImages)throw Error('Missing image on '+name);
 }
 await page.goto(origin+'/proposal/resonant-field-proposal.html?fieldVideo=1#app',{waitUntil:'networkidle'});
 await page.locator('#appearanceOpen').click();
 await page.waitForSelector('#appearance[open]');
 await page.locator('#appearance').evaluate(el=>{const s=el.querySelector('.appearance-body')||el; s.scrollTop=0;});
 await page.screenshot({path:receipt+'.controls.png'});
 await page.locator('.plate-disclosure > summary').click();
 const ids=await page.locator('#plateGrid button').evaluateAll(bs=>bs.map(b=>b.dataset.plate));
 if(ids.length!==25)throw Error('Expected 24 background plates and no-image option');
 for(const id of ids){
  await page.locator(`#plateGrid button[data-plate="${id}"]`).click();
  await page.waitForFunction(id=>{
   const b=document.querySelector(`#plateGrid button[data-plate="${id}"]`);
   const p=document.querySelector('.plate');
   return b?.getAttribute('aria-pressed')==='true'&&(id==='plain'||p?.complete&&p.naturalWidth>0);
  },id);
  result.plates.push(id);
 }
 await page.locator('#plateGrid button[data-plate="animal-kingfisher"]').click();
 await page.waitForTimeout(700);
 await page.screenshot({path:receipt+'.appearance.png'});
 await page.goto(origin+'/proposal/resonant-field-proposal.html#proposal',{waitUntil:'networkidle'});
 await page.screenshot({path:receipt+'.proposal.png'});

 result.responsive=[];
 for(const width of [390,768,1440]){
  await page.setViewportSize({width,height:900});
  for(const route of ['proposal','app','design-system','combined']){
   await page.goto(origin+'/proposal/resonant-field-proposal.html#'+route,{waitUntil:'networkidle'});
   const row=await page.evaluate(()=>({view:document.documentElement.dataset.view,overflow:document.documentElement.scrollWidth>innerWidth+1,missing:[...document.images].filter(i=>i.currentSrc&&i.complete&&!i.naturalWidth).length}));
   result.responsive.push({width,route,...row});
   if(row.overflow||row.missing)result.errors.push('Responsive failure '+width+' '+route);
  }
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(origin+'/proposal/resonant-field-proposal.html#app',{waitUntil:'networkidle'});
 await page.locator('#appearanceOpen').focus();await page.keyboard.press('Enter');
 await page.waitForSelector('#appearance[open]');
 result.keyboard={opened:true};
 await page.keyboard.press('Tab');
 result.keyboard.focusWithin=await page.evaluate(()=>document.querySelector('#appearance').contains(document.activeElement));
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.querySelector('#appearance').open&&document.activeElement.id==='appearanceOpen',{},{timeout:5000});
 result.keyboard.closed=await page.evaluate(()=>!document.querySelector('#appearance').open);
 result.keyboard.focusRestored=await page.evaluate(()=>document.activeElement.id==='appearanceOpen');
 if(!Object.values(result.keyboard).every(Boolean))result.errors.push('Appearance keyboard dialog failed');
 result.accessibility=await page.evaluate(()=>({announcer:!!document.querySelector('[aria-live="polite"]'),misleadingStatus:document.querySelectorAll('[role="status"][aria-live="off"]').length,learningRole:document.querySelector('#learningStatus').getAttribute('role'),numericReadoutsSilent:['paletteBlendReadout','harmonyReadout','comparisonStatus'].every(id=>document.getElementById(id).getAttribute('role')==='note')}));
 if(!result.accessibility.announcer||result.accessibility.misleadingStatus||result.accessibility.learningRole!=='note'||!result.accessibility.numericReadoutsSilent)result.errors.push('Announcement semantics failed');
 await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});
 result.forcedColors=await page.evaluate(()=>({forced:matchMedia('(forced-colors:active)').matches,reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches}));
 if(!result.forcedColors.forced||!result.forcedColors.reducedMotion)result.errors.push('System fallback emulation failed');
 await page.emulateMedia({forcedColors:'none',reducedMotion:'no-preference'});
 // Exercise the real iframe transport after origin/source hardening.
 await page.goto(origin+'/proposal/resonant-field-proposal.html#proposal',{waitUntil:'networkidle'});
 await page.locator('#compareAtom').selectOption('cards');
 await page.waitForTimeout(800);
 result.messaging=await page.frames().find(f=>f.url().includes('/comparison/system3.html')).evaluate(()=>window.atomicMetrics().atom);
 if(result.messaging!=='cards')result.errors.push('Same-origin comparison transport failed');
 const child=page.frames().find(f=>f.url().includes('/comparison/system3.html'));
 result.rejectedMessage=await child.evaluate(()=>{dispatchEvent(new MessageEvent('message',{source:parent,origin:'https://invalid.example',data:{kind:'atomic-compare',atom:'inputs'}}));return window.atomicMetrics().atom==='cards';});
 if(!result.rejectedMessage)result.errors.push('Foreign-origin comparison message accepted');
 result.rejectedSourceMessage=await child.evaluate(()=>{dispatchEvent(new MessageEvent('message',{source:window,origin:location.origin,data:{kind:'atomic-compare',atom:'inputs'}}));return window.atomicMetrics().atom==='cards';});
 if(!result.rejectedSourceMessage)result.errors.push('Wrong-source comparison message accepted');
 result.passed=result.errors.length===0&&result.network_failures.length===0&&result.external_requests.length===0;
}catch(e){result.errors.push(String(e))}finally{
 await browser?.close();server.kill('SIGTERM');
 await writeFile(receipt,JSON.stringify(result,null,2)+'\n');
}
console.log(JSON.stringify(result));process.exitCode=result.passed?0:1;
