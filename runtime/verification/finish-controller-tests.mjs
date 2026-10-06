import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const sourcePath = join(here, "..", "materials", "finish-controller.js");
const api = require(sourcePath);

const browserSandbox = {};
runInNewContext(readFileSync(sourcePath, "utf8"), browserSandbox);

const DEFAULT_ANGLE = Math.atan2(0.309, 0.253) * 180 / Math.PI;
const defaults = () => ({ amount: 100, spread: 100, angle: DEFAULT_ANGLE });
const LIGHT_BASE = 0.035;
const DARK_BASE = 0.055;

test("exposes a browser global and a CommonJS api", () => {
  assert.equal(typeof api.normalize, "function");
  assert.equal(typeof api.gain, "function");

  const browserApi = browserSandbox.ResonantFinishController;
  assert.equal(typeof browserApi?.normalize, "function");
  assert.equal(typeof browserApi?.gain, "function");
  assert.equal(Object.isFrozen(browserApi.DEFAULTS), true);
  const browserNormalized = browserApi.normalize({ amount: 150 });
  assert.equal(browserNormalized.amount, 150);
  assert.equal(browserNormalized.spread, 100);
  assert.equal(browserNormalized.angle, DEFAULT_ANGLE);
  assert.equal(browserApi.gain({ amount: 200 }, "dark"), 4 * DARK_BASE);
});

test("DEFAULTS are canonical and frozen", () => {
  assert.deepEqual(api.DEFAULTS, defaults());
  assert.deepEqual(Object.keys(api.DEFAULTS), ["amount", "spread", "angle"]);
  assert.ok(Number.isFinite(api.DEFAULTS.angle));
  assert.ok(api.DEFAULTS.angle > 50 && api.DEFAULTS.angle < 51);
  assert.equal(Object.isFrozen(api.DEFAULTS), true);
  assert.throws(() => {
    api.DEFAULTS.amount = 5;
  }, TypeError);
});

test("null, missing, and non-object inputs fall back to defaults", () => {
  for (const input of [undefined, null, 0, 42, "", "finish", true, false, [], [{ amount: 1 }], () => {}, Symbol("finish")]) {
    assert.deepEqual(api.normalize(input), defaults());
  }
});

test("corrupt, non-numeric, and unicode field values fall back per field", () => {
  const corrupt = {
    amount: { value: 150 },
    spread: [150],
    angle: () => 150,
  };
  assert.deepEqual(api.normalize(corrupt), defaults());

  for (const bad of ["100", "", "١٠٠", "１００", "宽", Number.NaN, Infinity, -Infinity, null, undefined, false, 100n, Symbol("150")]) {
    assert.deepEqual(api.normalize({ amount: bad, spread: 120, angle: 200 }), {
      amount: 100,
      spread: 120,
      angle: 200,
    });
  }

  assert.deepEqual(api.normalize({ amount: new Date() }), defaults());
  assert.deepEqual(api.normalize({ "ａｍｏｕｎｔ": 150, "spread ": 150 }), defaults());
  assert.deepEqual(api.normalize({ amount: 10, spread: 20, angle: 30, intensity: 99, layers: {} }), {
    amount: 10,
    spread: 20,
    angle: 30,
  });
});

test("finite out-of-range values clamp instead of falling back", () => {
  assert.deepEqual(api.normalize({ amount: 999, spread: 5000, angle: 720 }), {
    amount: 200,
    spread: 300,
    angle: 360,
  });
  assert.deepEqual(api.normalize({ amount: -3, spread: -0.5, angle: -400 }), {
    amount: 0,
    spread: 0,
    angle: 0,
  });
  assert.deepEqual(api.normalize({ amount: 200.000001 }), { ...defaults(), amount: 200 });
  assert.equal(api.normalize({ amount: 137.25 }).amount, 137.25);
  assert.equal(api.normalize({ angle: 359.9 }).angle, 359.9);
});

test("zero is an explicit setting while null falls back", () => {
  assert.deepEqual(api.normalize({ amount: 0, spread: 0, angle: 0 }), {
    amount: 0,
    spread: 0,
    angle: 0,
  });
  assert.deepEqual(api.normalize({ amount: null, spread: null, angle: null }), defaults());
});

test("inherited, hostile, and failing accessors never leak values or throw", () => {
  const inherited = Object.create({ amount: 150, spread: 150, angle: 150 });
  assert.deepEqual(api.normalize(inherited), defaults());

  Object.prototype.spread = 275;
  try {
    assert.deepEqual(api.normalize({ amount: 10 }), { ...defaults(), amount: 10 });
  } finally {
    delete Object.prototype.spread;
  }

  const throwing = {};
  Object.defineProperty(throwing, "amount", {
    get() {
      throw new Error("boom");
    },
    enumerable: true,
  });
  assert.deepEqual(api.normalize(throwing), defaults());

  const hostileProxy = new Proxy(
    {},
    {
      get() {
        throw new Error("boom");
      },
      has() {
        throw new Error("boom");
      },
    },
  );
  assert.deepEqual(api.normalize(hostileProxy), defaults());

  const revocable = Proxy.revocable({ amount: 130 }, {});
  revocable.revoke();
  assert.deepEqual(api.normalize(revocable.proxy), defaults());

  const working = {};
  Object.defineProperty(working, "amount", {
    get() {
      return 150;
    },
    enumerable: true,
  });
  assert.deepEqual(api.normalize(working), { ...defaults(), amount: 150 });

  assert.deepEqual(api.normalize(Object.assign(Object.create(null), { amount: 180 })), {
    ...defaults(),
    amount: 180,
  });
});

