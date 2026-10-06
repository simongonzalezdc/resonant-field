# Resonant Field host integration contract

This document is for an approved host that wants the retained visual runtime. It
describes local rendering hooks only; it makes no business, provider, trust,
approval, or permission claim.

## Dependency order

Load the styles first, then the scripts in this order:

1. `volume.css` and `geometry.css` after the host component skin.
2. `blend-controller.js`, `finish-controller.js` and `contrast-controller.js` (pure preference/finish/readability helpers), followed by `volume.js`, which defines `window.ResonantVolume`.
3. `geometry.js`, which defines `window.ResonantGeometry`.
4. `world-sampler.js`, which reads the mounted volume and defines
   `window.ResonantWorldSampler`.
5. `corner-controller.js`, which defines
   `window.ResonantCornerController` and is optional unless the host wants the
   callback-based corner adapter.
6. `asset-bank.js` when using the lazy offline JSON asset bank.

The host must call `ResonantVolume.mount(document)` once the semantic DOM exists.
After changing a plate or appearance, call `ResonantVolume.configure(...)` and
`ResonantWorldSampler.refresh()`. Before removing the host document, call the
mount result's `unmount()` (or `ResonantVolume.unmount()`). For SPA route teardown, call `ResonantWorldSampler.release()`; refresh after the next scene mounts. The sampler default is exactly one visible `[data-volume-world]` with a direct-child `.plate`; call `configureHost(...)` explicitly for a legacy selector. A pagehide teardown releases sampler-owned blob URLs and decoded scene state.

## Host markup and tokens

Provide exactly one visible `[data-volume-world]` scene per host view. A direct child
`img.plate` is the source substrate; it may be an approved same-origin local
asset or a small data SVG. The sampler covers that image into bounded canvases.
Readable headings, labels, and controls stay in ordinary DOM nodes and are
never painted into the substrate.

Use explicit semantic hooks:

```html
<section data-volume-world>
  <img class="plate" alt="" aria-hidden="true" src="...">
  <article data-volume-role="workplane" data-volume-state="resting">...</article>
  <button data-volume-role="primary" data-volume-state="hover">...</button>
</section>
```

`data-volume-role` chooses the authored plane (`atmosphere`, `context`,
`workplane`, `reading`, `editor`, `control`, `primary`, `source-item`, or
`overlay`). `data-volume-state` chooses the visual relation (`resting`,
`hover`, `focus`, `pressed`, `active`, `selected`, `inset`, `recessed`,
`raised`, `floating`, `disabled`, or `error`). Sibling/column order is not an
integration contract. Depth is an optical relation, never authorization.

The host owns these root appearance variables:

| Token | Meaning |
| --- | --- |
| `--material-hue` | Main hue in degrees |
| `--material-chroma` | Normalized chroma, normally `0..0.12` |
| `--tone-anchor` | Authored tonal anchor |
| `--plate-brightness` | Plate exposure multiplier |
| `--plate-position` | Cover-image horizontal position, `0..100` |
| `--accent-hue` | Localized hover/focus/selected signal hue |
| `--presence` | Semantic material presence multiplier |
| `--texture-opacity` | Background/photo opacity, clamped to `0..1` |

`data-mode`, `data-selective`, and `data-solid` are the shared root appearance
state attributes. `ResonantVolume.configure({ plate, hue, chroma, toneAnchor,
mode, brightness, position, selectiveColor, presence, backgroundPresence, solid,
accentHue })` is the public appearance boundary: it writes these shared root
tokens and the retained `--rv-*` aliases. `backgroundPresence` is clamped to
`0..1` and writes `--texture-opacity`. `resolve(role, state, parent)` is a pure
plan query. `setState(element, state)` updates one real DOM node. `inspect()`
returns the frozen semantic model.

`ResonantGeometry` is the corner-only path: `configure(profile)`, `refresh()`,
`resolve(...)`, and `inspect()`. It changes radius geometry, not the material
substrate. Parent-radius subtraction is opt-in only: pass
`{ edgeFollowing: true }` to `resolve(...)`; the DOM adapter uses
`data-corner-edge-following="true"` for explicitly nested shells. Ordinary
parent arguments do not change the radius. `ResonantCornerController.create({
geometry, onReadout, onPersist, eventTarget })` returns `apply(profile, {
save, notify })`; `eventTarget` is an `EventTarget` used only for local
`CustomEvent` notification. Persistence and any local Blackboard `postMessage`
transport remain host callbacks; the controller does not provide transport.

## Ownership boundary

Core owns semantic planning, DOM-owned film nodes, world alignment, bounded
sampling, fallback behavior, and observer teardown. The host owns controls,
local state storage, atomic/Blackboard transport, readable demo text, routing,
and whether an appearance setting is exposed.

Do not integrate through prototype element IDs or demo routing functions.
The portable contract is the role/state attributes and the root tokens above.
The host-smoke fixture uses no product application script and has no provider or
business data.

