# Runtime verification

Use an existing Python environment with the pinned `requirements.txt` dependencies. For a new local environment, install with `python -m pip install -r runtime/verification/requirements.txt`, then `python -m playwright install chromium webkit`. Browser installation is a separate prerequisite.

The artifact resolver finds `proposal/resonant-field-proposal.html` from the package root. The standalone fixture remains at `runtime/verification/fixtures/host-smoke.html`. Run `python runtime/verification/verify-portability.py --help` for the engine options. The standalone verifier opens the fixture from its local file URL; the interactive proposal should be served over HTTP.

Set `RESONANT_CHROMIUM_EXECUTABLE` only when using an already-installed system Chromium. Otherwise the harness uses the Playwright-managed browser. Missing WebKit is reported as unavailable, never as passing.

## Interactive proposal checks (Node)

Install the pinned development dependencies in this directory with `npm ci`. Use the existing system browser via `RESONANT_CHROMIUM_EXECUTABLE`, or install a Playwright-managed Chromium with `npx playwright install chromium`. From the repository root, run:

```sh
node runtime/verification/verify-proposal.mjs
```

The runner verifies `FILE-MANIFEST.json`, all HTML pages and background choices, phone/tablet/desktop reflow, appearance-dialog keyboard behavior, live-region semantics, same-origin iframe messaging and rejection of foreign-origin messages. It also emulates forced colors and reduced motion. Results and screenshots go to the ignored `.verification-output/` directory. Pass a root directory and receipt filename as the first two arguments to choose another output location. `RESONANT_PLAYWRIGHT_ROOT` can reuse an existing Playwright installation without changing dependencies.

These automated checks do not certify all contrast combinations or replace manual screen-reader acceptance. The Python artifact resolver is a reusable helper with a path-confinement check recorded in `EXPORT-CHECKS.json`; the shipped Node runner verifies the published artifact directly. Run `python runtime/verification/test-harness.py` for the four dependency-free artifact selection and confinement regressions.

Run `npm test --prefix runtime/verification` for the shipped blend, finish and contrast controller regressions. They require Node only; the browser dependency is not loaded by those tests.

Run `node runtime/verification/verify-navigation.mjs` for all 20 directed navigation pairs at five viewport widths, active navigation semantics, history and brand routing, scroll retention, shared Appearance access, full-size photo samples after a delayed return, and scene teardown. It uses the same browser environment variables and optional root/receipt arguments. This checks interaction correctness; headless timing does not certify smoothness on every device.
