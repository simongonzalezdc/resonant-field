/* Shared geometry-only update path; host owns controls, persistence and transport. */
(function(global,factory){const api=factory(global);if(global)global.ResonantCornerController=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof window==='undefined'?globalThis:window,function(global){
  'use strict';
  function create({geometry=global.ResonantGeometry,eventTarget=global,onReadout,onPersist}={}) {
    if(!geometry?.configure || !geometry?.inspect)throw new TypeError('A Resonant Field geometry runtime is required');
    return {apply(profile,{save=true,notify=true}={}) {
      geometry.configure(profile);const snapshot=geometry.inspect();
      onReadout?.(snapshot);
      if(notify && eventTarget?.dispatchEvent)eventTarget.dispatchEvent(new global.CustomEvent('resonant-geometry-applied',{detail:{profile:snapshot.index,geometry:snapshot}}));
      if(save)onPersist?.(snapshot);
      return snapshot;
    }};
  }
  return {create};
});
