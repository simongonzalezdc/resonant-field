/* Offline data is inert until a host asks for one full-resolution plate. */
(function(global,factory){const api=factory();if(global)global.ResonantAssetBank=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  function create({document,idPrefix='plate-data-'}={}) {
    if(!document?.getElementById)throw new TypeError('A document-backed asset bank is required');
    return {wrapPlate(plate){
      let loaded=false,value='';
      Object.defineProperty(plate,'src',{get(){if(!loaded){const node=document.getElementById(idPrefix+plate.id);value=node?JSON.parse(node.textContent):'';loaded=true;}return value;}});
      return plate;
    }};
  }
  return {create};
});
