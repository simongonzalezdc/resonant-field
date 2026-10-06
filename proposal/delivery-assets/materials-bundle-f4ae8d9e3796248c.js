/* Resonant Field browser runtime; dependency order preserved from candidate modules. */

;
/*
 * Pure compositing preference state for Resonant Field.
 *
 * This module owns no DOM, storage, timers, or application state. It accepts
 * persisted preference-shaped data and returns a canonical copy for the host
 * to apply to its renderer.
 */
(function install(global, factory) {
  const api = factory();
  if (global && typeof global === "object") global.ResonantBlendController = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createApi() {
  "use strict";

  const MODE_DEFINITIONS = [
    ["normal", "Normal", "Normal"],
    ["darken", "Darken", "Darken"],
    ["multiply", "Multiply", "Darken"],
    ["color-burn", "Color Burn", "Darken"],
    ["lighten", "Lighten", "Lighten"],
    ["screen", "Screen", "Lighten"],
    ["color-dodge", "Color Dodge", "Lighten"],
    ["overlay", "Overlay", "Contrast"],
    ["soft-light", "Soft Light", "Contrast"],
    ["hard-light", "Hard Light", "Contrast"],
    ["difference", "Difference", "Difference"],
    ["exclusion", "Exclusion", "Difference"],
    ["hue", "Hue", "Component"],
    ["saturation", "Saturation", "Component"],
    ["color", "Color", "Component"],
    ["luminosity", "Luminosity", "Component"],
  ];

  const modes = MODE_DEFINITIONS.map(([value, label, group]) =>
    Object.freeze({ value, label, group }),
  );
  const MODES = Object.freeze(modes);
  const SUPPORTED_MODES = new Set(MODES.map(({ value }) => value));
  const DEPTH_KEYS = Object.freeze(["0", "1", "2", "3", "4"]);
  const DEPTH_SET = new Set(DEPTH_KEYS);
  const hasOwn = Object.prototype.hasOwnProperty;
  const objectConstructorSource = Function.prototype.toString.call(Object);

  function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    try {
      const prototype = Object.getPrototypeOf(value);
      if (prototype === null) return true;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "constructor");
      return (
        descriptor !== undefined &&
        typeof descriptor.value === "function" &&
        Function.prototype.toString.call(descriptor.value) === objectConstructorSource
      );
    } catch (_error) {
      return false;
    }
  }

  function own(value, key) {
    try {
      return hasOwn.call(value, key);
    } catch (_error) {
      return false;
    }
  }

  function read(value, key) {
    if (!own(value, key)) return undefined;
    try {
      return value[key];
    } catch (_error) {
      return undefined;
    }
  }

  function validAmount(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
  }

  function normalizeMode(value, fallback) {
    return typeof value === "string" && SUPPORTED_MODES.has(value) ? value : fallback;
  }

  function normalizeLayer(layer) {
    const amount = read(layer, "amount");
    return {
      mode: normalizeMode(read(layer, "mode"), "inherit"),
      amount: validAmount(amount) ? amount : null,
    };
  }

  function normalize(input) {
    const result = { mode: "normal", amount: 100, layers: {} };
    if (!isPlainObject(input)) return result;

    result.mode = normalizeMode(read(input, "mode"), "normal");
    const amount = read(input, "amount");
    if (validAmount(amount)) result.amount = amount;

    const layers = read(input, "layers");
    if (!isPlainObject(layers)) return result;

    let keys;
    try {
      keys = Object.keys(layers);
    } catch (_error) {
      return result;
    }
    for (const key of keys) {
      if (!DEPTH_SET.has(key)) continue;
      const layer = read(layers, key);
      if (isPlainObject(layer)) result.layers[key] = normalizeLayer(layer);
    }
    return result;
  }

  function resolve(input, depth) {
    const normalized = normalize(input);
    const depthKey = typeof depth === "number" && Number.isInteger(depth) ? String(depth) : null;
    const layer = depthKey !== null && DEPTH_SET.has(depthKey) ? normalized.layers[depthKey] : undefined;
    const mode = layer && layer.mode !== "inherit" ? layer.mode : normalized.mode;
    const amount = layer && layer.amount !== null ? layer.amount : normalized.amount;
    return {
      mode,
      amount,
      operation: mode === "normal" ? "source-over" : mode,
    };
  }

  return { MODES, normalize, resolve };
});


;
/*
 * Pure finish (sheen amount, spread, angle) settings contract for Resonant Field.
 *
 * This module owns no DOM, storage, timers, or application state. Hosts
 * persist arbitrary finish-shaped data; normalize() returns a safe canonical
 * copy for the host renderer, and gain() maps the canonical amount to a
 * bounded response scalar for light and dark substrate modes.
 */
