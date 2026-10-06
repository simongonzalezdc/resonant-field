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
