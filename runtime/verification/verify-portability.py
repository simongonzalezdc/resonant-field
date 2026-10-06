"""Run the standalone approved-host fixture through the repository Playwright harness."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from verification.harness import ROOT, launch_browser


FIXTURE = "/verification/fixtures/host-smoke.html"
FIXTURE_PATH = ROOT / "verification/fixtures/host-smoke.html"
REPORT = ROOT / "evidence/optimization/portability-report.md"
HASHED_FILES = [
    "materials/volume.js",
    "materials/world-sampler.js",
    "materials/geometry.js",
    "materials/corner-controller.js",
    "materials/INTEGRATION.md",
    "materials/runtime-contract.json",
    "verification/fixtures/host-smoke.html",
    "verification/verify-portability.py",
]


def fixture_url(query: str) -> str:
    return f"{FIXTURE_PATH.as_uri()}?{query}"


def checks_for(page: Any) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []

    def check(name: str, passed: bool, actual: Any = None, detail: str = "") -> None:
        row = {"id": name, "passed": bool(passed), "detail": detail}
        if actual is not None:
            row["actual"] = actual
        checks.append(row)

    errors: list[str] = []
    failures: list[dict[str, Any]] = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("response", lambda response: failures.append({"url": response.url, "status": response.status}) if response.status >= 400 else None)
    response = page.goto(fixture_url("run=normal"), wait_until="load")
    page.wait_for_function("() => window.HostSmoke?.core?.mounted === true", timeout=15000)
    page.wait_for_function("() => window.ResonantWorldSampler?.inspect().status === 'ready'", timeout=45000)

    identity = page.evaluate("""() => ({
      world: Boolean(document.querySelector('[data-volume-world]')),
      plate: document.querySelectorAll('[data-volume-world] > img.plate').length,
      productScripts: [...document.scripts].some(s => /(?:app|proposal)/i.test(s.src)),
      modules: Object.keys(HostSmoke.core.modules).length,
      mounted: HostSmoke.core.mounted
    })""")
    check("standalone-host-shape", identity["world"] and identity["plate"] == 1 and not identity["productScripts"], identity, "fixture uses one data-volume-world and one direct img.plate without product scripts")
    check("three-core-modules-mounted", identity["mounted"] and identity["modules"] == 3, identity, "volume, geometry, and world sampler are mounted in dependency order")
    check("cold-load-clean", not errors and not failures and (response is None or response.ok), {"errors": errors, "failures": failures, "status": response.status if response else None}, "fixture loads without page errors or failed resources")

    initial = page.evaluate("() => HostSmoke.inspect()")
    depths = [int(row["depth"]) for row in initial["depths"]]
    check("semantic-five-depths", depths == [0, 1, 2, 3, 4], initial["depths"], "explicit semantic roles resolve to all five authored planes")
    sweep = page.evaluate("() => HostSmoke.stateSweep()")
    check("state-probes-use-real-dom-model", [row["state"] for row in sweep["probes"]] == ["resting", "hover", "focus", "pressed", "selected"] and all(0 <= row["depth"] <= 4 for row in sweep["probes"]), sweep, "state changes are resolved by role/state, not sibling order")

    before_scene = page.evaluate("() => ResonantWorldSampler.inspect()")
    page.evaluate("() => HostSmoke.setAppearance({ hue: 188, brightness: .46 })")
    page.wait_for_function("(before) => { const s = ResonantWorldSampler.inspect(); return s.status === 'ready' && s.sceneKey !== before.sceneKey; }", arg=before_scene, timeout=45000)
    after_scene = page.evaluate("() => ResonantWorldSampler.inspect()")
    check("hue-brightness-rebuild", after_scene["sceneKey"] != before_scene["sceneKey"] and after_scene["samples"] == 5 and after_scene["scene"], {"before": before_scene, "after": after_scene}, "appearance changes rebuild five bounded depth samples")

    stable_film = page.evaluate("() => { const e = document.querySelector('#workplane > .rv-surface > .rv-film'); window.__hostSmokeFilm = e; return { present: Boolean(e) }; }")
    generation_before_corners = after_scene["generation"]
    corner_results = []
    for profile in range(5):
        corner_results.append(page.evaluate("profile => HostSmoke.setCorner(profile)", profile))
    generation_after_corners = page.evaluate("() => ResonantWorldSampler.inspect().generation")
    corner_state = page.evaluate("() => ({ root: document.documentElement.dataset.cornerProfile, unit: document.documentElement.style.getPropertyValue('--corner-unit'), events: HostSmoke.events })")
    check("corner-controller-path", [row["index"] for row in corner_results] == list(range(5)) and generation_after_corners == generation_before_corners and corner_state["root"] == "4", {"results": corner_results, "state": corner_state, "generation": [generation_before_corners, generation_after_corners]}, "corner updates use the controller and do not rebuild the sampled substrate")
    stable_after = page.evaluate("() => ({ same: document.querySelector('#workplane > .rv-surface > .rv-film') === window.__hostSmokeFilm, count: document.querySelectorAll('#workplane > .rv-surface > .rv-film').length })")
    check("dom-film-reuse", stable_film["present"] and stable_after["same"] and stable_after["count"] == 3, stable_after, "volume keeps existing semantic film nodes instead of replacing the DOM subtree")

    state_values = page.evaluate("() => ({ hover: HostSmoke.setState('control', 'hover').depth, pressed: HostSmoke.setState('control', 'pressed').depth, state: document.getElementById('control').dataset.volumeState })")
    check("real-control-state-transition", state_values["hover"] == 4 and state_values["pressed"] == 2 and state_values["state"] == "pressed", state_values, "a real button exercises hover and pressed depth changes")

    teardown = page.evaluate("() => HostSmoke.teardown()")
    check("teardown-releases-runtime", teardown["mounted"] is False and teardown["sampler"]["resources"]["activeUrls"] == 0 and teardown["sampler"]["resources"]["pendingScenes"] == 0, teardown, "unmount plus pagehide releases observers, blob URLs, and pending scene work")

    return checks


def reduced_transparency_check(page: Any) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []

    def check(name: str, passed: bool, actual: Any = None, detail: str = "") -> None:
        row = {"id": name, "passed": bool(passed), "detail": detail}
        if actual is not None:
            row["actual"] = actual
        checks.append(row)

    page.goto(fixture_url("run=reduced"), wait_until="load")
    page.wait_for_function("() => window.HostSmoke?.core?.mounted === true", timeout=15000)
    page.wait_for_function("() => document.documentElement.dataset.volumeSampling === 'solid'", timeout=15000)
    actual = page.evaluate("""() => ({
      sampling: document.documentElement.dataset.volumeSampling,
      plate: getComputedStyle(document.querySelector('.plate')).visibility,
      sampled: document.querySelectorAll('.rv-world-sampled').length,
      urls: ResonantWorldSampler.inspect().resources.activeUrls,
      solid: document.documentElement.dataset.solid
    })""")
    check("reduced-transparency-fallback", actual["sampling"] == "solid" and actual["plate"] != "hidden" and actual["sampled"] == 0 and actual["urls"] == 0, actual, "reduced transparency selects the opaque/readable fallback and clears sampled resources")
    return checks


def run_engine(engine: str) -> dict[str, Any]:
    result: dict[str, Any] = {"engine": engine, "status": "error", "checks": []}
    try:
        with sync_playwright() as playwright:
            browser = launch_browser(playwright, engine)
            page = browser.new_page(viewport={"width": 1024, "height": 700})
            result["checks"].extend(checks_for(page))
            reduced = browser.new_page(viewport={"width": 1024, "height": 700})
            reduced.add_init_script("""(() => {
              const native = window.matchMedia.bind(window);
              window.matchMedia = query => {
                const result = native(query);
                if (query === '(prefers-reduced-transparency: reduce)' && location.search.includes('run=reduced')) {
                  return { ...result, matches: true, addEventListener: result.addEventListener?.bind(result), removeEventListener: result.removeEventListener?.bind(result) };
                }
                return result;
              };
            })();""")
            result["checks"].extend(reduced_transparency_check(reduced))
            browser.close()
        result["status"] = "pass" if all(check["passed"] for check in result["checks"]) else "fail"
    except Exception as error:  # A missing browser or fixture failure is evidence, never a pass.
        result["error"] = f"{type(error).__name__}: {error}"
    return result


def hashes() -> dict[str, str]:
    return {path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in HASHED_FILES}


def write_report(payload: dict[str, Any]) -> None:
    lines = [
        "# Host portability verification",
        "",
        "This report covers the standalone local host fixture only. It makes no product, provider, business, trust, approval, or deployment claim.",
        "",
        f"- Generated: `{payload['generated_at']}`",
        f"- Overall status: **{payload['status'].upper()}**",
        f"- Fixture: `{FIXTURE}`",
        "",
        "## Harness results",
        "",
    ]
    for result in payload["engines"]:
        lines.append(f"### {result['engine']}: {result['status'].upper()}")
        if result.get("error"):
            lines.append(f"- Error: `{result['error']}`")
        for check in result.get("checks", []):
            mark = "PASS" if check["passed"] else "FAIL"
            lines.append(f"- `{mark}` `{check['id']}` — {check['detail']}")
            if not check["passed"] and "actual" in check:
                lines.append(f"  - Actual: `{json.dumps(check['actual'], sort_keys=True)}`")
        lines.append("")
    lines.extend(["## Source hashes", "", "SHA-256 values below identify the exact local sources exercised by the contract.", ""])
    for path, digest in payload["hashes"].items():
        lines.append(f"- `{digest}`  `{path}`")
    lines.extend([
        "",
        "## Optimization disposition",
        "",
        "The reusable optimization mapping is defined in `materials/runtime-contract.json` and summarized in `materials/INTEGRATION.md`: row-major blur, cache/DOM reuse, encoded substrate, bounded PNG encoding, corner-only geometry updates, and bounded local asset loading.",
        "",
        "A pass here means the local host fixture exercised these hooks in the selected Playwright engines. It does not substitute for human visual approval, production integration, or acceptance of any external system.",
        "",
    ])
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("engine", nargs="?", choices=["chromium", "webkit", "all"], default="all")
    args = parser.parse_args()
    engines = ["chromium", "webkit"] if args.engine == "all" else [args.engine]
    results = [run_engine(engine) for engine in engines]
    payload = {
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "status": "pass" if all(result["status"] == "pass" for result in results) else "fail",
        "engines": results,
        "hashes": hashes(),
    }
    write_report(payload)
    print(json.dumps(payload, indent=2))
    return 0 if payload["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