(function install(global, factory) {
  const api = factory();
  if (global && typeof global === "object") global.ResonantFinishController = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createApi() {
  "use strict";

  const LIMITS = Object.freeze({
    amount: Object.freeze([0, 200]),
    spread: Object.freeze([0, 300]),
    angle: Object.freeze([0, 360]),
  });

  const DEFAULTS = Object.freeze({
    amount: 100,
    spread: 100,
    angle: Math.atan2(0.309, 0.253) * 180 / Math.PI,
  });

  function isRecord(value) {
    if (value === null || typeof value !== "object") return false;
    try {
      return !Array.isArray(value);
    } catch (_error) {
      return false;
    }
  }

  function readField(input, key) {
    // The own-property check and the read are guarded together so hostile
    // prototypes, throwing accessors, and revoked or trapped proxies fall
    // back to defaults instead of failing normalization.
    try {
      if (!Object.prototype.hasOwnProperty.call(input, key)) return undefined;
      return input[key];
    } catch (_error) {
      return undefined;
    }
  }

  function normalizeField(input, key) {
    const value = readField(input, key);
    if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULTS[key];
    const [minimum, maximum] = LIMITS[key];
    return Math.min(Math.max(value, minimum), maximum);
  }

  function normalize(input) {
    if (!isRecord(input)) return { ...DEFAULTS };
    return {
      amount: normalizeField(input, "amount"),
      spread: normalizeField(input, "spread"),
      angle: normalizeField(input, "angle"),
    };
  }

  function gain(input, mode, plate) {
    const base = mode === "dark" ? 0.055 : 0.035;
    const n = normalize(input).amount / 100;
    if(n<=1)return base*n;
    const response=n<=1.6?1+5*(n-1)**2:3*n-2;
    const extra=mode==='dark'&&plate==='vellum-fold-v2'?.55:1;
    return base*(1+(response-1)*extra);
  }

  function hueSpan(input){
    const n=normalize(input).spread/100;
    return 50*Math.log2(3/2)*(n<=1?n:2*n-1);
  }
  return { DEFAULTS, normalize, gain, hueSpan };
});


;
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


;
/*
 * Resonant volume: semantic material planning and a small DOM renderer.
 *
 * The resolver is intentionally independent of DOM order, localStorage, and
 * product trust/permission state. `resolve()` only consumes role, visual
 * state, and an optional parent plan. The renderer is the browser boundary:
 * it samples the current appearance and aligns an existing plate to each
 * local scene without rasterising any readable content.
 */
(function installVolume(global, factory) {
  const api = factory(global);
  if (global && typeof global === "object") global.ResonantVolume = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function createVolume(global) {
  "use strict";

  const paintedStates=new WeakMap();
  const MODEL = {
    schemaVersion: 3,
    signalPolicy: {accentOffset:150,backgroundOffset:180,chroma:.11,selectiveGain:.32},
    coordinateSpace: "world-local",
    depthPolicy: {
      atmosphere: 0,
      inset: 1,
      work: 2,
      raised: 3,
      floating: 4,
      note: "Depth is an optical relation, never trust, approval, or permission state.",
    },
    voices: ["atmosphere", "inset", "work", "raised", "floating"].map((id,depth) => {
      const ratios=[2/3,3/2,5/4,4/3,8/9];
      const cumulative=.62*Math.log2(depth+2)/Math.log2(6);
      const previous=depth ? .62*Math.log2(depth+1)/Math.log2(6) : 0;
      const totalBlur=.65+4.8*(Math.log2(depth+1)/Math.log2(5))**2;
      const previousBlur=depth ? .65+4.8*(Math.log2(depth)/Math.log2(5))**2 : 0;
      return {id,depth,intervalRatio:ratios[depth],hueOffset:50*Math.log2(ratios[depth]),
        // Authored tonal envelope shares the interval phase with hue. Each
        // film keeps its own tone when consumed by a deeper stack.
        toneDelta:.15+.12*Math.sin(2*Math.PI*Math.log2(ratios[depth])),
        lightToneDelta:.03-.10*Math.sin(2*Math.PI*Math.log2(ratios[depth])),
        fillAlpha:(cumulative-previous)/(1-previous),diffusion:totalBlur-previousBlur,edgeAlpha:.2+depth*.06};
    }),
    roles: {
      atmosphere: { baseDepth: 0, parentPolicy: "absolute", purpose: "world" },
      context: { baseDepth: 1, parentPolicy: "below-parent", purpose: "support" },
      workplane: { baseDepth: 2, parentPolicy: "absolute", purpose: "work" },
      reading: { baseDepth: 1, parentPolicy: "below-parent", purpose: "reading" },
      editor: { baseDepth: 1, parentPolicy: "below-parent", purpose: "editing" },
      control: { baseDepth: 3, parentPolicy: "above-parent", purpose: "action" },
      primary: { baseDepth: 3, parentPolicy: "absolute", purpose: "primary-action" },
      "source-item": { baseDepth: 2, parentPolicy: "same-parent", purpose: "source" },
      overlay: { baseDepth: 4, parentPolicy: "absolute", purpose: "contextual-overlay" },
    },
    purposePolicies: {
      world: "absolute",
      support: "below-parent",
      work: "absolute",
      reading: "below-parent",
      editing: "below-parent",
      action: "above-parent",
      "primary-action": "absolute",
      source: "same-parent",
      citation: "below-parent",
      "contextual-overlay": "absolute",
      inset: "below-parent",
    },
    purposeDepths: {"decision-surface":3,"review-action":4},
    states: {
      resting: { relation: "resting" },
      idle: { relation: "resting" },
      unselected: { relation: "resting" },
      hover: { relation: "raised", parentOffset: 2 },
      focus: { relation: "focus-lift", parentOffset: 1 },
      pressed: { relation: "pressed", parentOffset: 0 },
      active: { relation: "raised", parentOffset: 1 },
      selected: { relation: "selected-recessed", parentOffset: -1 },
      inset: { relation: "recessed", parentOffset: -1 },
      recessed: { relation: "recessed", parentOffset: -1 },
      raised: { relation: "raised", parentOffset: 1 },
      floating: { relation: "floating", absoluteDepth: 4 },
      disabled: { relation: "disabled" },
      error: {relation:"focus-lift",parentOffset:1},
    },
    opticalPolicy: {
      targetFullStackCoverage: [0.55, 0.65],
      modeContrast: 0.2,
      modeBrightness: { dark: 0.55, light: 1.25 },
      toneFloor: 0.24,
      reflection: "restrained structural directional sheen; no broad rainbow band",
      emission: "localized only for actual hover/focus/active/selected state",
      readability: "DOM text and controls remain outside filtered material samples",
      fallback: "RGB translucent fills, Canvas/CanvasText in forced colors, solid surface for reduced transparency",
    },
  };

  const ROLE_ALIASES = {
    pane: "workplane",
    work: "workplane",
    panel: "workplane",
    surface: "workplane",
    document: "reading",
    field: "editor",
    button: "control",
    source: "source-item",
    popover: "overlay",
    dialog: "overlay",
  };
  const COMPONENT_ROLES = new Set(["control", "primary", "source-item"]);
  const SURFACE_ROLES = new Set([
    "atmosphere",
    "context",
    "workplane",
    "reading",
    "editor",
    "overlay",
  ]);
  const LEGACY_SURFACE_SELECTORS = [
    ".pane",
    ".aug-proposed-panel",
    ".material-lab",
    ".strata-stack",
    ".appearance",
  ];
  const LEGACY_ROLE_BY_ID = {
    chatPane: "workplane",
    sourcePane: "workplane",
    reviewPane: "workplane",
    augSystem3Grammar: "workplane",
    appearance: "overlay",
  };

  const state = {
    document: null,
    mounted: false,
    appearance: {},
    renderAppearance: null,
    renderParents: null,
    plans: new Map(),
    animationFrame: 0,
    refreshToken: 0,
    observer: null,
    resizeObserver: null,
    listenersAttached: false,
    mediaQueries: [],
  };

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.min(max, Math.max(min, number))
      : fallback;
  }

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeRole(role) {
    const key = String(role || "workplane").trim().toLowerCase();
    return MODEL.roles[key] ? key : ROLE_ALIASES[key] || "workplane";
  }

  function normalizeState(input) {
    if (typeof input === "string") return { name: input.toLowerCase() === "focused" ? "focus" : input.toLowerCase() };
    if (!input || typeof input !== "object") return { name: "resting" };
    const raw = String(input.state || input.status || input.name || "resting").toLowerCase();
    const name = raw === "focused" ? "focus" : raw;
    return { ...input, name };
  }

  function normalizeParent(parent) {
    if (!parent) return null;
    if (typeof parent === "string") {
      const role = normalizeRole(parent);
      return { role, depth: MODEL.roles[role].baseDepth, relation: "parent-reference" };
    }
    if (typeof parent !== "object") return null;
    const depth = finite(parent.depth ?? parent.level, NaN);
    if (!Number.isFinite(depth)) return null;
    return {
      role: normalizeRole(parent.role || "workplane"),
      depth: clamp(depth, 0, 4, 2),
      relation: parent.relation || "parent-plan",
    };
  }

  function colorForVoice(voice, options) {
    const mode = options.mode === "light" ? "light" : "dark";
    const alpha=v=>clamp(v.fillAlpha*options.presence*(options.solid?1.16:1),.025,.3,v.fillAlpha);
    const weights=MODEL.voices.map((v,i) => alpha(v)*MODEL.voices.slice(i+1).reduce((t,upper)=>t*(1-alpha(upper)),1)*clamp(finite(options.chroma,.054)*(0.52+v.depth*.1)*(mode==="light"?1.2:1),0,.12,.04));
    const x=MODEL.voices.reduce((v,row,i)=>v+weights[i]*Math.cos(row.hueOffset*Math.PI/180),0);
    const y=MODEL.voices.reduce((v,row,i)=>v+weights[i]*Math.sin(row.hueOffset*Math.PI/180),0);
    const rotation=-Math.atan2(y,x)*180/Math.PI;
    const hue = ((finite(options.hue, 260) + voice.hueOffset + rotation + 360) % 360 + 360) % 360;
    const chroma = clamp(finite(options.chroma, 0.054) * (0.52 + voice.depth * 0.1) * (mode === "light" ? 1.2 : 1), 0, 0.12, 0.04);
    const rawAnchor=finite(options.toneAnchor,mode === "light" ? .76 : .26);
    const anchor=clamp(mode === "light" && rawAnchor<.55 ? .76+(rawAnchor-.26)*.8 : rawAnchor,.2,.9,.26);
    const lightness = mode === "light"
      ? clamp(anchor + voice.lightToneDelta, 0.24, 0.96, 0.82)
      : clamp(anchor + voice.toneDelta, 0.24, 0.86, 0.32);
    return { hue, chroma, lightness };
  }

  function hslFallback(color) {
    const h = ((color.hue % 360) + 360) % 360 / 360;
    const saturation = clamp(color.chroma * 6.2, 0, 0.75, 0.18);
    const lightness = clamp(color.lightness, 0.05, 0.95, 0.35);
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = chroma * (1 - Math.abs((h * 6) % 2 - 1));
    const m = lightness - chroma / 2;
    let rgb;
    if (h < 1 / 6) rgb = [chroma, x, 0];
    else if (h < 2 / 6) rgb = [x, chroma, 0];
    else if (h < 3 / 6) rgb = [0, chroma, x];
    else if (h < 4 / 6) rgb = [0, x, chroma];
    else if (h < 5 / 6) rgb = [x, 0, chroma];
    else rgb = [chroma, 0, x];
    return rgb.map((channel) => Math.round((channel + m) * 255)).join(" ");
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
    return value;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function edgeProfile(depth, relation, mode, purpose) {
    const light=mode === "light", highlight=light ? .55 : 1, shadow=light ? .75 : 1;
    const recessed=relation.includes("recessed") || relation === "pressed";
    const profile=recessed ? "inset" : purpose === "world" ? "world" : depth === 4 ? "floating" : depth === 3 ? "raised" : "contact";
    const shade=(alpha)=>`rgb(0 0 0 / ${(alpha*shadow).toFixed(3)})`;
    const shine=(alpha)=>`rgb(255 255 255 / ${(alpha*highlight).toFixed(3)})`;
    const shadows=profile === "world" ? "none" : profile === "inset"
      ? `inset 0 2px 4px ${shade(.22)},inset 0 -1px 0 ${shine(.10)}`
      : profile === "floating"
      ? `inset 0 1px 0 ${shine(.36)},0 3px 0 ${shade(.28)},0 2px 3px ${shade(.10)},0 9px 18px ${shade(.20)}`
      : profile === "raised"
      ? `inset 0 1px 0 ${shine(.28)},0 2px 0 ${shade(.24)},0 3px 4px ${shade(.18)},0 6px 12px ${shade(.16)}`
      : `inset 0 1px 0 ${shine(.16)},0 1px 0 ${shade(.12)},0 2px 5px ${shade(.14)}`;
    return {profile, shadows, contour:profile === "world" ? "transparent" : light ? "rgb(0 0 0 / .22)" : `rgb(255 255 255 / ${(.12+depth*.055).toFixed(3)})`};
  }

  function resolve(role, inputState, inputParent) {
    const normalizedRole = normalizeRole(role);
    const visualState = normalizeState(inputState);
    const roleRule = MODEL.roles[normalizedRole];
    const stateRule = MODEL.states[visualState.name] || MODEL.states.resting;
    const parent = normalizeParent(inputParent);
    const parentDepth = parent ? parent.depth : null;
    const purpose = visualState.purpose || roleRule.purpose;
    let depth = roleRule.baseDepth;
    let relation = stateRule.relation;

    const purposeDepth=MODEL.purposeDepths[purpose];
    const parentPolicy = purposeDepth !== undefined ? "absolute" : MODEL.purposePolicies[purpose] || roleRule.parentPolicy;
    if(purposeDepth !== undefined) depth=purposeDepth;
    if (parentDepth !== null) {
      if (parentPolicy === "below-parent") depth = parentDepth - 1;
      if (parentPolicy === "above-parent") depth = parentDepth === 4 ? 3 : parentDepth + 1;
      if (parentPolicy === "same-parent") depth = parentDepth;
    }

    if(["resting","idle","unselected"].includes(visualState.name)) {
      if(parentPolicy === "below-parent") relation="recessed";
      else if(parentPolicy === "above-parent" || purposeDepth === 3) relation="raised";
      else if(purposeDepth === 4) relation="floating";
    }
    if (stateRule.absoluteDepth !== undefined) depth = stateRule.absoluteDepth;
    else if (visualState.name === "hover") {
      depth = parentDepth === null ? depth + 1 : parentDepth + 2;
    } else if (["focus", "active", "raised", "error"].includes(visualState.name)) {
      depth = parentDepth === null ? depth + 1 : parentDepth + (stateRule.parentOffset || 1);
    } else if (["pressed"].includes(visualState.name)) {
      depth = parentDepth === null ? depth - 1 : parentDepth === 4 ? 2 : parentDepth;
    } else if (["selected", "inset", "recessed"].includes(visualState.name)) {
      depth = parentDepth === null ? depth - 1 : parentDepth - 1;
    }
    if(normalizedRole === "primary") { if(["hover","focus"].includes(visualState.name)) depth=4; else if(visualState.name === "pressed") depth=2; }
    if(purpose === "review-action") depth=visualState.name === "pressed" ? 3 : 4;
    if(purpose === "decision-surface" && ["resting","idle"].includes(visualState.name)) depth=3;
    if (visualState.depth !== undefined) depth = finite(visualState.depth, depth);
    depth = Math.round(clamp(depth, 0, 4, roleRule.baseDepth));

    const options = {
      mode: visualState.mode === "light" ? "light" : "dark",
      hue: finite(visualState.hue, 260),
      chroma: clamp(finite(visualState.chroma, 0.054), 0, 0.165, 0.054),
      toneAnchor: clamp(finite(visualState.toneAnchor, visualState.mode === "light" ? 0.76 : 0.26), 0.2, 0.9, 0.26),
      presence: clamp(finite(visualState.presence, 1), 0, 1.2, 1),
      solid: visualState.solid === true,
      accentHue: finite(visualState.accentHue, finite(visualState.hue, 260) + MODEL.signalPolicy.accentOffset),
      accentLightness: clamp(finite(visualState.accentLightness, 0.7), 0, 1, 0.7),
    };
    const stack = MODEL.voices.slice(0, depth + 1).map((voice) => {
      const color = colorForVoice(voice, options);
      const opacity = clamp(voice.fillAlpha * options.presence * (options.solid ? 1.16 : 1), 0.025, 0.3, voice.fillAlpha);
      return {
        id: voice.id,
        depth: voice.depth,
        opacity,
        transmission: 1 - opacity,
        diffusion: voice.diffusion,
        color,
        fallbackRgb: hslFallback(color),
      };
    });
    const cumulativeCoverage = 1 - stack.reduce((remaining, voice) => remaining * voice.transmission, 1);
    const isEmissive = ["hover", "focus", "active", "selected"].includes(visualState.name);
    const reflectionStrength = visualState.name === "disabled" ? 0.08 : 0.16 + depth * 0.025;
    const plan = {
      schemaVersion: MODEL.schemaVersion,
      role: normalizedRole,
      state: visualState.name,
      purpose,
      parent: parent ? { role: parent.role, depth: parent.depth } : null,
      depth,
      level: depth,
      relativeDepth: parentDepth === null ? null : depth - parentDepth,
      relation,
      voice: MODEL.voices[depth].id,
      voices: stack,
      coordinateSpace: MODEL.coordinateSpace,
      ordering: {
        key: `${normalizedRole}:${visualState.name}:${depth}`,
        source: "semantic-role-state-parent",
        ignoresSiblingOrder: true,
      },
      optics: {
        cumulativeCoverage,
        targetCoverage: MODEL.opticalPolicy.targetFullStackCoverage,
        pigment: stack.map((voice) => ({ id: voice.id, opacity: voice.opacity, color: voice.color })),
        transmission: 1 - cumulativeCoverage,
        diffusion: {
          added: stack.length ? stack[stack.length - 1].diffusion : 0,
          total: stack.reduce((sum, voice) => sum + voice.diffusion, 0),
        },
        reflection: {
          strength: reflectionStrength,
          hueOffset: visualState.name === "focus" ? 5 : 9,
          incidence: clamp(finite(visualState.incidence, 0.5), 0, 1, 0.5),
        },
        edge: {
          ...edgeProfile(depth,relation,options.mode,purpose),
          thickness: 1 + depth * 0.22,
          light: MODEL.voices[depth].edgeAlpha,
          shadow: relation === "recessed" || relation === "selected-recessed" ? 0.18 : 0.28 + depth * 0.035,
        },
        emission: {
          enabled: isEmissive,
          hue: ((options.accentHue) % 360 + 360) % 360,
          lightness: options.accentLightness,
          alpha: isEmissive ? (visualState.name === "selected" ? 0.22 : 0.16) : 0,
          radius: visualState.name === "focus" ? 24 : 18,
        },
        readability: {
          toneFloor: MODEL.opticalPolicy.toneFloor,
          mode: options.mode,
          contentFiltered: false,
          solidFallback: options.solid,
        },
      },
    };
    return deepFreeze(plan);
  }

  function cachedResolve(role, inputState, inputParent) {
    const visualState = normalizeState(inputState);
    const parent = normalizeParent(inputParent);
    const key = JSON.stringify([
      normalizeRole(role),
      visualState.name,
      visualState.purpose || "",
      visualState.mode || "dark",
      finite(visualState.hue, 260),
      finite(visualState.chroma, 0.054),
      finite(visualState.toneAnchor, 0.26),
      finite(visualState.presence, 1),
      visualState.solid === true,
      finite(visualState.accentHue, 302),
      clamp(finite(visualState.accentLightness, 0.7), 0, 1, 0.7),
      finite(visualState.incidence, 0.5),
      parent ? [parent.role, parent.depth, parent.relation] : null,
    ]);
    const existing = state.plans.get(key);
    if (existing) return existing;
    const plan = resolve(role, visualState, parent);
    if (state.plans.size >= 256) state.plans.clear();
    state.plans.set(key, plan);
    return plan;
  }

  function parseCssNumber(doc, property, fallback) {
    if (!doc || !doc.documentElement || typeof getComputedStyle !== "function") return fallback;
    const value = getComputedStyle(doc.documentElement).getPropertyValue(property).trim();
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function readAppearance(doc) {
    const root = doc && doc.documentElement;
    const mode = root && root.dataset && root.dataset.mode === "light" ? "light" : "dark";
    return {
      mode,
      hue: parseCssNumber(doc, "--material-hue", 260),
      chroma: parseCssNumber(doc, "--material-chroma", 0.054),
      toneAnchor: parseCssNumber(doc, "--tone-anchor", mode === "light" ? 0.76 : 0.26),
      brightness: parseCssNumber(doc, "--plate-brightness", 0.7),
      presence: state.appearance.presence ?? parseCssNumber(doc, "--presence", 1),
      backgroundPresence: state.appearance.backgroundPresence ?? parseCssNumber(doc, "--texture-opacity", 1),
      position: state.appearance.position ?? parseCssNumber(doc, "--plate-position", 50),
      solid: Boolean(state.appearance.solid ?? (root && root.dataset && root.dataset.solid === "true")),
      selectiveColor: Boolean(state.appearance.selectiveColor ?? (root && root.dataset && root.dataset.selective === "true")),
      accentHue: parseCssNumber(doc, "--accent-hue", 230),
      accentLightness: clamp(parseCssNumber(doc, "--accent-lightness", 0.7), 0, 1, 0.7),
    };
  }

  function setAppearanceToken(root, canonical, legacy, value) {
    if (value === undefined || value === null) return;
    root.style.setProperty(canonical, String(value));
    root.style.setProperty(legacy, String(value));
  }

  function appearanceState(doc, extra) {
    const appearance={ ...(state.renderAppearance || readAppearance(doc)), ...state.appearance, ...extra };
    if(global.matchMedia?.("(prefers-reduced-transparency: reduce)").matches || global.matchMedia?.("(forced-colors: active)").matches) appearance.solid=true;
    return appearance;
  }

  function findNearestSurface(element) {
    let current = element && element.parentElement;
    while (current) {
      if (current.dataset && current.dataset.volumeRole && SURFACE_ROLES.has(normalizeRole(current.dataset.volumeRole))) return current;
      if (LEGACY_SURFACE_SELECTORS.some((selector) => current.matches && current.matches(selector))) return current;
      current = current.parentElement;
    }
    return null;
  }

  function inferredRole(element) {
    if (!element) return "workplane";
    if (element.dataset && element.dataset.volumeRole) return normalizeRole(element.dataset.volumeRole);
    if (LEGACY_ROLE_BY_ID[element.id]) return LEGACY_ROLE_BY_ID[element.id];
    if (element.classList && element.classList.contains("appearance")) return "overlay";
    if (element.matches && element.matches("button,[role=button],input,select,textarea")) return "control";
    if (element.classList && element.classList.contains("pane")) return "workplane";
    if (element.classList && element.classList.contains("aug-proposed-panel")) return "workplane";
    return "workplane";
  }

  function parentPlanFor(element) {
    const parent=findNearestSurface(element);
    if(!parent) return null;
    if(state.renderParents?.has(parent)) return state.renderParents.get(parent);
    const role=inferredRole(parent),visualState=parent.dataset?.volumeState || "resting";
    const plan=cachedResolve(role,appearanceState(state.document,{state:visualState,purpose:parent.dataset?.volumePurpose}),parentPlanFor(parent));
    state.renderParents?.set(parent,plan);
    return plan;
  }

  function setStyle(element, name, value) {
    if (element && element.style && element.style.getPropertyValue?.(name) !== String(value)) element.style.setProperty(name, String(value));
  }

  function worldRect(doc) {
    const world = doc && doc.querySelector("#workspace > .plate, [data-volume-world], .workspace-shell > .plate, .plate");
    if (!world || typeof world.getBoundingClientRect !== "function") return null;
    const rect = world.getBoundingClientRect();
    return rect.width && rect.height ? rect : null;
  }

  function alignWorld(host, target, doc, plan, appearance) {
    if (!target || typeof target.getBoundingClientRect !== "function") return;
    const local = target.getBoundingClientRect();
    const world = worldRect(doc);
    if (!local.width || !local.height) return;
    const vars = {
      "--rv-world-width": world ? `${world.width}px` : `${local.width}px`,
      "--rv-world-height": world ? `${world.height}px` : `${local.height}px`,
      "--rv-world-left": world ? `${world.left - local.left}px` : "0px",
      "--rv-world-top": world ? `${world.top - local.top}px` : "0px",
      "--rv-local-width": `${local.width}px`,
      "--rv-local-height": `${local.height}px`,
      "--rv-scene-contrast": `${MODEL.opticalPolicy.modeContrast}`,
      "--rv-scene-brightness": `${MODEL.opticalPolicy.modeBrightness[appearance.mode]}`,
      "--rv-blur": `${Math.min(10, plan.optics.diffusion.total).toFixed(2)}px`,
      "--rv-position": `${clamp(appearance.position, 0, 100, 50)}%`,
    };
    for (const [name, value] of Object.entries(vars)) setStyle(target, name, value);
    const ground = target.querySelector && target.querySelector(":scope > .material-ground, :scope > .lab-plate");
    if (ground && world) {
      Object.assign(ground.style, {
        left: `${world.left - local.left}px`,
        top: `${world.top - local.top}px`,
        width: `${world.width}px`,
        height: `${world.height}px`,
        objectPosition: `${clamp(appearance.position, 0, 100, 50)}% center`,
        filter: `grayscale(1) contrast(${MODEL.opticalPolicy.modeContrast}) brightness(${Math.max(0.2, appearance.brightness * MODEL.opticalPolicy.modeBrightness[appearance.mode])}) blur(${Math.min(10, plan.optics.diffusion.total).toFixed(2)}px)`,
      });
    }
    setStyle(host, "--rv-world-coordinate", "aligned");
  }

  function applyOpaqueFallback(element,solid) {
    if(solid) {
      element.classList.toggle("rv-world-sampled",false);
      element.style.setProperty("transition","none","important");
      element.style.setProperty("background-color","Canvas","important");
      element.style.setProperty("background-image","none","important");
      element.style.setProperty("color","CanvasText","important");
      element.dataset.volumeBackgroundOwner="solid";
    } else if(element.dataset.volumeBackgroundOwner === "solid") {
      for(const property of ["background-color","background-image","color","transition"]) element.style.removeProperty(property);
      element.dataset.volumeBackgroundOwner="scene";
    }
  }
  function ensureSurface(target, plan, appearance) {
    target.classList.add("rv-rendered-surface");
    target.dataset.volumeEngine = "semantic";
    target.dataset.volumeDepth = String(plan.depth);
    target.dataset.volumeRelation = plan.relation;
    let surface = target.querySelector(":scope > .rv-surface");
    if (!surface) {
      surface = target.ownerDocument.createElement("span");
      surface.className = "rv-surface";
      surface.setAttribute("aria-hidden", "true");
      target.insertBefore(surface, target.firstChild);
    }
    const signature=JSON.stringify(plan.voices);
    if(surface.dataset.signature !== signature) {
    surface.dataset.signature=signature;
    while(surface.children.length>plan.voices.length)surface.lastElementChild.remove();
    for (const voice of plan.voices) {
      let film=surface.children[voice.depth];
      if(!film){film=target.ownerDocument.createElement("span");surface.appendChild(film);}
      film.className = "rv-film";
      film.dataset.voice = voice.id;
      film.dataset.depth = String(voice.depth);
      film.setAttribute("aria-hidden", "true");
      setStyle(film, "--rv-film-opacity", voice.opacity.toFixed(4));
      setStyle(film, "--rv-film-hue", `${voice.color.hue}deg`);
      setStyle(film, "--rv-film-chroma", voice.color.chroma.toFixed(4));
      setStyle(film, "--rv-film-lightness", voice.color.lightness.toFixed(4));
      setStyle(film, "--rv-film-rgb", voice.fallbackRgb);
      setStyle(film, "--rv-film-diffusion", `${voice.diffusion}px`);
    }
    }
    let sheen = target.querySelector(":scope > .rv-sheen");
    if (!sheen) {
      sheen = target.ownerDocument.createElement("span");
      sheen.className = "rv-sheen";
      sheen.setAttribute("aria-hidden", "true");
      target.appendChild(sheen);
    }
    let emission = target.querySelector(":scope > .rv-emission");
    if (!emission) {
      emission = target.ownerDocument.createElement("span");
      emission.className = "rv-emission";
      emission.setAttribute("aria-hidden", "true");
      target.appendChild(emission);
    }
    const reflection = plan.optics.reflection;
    const edge = plan.optics.edge;
    setStyle(target, "--rv-reflection-strength", reflection.strength.toFixed(3));
    setStyle(target, "--rv-reflection-hue", `${reflection.hueOffset}deg`);
    setStyle(target, "--rv-main-hue", `${appearance.hue ?? 260}deg`);
    setStyle(target, "--rv-incidence", reflection.incidence.toFixed(3));
    setStyle(target, "--rv-edge-profile", edge.shadows);
    setStyle(target, "--rv-edge-contour", edge.contour);
    setStyle(target, "--rv-edge-alpha", edge.light.toFixed(3));
    setStyle(target, "--rv-edge-thickness", `${edge.thickness.toFixed(2)}px`);
    setStyle(target, "--rv-edge-shadow", edge.shadow.toFixed(3));
    setStyle(target, "--rv-emission-alpha", plan.optics.emission.alpha.toFixed(3));
    setStyle(target, "--rv-emission-hue", `${plan.optics.emission.hue}deg`);
    setStyle(target, "--rv-emission-radius", `${plan.optics.emission.radius}px`);
    target.classList.toggle("rv-has-emission", plan.optics.emission.enabled);
    target.classList.toggle("rv-solid", plan.optics.readability.solidFallback);
    return surface;
  }

  function paintComponent(element, explicitState) {
    if (!element || !element.style) return null;
    const role = inferredRole(element);
    if (!COMPONENT_ROLES.has(role)) return null;
    const name = explicitState || (element.dataset && element.dataset.volumeState) || "resting";
    const plan = cachedResolve(role, appearanceState(state.document, {
      state: name,
      purpose: element.dataset && element.dataset.volumePurpose,
      incidence: element.dataset && element.dataset.volumeIncidence,
    }), parentPlanFor(element));
    element.dataset.volumeEngine = "semantic";
    element.dataset.volumeRendered = "true";
    if(element.dataset.volumeState !== plan.state) element.dataset.volumeState = plan.state;
    element.dataset.volumeDepth = String(plan.depth);
    element.dataset.volumeRelation = plan.relation;
    paintedStates.set(element,plan.state);
    element.classList.add("rv-component");
    element.classList.toggle("rv-solid",plan.optics.readability.solidFallback);
    applyOpaqueFallback(element,plan.optics.readability.solidFallback);
    const voice = plan.voices[plan.voices.length - 1];
    setStyle(element, "--rv-edge-profile", plan.optics.edge.shadows);
    setStyle(element, "--rv-edge-contour", plan.optics.edge.contour);
    setStyle(element, "--rv-component-depth", plan.depth);
    setStyle(element, "--rv-component-fill", `rgb(${voice.fallbackRgb} / ${Math.min(0.52, voice.opacity * 2.1).toFixed(3)})`);
    setStyle(element, "--rv-component-edge", `rgb(${voice.fallbackRgb} / ${Math.min(0.8, plan.optics.edge.light + 0.2).toFixed(3)})`);
    setStyle(element, "--rv-component-lift", `${plan.relation === "raised" || plan.relation === "focus-lift" ? (plan.depth === 4 ? -2 : -1) : plan.relation === "pressed" || plan.relation.includes("recessed") ? 1 : 0}px`);
    setStyle(element, "--rv-component-shadow", `${plan.optics.edge.shadow}`);
    const emissionLightness = Math.round(plan.optics.emission.lightness * 10000) / 100;
    const signal=typeof CSS!=="undefined" && CSS.supports("color","oklch(.5 .11 230)")
      ? `oklch(${plan.optics.emission.lightness} ${MODEL.signalPolicy.chroma} ${plan.optics.emission.hue} / ${plan.optics.emission.alpha})`
      : `hsl(${plan.optics.emission.hue} 70% ${emissionLightness}% / ${plan.optics.emission.alpha})`;
    setStyle(element, "--rv-component-emission", plan.optics.emission.enabled ? signal : "transparent");
    return plan;
  }

  function paintSurface(host) {
    const role = inferredRole(host);
    if (!SURFACE_ROLES.has(role)) return null;
    if (host.closest && host.closest(".aug-source-panel")) return null;
    const visualState = host.dataset && host.dataset.volumeState;
    const plan = cachedResolve(role, appearanceState(state.document, {
      state: visualState || "resting",
      purpose: host.dataset && host.dataset.volumePurpose,
      incidence: host.dataset && host.dataset.volumeIncidence,
    }), parentPlanFor(host));
    setStyle(host, "--rv-edge-profile", plan.optics.edge.shadows);
    setStyle(host, "--rv-edge-contour", plan.optics.edge.contour);
    host.classList.add("rv-semantic-host");
    host.dataset.volumeEngine = "semantic";
    host.dataset.volumeDepth = String(plan.depth);
    host.dataset.volumeRelation = plan.relation;
    paintedStates.set(host,host.dataset.volumeState||"resting");
    host.classList.toggle("rv-solid", plan.optics.readability.solidFallback);
    applyOpaqueFallback(host,plan.optics.readability.solidFallback);
    const target = host.matches && host.matches(".pane-material,.material-lab,.strata-stack")
      ? host
      : (host.querySelector && host.querySelector(":scope > .pane-material, :scope > .material-lab, :scope > .strata-stack")) || host;
    if(host.matches("textarea,input,select")) {
      host.classList.add("rv-field");host.dataset.volumeRendered="true";
    } else {
      ensureSurface(target, plan, appearanceState(state.document));
      alignWorld(host, target, state.document, plan, appearanceState(state.document));
    }
    return plan;
  }

  function discoverSurfaceHosts(doc) {
    const found = new Set();
    doc.querySelectorAll("[data-volume-role]").forEach((element) => {
      const role = normalizeRole(element.dataset.volumeRole);
      if (SURFACE_ROLES.has(role)) found.add(element);
    });
    for (const selector of LEGACY_SURFACE_SELECTORS) doc.querySelectorAll(selector).forEach((element) => found.add(element));
    return [...found];
  }

  function render(doc) {
    if (!doc) return { surfaces: 0, components: 0 };
    state.document = doc;
    state.refreshToken += 1;
    state.appearance = { ...state.appearance };
    state.renderAppearance = readAppearance(doc);
    state.renderParents = new WeakMap();
    try {
    let surfaces = 0;
    for (const host of discoverSurfaceHosts(doc)) if (!host.closest("[hidden],dialog:not([open])") && paintSurface(host)) surfaces += 1;
    const componentNodes = doc.querySelectorAll("[data-volume-role], [data-volume-state]");
    let components = 0;
    for (const element of componentNodes) {
      if (element.closest("[hidden],dialog:not([open])") || SURFACE_ROLES.has(inferredRole(element))) continue;
      if (paintComponent(element)) components += 1;
    }
    if(global.dispatchEvent && typeof CustomEvent !== "undefined") global.dispatchEvent(new CustomEvent("resonant-volume-rendered"));
    return { surfaces, components };
    } finally { state.renderAppearance = null; state.renderParents = null; }
  }

  function scheduleRefresh() {
    if (!state.mounted || !state.document) return;
    if (state.animationFrame) return;
    const run = () => {
      state.animationFrame = 0;
      render(state.document);
    };
    state.animationFrame = global.setTimeout(run,0);
  }

  function attachObservers(doc) {
    if (state.listenersAttached) return;
    state.listenersAttached = true;
    if (global.addEventListener) global.addEventListener("resize", scheduleRefresh, { passive: true });
    for(const query of ["(prefers-reduced-transparency: reduce)","(forced-colors: active)"]){const media=global.matchMedia?.(query);if(media){media.addEventListener?.('change',scheduleRefresh);state.mediaQueries.push(media);}}
    if (typeof MutationObserver === "function" && doc.body) {
      state.observer = new MutationObserver((records) => {
        const externalClasses=v=>String(v||'').split(/\s+/).filter(c=>c&&!c.startsWith('rv-')).sort().join(' ');
        if(records.some(r=>{if(r.type!=="attributes"||r.oldValue===r.target.getAttribute(r.attributeName))return false;if(r.attributeName==="class")return externalClasses(r.oldValue)!==externalClasses(r.target.getAttribute('class'));if(r.attributeName==="data-volume-state"&&paintedStates.get(r.target)===r.target.dataset.volumeState)return false;return true;}))scheduleRefresh();
      });
      state.observer.observe(doc.body, { subtree: true, attributes: true, attributeOldValue:true, attributeFilter: ["data-volume-role", "data-volume-state", "data-volume-purpose", "data-volume-incidence","hidden","open","class"] });
      state.observer.observe(doc.documentElement,{attributes:true,attributeOldValue:true,attributeFilter:["data-view","data-surface","data-appearance","class","hidden"]});
    }
    if (typeof ResizeObserver === "function") {
      state.resizeObserver = new ResizeObserver(scheduleRefresh);
      state.resizeObserver.observe(doc.documentElement);
    }
  }

  function mount(doc) {
    const nextDocument = doc || (global && global.document);
    if (!nextDocument) return { mounted: false, refresh: () => ({ surfaces: 0, components: 0 }) };
    state.document = nextDocument;
    state.mounted = true;
    attachObservers(nextDocument);
    return { mounted: true, ...render(nextDocument), refresh, configure, setState, unmount };
  }

  function configure(options) {
    if (!options || typeof options !== "object") return clone(state.appearance);
    const allowed = ["plate", "hue", "chroma", "toneAnchor", "mode", "brightness", "position", "selectiveColor", "presence", "backgroundPresence", "solid", "accentHue", "accentLightness"];
    for (const key of allowed) if (Object.prototype.hasOwnProperty.call(options, key)) state.appearance[key] = key === "accentLightness" ? clamp(finite(options[key], 0.7), 0, 1, 0.7) : options[key];
    if (state.document && state.document.documentElement) {
      const root = state.document.documentElement;
      if (state.appearance.mode === "dark" || state.appearance.mode === "light") root.dataset.mode = state.appearance.mode;
      if (state.appearance.solid !== undefined) root.dataset.solid = String(Boolean(state.appearance.solid));
      if (state.appearance.selectiveColor !== undefined) root.dataset.selective = String(Boolean(state.appearance.selectiveColor));
      setAppearanceToken(root, "--material-hue", "--rv-material-hue", state.appearance.hue);
      setAppearanceToken(root, "--material-chroma", "--rv-material-chroma", state.appearance.chroma);
      setAppearanceToken(root, "--tone-anchor", "--rv-tone-anchor", state.appearance.toneAnchor);
      setAppearanceToken(root, "--plate-brightness", "--rv-brightness", state.appearance.brightness);
      const position = state.appearance.position === undefined
        ? undefined
        : `${clamp(finite(state.appearance.position, 50), 0, 100, 50)}%`;
      setAppearanceToken(root, "--plate-position", "--rv-position", position);
      setAppearanceToken(root, "--presence", "--rv-presence", state.appearance.presence);
      const backgroundPresence = state.appearance.backgroundPresence === undefined
        ? undefined
        : clamp(finite(state.appearance.backgroundPresence, 1), 0, 1, 1);
      setAppearanceToken(root, "--texture-opacity", "--rv-texture-opacity", backgroundPresence);
      setAppearanceToken(root, "--accent-hue", "--rv-accent-hue", state.appearance.accentHue);
      setAppearanceToken(root, "--accent-lightness", "--rv-accent-lightness", state.appearance.accentLightness);
      if (state.appearance.mode === "dark" || state.appearance.mode === "light") root.style.setProperty("--rv-mode", state.appearance.mode);
      if (state.appearance.selectiveColor !== undefined) root.style.setProperty("--rv-selective-color", String(Boolean(state.appearance.selectiveColor)));
    }
    return render(state.document);
  }

  function refresh() {
    return render(state.document || (global && global.document));
  }

  function setState(element, nextState) {
    if (!element || !element.dataset) return null;
    const visualState = normalizeState(nextState);
    if(element.dataset.volumeState !== visualState.name) element.dataset.volumeState = visualState.name;
    const role = inferredRole(element);
    const plan = COMPONENT_ROLES.has(role) ? paintComponent(element, visualState.name) : paintSurface(element);
    if(SURFACE_ROLES.has(role))element.querySelectorAll("[data-volume-role]").forEach(child=>{if(SURFACE_ROLES.has(inferredRole(child)))paintSurface(child);else paintComponent(child);});
    if(global.dispatchEvent && typeof CustomEvent!=="undefined")global.dispatchEvent(new CustomEvent("resonant-volume-rendered",{detail:{target:element}}));
    return plan;
  }

  function unmount() {
    if (state.observer) state.observer.disconnect();
    if (state.resizeObserver) state.resizeObserver.disconnect();
    if (state.animationFrame) global.clearTimeout(state.animationFrame);
    state.observer = null;
    state.resizeObserver = null;
    state.animationFrame = 0;
    state.mounted = false;
    global.removeEventListener?.('resize',scheduleRefresh);
    state.mediaQueries.forEach(media=>media.removeEventListener?.('change',scheduleRefresh));state.mediaQueries=[];
    state.listenersAttached = false;
  }

  return {
    model: deepFreeze(clone(MODEL)),
    resolve,
    inspect: () => clone(MODEL),
    mount,
    configure,
    refresh,
    setState,
    unmount,
  };
});


;
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
  let sceneKey = "";
  let paintedSceneKey = "";
  let pendingScene=null;
  let samples = [];
  let fallbackColors=[];
  let lastScene = null;
  let substrate="",sampleBlobs=[],ownedUrls=[],sourceValue="",sourceCounter=0,baseCache=null;
  const retiredUrls=new Map();
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
    if(pendingFrame)clearTimeout(pendingFrame);pendingFrame=0;pendingScene=null;
    ownedUrls.forEach(u=>URL.revokeObjectURL(u));ownedUrls=[];
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
    const width=Math.max(1,Math.min(2048,nativeWidth,Math.ceil(world.width))),height=Math.max(1,Math.ceil(world.height*width/world.width));
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
    retire(old);
    samples=ownedUrls.slice(0,5);fallbackColors=nextFallback;lastScene={readability,width:world.width,height:world.height,encodedWidth:width,encodedHeight:height,diffusion:nativeFilter ? "native-gaussian" : "moment-matched-box",blurExecution:reuse ? "cached" : "main",encoding:synchronousEncoding?"bounded-synchronous-fallback":"asynchronous-with-bounded-fallback",buildMilliseconds:Math.round(performance.now()-started),reflection:texture ? {coverage:texture.coverage,mean:texture.mean,maxOpacity:window.ResonantFinishController?.gain(prefs.finish,prefs.mode,prefs.plate)??(prefs.mode==="light"?.035:.055),analysisWidth:texture.width,analysisHeight:texture.height} : null,timings:Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,Math.round(v)]))};
    return true;
  }

  async function refresh() {
    if(closed)return;
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
    const key=JSON.stringify([sourceId(src),Math.ceil(world.width),Math.ceil(world.height),prefs]);
    try {
      if(key !== sceneKey) {
        if(!pendingScene || pendingScene.key !== key) {
          const job={key,promise:null};
          job.promise=rebuild(world,prefs,src).then(success=>{if(pendingScene===job){if(success)sceneKey=key;pendingScene=null;}return success;}).catch(error=>{if(pendingScene===job) pendingScene=null;throw error;});
          pendingScene=job;
        }
        const success=await pendingScene.promise;
        if(!success || sceneKey !== key) return;
      }
      setCss(setting,"background-image",`url("${substrate}")`,"important");
      setCss(setting,"background-size",`${lastScene.width}px ${lastScene.height}px`,"important");
      setCss(setting,"background-position","0 0","important");
      if(plate)plate.style.visibility="hidden";
      document.querySelectorAll("[data-volume-rendered],.rv-semantic-host").forEach(element => {
        if(element===setting || (host.excludeSelector && element.closest(host.excludeSelector)) || element.closest("[hidden]") || (host.ignoredHostSelector && element.matches(host.ignoredHostSelector))) return;
        if(prefs.solid || matchMedia("(forced-colors: active)").matches || matchMedia("(prefers-reduced-transparency: reduce)").matches) { element.classList.remove("rv-world-sampled");return; }
        const depth=Number(element.dataset.volumeDepth);
        if(!Number.isInteger(depth) || !samples[depth]) return;
        const rect=element.getBoundingClientRect();
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
    return paintedSceneKey===JSON.stringify([sourceId(src),Math.ceil(rect.width),Math.ceil(rect.height),prefs]);
  }
  function snapshot(){
    const painted=paintedSceneKey?JSON.parse(paintedSceneKey)[3]:appearance();
    // Media fallbacks are a painted solid state, independent of the saved user choice.
    if(document.documentElement.dataset.volumeSampling==="solid")painted.solid=true;
    return {key:paintedSceneKey,samples:[...samples],blobs:[...sampleBlobs],scene:lastScene,appearance:painted,desiredAppearance:appearance(),current:isCurrent()};
  }
  function schedule() {
    if(closed || pendingFrame) return;
    pendingFrame=setTimeout(() => {pendingFrame=0;refresh();},0);
  }
  addEventListener("resonant-volume-rendered",schedule);
  addEventListener("resize",schedule,{passive:true});
  document.addEventListener("scroll",schedule,{passive:true,capture:true});
  window.ResonantWorldSampler={configureHost(options={}){for(const key of ['worldSelector','excludeSelector','ignoredHostSelector'])if(typeof options[key]==='string')host[key]=options[key];generation++;releaseScene();schedule();return {...host};},release(){generation++;releaseScene();document.documentElement.dataset.volumeSampling='idle';},refresh:schedule,snapshot,isCurrent,inspect:()=>({sceneKey,paintedSceneKey,samples:samples.length,generation,scene:lastScene,status:document.documentElement.dataset.volumeSampling,resources:{pendingEncodes,activeWorkers:0,activeUrls:ownedUrls.length,retiredBatches:retiredUrls.size,pendingScenes:pendingScene?1:0}})};
  addEventListener("pagehide",e=>{if(!e.persisted){closed=true;generation++;releaseScene();imageCache.clear();}});
  schedule();
})();


;
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
  const doc=global.document;let index=2,pending=false;
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
    for(const e of doc.querySelectorAll(selector)){
      if(excluded(e)||e.matches('input[type=range],input[type=checkbox],input[type=file],svg'))continue;
      const w=e.offsetWidth,h=e.offsetHeight;if(!w||!h)continue;
      const role=roleFor(e);let parentRadius=null,inset=0;
      const edgeFollowing=e.dataset.cornerEdgeFollowing==='true';
      if(edgeFollowing){
        const parent=e.parentElement.closest('[data-corner-radius]');
        if(parent){const a=e.getBoundingClientRect(),b=parent.getBoundingClientRect();parentRadius=Number(parent.dataset.cornerRadius);inset=Math.max(0,Math.min(a.left-b.left,a.top-b.top,b.right-a.right,b.bottom-a.bottom));}
      }
      const radius=resolve(role,index,w,h,parentRadius,inset,{edgeFollowing}),value=radius+'px';
      e.dataset.cornerKind=role;e.dataset.cornerRadius=String(radius);e.dataset.cornerOwner='harmonic-geometry';
      if(e.style.getPropertyValue('border-radius')!==value)e.style.setProperty('border-radius',value,'important');
    }
  }
  function schedule(){if(pending||!doc)return;pending=true;global.queueMicrotask(()=>{pending=false;apply();});}
  function configure(value){index=indexOf(value);apply();return stops[index];}
  const api={resolve,configure,refresh:schedule,stops,factors,inspect:()=>({index,name:stops[index].name,unit:8*stops[index].scale,factors})};
  global.ResonantGeometry=api;if(typeof module==='object'&&module.exports)module.exports=api;
  if(doc){global.addEventListener('resize',schedule);global.addEventListener('resonant-volume-rendered',schedule);doc.addEventListener('DOMContentLoaded',apply,{once:true});}
})(typeof window==='undefined'?globalThis:window);


