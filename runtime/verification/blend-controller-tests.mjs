import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const sourcePath = join(here, "..", "materials", "blend-controller.js");
const api = require(sourcePath);

const browserSandbox = {};
runInNewContext(readFileSync(sourcePath, "utf8"), browserSandbox);
assert.equal(typeof browserSandbox.ResonantBlendController.normalize, "function");
assert.equal(typeof browserSandbox.ResonantBlendController.resolve, "function");

const modeValues = [
  "normal",
  "darken",
  "multiply",
  "color-burn",
  "lighten",
  "screen",
  "color-dodge",
  "overlay",
  "soft-light",
  "hard-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
];
assert.deepEqual(api.MODES.map(({ value }) => value), modeValues);
assert.ok(api.MODES.every(({ label, group }) => typeof label === "string" && typeof group === "string"));
assert.deepEqual(api.MODES.find(({ value }) => value === "normal"), {
  value: "normal",
  label: "Normal",
  group: "Normal",
});
assert.deepEqual(api.MODES.find(({ value }) => value === "multiply"), {
  value: "multiply",
  label: "Multiply",
  group: "Darken",
});

// Legacy and malformed persisted settings normalize to safe canonical state.
{
  assert.deepEqual(api.normalize(null), { mode: "normal", amount: 100, layers: {} });
  assert.deepEqual(api.normalize([]), { mode: "normal", amount: 100, layers: {} });
  assert.deepEqual(api.normalize({ mode: "multiply", amount: 42 }), {
    mode: "multiply",
    amount: 42,
    layers: {},
  });
  assert.deepEqual(
    api.normalize({
      mode: "not-a-mode",
      amount: "80",
      layers: {
        0: { mode: "not-a-mode", amount: 101 },
        2: { mode: "screen", amount: 0 },
        4: { mode: "inherit", amount: null },
        5: { mode: "overlay", amount: 30 },
        unknown: { mode: "difference", amount: 20 },
        ignored: new Date(),
      },
      extra: { should: "not survive" },
    }),
    {
      mode: "normal",
      amount: 100,
      layers: {
        0: { mode: "inherit", amount: null },
        2: { mode: "screen", amount: 0 },
        4: { mode: "inherit", amount: null },
      },
    },
  );
  assert.deepEqual(api.normalize({ mode: "screen", amount: 55, layers: [] }), {
    mode: "screen",
    amount: 55,
    layers: {},
  });
  assert.deepEqual(api.normalize({ mode: "difference", amount: -1 }), {
    mode: "difference",
    amount: 100,
    layers: {},
  });
  assert.deepEqual(api.normalize({ mode: "difference", amount: 100.1 }), {
    mode: "difference",
    amount: 100,
    layers: {},
  });
  assert.deepEqual(api.normalize({ mode: "difference", amount: Number.NaN }), {
    mode: "difference",
    amount: 100,
    layers: {},
  });
}

// Each depth is isolated; inherit follows the current global values.
{
  const settings = {
    mode: "multiply",
    amount: 35,
    layers: {
      0: { mode: "screen", amount: 20 },
      1: { mode: "inherit", amount: null },
      2: { mode: "overlay", amount: 0 },
      3: { mode: "difference", amount: 70 },
    },
  };
  assert.deepEqual(api.resolve(settings, 0), { mode: "screen", amount: 20, operation: "screen" });
  assert.deepEqual(api.resolve(settings, 1), { mode: "multiply", amount: 35, operation: "multiply" });
  assert.deepEqual(api.resolve(settings, 2), { mode: "overlay", amount: 0, operation: "overlay" });
  assert.deepEqual(api.resolve(settings, 3), { mode: "difference", amount: 70, operation: "difference" });
  assert.deepEqual(api.resolve(settings, 4), { mode: "multiply", amount: 35, operation: "multiply" });
  assert.deepEqual(api.resolve(settings, 99), { mode: "multiply", amount: 35, operation: "multiply" });

  settings.mode = "lighten";
  settings.amount = 64;
  assert.deepEqual(api.resolve(settings, 1), { mode: "lighten", amount: 64, operation: "lighten" });
  assert.deepEqual(api.resolve(settings, 0), { mode: "screen", amount: 20, operation: "screen" });
  assert.deepEqual(api.resolve(settings, 4), { mode: "lighten", amount: 64, operation: "lighten" });
}

// Zero is an explicit layer amount; null inherits the global amount.
{
  const settings = {
    mode: "normal",
    amount: 73,
    layers: {
      0: { mode: "inherit", amount: 0 },
      1: { mode: "inherit", amount: null },
      2: { mode: "normal", amount: 0 },
    },
  };
  assert.deepEqual(api.resolve(settings, 0), { mode: "normal", amount: 0, operation: "source-over" });
  assert.deepEqual(api.resolve(settings, 1), { mode: "normal", amount: 73, operation: "source-over" });
  assert.deepEqual(api.resolve(settings, 2), { mode: "normal", amount: 0, operation: "source-over" });
}

// Results and nested layers never alias input, defaults, or another call.
{
  const input = { mode: "overlay", amount: 50, layers: { 2: { mode: "screen", amount: 25 } } };
  const normalized = api.normalize(input);
  const normalizedAgain = api.normalize(input);
  assert.notStrictEqual(normalized, normalizedAgain);
  assert.notStrictEqual(normalized.layers, normalizedAgain.layers);
  assert.notStrictEqual(normalized.layers["2"], normalizedAgain.layers["2"]);

  normalized.layers["2"].mode = "difference";
  normalized.layers["2"].amount = 0;
  normalized.layers.extra = { mode: "color", amount: 10 };
  assert.deepEqual(api.resolve(input, 2), { mode: "screen", amount: 25, operation: "screen" });
  assert.deepEqual(api.normalize(input), {
    mode: "overlay",
    amount: 50,
    layers: { 2: { mode: "screen", amount: 25 } },
  });

  const first = api.resolve(input, 2);
  const second = api.resolve(input, 2);
  assert.notStrictEqual(first, second);
  first.mode = "normal";
  first.operation = "source-over";
  first.amount = 0;
  assert.deepEqual(second, { mode: "screen", amount: 25, operation: "screen" });
  assert.deepEqual(input, { mode: "overlay", amount: 50, layers: { 2: { mode: "screen", amount: 25 } } });
}

// A browser-loaded copy exposes the same mode resolution contract.
const browserResolved = browserSandbox.ResonantBlendController.resolve({ mode: "normal" }, 0);
assert.equal(browserResolved.mode, "normal");
assert.equal(browserResolved.amount, 100);
assert.equal(browserResolved.operation, "source-over");

console.log("blend-controller-tests: mode catalog, malformed persistence, depth inheritance, explicit zero, and alias safety passed");
