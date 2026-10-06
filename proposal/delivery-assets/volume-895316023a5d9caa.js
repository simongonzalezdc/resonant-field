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