;
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


;
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


;
/*
 * Pure material preset state controller.
 *
 * It owns no DOM, storage, timers, or application state. A preset replaces
 * only the six material fields; every other current preference passes through.
 */
(function install(global, factory) {
  const api = factory();
  if (global && typeof global === "object") global.ResonantMaterialPresets = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createApi() {
  "use strict";

  const MATERIAL_KEYS = Object.freeze([
    "hue",
    "strength",
    "surfaceLight",
    "accentLight",
    "accentLinked",
    "accent",
  ]);
  const EPSILON = 1e-6;
  const LIMITS = Object.freeze({
    hue: Object.freeze([0, 360]),
    strength: Object.freeze([0, 55]),
    surfaceLight: Object.freeze([0, 100]),
    accentLight: Object.freeze([0, 100]),
    accent: Object.freeze([0, 360]),
  });

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function finiteNumber(value, path) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`${path} must be a finite number`);
    }
    return value;
  }

  function boundedNumber(value, path, [minimum, maximum], { angular = false } = {}) {
    finiteNumber(value, path);
    const valid = angular
      ? value >= minimum && value < maximum
      : value >= minimum && value <= maximum;
    if (!valid) throw new RangeError(`${path} is outside its allowed range`);
    return value;
  }

  function wrapHue(value) {
    return ((value % 360) + 360) % 360;
  }

  function angularDistance(first, second) {
    const direct = Math.abs(wrapHue(first) - wrapHue(second));
    return Math.min(direct, 360 - direct);
  }

  function close(first, second) {
    return Math.abs(first - second) <= EPSILON;
  }

  function sameAngle(first, second) {
    return angularDistance(first, second) <= EPSILON;
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (isObject(value)) {
      const copy = {};
      for (const [key, nested] of Object.entries(value)) copy[key] = clone(nested);
      return copy;
    }
    return value;
  }

  function freeze(value) {
    if (Array.isArray(value)) {
      value.forEach(freeze);
      return Object.freeze(value);
    }
    if (isObject(value)) {
      Object.values(value).forEach(freeze);
      return Object.freeze(value);
    }
    return value;
  }

  function validateOklch(color, path) {
    if (!isObject(color)) throw new TypeError(`${path} must be an object`);
    if (own(color, "label") && (typeof color.label !== "string" || !color.label.trim())) {
      throw new TypeError(`${path}.label must be a non-empty string`);
    }
    if (!isObject(color.oklch)) throw new TypeError(`${path}.oklch must be an object`);
    boundedNumber(color.oklch.l, `${path}.oklch.l`, [0, 1]);
    boundedNumber(color.oklch.c, `${path}.oklch.c`, [0, 1]);
    boundedNumber(color.oklch.h, `${path}.oklch.h`, [0, 360], { angular: true });
  }

  function validateRecord(record, index, accentOffset) {
    const path = `presets[${index}]`;
    if (!isObject(record)) throw new TypeError(`${path} must be an object`);
    if (typeof record.id !== "string" || !record.id.trim()) {
      throw new TypeError(`${path}.id must be a non-empty string`);
    }
    for (const key of MATERIAL_KEYS) {
      if (!own(record, key)) throw new TypeError(`${path}.${key} is required`);
    }
    boundedNumber(record.hue, `${path}.hue`, LIMITS.hue, { angular: true });
    boundedNumber(record.strength, `${path}.strength`, LIMITS.strength);
    boundedNumber(record.surfaceLight, `${path}.surfaceLight`, LIMITS.surfaceLight);
    boundedNumber(record.accentLight, `${path}.accentLight`, LIMITS.accentLight);
    if (typeof record.accentLinked !== "boolean") {
      throw new TypeError(`${path}.accentLinked must be a boolean`);
    }
    boundedNumber(record.accent, `${path}.accent`, LIMITS.accent, { angular: true });
    if (record.accentLinked && !sameAngle(record.accent, record.hue + accentOffset)) {
      throw new RangeError(`${path}.accent must follow the linked accent offset`);
    }
    for (const key of ["label", "description", "rationale"]) {
      if (own(record, key) && (typeof record[key] !== "string" || !record[key].trim())) {
        throw new TypeError(`${path}.${key} must be a non-empty string`);
      }
    }
    if (own(record, "surfaceColor")) validateOklch(record.surfaceColor, `${path}.surfaceColor`);
    if (own(record, "accentColor")) validateOklch(record.accentColor, `${path}.accentColor`);
    return record;
  }

  function validateCurrent(current, { complete }) {
    if (!isObject(current)) throw new TypeError("current must be an object");
    if (!complete) {
      for (const key of MATERIAL_KEYS) {
        if (!own(current, key)) continue;
        if (key === "accentLinked") {
          if (typeof current[key] !== "boolean") {
            throw new TypeError(`current.${key} must be a boolean`);
          }
        } else if (key === "strength") {
          boundedNumber(current[key], `current.${key}`, LIMITS.strength);
        } else if (key === "surfaceLight" || key === "accentLight") {
          boundedNumber(current[key], `current.${key}`, LIMITS[key]);
        } else if (key === "hue" || key === "accent") {
          boundedNumber(current[key], `current.${key}`, [-Infinity, Infinity]);
        } else {
          throw new TypeError(`current.${key} is not a supported material field`);
        }
      }
      return;
    }
    for (const key of MATERIAL_KEYS) {
      if (!own(current, key)) throw new TypeError(`current.${key} is required`);
    }
    boundedNumber(current.hue, "current.hue", [-Infinity, Infinity]);
    boundedNumber(current.strength, "current.strength", LIMITS.strength);
    boundedNumber(current.surfaceLight, "current.surfaceLight", LIMITS.surfaceLight);
    boundedNumber(current.accentLight, "current.accentLight", LIMITS.accentLight);
    if (typeof current.accentLinked !== "boolean") {
      throw new TypeError("current.accentLinked must be a boolean");
    }
    boundedNumber(current.accent, "current.accent", [-Infinity, Infinity]);
  }

  function materialValues(value) {
    return Object.fromEntries(MATERIAL_KEYS.map((key) => [key, value[key]]));
  }

  function materialMatches(current, preset) {
    return (
      sameAngle(current.hue, preset.hue) &&
      close(current.strength, preset.strength) &&
      close(current.surfaceLight, preset.surfaceLight) &&
      close(current.accentLight, preset.accentLight) &&
      current.accentLinked === preset.accentLinked &&
      sameAngle(current.accent, preset.accent)
    );
  }

  function create(options) {
    if (!isObject(options)) throw new TypeError("options must be an object");
    if (!Array.isArray(options.presets)) throw new TypeError("presets must be an array");
    const accentOffset = options.accentOffset === undefined ? 150 : options.accentOffset;
    boundedNumber(accentOffset, "accentOffset", [0, 360], { angular: true });

    const records = options.presets.map((record, index) => {
      validateRecord(record, index, accentOffset);
      return freeze(clone(record));
    });
    const ids = new Set();
    for (const record of records) {
      if (ids.has(record.id)) throw new RangeError(`preset ids must be unique: ${record.id}`);
      ids.add(record.id);
    }
    const byId = new Map(records.map((record) => [record.id, record]));

    return Object.freeze({
      list() {
        return records.map((record) => clone(record));
      },
      get(id) {
        if (typeof id !== "string") throw new TypeError("preset id must be a string");
        const record = byId.get(id);
        return record === undefined ? undefined : clone(record);
      },
      apply(current, id) {
        validateCurrent(current, { complete: false });
        if (typeof id !== "string") throw new TypeError("preset id must be a string");
        const preset = byId.get(id);
        if (!preset) throw new RangeError(`unknown preset: ${id}`);
        const next = clone(current);
        Object.assign(next, materialValues(preset));
        return next;
      },
      match(current) {
        validateCurrent(current, { complete: true });
        const preset = records.find((record) => materialMatches(current, record));
        return preset === undefined ? null : clone(preset);
      },
    });
  }

  return Object.freeze({
    create,
  });
});


