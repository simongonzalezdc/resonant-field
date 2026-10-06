import assert from'node:assert/strict';import{createRequire}from'node:module';const require=createRequire(import.meta.url),{resolve}=require('../materials/contrast-controller.js');
const pixels=(...colors)=>new Uint8ClampedArray(colors.flatMap(v=>[v,v,v,255]));
assert.equal(resolve(pixels(30,50),'dark').ink,null);
assert.equal(resolve(pixels(190,220),'light').ink,null);
assert.equal(resolve(pixels(100,110),'light').ink,'#fff');
assert.equal(resolve(pixels(0,255),'light').alpha>0,true);
assert.equal(resolve(pixels(0,255),'light').minimum,null);
for(let gray=0;gray<256;gray++){const d=resolve(pixels(gray),'light');assert.ok(d.alpha===0);assert.ok(d.minimum>=4.5);}
console.log('PASS normal/theme retention, extreme ink adaptation, bounded matte, all256 neutral tones');
