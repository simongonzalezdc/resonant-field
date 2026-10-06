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