;
/*
 * Local appearance preference learning for Resonant Field.
 *
 * This module owns no DOM, network, application, document, session, or
 * provider state. It accepts only whitelisted appearance values and returns
 * recommendations for the host to review and apply explicitly.
 */
(function install(global, factory) {
  const api = factory();
  if (global && typeof global === "object") global.ResonantAppearanceLearning = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createApi() {
  "use strict";

  const SCHEMA = "resonant-field-appearance-learning";
  const VERSION = 1;
  const DEFAULT_THRESHOLD = 3;
  const DEFAULT_MAX_HISTORY = 60;
  const MAX_HISTORY = 500;
  const MAX_USES = 10000;
  const APPEARANCE_KEYS = Object.freeze([
    "hue",
    "strength",
    "accent",
    "surfaceLight",
    "accentLight",
    "accentLinked",
    "selectiveColor",
    "mode",
    "intensity",
    "position",
    "brightness",
    "solid",
    "cornerProfile",
    "plate",
  ]);
  const NUMERIC_LIMITS = Object.freeze({
    strength: Object.freeze([0, 55]),
    surfaceLight: Object.freeze([0, 100]),
    accentLight: Object.freeze([0, 100]),
    intensity: Object.freeze([0, 100]),
    position: Object.freeze([0, 100]),
    brightness: Object.freeze([30, 130]),
    cornerProfile: Object.freeze([0, 4]),
  });
  const CONTEXT_KEYS = new Set([
    "area",
    "density",
    "feature",
    "locale",
    "mode",
    "page",
    "route",
    "screen",
    "scope",
    "surface",
    "theme",
    "variant",
    "view",
    "viewport",
    "workspace",
  ]);
  const CONTENT_CONTEXT_KEYS = /document|session|provider|prompt|content|payload|transcript|message|html|text/i;

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (isObject(value)) {
      const result = {};
      Object.keys(value).forEach((key) => {
        result[key] = clone(value[key]);
      });
      return result;
    }
    return value;
  }

  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (isObject(value)) {
      return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
        .join(",")}}`;
    }
    return JSON.stringify(value);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function finiteNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function wrapHue(value) {
    return ((value % 360) + 360) % 360;
  }

  function angularDistance(first, second) {
    const direct = Math.abs(wrapHue(first) - wrapHue(second));
    return Math.min(direct, 360 - direct);
  }

  function safeToken(value, maximum = 80) {
    if (typeof value !== "string") return null;
    const token = value.trim();
    if (!token || token.length > maximum || /[\u0000-\u001f\u007f]/.test(token)) return null;
    return token;
  }

  function safePlate(value) {
    const plate = safeToken(value, 120);
    if (!plate || /^(?:blob|data):/i.test(plate) || /:\/\//.test(plate)) return null;
    if (plate.startsWith("/") || plate.includes("\\") || plate.split("/").includes("..")) return null;
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(plate)) return null;
    return plate;
  }

  function sanitizeState(input) {
    if (!isObject(input)) return {};
    const result = {};
    for (const key of APPEARANCE_KEYS) {
      if (!own(input, key)) continue;
      const value = input[key];
      if (key === "hue" || key === "accent") {
        const number = finiteNumber(value);
        if (number !== null) result[key] = wrapHue(number);
      } else if (own(NUMERIC_LIMITS, key)) {
        const number = finiteNumber(value);
        if (number !== null) {
          const bounded = clamp(number, NUMERIC_LIMITS[key][0], NUMERIC_LIMITS[key][1]);
          result[key] = key === "cornerProfile" ? Math.round(bounded) : bounded;
        }
      } else if (key === "accentLinked" || key === "selectiveColor" || key === "solid") {
        if (typeof value === "boolean") result[key] = value;
      } else if (key === "mode") {
        if (value === "dark" || value === "light") result[key] = value;
      } else if (key === "plate") {
        const plate = safePlate(value);
        if (plate) result[key] = plate;
      }
    }
    return result;
  }

  function normalizeThreshold(value) {
    const number = finiteNumber(value);
    return number === null ? DEFAULT_THRESHOLD : clamp(Math.round(number), 1, 20);
  }

  function normalizeMaxHistory(value) {
    const number = finiteNumber(value);
    return number === null ? DEFAULT_MAX_HISTORY : clamp(Math.round(number), 1, MAX_HISTORY);
  }

  function normalizeContext(input) {
    if (typeof input === "string") {
      const value = safeToken(input, 80);
      if (value) return { key: `string:${value}`, value };
      return { key: "default", value: "default" };
    }
    if (!isObject(input)) return { key: "default", value: "default" };
    const result = {};
    for (const key of Object.keys(input).sort()) {
      if (!CONTEXT_KEYS.has(key) || CONTENT_CONTEXT_KEYS.test(key)) continue;
      const value = input[key];
      if (typeof value === "string") {
        const token = safeToken(value, 80);
        if (token && !CONTENT_CONTEXT_KEYS.test(token)) result[key] = token;
      } else if (typeof value === "boolean") {
        result[key] = value;
      } else if (typeof value === "number" && Number.isFinite(value)) {
        result[key] = value;
      }
    }
    if (!Object.keys(result).length) return { key: "default", value: "default" };
    return { key: `object:${stableStringify(result)}`, value: result };
  }

  function normalizeNow(value) {
    const number = finiteNumber(value);
    return number === null ? Date.now() : number;
  }

  function normalizeSource(source) {
    return source === "manual" || source === "manual-commit" ? "manual" : null;
  }

  function storageReader(storage) {
    if (!storage || typeof storage !== "object") return null;
    if (typeof storage.getItem === "function") return (key) => storage.getItem(key);
    if (typeof storage.get === "function") return (key) => storage.get(key);
    return null;
  }

  function storageWriter(storage) {
    if (!storage || typeof storage !== "object") return null;
    if (typeof storage.setItem === "function") return (key, value) => storage.setItem(key, value);
    if (typeof storage.set === "function") return (key, value) => storage.set(key, value);
    return null;
  }

  function storageRemover(storage) {
    if (!storage || typeof storage !== "object") return null;
    if (typeof storage.removeItem === "function") return (key) => storage.removeItem(key);
    if (typeof storage.remove === "function") return (key) => storage.remove(key);
    return null;
  }

  function contextForEntry(value) {
    if (value && typeof value === "object" && own(value, "key") && own(value, "value")) {
      return normalizeContext(value.value);
    }
    return normalizeContext(value);
  }

  function compareEntries(first, second) {
    const firstState = first.state;
    const secondState = second.state;
    const keys = APPEARANCE_KEYS.filter((key) => own(firstState, key) && own(secondState, key));
    if (!keys.length) return 1;
    let total = 0;
    for (const key of keys) {
      const a = firstState[key];
      const b = secondState[key];
      if (key === "hue" || key === "accent") {
        total += angularDistance(a, b) / 180;
      } else if (typeof a === "number" && typeof b === "number") {
        const limits = NUMERIC_LIMITS[key];
        total += limits ? Math.abs(a - b) / Math.max(1, limits[1] - limits[0]) : 0;
      } else {
        total += a === b ? 0 : 1;
      }
    }
    return total / keys.length;
  }

  function chooseExemplar(entries) {
    const scored = entries.map((entry) => {
      const distance = entries.reduce((sum, other) => {
        if (other === entry) return sum;
        return sum + compareEntries(entry, other) * other.uses;
      }, 0);
      return { entry, distance };
    });
    scored.sort((first, second) => {
      if (first.entry.uses !== second.entry.uses) return second.entry.uses - first.entry.uses;
      if (first.distance !== second.distance) return first.distance - second.distance;
      if (first.entry.lastSeen !== second.entry.lastSeen) return second.entry.lastSeen - first.entry.lastSeen;
      return first.entry.sequence - second.entry.sequence;
    });
    return scored[0];
  }

  function circularConsensus(entries, key) {
    const values = entries
      .filter((entry) => finiteNumber(entry.state[key]) !== null)
      .map((entry) => ({ value: entry.state[key], weight: entry.uses }));
    if (values.length < 2) return null;
    let sin = 0;
    let cos = 0;
    let weight = 0;
    for (const item of values) {
      const radians = (item.value * Math.PI) / 180;
      sin += Math.sin(radians) * item.weight;
      cos += Math.cos(radians) * item.weight;
      weight += item.weight;
    }
    const concentration = Math.sqrt(sin * sin + cos * cos) / weight;
    if (concentration < 0.55) return null;
    return wrapHue((Math.atan2(sin, cos) * 180) / Math.PI);
  }

  function roundConfidence(value) {
    return Math.round(clamp(value, 0, 1) * 1000) / 1000;
  }

  function create(options = {}) {
    if (!isObject(options)) throw new TypeError("options must be an object");
    const threshold = normalizeThreshold(options.threshold);
    const maxHistory = normalizeMaxHistory(options.maxHistory);
    const storage = options.storage;
    const storageKey = safeToken(options.storageKey, 160) || "resonant-field-appearance-learning";
    const read = storageReader(storage);
    const write = storageWriter(storage);
    const remove = storageRemover(storage);
    const defaultContext = normalizeContext(options.context);
    let enabled = options.enabled === undefined ? true : options.enabled === true;
    let history = [];
    let sequence = 0;
    let storageStatus = storage ? "empty" : "unavailable";

    function entryView(entry) {
      return {
        context: clone(entry.context.value),
        state: clone(entry.state),
        uses: entry.uses,
        firstSeen: entry.firstSeen,
        lastSeen: entry.lastSeen,
      };
    }

    function serializedValue() {
      return {
        schema: SCHEMA,
        version: VERSION,
        enabled,
        threshold,
        maxHistory,
        history: history.map(entryView),
      };
    }

    function persist() {
      if (!write) return;
      try {
        write(storageKey, JSON.stringify(serializedValue()));
        storageStatus = "stored";
      } catch (_error) {
        storageStatus = "write-error";
      }
    }

    function trimHistory() {
      if (history.length <= maxHistory) return;
      history.sort((first, second) => {
        if (first.lastSeen !== second.lastSeen) return second.lastSeen - first.lastSeen;
        return second.sequence - first.sequence;
      });
      history = history.slice(0, maxHistory);
    }

    function hydrate(raw) {
      let parsed = raw;
      try {
        if (typeof raw === "string") parsed = JSON.parse(raw);
      } catch (_error) {
        storageStatus = "corrupt";
        return;
      }
      if (!isObject(parsed) || parsed.schema !== SCHEMA || parsed.version !== VERSION || !Array.isArray(parsed.history)) {
        storageStatus = "corrupt";
        return;
      }
      if (typeof parsed.enabled === "boolean") enabled = parsed.enabled;
      const hydrated = [];
      for (const rawEntry of parsed.history) {
        if (!isObject(rawEntry)) continue;
        const state = sanitizeState(rawEntry.state);
        if (!Object.keys(state).length) continue;
        const context = contextForEntry(rawEntry.context);
        const firstSeen = finiteNumber(rawEntry.firstSeen) ?? 0;
        const lastSeen = finiteNumber(rawEntry.lastSeen) ?? firstSeen;
        const usesNumber = finiteNumber(rawEntry.uses);
        const uses = usesNumber === null ? 1 : clamp(Math.round(usesNumber), 1, MAX_USES);
        hydrated.push({
          context,
          state,
          signature: stableStringify(state),
          uses,
          firstSeen,
          lastSeen,
          sequence: ++sequence,
        });
      }
      const deduplicated = new Map();
      for (const entry of hydrated) {
        const key = `${entry.context.key}|${entry.signature}`;
        const prior = deduplicated.get(key);
        if (!prior || entry.lastSeen >= prior.lastSeen) deduplicated.set(key, entry);
      }
      history = [...deduplicated.values()];
      trimHistory();
      storageStatus = "loaded";
    }

    if (read) {
      try {
        const raw = read(storageKey);
        if (raw === null || raw === undefined || raw === "") {
          storageStatus = "empty";
        } else {
          hydrate(raw);
        }
      } catch (_error) {
        storageStatus = "read-error";
      }
    }

    function contextFrom(input) {
      return input === undefined ? defaultContext : normalizeContext(input);
    }

    function findEntry(context, signature) {
      return history.find((entry) => entry.context.key === context.key && entry.signature === signature);
    }

    function observe(state, metadata = {}) {
      const meta = isObject(metadata) ? metadata : {};
      if (!enabled) {
        return { accepted: false, reason: "disabled", context: clone(contextFrom(meta.context).value) };
      }
      if (!normalizeSource(meta.source)) {
        return { accepted: false, reason: "source-not-manual", context: clone(contextFrom(meta.context).value) };
      }
      const cleanState = sanitizeState(state);
      const context = contextFrom(meta.context);
      if (!Object.keys(cleanState).length) {
        return { accepted: false, reason: "empty-appearance-state", context: clone(context.value) };
      }
      const now = normalizeNow(meta.now);
      const signature = stableStringify(cleanState);
      const prior = findEntry(context, signature);
      if (prior) {
        if(prior.lastSeen===now)return {accepted:false,reason:"duplicate-commit",context:clone(context.value)};
        prior.uses = clamp(prior.uses + 1, 1, MAX_USES);
        prior.lastSeen = now;
        prior.sequence = ++sequence;
        persist();
        return {
          accepted: true,
          repeated: true,
          reason: "manual-commit-repeated",
          context: clone(context.value),
          state: clone(cleanState),
          distinctCommits: history.filter((entry) => entry.context.key === context.key).length,
          historySize: history.length,
        };
      }
      const entry = {
        context,
        state: cleanState,
        signature,
        uses: 1,
        firstSeen: now,
        lastSeen: now,
        sequence: ++sequence,
      };
      history.push(entry);
      trimHistory();
      persist();
      return {
        accepted: true,
        repeated: false,
        reason: "manual-commit-recorded",
        context: clone(context.value),
        state: clone(cleanState),
        distinctCommits: history.filter((item) => item.context.key === context.key).length,
        historySize: history.length,
      };
    }

    function recommend(current, metadata = {}) {
      const meta = isObject(metadata) ? metadata : {};
      const context = contextFrom(meta.context);
      const currentState = sanitizeState(current);
      const entries = history.filter((entry) => entry.context.key === context.key);
      const distinctCommits = entries.length;
      const committedChoices=entries.reduce((sum,entry)=>sum+entry.uses,0);
      const base = {
        eligible: committedChoices >= threshold,
        applied: false,
        context: clone(context.value),
        samples: committedChoices,
        committedChoices,
        uniqueConfigurations: distinctCommits,
        distinctCommits,
        confidence: 0,
        reasons: [],
      };
      if (!enabled) {
        const paused = {
          ...base,
          eligible: false,
          recommendation: clone(currentState),
          state: clone(currentState),
          appearance: {},
          reasons: ["Learning is paused; no recommendation is produced."],
        };
        return paused;
      }
      if (committedChoices < threshold) {
        return {
          ...base,
          recommendation: clone(currentState),
          state: clone(currentState),
          appearance: {},
          reasons: [`Need ${threshold} committed manual choices in this context; found ${committedChoices}.`],
        };
      }

      const chosen = chooseExemplar(entries);
      const learned = clone(chosen.entry.state);
      const hue = circularConsensus(entries, "hue");
      if (hue !== null && own(learned, "hue")) learned.hue = hue;
      const recommendation = { ...currentState, ...learned };
      const coverage = Object.keys(learned).length / APPEARANCE_KEYS.length;
      const support = chosen.entry.uses / entries.reduce((sum, entry) => sum + entry.uses, 0);
      const coherence = 1 - clamp(chosen.distance / Math.max(1, entries.reduce((sum,entry)=>sum+(entry===chosen.entry?0:entry.uses),0)), 0, 1);
      const confidence = roundConfidence(0.3 + coverage * 0.25 + support * 0.2 + coherence * 0.25);
      const reasons = [
        `${committedChoices} committed manual choices support this context.`,
        "A coherent observed configuration is recommended; the engine never applies it silently.",
      ];
      if (hue !== null) {
        reasons.push("Hue uses circular consensus across nearby values, including wraparound at 360 degrees.");
      } else if (entries.some((entry) => own(entry.state, "hue"))) {
        reasons.push("Hue evidence is split; an observed exemplar is kept instead of averaging opposite hues.");
      }
      if (coverage < 0.5) reasons.push("Sparse evidence leaves unobserved appearance fields at their current values.");
      return {
        ...base,
        confidence,
        recommendation: clone(recommendation),
        state: clone(recommendation),
        appearance: clone(learned),
        reasons,
      };
    }

    function setEnabled(value) {
      if (typeof value !== "boolean") throw new TypeError("enabled must be a boolean");
      enabled = value;
      persist();
      return enabled;
    }

    function reset(scope) {
      let context = null;
      if (scope !== undefined && scope !== null) {
        context = normalizeContext(isObject(scope) && own(scope, "context") ? scope.context : scope);
        history = history.filter((entry) => entry.context.key !== context.key);
      } else {
        history = [];
      }
      if (remove && history.length === 0 && scope === undefined) {
        try {
          remove(storageKey);
          storageStatus = "empty";
        } catch (_error) {
          storageStatus = "write-error";
        }
      } else {
        persist();
      }
      return { reset: true, context: context ? clone(context.value) : null, historySize: history.length };
    }

    function inspect() {
      const contexts = new Map();
      for (const entry of history) {
        const current = contexts.get(entry.context.key) || {
          context: clone(entry.context.value),
          distinctCommits: 0,
          observations: 0,
          lastSeen: entry.lastSeen,
        };
        current.distinctCommits += 1;
        current.observations += entry.uses;
        current.lastSeen = Math.max(current.lastSeen, entry.lastSeen);
        contexts.set(entry.context.key, current);
      }
      return {
        schema: SCHEMA,
        version: VERSION,
        enabled,
        threshold,
        maxHistory,
        historySize: history.length,
        observations: history.reduce((sum, entry) => sum + entry.uses, 0),
        contexts: [...contexts.values()],
        history: history.map(entryView),
        storage: {
          available: Boolean(read || write),
          key: storageKey,
          status: storageStatus,
        },
      };
    }

    return Object.freeze({
      observe,
      recommend,
      setEnabled,
      reset,
      inspect,
      serialize() {
        return JSON.stringify(serializedValue());
      },
    });
  }

  return Object.freeze({ create });
});
