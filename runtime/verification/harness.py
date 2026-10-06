"""Shared, fail-closed harness and receipt primitives for the two QA engines."""

from __future__ import annotations

import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PACKAGE_ROOT = ROOT.parent


def redact_text(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    replacements = {
        str(ROOT): "<revision>",
        str(Path.home()): "<user-home>",
        "/private/tmp/": "<temp>/",
        "/var/folders/": "<temp>/",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    return value


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def harness_sha256(*paths: Path) -> str:
    digest = hashlib.sha256()
    for path in paths:
        digest.update(path.name.encode("utf-8"))
        digest.update(path.read_bytes())
    return digest.hexdigest()


def resolve_artifact(explicit: str | None = None) -> Path | None:
    """Resolve only a revision-local built artifact; never consult a pointer or old revision."""
    candidates = [
        PACKAGE_ROOT / "proposal" / "resonant-field-proposal.html",
        PACKAGE_ROOT / "dist" / "resonant-field-proposal.html",
        PACKAGE_ROOT / "build" / "resonant-field-proposal.html",
    ]
    if explicit is not None:
        candidates = [Path(explicit)]
    for candidate in candidates:
        if candidate is None:
            continue
        path = candidate if candidate.is_absolute() else (PACKAGE_ROOT / candidate)
        path = path.resolve()
        if path.is_file() and path.is_relative_to(PACKAGE_ROOT):
            return path
    return None


def atomic_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temporary, path)


class Receipt:
    """A receipt cannot claim pass when a case was skipped, aborted, or failed."""

    def __init__(self, suite: str, engine: str, artifact_sha256: str, harness_sha256_value: str, planned_count: int):
        self.suite = suite
        self.engine = engine
        self.artifact_sha256 = artifact_sha256
        self.harness_sha256 = harness_sha256_value
        self.planned_count = planned_count
        self.run_id = str(uuid.uuid4())
        self.started_at = utc_now()
        self.checks: list[dict[str, Any]] = []
        self.aborted: dict[str, str] | None = None

    def _check(self, case_id: str) -> None:
        if any(check["id"] == case_id for check in self.checks):
            raise ValueError(f"duplicate case id: {case_id}")

    def record(
        self,
        case_id: str,
        passed: bool,
        detail: str,
        expected: Any = None,
        actual: Any = None,
        evidence: str | None = None,
        mutation: str | None = None,
    ) -> None:
        self._check(case_id)
        row: dict[str, Any] = {
            "id": case_id,
            "status": "pass" if passed else "fail",
            "passed": bool(passed),
            "detail": redact_text(detail),
        }
        if expected is not None:
            row["expected"] = expected
        if actual is not None:
            row["actual"] = actual
        if evidence is not None:
            row["evidence"] = evidence
        if mutation is not None:
            row["mutation"] = mutation
        self.checks.append(row)

    def abort(self, case_id: str, reason: str) -> None:
        self._check(case_id)
        reason = redact_text(reason)
        self.checks.append({"id": case_id, "status": "aborted", "passed": False, "detail": reason})
        self.aborted = {"case": case_id, "reason": reason}

    def finish(self) -> dict[str, Any]:
        ended_at = utc_now()
        if self.aborted is not None:
            status = "aborted"
        elif len(self.checks) != self.planned_count:
            status = "aborted"
            self.aborted = {"case": "receipt", "reason": "planned cases were not completed"}
        elif all(check["passed"] for check in self.checks):
            status = "pass"
        else:
            status = "fail"
        return {
            "schema_version": 1,
            "suite": self.suite,
            "engine": self.engine,
            "run_id": self.run_id,
            "started_at": self.started_at,
            "ended_at": ended_at,
            "artifact_sha256": self.artifact_sha256,
            "harness_sha256": self.harness_sha256,
            "planned_count": self.planned_count,
            "completed_count": len(self.checks),
            "status": status,
            "passed": status == "pass",
            "aborted": self.aborted,
            "checks": self.checks,
        }


def evidence_path(suite: str, engine: str) -> Path:
    return ROOT / "verification" / "receipts" / engine / f"{suite}.json"


def write_receipt(receipt: Receipt, suite: str, engine: str, write: bool = True) -> dict[str, Any]:
    payload = receipt.finish()
    if write:
        atomic_json(evidence_path(suite, engine), payload)
    return payload


def launch_browser(playwright: Any, engine: str) -> Any:
    """Use Playwright-managed browsers or an explicitly configured Chromium; leave missing engines explicit."""
    if engine == "chromium":
        executable = os.environ.get("RESONANT_CHROMIUM_EXECUTABLE")
        if executable:
            return playwright.chromium.launch(executable_path=executable, headless=True)
        return playwright.chromium.launch(headless=True)
    return playwright.webkit.launch(headless=True)
