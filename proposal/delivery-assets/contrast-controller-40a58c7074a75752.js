/* Choose readable ink for an extreme material mix; Normal remains unchanged. */
(function(global,factory){const api=factory();if(global)global.ResonantContrastController=api;if(typeof module==='object'&&module.exports)module.exports=api;})(globalThis,function(){
  'use strict';
  const linear=Array.from({length:256},(_,v)=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
  const luminance=(r,g,b)=>.2126*linear[r]+.7152*linear[g]+.0722*linear[b];
  const ratio=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  function resolve(pixels,mode){
    let low=1,high=0,minChannel=255,maxChannel=0;
    for(let i=0;i<pixels.length;i+=4){const r=pixels[i],g=pixels[i+1],b=pixels[i+2],l=luminance(r,g,b);low=Math.min(low,l);high=Math.max(high,l);minChannel=Math.min(minChannel,r,g,b);maxChannel=Math.max(maxChannel,r,g,b);}
    const preferred=mode==='light'?39:240,inkL=linear[preferred];
    const current=inkL>=low&&inkL<=high?1:Math.min(ratio(inkL,low),ratio(inkL,high));
    if(current>=4.5)return {ink:null,overlay:null,alpha:0,minimum:current};
    const black=(low+.05)/.05,white=1.05/(high+.05);
    if(Math.max(black,white)>=4.5)return{ink:black>=white?'#000':'#fff',overlay:null,alpha:0,minimum:Math.max(black,white)};
    // If the photograph spans both polarities, a bounded matte keeps one ink readable.
    const darkAlpha=maxChannel?Math.max(0,1-117/maxChannel):0;
    const lightAlpha=minChannel<255?Math.max(0,(117-minChannel)/(255-minChannel)):0;
    return darkAlpha<=lightAlpha?{ink:'#fff',overlay:'#000',alpha:darkAlpha,minimum:null}:{ink:'#000',overlay:'#fff',alpha:lightAlpha,minimum:null};
  }
  return {resolve};
});
