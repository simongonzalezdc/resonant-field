/* Native sRGB source-over reference mixing. Uniform gray is a calibration control,
   not a promise that every photographic patch has identical perceived hue. */
window.ResonantPalette = (() => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const wrap = (angle) => ((angle % 360) + 360) % 360;
  const distance = (a, b) => ((a - b + 540) % 360) - 180;
  let key = "",
    cached;

  function oklab(rgb) {
    const linear = rgb.map((v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    const [r, g, b] = linear;
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return {
      hue: wrap((Math.atan2(bb, a) * 180) / Math.PI),
      chroma: Math.hypot(a, bb),
    };
  }

  function calculate(model, { hue, chroma, toneAnchor, mode }) {
    const nextKey = [hue, chroma, toneAnchor, mode].join(":");
    if (key === nextKey) return cached;
    const tones = model.rows.map(
      (row) =>
        toneAnchor +
        (mode === "dark"
          ? row.dark_lightness_offset
          : row.light_lightness_offset),
    );
    const pigments = model.rows.map((row, i) => {
      const referenceTone = toneAnchor + row.dark_lightness_offset;
      const pigment = Math.min(
        chroma * row.chroma_weight,
        referenceTone * model.chroma_caps.dark,
      );
      return pigment * (mode === "light" ? model.light_chroma_gain : 1);
    });
    const weights = model.rows.map(
      (row, i) =>
        row.alpha *
        model.rows
          .slice(i + 1)
          .reduce((value, upper) => value * (1 - upper.alpha), 1),
    );
    let x = 0,
      y = 0;
    model.rows.forEach((row, i) => {
      const weight = weights[i] * pigments[i];
      const angle = (row.raw_hue_offset * Math.PI) / 180;
      x += weight * Math.cos(angle);
      y += weight * Math.sin(angle);
    });
    let correction = x || y ? (-Math.atan2(y, x) * 180) / Math.PI : 0;

    function mix(rotation, background = 128) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = `rgb(${background} ${background} ${background})`;
      context.fillRect(0, 0, 1, 1);
      model.rows.forEach((row, i) => {
        context.fillStyle = `oklch(${tones[i]} ${pigments[i]} ${wrap(hue + row.raw_hue_offset + rotation)} / ${row.alpha})`;
        context.fillRect(0, 0, 1, 1);
      });
      const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
      return { ...oklab(rgb), rgb };
    }
    let best = mix(correction),
      bestCorrection = correction;
    // Bounded correction: this moves the family together, preserving all pairwise variation.
    if (best.chroma >= 0.006) {
      for (let i = 0; i < 6; i++) {
        const error = distance(best.hue, hue);
        if (Math.abs(error) < 0.6) break;
        correction = Math.max(-20, Math.min(20, bestCorrection - error));
        const candidate = mix(correction);
        if (Math.abs(distance(candidate.hue, hue)) >= Math.abs(error)) break;
        best = candidate;
        bestCorrection = correction;
      }
    }
    if (best.chroma >= 0.006) {
      const origin = bestCorrection;
      for (let j = -8; j <= 8; j++) {
        const rotation = Math.max(-20, Math.min(20, origin + j * 0.25));
        const candidate = mix(rotation);
        if (
          Math.abs(distance(candidate.hue, hue)) <
          Math.abs(distance(best.hue, hue))
        ) {
          best = candidate;
          bestCorrection = rotation;
        }
      }
    }
    const offsets = model.rows.map(
      (row) => row.raw_hue_offset + bestCorrection,
    );
    cached = {
      correction: bestCorrection,
      offsets,
      hues: offsets.map((offset) => wrap(hue + offset)),
      tones,
      pigments,
      reference: best,
      referenceError: distance(best.hue, hue),
      neutral: best.chroma < 0.006,
    };
    key = nextKey;
    return cached;
  }
  return { calculate, oklab, wrap, distance };
})();
