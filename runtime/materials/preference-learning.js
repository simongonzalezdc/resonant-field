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
