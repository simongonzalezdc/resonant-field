/* The setting and resolved film path are sampled once per depth. UI remains DOM.
   Inset regions expose the shallower ray path, rather than adding another coat
   over a painted ancestor. The opaque raster is the visible scene (photograph
   plus transparent films), never a neutral reading mat. */
(function () {
  "use strict";
  let generation = 0;
  const host={worldSelector:"[data-volume-world]",excludeSelector:"",ignoredHostSelector:"[data-volume-world]"};
  let closed=false;
  let pendingFrame = 0;
  let refreshRevision = 0;
  let sceneKey = "";
  let paintedSceneKey = "";
  let pendingScene=null;
  let samples = [];
  let fallbackColors=[];
  let lastScene = null;
  let substrate="",sampleBlobs=[],ownedUrls=[],sourceValue="",sourceCounter=0,baseCache=null;
  const retiredUrls=new Map();
  // Keep the three destination worlds at original sampling resolution.
  const sceneCache=new Map();let cacheHits=0;
  function rememberScene(key) {
    sceneCache.delete(key);
    sceneCache.set(key,{urls:ownedUrls,samples,blobs:sampleBlobs,substrate,fallbackColors,scene:lastScene});
    while(sceneCache.size>3){const first=sceneCache.keys().next().value;const old=sceneCache.get(first);sceneCache.delete(first);retire(old.urls);}
  }
  function restoreScene(key) {
    const cached=sceneCache.get(key);if(!cached)return false;
    if(pendingScene){generation++;pendingScene=null;}
    sceneCache.delete(key);sceneCache.set(key,cached);
    ownedUrls=cached.urls;samples=cached.samples;sampleBlobs=cached.blobs;substrate=cached.substrate;fallbackColors=cached.fallbackColors;lastScene=cached.scene;
    sceneKey=key;baseCache=null;cacheHits++;return true;
  }
  function retire(urls){if(!urls.length)return;const id=setTimeout(()=>{urls.forEach(u=>URL.revokeObjectURL(u));retiredUrls.delete(id)},5000);retiredUrls.set(id,urls);while(retiredUrls.size>1){const [timer,old]=retiredUrls.entries().next().value;clearTimeout(timer);old.forEach(u=>URL.revokeObjectURL(u));retiredUrls.delete(timer);}}
  function clearScenePaint() {
    document.querySelectorAll('[data-volume-background-owner="scene"]').forEach(e=>{
      for(const property of ['background-color','background-image','background-size','background-position','background-repeat'])e.style.removeProperty(property);
      e.classList.remove('rv-world-sampled');delete e.dataset.volumeBackgroundOwner;delete e.dataset.volumeSceneKey;
    });
    document.querySelectorAll(host.worldSelector).forEach(e=>{
      if(ownedUrls.some(url=>e.style.getPropertyValue('background-image').includes(url))){for(const property of ['background-image','background-size','background-position'])e.style.removeProperty(property);}
      const plate=e.querySelector(':scope>.plate');if(plate)plate.style.visibility='';
    });
  }
  function releaseScene() {
    clearScenePaint();
    if(pendingFrame)cancelAnimationFrame(pendingFrame);pendingFrame=0;pendingScene=null;
    new Set([...ownedUrls,...[...sceneCache.values()].flatMap(entry=>entry.urls)]).forEach(u=>URL.revokeObjectURL(u));ownedUrls=[];sceneCache.clear();
    retiredUrls.forEach((urls,t)=>{clearTimeout(t);urls.forEach(u=>URL.revokeObjectURL(u));});retiredUrls.clear();
    samples=[];sampleBlobs=[];fallbackColors=[];substrate="";baseCache=null;lastScene=null;sceneKey="";paintedSceneKey="";
  }
  const makeCanvas=()=>typeof OffscreenCanvas==='function'?new OffscreenCanvas(1,1):document.createElement('canvas');
  let synchronousEncoding=false,pendingEncodes=0,retryEncodingAt=0;
  function encodeSync(canvas) {
    let source=canvas;
    if(!source.toDataURL){source=document.createElement('canvas');source.width=canvas.width;source.height=canvas.height;source.getContext('2d',{willReadFrequently:true}).drawImage(canvas,0,0);}
    const text=source.toDataURL('image/png').split(',')[1],raw=atob(text),bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return new Blob([bytes],{type:'image/png'});
  }
  async function encode(canvas,token) {
    if(closed || token!==generation)return null;
    if(!canvas.convertToBlob)synchronousEncoding=true;
    else if(synchronousEncoding && pendingEncodes===0 && performance.now()>=retryEncodingAt)synchronousEncoding=false;
    // A superseded encode cannot be aborted, so permit at most one outstanding.
    if(synchronousEncoding || pendingEncodes>0)return encodeSync(canvas);
    let timer,started=false;const encodeStarted=performance.now();pendingEncodes++;
    try {
      const operation=canvas.convertToBlob({type:'image/png'});started=true;
      const asynchronous=Promise.resolve(operation).then(blob=>{
        // A short scheduling delay should not permanently penalize a healthy codec.
        if(blob && !closed && performance.now()-encodeStarted<1000){synchronousEncoding=false;}
        return blob;
      }).finally(()=>{pendingEncodes--;});
      const blob=await Promise.race([asynchronous,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),250);})]);
      if(blob)return blob;
      synchronousEncoding=true;retryEncodingAt=performance.now()+5000;
      return closed || token!==generation ? null : encodeSync(canvas);
    } catch {
      if(!started)pendingEncodes--;
      synchronousEncoding=true;retryEncodingAt=performance.now()+5000;
      return closed || token!==generation ? null : encodeSync(canvas);
    } finally {clearTimeout(timer);}
  }
  const setCss=(e,k,v,priority="")=>{if(e.style.getPropertyValue(k)!==v||e.style.getPropertyPriority(k)!==priority)e.style.setProperty(k,v,priority);};
  const sourceId=src=>{if(src!==sourceValue){sourceValue=src;sourceCounter++;}return src.length>512?"inline-plate:"+sourceCounter:src;};
  const imageCache = new Map();
  const css = document.createElement("style");
  css.textContent = `
    .rv-world-sampled { background-image:var(--rv-world-sample)!important; background-size:var(--rv-sample-width) var(--rv-sample-height)!important; background-position:var(--rv-sample-x) var(--rv-sample-y)!important; background-repeat:no-repeat!important; background-color:var(--rv-sample-base,transparent)!important; }
    .rv-world-sampled { border-color:var(--rv-edge-contour,rgb(255 255 255 / .2))!important; box-shadow:var(--rv-edge-profile,none)!important; }
    .rv-world-sampled:is([data-volume-role=primary],[data-volume-state=selected],[data-volume-state=focus],[data-volume-state=focused]) {border-color:var(--accent-color)!important;}
    .rv-world-sampled > .pane-material, .rv-world-sampled > .rv-surface, .rv-world-sampled > .rv-film { display:none!important; }
    .rv-local-emission {position:absolute;inset-inline-start:8px;inset-block-start:9px;width:3px;height:3px;border-radius:50%;background:var(--accent-color);box-shadow:0 0 7px 2px oklch(var(--accent-lightness,.7) .11 calc(var(--accent-hue)*1deg) / .4);pointer-events:none;display:none;}
    [data-volume-state=selected]>.rv-local-emission,[data-volume-state=focus]>.rv-local-emission {display:block;}
    @media(prefers-reduced-transparency:reduce) {.rv-local-emission {display:none;}}
    .rv-world-sampled > .rv-sheen,.rv-world-sampled > .rv-emission { pointer-events:none; }
    @media(forced-colors:active) { .rv-world-sampled { background-image:none!important; background-color:Canvas!important; } }
  `;
  document.head.append(css);

  function loadImage(src) {
    if (!src) return Promise.resolve(null);
    if (imageCache.has(src)) return imageCache.get(src);
    const result = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Selected material plate could not be decoded"));
      image.src = src;
    });
    imageCache.set(src, result);
    // Bound decoded setting ownership; superseded work is discarded by generation.
    if (imageCache.size > 3) imageCache.delete(imageCache.keys().next().value);
    return result;
  }

  function mixingSettings(name){try{return JSON.parse(document.documentElement.dataset[name]||"{}");}catch{return {};}}
  function appearance() {
    const root = document.documentElement;
    const computed = getComputedStyle(root);
    const number = (name,fallback) => {const value=Number.parseFloat(computed.getPropertyValue(name));return Number.isFinite(value) ? value : fallback;};
    return {
      mode:root.dataset.mode === "light" ? "light" : "dark",plate:root.dataset.materialId||"",
      hue:number("--material-hue",260), chroma:number("--material-chroma",.054),
      toneAnchor:number("--tone-anchor",.26), position:number("--plate-position",50),
      brightness:number("--plate-brightness",.7), presence:number("--rv-presence",1),
      backgroundPresence:Math.max(0,Math.min(1,number("--texture-opacity",.6))),
      solid:root.dataset.solid === "true", selectiveColor:root.dataset.selective === "true",
      blend:window.ResonantBlendController?.normalize(mixingSettings("blend"))||{mode:"normal",amount:100,layers:{}},
      finish:window.ResonantFinishController?.normalize(mixingSettings("finish"))||{amount:100,spread:100,angle:Math.atan2(.309,.253)*180/Math.PI},
    };
  }

  function neutralGround(prefs) {
    return prefs.mode === "light" ? 197 : Math.round(255*encoded(Math.max(.12,prefs.toneAnchor-.10)**3));
  }

  function drawCover(context, image, width, height, position) {
    const scale = Math.max(width/image.naturalWidth,height/image.naturalHeight);
    const w=image.naturalWidth*scale, h=image.naturalHeight*scale;
    context.drawImage(image,(width-w)*position/100,(height-h)*position/100,w,h);
  }

  function boxBlur(source,width,height,radius) {
    if(!radius) return source;
    const horizontal=new Uint8ClampedArray(source.length),output=new Uint8ClampedArray(source.length),windowSize=2*radius+1;
    // Scalar channel sums keep the same clamped-byte rounding at each pass.
    for(let y=0;y<height;y++) {
      const row=y*width*4;let red=0,green=0,blue=0;
      for(let x=-radius;x<=radius;x++) {const i=row+Math.max(0,Math.min(width-1,x))*4;red+=source[i];green+=source[i+1];blue+=source[i+2];}
      for(let x=0;x<width;x++) {
        const i=row+x*4,remove=row+Math.max(0,x-radius)*4,add=row+Math.min(width-1,x+radius+1)*4;
        horizontal[i]=red/windowSize;horizontal[i+1]=green/windowSize;horizontal[i+2]=blue/windowSize;horizontal[i+3]=255;
        red+=source[add]-source[remove];green+=source[add+1]-source[remove+1];blue+=source[add+2]-source[remove+2];
      }
    }
    // Traverse the vertical pass by row so reads and writes remain contiguous.
    const reds=new Int32Array(width),greens=new Int32Array(width),blues=new Int32Array(width);
    for(let y=-radius;y<=radius;y++) {
      const row=Math.max(0,Math.min(height-1,y))*width*4;
      for(let x=0;x<width;x++){const i=row+x*4;reds[x]+=horizontal[i];greens[x]+=horizontal[i+1];blues[x]+=horizontal[i+2];}
    }
    for(let y=0;y<height;y++) {
      const row=y*width*4,remove=Math.max(0,y-radius)*width*4,add=Math.min(height-1,y+radius+1)*width*4;
      for(let x=0;x<width;x++) {
        const offset=x*4,i=row+offset,r=remove+offset,a=add+offset;
        output[i]=reds[x]/windowSize;output[i+1]=greens[x]/windowSize;output[i+2]=blues[x]/windowSize;output[i+3]=255;
        reds[x]+=horizontal[a]-horizontal[r];greens[x]+=horizontal[a+1]-horizontal[r+1];blues[x]+=horizontal[a+2]-horizontal[r+2];
      }
    }
    return output;
  }
  function momentBlur(source,width,height,sigma) {
    const radius=(Math.sqrt(1+12*sigma*sigma)-1)/2,lower=Math.floor(radius),upper=lower+1;
    const lowVariance=lower*(lower+1)/3,highVariance=upper*(upper+1)/3;
    const mix=(sigma*sigma-lowVariance)/(highVariance-lowVariance);
    const low=boxBlur(source,width,height,lower),high=boxBlur(source,width,height,upper),result=new Uint8ClampedArray(source.length);
    for(let i=0;i<source.length;i++) result[i]=low[i]*(1-mix)+high[i]*mix;
    return result;
  }
  function blurReflection(source,width,height,sigma){
    // Diffuse optical coverage as a scalar; the photographic blur deliberately owns opaque alpha.
    const mask=new Uint8ClampedArray(source.length);
    for(let i=0;i<source.length;i+=4){mask[i]=mask[i+1]=mask[i+2]=source[i+3];mask[i+3]=255;}
    const blurred=momentBlur(mask,width,height,sigma),result=new Uint8ClampedArray(source);
    for(let i=0;i<source.length;i+=4)result[i+3]=blurred[i];
    return result;
  }
  const linear=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
  const encoded=c=>c<=.0031308?12.92*c:1.055*c**(1/2.4)-.055;
  function selectiveGray(gray,luminance,direction) {
    if(!direction)return [gray,gray,gray];
    const t=Math.max(0,Math.min(1,(luminance-.45)/.4)),mask=t*t*(3-2*t),y=linear(gray/255);
    let bound=Infinity;
    for(const d of direction)if(Math.abs(d)>1e-8)bound=Math.min(bound,d>0?(1-y)/d:y/-d);
    const amount=mask*.32*Math.max(0,bound);
    return direction.map(d=>Math.round(255*encoded(Math.max(0,Math.min(1,y+amount*d)))));
  }
  // A stylized directional reflection from photographic microtexture, not
  // a physical thin-film simulation. Analysis is small, shared and static.
  // Exact indexed order statistic; only these local arrays are mutated.
  function rankValue(values,rank) {
    if(!values.length)return 0;
    let left=0,right=values.length-1;
    while(left<right) {
      const pivot=values[(left+right)>>>1];let i=left,j=right;
      while(i<=j) {
        while(values[i]<pivot)i++;while(values[j]>pivot)j--;
        if(i<=j){const value=values[i];values[i]=values[j];values[j]=value;i++;j--;}
      }
      if(rank<=j)right=j;else if(rank>=i)left=i;else break;
    }
    return values[rank];
  }
  function reflectionSource(pixels,width,height) {
    const scale=Math.min(1,384/width,384/height),w=Math.max(3,Math.round(width*scale)),h=Math.max(3,Math.round(height*scale));
    const gray=new Uint8ClampedArray(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      const source=(Math.min(height-1,Math.floor(y/scale))*width+Math.min(width-1,Math.floor(x/scale)))*4,i=(y*w+x)*4;
      const value=.2126*pixels.data[source]+.7152*pixels.data[source+1]+.0722*pixels.data[source+2];
      gray[i]=gray[i+1]=gray[i+2]=value;gray[i+3]=255;
    }
    return {width:w,height:h,gray};
  }
  function reflectionMask(source,angle=Math.atan2(.309,.253)*180/Math.PI) {
    const {width:w,height:h,gray}=source;
    const radians=angle*Math.PI/180,lightLength=Math.hypot(.253,.309),lightX=lightLength*Math.cos(radians),lightY=lightLength*Math.sin(radians);
    const fine=boxBlur(gray,w,h,1),broad=boxBlur(gray,w,h,3),energy=[],values=[];
    const band=(x,y)=>(fine[(y*w+x)*4]-broad[(y*w+x)*4])/255;
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++) {
      const dx=(band(x+1,y)-band(x-1,y))/2,dy=(band(x,y+1)-band(x,y-1))/2,e=Math.hypot(dx,dy);
      const length=Math.hypot(4*dx,4*dy,1),dot=Math.max(0,(4*dx*lightX+4*dy*lightY+.917)/length);
      values.push({index:y*w+x,energy:e,reflectance:dot**24,orientation:Math.atan2(dy,dx)/Math.PI});energy.push(e);
    }
    const threshold=rankValue(energy,Math.floor(energy.length*.92))||0,mask=new Float32Array(w*h),orientation=new Float32Array(w*h);
    let maximum=0;
    for(const row of values)if(row.energy>threshold && row.energy>1e-5){const m=row.reflectance*(row.energy-threshold);mask[row.index]=m;orientation[row.index]=row.orientation;maximum=Math.max(maximum,m);}
    // Above the legacy range, use continuous ridge responses instead of sparse peaks.
    const ridgeField=boxBlur(gray,w,h,3);
    const ridge = new Float32Array(w*h), ridgeOrientation = new Float32Array(w*h), ridgeValues=[];
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++) {
      const i=y*w+x, dx=(ridgeField[(i+1)*4]-ridgeField[(i-1)*4])/510, dy=(ridgeField[(i+w)*4]-ridgeField[(i-w)*4])/510;
      const energy=Math.hypot(dx,dy), length=Math.hypot(4*dx,4*dy,1);
      ridge[i]=energy*(.15+.85*((1+Math.cos(Math.atan2(dy,dx)-radians))/2)**1.4);
      ridgeOrientation[i]=Math.atan2(dy,dx)/Math.PI;ridgeValues.push(ridge[i]);
    }
    const ridgeScale=rankValue(ridgeValues,Math.floor(ridgeValues.length*.95))||1;
    for(let i=0;i<ridge.length;i++){const t=Math.min(1,ridge[i]/ridgeScale);ridge[i]=t*t*(3-2*t)*.6;}
    const positive=[...mask].filter(value=>value>0);
    const normalization=rankValue(positive,Math.floor(positive.length*.95)) || maximum;
    let active=0,sum=0;
    for(let i=0;i<mask.length;i++){mask[i]=normalization ? Math.min(1,mask[i]/normalization) : 0;if(mask[i])active++;sum+=mask[i];}
    return {width:w,height:h,mask,orientation,ridge,ridgeOrientation,coverage:active/mask.length,mean:sum/mask.length};
  }
  function reflectionTint(texture,prefs,phase=1,ridge=false,sigma=0) {
    const canvas=document.createElement("canvas");canvas.width=texture.width;canvas.height=texture.height;const context=canvas.getContext("2d"),data=context.createImageData(canvas.width,canvas.height);
    const palette=document.createElement("canvas");palette.width=64;palette.height=1;const probe=palette.getContext("2d");
    for(let i=0;i<64;i++){const interval=window.ResonantFinishController?.hueSpan?.(prefs.finish)??50*Math.log2(3/2)*(Number.isFinite(prefs.finish.spread)?prefs.finish.spread/100:1),hue=(prefs.hue+phase*(i/63*2-1)*interval+360)%360;probe.fillStyle=CSS.supports("color","oklch(.5 .08 120)") ? `oklch(${prefs.mode==='light'?(ridge?.66:.58):.82} ${ridge?(prefs.mode==='light'?.16:.11):.08} ${hue})` : `hsl(${hue} 38% ${prefs.mode==='light'?50:80}%)`;probe.fillRect(i,0,1,1);}
    const colors=probe.getImageData(0,0,64,1).data;
    const peakFocus=ridge?Math.max(0,(prefs.finish.amount-160)/40):0;
    for(let i=0;i<texture.mask.length;i++){const bin=Math.round(((ridge?texture.ridgeOrientation[i]:texture.orientation[i])+1)*31.5)*4;for(let c=0;c<3;c++)data.data[i*4+c]=colors[bin+c];data.data[i*4+3]=Math.round((ridge?Math.pow(texture.ridge[i]/.6,1+peakFocus*1.5)*.6:texture.mask[i])*255);}
    if(sigma>0)data.data.set(blurReflection(data.data,canvas.width,canvas.height,sigma));
    context.putImageData(data,0,0);return canvas;
  }
  async function rebuild(world,prefs,src) {
    document.documentElement.dataset.volumeSampling="loading";
    const token=++generation,started=performance.now(),image=await loadImage(src);
    const timings={image:performance.now()-started,grade:0,blur:0,encode:0};let phaseStart=performance.now();
    if(token !== generation) return false;
    // Upscaling the photographed plate before encoding adds memory, not source detail.
    const nativeWidth=image?image.naturalWidth:2048;
    const width=image ? Math.max(1,Math.min(2048,nativeWidth,Math.ceil(world.width))) : 1,
      height=image ? Math.max(1,Math.ceil(world.height*width/world.width)) : 1;
    const baseKey=JSON.stringify([sourceId(src),width,height,prefs.mode,prefs.toneAnchor,prefs.brightness,prefs.backgroundPresence,prefs.position,prefs.selectiveColor,prefs.selectiveColor?prefs.hue:0]);
    const reuse=baseCache?.key===baseKey;
    const base=reuse?baseCache.canvas:makeCanvas();if(!reuse){base.width=width;base.height=height;}
    const baseContext=base.getContext("2d",{willReadFrequently:true});
    if(!reuse){const neutral=neutralGround(prefs);baseContext.fillStyle=`rgb(${neutral} ${neutral} ${neutral})`;baseContext.fillRect(0,0,width,height);
    if(image) drawCover(baseContext,image,width,height,prefs.position);
    }
    const pixels=reuse?baseCache.pixels:baseContext.getImageData(0,0,width,height);
    const textureSource=reuse?baseCache.textureSource:image?reflectionSource(pixels,width,height):null;
    const angleKey=JSON.stringify([prefs.finish.angle]);
    const texture=textureSource?(reuse&&baseCache.angleKey===angleKey?baseCache.texture:reflectionMask(textureSource,prefs.finish.angle)):null;
    const exposure=prefs.mode === "light" ? 1.45+(prefs.brightness-.7)*.18 : .3+(prefs.brightness-.7)*.1;
    let complement=null;
    if(prefs.selectiveColor) {
      const probe=document.createElement("canvas").getContext("2d");probe.fillStyle=`hsl(${(prefs.hue+180)%360} 35% 55%)`;probe.fillRect(0,0,1,1);const rgb=probe.getImageData(0,0,1,1).data,channels=[...rgb].slice(0,3).map(c=>linear(c/255)),y=.2126*channels[0]+.7152*channels[1]+.0722*channels[2];complement=channels.map(c=>c-y);
    }
    const gradeCache=new Map();
    if(image && !reuse) for(let i=0;i<pixels.data.length;i+=4) {
      const colorKey=(pixels.data[i]<<16)|(pixels.data[i+1]<<8)|pixels.data[i+2];let colored=gradeCache.get(colorKey);
      if(!colored){const luminance=(.2126*pixels.data[i]+.7152*pixels.data[i+1]+.0722*pixels.data[i+2])/255;
      // Light ink needs a calmer photographic field; dark retains its texture.
      const contrast=prefs.mode === "light" ? .24 : .42;
      const gray=Math.min(255,Math.max(0,((luminance-.5)*contrast+.5)*exposure*255));
      colored=selectiveGray(gray,luminance,complement);if(gradeCache.size<4096)gradeCache.set(colorKey,colored);}
      for(let c=0;c<3;c++) {
        const neutral=neutralGround(prefs);
        pixels.data[i+c]=neutral+(colored[c]-neutral)*prefs.backgroundPresence;
      }
      pixels.data[i+3]=255;
    }
    if(!reuse){baseContext.putImageData(pixels,0,0);baseCache={key:baseKey,canvas:base,pixels,textureSource,texture,angleKey,blurred:[]};}
    baseCache.texture=texture;baseCache.angleKey=angleKey;
    const reflectionKey=JSON.stringify([prefs.hue,prefs.mode,prefs.finish.spread,angleKey,Math.max(160,prefs.finish.amount)]);
    if(texture && baseCache.reflectionKey!==reflectionKey){baseCache.reflectionImages=[reflectionTint(texture,prefs,1),reflectionTint(texture,prefs,-1)];baseCache.reflectionKey=reflectionKey;baseCache.ridgeImages=[];}
    timings.grade=performance.now()-phaseStart;
    // Both engines share deterministic, moment-matched diffusion.
    const nativeFilter=false,output=[],nextFallback=[],readability=[];
    for(let depth=0;depth<5;depth++) {
      if(token !== generation) return false;
      const plan=window.ResonantVolume.resolve("workplane",{...prefs,depth},null),canvas=makeCanvas();canvas.width=width;canvas.height=height;
      const context=canvas.getContext("2d",{willReadFrequently:true}),sigma=plan.optics.diffusion.total*width/world.width;
      phaseStart=performance.now();
      if(nativeFilter) {context.filter=`blur(${sigma}px)`;context.drawImage(base,0,0);context.filter="none";}
      else {let blurred=baseCache.blurred[depth];if(!blurred){blurred=momentBlur(pixels.data,width,height,sigma);if(token!==generation)return false;baseCache.blurred[depth]=blurred;}context.putImageData(new ImageData(blurred,width,height),0,0);}
      timings.blur+=performance.now()-phaseStart;
      const mix=(window.ResonantBlendController?.resolve(prefs.blend,depth)||{operation:"source-over",amount:100}),active=mix.operation!=="source-over"&&mix.amount>0;
      let effectContext=null,effectCanvas=null;
      if(active&&mix.amount<100){effectCanvas=makeCanvas();effectCanvas.width=width;effectCanvas.height=height;effectContext=effectCanvas.getContext("2d");effectContext.drawImage(canvas,0,0);effectContext.globalCompositeOperation=mix.operation;}
      if(active&&mix.amount===100)context.globalCompositeOperation=mix.operation;
      for(const film of plan.voices) {
        const color=film.color,fill=CSS.supports("color","oklch(.5 .05 120)") ? `oklch(${color.lightness} ${color.chroma} ${color.hue} / ${film.opacity})` : `rgb(${film.fallbackRgb} / ${film.opacity})`;
        context.fillStyle=fill;context.fillRect(0,0,width,height);
        if(effectContext){effectContext.fillStyle=fill;effectContext.fillRect(0,0,width,height);}
      }
      context.globalCompositeOperation="source-over";
      if(effectContext){context.globalAlpha=mix.amount/100;context.drawImage(effectCanvas,0,0);context.globalAlpha=1;}
      // Reflection is part of the same cumulative sampled path, never another
      // DOM pane/mask. Text remains outside this raster and is never filtered.
      if(baseCache.reflectionImages){
        const gain=window.ResonantFinishController?.gain(prefs.finish,prefs.mode,prefs.plate)??(prefs.finish.amount===0?0:(prefs.mode==="light"?.035:.055));
        const strength=gain*prefs.backgroundPresence*plan.optics.cumulativeCoverage/.62,phase=depth/4;
        const ridgeMix=Math.max(0,Math.min(1,(prefs.finish.amount-100)/60));
        if(ridgeMix && !baseCache.ridgeImages[depth]){
          // One photographic hue field: opposite palettes cancel color travel at middle depth.
          const ridgeImage=reflectionTint(texture,prefs,1,true,sigma*texture.width/width);
          baseCache.ridgeImages[depth]=[ridgeImage,ridgeImage];
        }
        const drawReflection=(images,weight)=>{for(let side=0;side<2;side++){context.globalAlpha=strength*weight*(side?phase:1-phase);context.drawImage(images[side],0,0,width,height);}};
        drawReflection(baseCache.reflectionImages,1-ridgeMix);
        if(ridgeMix)drawReflection(baseCache.ridgeImages[depth],ridgeMix);
        context.globalAlpha=1;
      }
      let contrast={ink:null,overlay:null,alpha:0,minimum:null};
      if(active && window.ResonantContrastController){
        contrast=window.ResonantContrastController.resolve(context.getImageData(0,0,width,height).data,prefs.mode);
        if(contrast.overlay){context.fillStyle=contrast.overlay;context.globalAlpha=contrast.alpha;context.fillRect(0,0,width,height);context.globalAlpha=1;}
      }
      readability.push(contrast);
      const coating=document.createElement("canvas");coating.width=coating.height=1;const pigment=coating.getContext("2d");
      for(const film of plan.voices) {const c=film.color;pigment.fillStyle=CSS.supports("color","oklch(.5 .05 120)") ? `oklch(${c.lightness} ${c.chroma} ${c.hue} / ${film.opacity})` : `rgb(${film.fallbackRgb} / ${film.opacity})`;pigment.fillRect(0,0,1,1);}
      const rgba=active?context.getImageData(Math.floor(width/2),Math.floor(height/2),1,1).data:pigment.getImageData(0,0,1,1).data;nextFallback.push(`rgb(${rgba[0]} ${rgba[1]} ${rgba[2]} / ${rgba[3]/255})`);
      phaseStart=performance.now();
      try{output.push(await encode(canvas,token));}
      finally{canvas.width=canvas.height=1;if(effectCanvas)effectCanvas.width=effectCanvas.height=1;}
      timings.encode+=performance.now()-phaseStart;
      // Superseding an appearance selection cancels before the next depth.
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(token !== generation) return false;
    const nextUrls=[];
    try {for(const blob of output)nextUrls.push(URL.createObjectURL(blob));}
    catch(error){nextUrls.forEach(u=>URL.revokeObjectURL(u));throw error;}
    const old=ownedUrls;sampleBlobs=output;ownedUrls=nextUrls;substrate=nextUrls[0];
    if(![...sceneCache.values()].some(entry=>entry.urls===old))retire(old);
    samples=ownedUrls.slice(0,5);fallbackColors=nextFallback;lastScene={readability,width:world.width,height:world.height,encodedWidth:width,encodedHeight:height,diffusion:nativeFilter ? "native-gaussian" : "moment-matched-box",blurExecution:reuse ? "cached" : "main",encoding:synchronousEncoding?"bounded-synchronous-fallback":"asynchronous-with-bounded-fallback",buildMilliseconds:Math.round(performance.now()-started),reflection:texture ? {coverage:texture.coverage,mean:texture.mean,maxOpacity:window.ResonantFinishController?.gain(prefs.finish,prefs.mode,prefs.plate)??(prefs.mode==="light"?.035:.055),analysisWidth:texture.width,analysisHeight:texture.height} : null,timings:Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,Math.round(v)]))};
    return true;
  }

  // A uniform setting has no spatial detail; navigation can reuse its five pixels.
  function sceneIdentity(src,world,prefs){return JSON.stringify([sourceId(src),src?Math.ceil(world.width):0,src?Math.ceil(world.height):0,prefs]);}

  async function refresh() {
    if(closed)return;
    const revision=++refreshRevision;
    const api=window.ResonantVolume;
    const visible=[...document.querySelectorAll(host.worldSelector)].filter(e=>{const rect=e.getBoundingClientRect();return rect.width && rect.height && !e.closest("[hidden]") && getComputedStyle(e).visibility!=="hidden";});
    if(visible.length!==1){document.documentElement.dataset.volumeSampling=visible.length?"ambiguous-world":"no-world";releaseScene();return;}
    const setting=visible[0];
    if(!api || !setting) return;
    const world=setting.getBoundingClientRect();
    if(!world.width || !world.height) return;
    const plate=setting.querySelector(":scope>.plate");
    const prefs=appearance(), src=plate?.getAttribute("src") ? plate.currentSrc || plate.src : "";
    if(prefs.solid || matchMedia("(forced-colors: active)").matches || matchMedia("(prefers-reduced-transparency: reduce)").matches) {
      generation++;releaseScene();
      for(const property of ["background-image","background-size","background-position"])setting.style.removeProperty(property);
      if(plate)plate.style.visibility="";
      document.querySelectorAll(".rv-world-sampled").forEach(e=>{
        e.classList.remove("rv-world-sampled");
        if(e.dataset.volumeInkOwner==="scene"){for(const name of ["--color-text","--color-text-secondary","color"])e.style.removeProperty(name);delete e.dataset.volumeInkOwner;}
        if(e.dataset.volumeBackgroundOwner==='scene') {
          for(const property of ["background-color","background-image","background-size","background-position","background-repeat"])e.style.removeProperty(property);
          delete e.dataset.volumeBackgroundOwner;delete e.dataset.volumeSceneKey;
        }
      });
      document.documentElement.dataset.volumeSampling="solid";
      window.dispatchEvent(new CustomEvent("resonant-world-sampled",{detail:{key:null,status:"solid"}}));
      return;
    }
    const key=sceneIdentity(src,world,prefs);
    try {
      if(key !== sceneKey && !restoreScene(key)) {
        if(!pendingScene || pendingScene.key !== key) {
          const job={key,promise:null};
          job.promise=rebuild(world,prefs,src).then(success=>{if(pendingScene===job){if(success){sceneKey=key;rememberScene(key);}pendingScene=null;}return success;}).catch(error=>{if(pendingScene===job) pendingScene=null;throw error;});
          pendingScene=job;
        }
        const success=await pendingScene.promise;
        if(!success || sceneKey !== key) return;
      }
      if(revision!==refreshRevision)return;
      const targets=[...document.querySelectorAll("[data-volume-rendered],.rv-semantic-host")]
        .filter(element=>element!==setting && !(host.excludeSelector && element.closest(host.excludeSelector))
          && !element.closest("[hidden],dialog:not([open])") && !(host.ignoredHostSelector && element.matches(host.ignoredHostSelector)))
        .map(element=>({element,depth:Number(element.dataset.volumeDepth),rect:element.getBoundingClientRect()}))
        .filter(({depth})=>Number.isInteger(depth)&&samples[depth]);
      lastScene.width=world.width;lastScene.height=world.height;
      setCss(setting,"background-image",`url("${substrate}")`,"important");
      setCss(setting,"background-size",`${lastScene.width}px ${lastScene.height}px`,"important");
      setCss(setting,"background-position","0 0","important");
      if(plate)plate.style.visibility="hidden";
      targets.forEach(({element,depth,rect}) => {
        const ink=lastScene.readability?.[depth]?.ink;
        if(ink){setCss(element,"--color-text",ink);setCss(element,"--color-text-secondary",ink);setCss(element,"color",ink,"important");element.dataset.volumeInkOwner="scene";}
        else if(element.dataset.volumeInkOwner==="scene"){for(const name of ["--color-text","--color-text-secondary","color"])element.style.removeProperty(name);delete element.dataset.volumeInkOwner;}
        element.classList.add("rv-world-sampled");
        if(element.matches("button,[role=button]") && !element.querySelector(":scope>.rv-local-emission")) {
          const emission=document.createElement("span");emission.className="rv-local-emission";emission.setAttribute("aria-hidden","true");element.append(emission);
        }
        const plan=api.resolve(element.dataset.volumeRole,{...prefs,depth,state:element.dataset.volumeState},null);
        setCss(element,"--rv-sample-edge",String(.12+depth*.055));
        setCss(element,"--rv-sample-shadow",String(plan.optics.edge.shadow));
        setCss(element,"--rv-sample-base",fallbackColors[depth]);
        // Large PNG URLs can exceed Chromium custom-property limits.
        // The owned background-image below is the authoritative sample.
        element.style.removeProperty("--rv-world-sample");
        setCss(element,"--rv-sample-width",`${lastScene.width}px`);
        setCss(element,"--rv-sample-height",`${lastScene.height}px`);
        setCss(element,"--rv-sample-x",`${world.left-rect.left}px`);
        setCss(element,"--rv-sample-y",`${world.top-rect.top}px`);
        // One owner for material backgrounds; legacy product CSS cannot repaint a finish.
        element.dataset.volumeBackgroundOwner="scene";
        if(element.dataset.volumeSceneKey!=="scene:"+generation)element.dataset.volumeSceneKey="scene:"+generation;
        setCss(element,"background-color",fallbackColors[depth],"important");
        setCss(element,"background-image",element.matches("select") ? `var(--select-arrow),url("${samples[depth]}")` : `url("${samples[depth]}")`,"important");
        setCss(element,"background-size",`${element.matches("select") ? "14px 14px," : ""}${lastScene.width}px ${lastScene.height}px`,"important");
        setCss(element,"background-position",`${element.matches("select") ? "right 12px center," : ""}${world.left-rect.left}px ${world.top-rect.top}px`,"important");
        setCss(element,"background-repeat","no-repeat","important");

      });
      paintedSceneKey=key;
      document.documentElement.dataset.volumeSampling="ready";
      window.dispatchEvent(new CustomEvent("resonant-world-sampled",{detail:{key}}));
    } catch(error) {
      document.documentElement.dataset.volumeSampling="failed";
      console.error("Material scene sampling failed:",error.message);
    }
  }
  function visibleWorlds(){return [...document.querySelectorAll(host.worldSelector)].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&!e.closest("[hidden]")&&getComputedStyle(e).visibility!=="hidden";});}
  function isCurrent(){
    if(closed)return false;
    const prefs=appearance();
    if(prefs.solid||matchMedia("(forced-colors: active)").matches||matchMedia("(prefers-reduced-transparency: reduce)").matches)return document.documentElement.dataset.volumeSampling==="solid"&&!pendingScene;
    if(!paintedSceneKey||sceneKey!==paintedSceneKey||pendingScene)return false;
    const worlds=visibleWorlds();if(worlds.length!==1)return false;
    const setting=worlds[0],rect=setting.getBoundingClientRect(),plate=setting.querySelector(":scope>.plate"),src=plate?.getAttribute("src")?plate.currentSrc||plate.src:"";
    return paintedSceneKey===sceneIdentity(src,rect,prefs);
  }
  function snapshot(){
    const painted=paintedSceneKey?JSON.parse(paintedSceneKey)[3]:appearance();
    // Media fallbacks are a painted solid state, independent of the saved user choice.
    if(document.documentElement.dataset.volumeSampling==="solid")painted.solid=true;
    return {key:paintedSceneKey,samples:[...samples],blobs:[...sampleBlobs],scene:lastScene,appearance:painted,desiredAppearance:appearance(),current:isCurrent()};
  }
  function schedule(immediate=false) {
    if(closed)return;
    if(immediate===true){if(pendingFrame)cancelAnimationFrame(pendingFrame);pendingFrame=0;return refresh();}
    if(pendingFrame)return;
    pendingFrame=requestAnimationFrame(() => {pendingFrame=0;refresh();});
  }
  addEventListener("resonant-volume-rendered",schedule);
  addEventListener("resize",schedule,{passive:true});
  document.addEventListener("scroll",schedule,{passive:true,capture:true});
  window.ResonantWorldSampler={configureHost(options={}){for(const key of ['worldSelector','excludeSelector','ignoredHostSelector'])if(typeof options[key]==='string')host[key]=options[key];generation++;releaseScene();schedule();return {...host};},release(){generation++;releaseScene();document.documentElement.dataset.volumeSampling='idle';},refresh:schedule,snapshot,isCurrent,inspect:()=>({sceneKey,paintedSceneKey,samples:samples.length,generation,scene:lastScene,status:document.documentElement.dataset.volumeSampling,resources:{pendingEncodes,activeWorkers:0,cachedScenes:sceneCache.size,cacheHits,cachedUrls:[...sceneCache.values()].filter(entry=>entry.urls!==ownedUrls).reduce((n,entry)=>n+entry.urls.length,0),activeUrls:ownedUrls.length,retiredBatches:retiredUrls.size,pendingScenes:pendingScene?1:0}})};
  addEventListener("pagehide",e=>{if(!e.persisted){closed=true;generation++;releaseScene();imageCache.clear();}});
  schedule();
})();