## Optimization disposition

All retained optimizations have a reusable source owner:

- `world-sampler.js`: row-major channel-sum box blur, cached decoded images,
  cached per-depth blur arrays, encoded base substrate, bounded PNG encoding,
  bounded blob URL retirement, and same-world sample reuse.
- `volume.js`: cached pure plans, a `WeakMap` for painted state, cached parent
  plans, and DOM film-node reuse.
- `geometry.js` plus `corner-controller.js`: corner-only updates without a
  scene rebuild.

Asset guidance is intentionally narrow: keep source plates local to the host,
bounded in dimensions by the sampler, and stable under a same-origin or data
URL policy. A host should not add remote image fetches or unbounded inline
payloads to this contract.

The exact machine-readable form is
[`runtime-contract.json`](runtime-contract.json); the standalone verification
fixture is [`../verification/fixtures/host-smoke.html`](../verification/fixtures/host-smoke.html).

## Shared asset pipeline
`asset-bank.js` supplies `ResonantAssetBank.create({document,idPrefix}).wrapPlate(plate)` for lazy offline JSON banks. The proposal build consumes this same module, so approved hosts reuse it rather than copying an inline accessor.
`asset_pipeline.py` supplies `encode_plate(validated_source_bytes)` for pixel-checked full-resolution lossless WebP and small gallery thumbnails. The proposal build consumes this same helper. It uses the already-present Pillow dependency; hosts retain originals and bind source provenance before calling it. Live hosts may use their own bundler to deliver the returned bytes with content hashes.
These modules are runtime/build optimizations; demo content, storage preference keys, screenshot harnesses and prototype navigation are host adapters, not required design-system code. No host/provider integration or team approval is implied.

### Material finish candidate

The same sampler supplies calm light contrast (.24; dark .42), resolver-owned relational edges and a static photographic texture reflection. Reflection uses two small shared color canvases from one texture analysis and is composited into the existing five images, with no additional DOM/compositor mask or listener. Its hue is main±29.25° (50 log2(3/2)) and nominal peak opacity is .035 light/.055 dark, multiplied by cumulative coverage/.62. Source texture coverage is bounded below 8%; no image yields no reflection. Solid, reduced transparency and forced colors bypass the sampled finish. This is an artistic approximation; human iridescence acceptance remains open.

The reflection color range projects the existing 3:2 interval as ±50 log2(3/2) degrees. Two opposite texture-orientation palettes blend with resolved depth/4, so component state changes alter the authored reflection phase without a pointer listener or new render pass. This is a material metaphor, not measured optical interference. Positive texture amplitudes normalize at their 95th percentile; active source coverage remains below 8%.

Selectable background plates use `encode_plate(validated_source_bytes, profile)` with `materials/plate-profile.json`: a centered 1664×936 crop, strict 8-bit grayscale RGB and lossless WebP method 4. Enlarging a too-small source fails. Pixel equality is verified against that normalized crop; full PNG masters remain archived. Omit the profile for the original full-resolution encoding contract.


## Personal appearance

Load `preset-controller.js` with `../design-system/material-presets.json` for material-only recipes. `../design-system/appearance-defaults.json` supplies complete starting-point candidates; these are presentation defaults, not accessibility overrides. The proposal consumes the same JSON registry.

Load `preference-learning.js` for bounded local preference learning. Observe only committed manual choices with a host-owned route/surface context. Call `recommend` when entering a context, then apply eligible results above the host confidence threshold. Preserve current accessibility settings and manual choices during active interaction. Never observe adaptations, initial state, demo capture, provider state or document content. The API performs no DOM changes or network requests. Supply local storage, expose pause/reset and keep a visible explanation of adaptation. The actual product host must wire those hooks; the proposal demonstrates them.

## Fonts, accessibility and local reference frames

`../design-system/tokens.css` declares the four bundled Hanken Grotesk and Bricolage Grotesque faces through relative URLs into `proposal/delivery-assets`. Keep that directory alongside `runtime`, or rewrite the URLs when bundling for a host. System fonts remain fallbacks.

Task transitions and manual learning actions use a central polite live region. Separate polite status regions announce substantive upload, Blackboard and local-decision changes. Numerical appearance readouts and the learning description use note roles to avoid announcements on every slider update. The visual toast is hidden from assistive technology; keyboard and screen-reader acceptance remain part of host review.

Reference frames contain trusted, bundled same-origin code. They are not an isolation boundary. Message senders name the current origin and receivers validate both origin and source window. Serve the package over a local HTTP origin; opaque `file:` framing is unsupported. Never substitute remote or untrusted frame content without a separate isolation design.

The standalone smoke fixture self-posts its geometry readout with `*` because a `file:` URL has an opaque origin. No receiver consumes that message, and it carries no product data. This exception does not apply to the interactive proposal’s iframe transport.
