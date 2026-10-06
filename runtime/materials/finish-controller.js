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