test("results are fresh plain objects that alias neither input nor DEFAULTS", () => {
  const input = { amount: 120, spread: 140, angle: 200 };
  const snapshot = { ...input };

  const first = api.normalize(input);
  const second = api.normalize(input);
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first, api.DEFAULTS);
  assert.equal(Object.getPrototypeOf(first), Object.prototype);
  assert.equal(Object.isExtensible(first), true);

  first.amount = 0;
  first.spread = 0;
  first.angle = 0;
  assert.deepEqual(second, snapshot);
  assert.deepEqual(api.normalize(input), snapshot);
  assert.equal(api.DEFAULTS.amount, 100);

  input.amount = 180;
  assert.equal(second.amount, 120);
  assert.deepEqual(input, { ...snapshot, amount: 180 });
  assert.throws(() => {
    api.DEFAULTS.angle = 0;
  }, TypeError);
});

test("gain maps the response at zero, baseline, and max in both modes", () => {
  assert.equal(api.gain({ amount: 0 }, "light"), 0);
  assert.equal(api.gain({ amount: 0 }, "dark"), 0);

  assert.equal(api.gain({ amount: 100 }, "light"), LIGHT_BASE);
  assert.equal(api.gain({ amount: 100 }, "dark"), DARK_BASE);
  assert.equal(api.gain(undefined), LIGHT_BASE);
  assert.equal(api.gain(null, "dark"), DARK_BASE);

  assert.equal(api.gain({ amount: 200 }, "light"), 4 * LIGHT_BASE);
  assert.equal(api.gain({ amount: 200 }, "dark"), 4 * DARK_BASE);
  assert.equal(api.gain({ amount: 1000 }, "dark"), 4 * DARK_BASE);
});

test("gain follows the linear and overdrive curves exactly", () => {
  assert.equal(api.gain({ amount: 40 }, "light"), LIGHT_BASE * 0.4);
  assert.equal(api.gain({ amount: 150 }, "dark"), DARK_BASE * (1 + 5 * (1.5 - 1) ** 2));

  assert.equal(api.gain({ amount: "high" }, "dark"), DARK_BASE);
  assert.equal(api.gain({ amount: -20 }, "light"), 0);
  for (const mode of ["", "blue", "night", undefined, null]) {
    assert.equal(api.gain({ amount: 100 }, mode), LIGHT_BASE);
  }
});

test("upper response limits broad luminance lift", () => {
  assert.ok(Math.abs(api.gain({amount:160}, "dark") - 2.8*DARK_BASE)<1e-12);
  assert.ok(Math.abs(api.gain({amount:180}, "dark") - 3.4*DARK_BASE)<1e-12);
});

test("gain rises strictly with amount across the full range", () => {
  for (const mode of ["light", "dark"]) {
    let previous = -Infinity;
    for (let amount = 0; amount <= 200; amount += 1) {
      const value = api.gain({ amount }, mode);
      assert.ok(value > previous, `gain must increase at amount ${amount} in ${mode} mode`);
      previous = value;
    }
    assert.equal(previous, 4 * (mode === "dark" ? DARK_BASE : LIGHT_BASE));
  }
});

// Calibrated upper travel opens a useful hue range; the approved baseline remains exact.
test('hue travel keeps zero/default and widens the upper range',()=>{
 assert.equal(typeof api.hueSpan,'function');
 const baseline=50*Math.log2(3/2);
 assert.equal(api.hueSpan({spread:0}),0);
 assert.equal(api.hueSpan({spread:100}),baseline);
 assert.equal(api.hueSpan({spread:300}),baseline*5);
 assert.equal(api.hueSpan({spread:'bad'}),baseline);
 let previous=-1;for(let spread=0;spread<=300;spread++){const n=api.hueSpan({spread});assert.ok(n>previous);previous=n;}
});

test('canvas upper response is restrained without changing approved defaults',()=>{
 const plate='vellum-fold-v2';
 assert.equal(api.gain({amount:0},'dark',plate),0);
 assert.equal(api.gain({amount:100},'dark',plate),DARK_BASE);
 assert.ok(Math.abs(api.gain({amount:200},'dark',plate)-DARK_BASE*2.65)<1e-12);
 assert.equal(api.gain({amount:200},'light',plate),LIGHT_BASE*4);
 let prior=-1;for(let amount=0;amount<=200;amount++){const next=api.gain({amount},'dark',plate);assert.ok(next>prior);prior=next;}
});
