"""Regression tests for artifact selection and package-boundary enforcement."""
import unittest
import tempfile
from pathlib import Path
from harness import PACKAGE_ROOT, resolve_artifact

class ArtifactSelection(unittest.TestCase):
    def test_default_export_exists(self):
        self.assertEqual(resolve_artifact(), PACKAGE_ROOT / "proposal" / "resonant-field-proposal.html")

    def test_explicit_package_file(self):
        self.assertEqual(resolve_artifact("proposal/resonant-field-proposal.html"), resolve_artifact())

    def test_missing_explicit_file_does_not_fall_back(self):
        self.assertIsNone(resolve_artifact("proposal/missing-export.html"))

    def test_existing_external_file_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact = Path(directory) / "outside.html"
            artifact.write_text("<html></html>")
            self.assertIsNone(resolve_artifact(str(artifact)))

if __name__ == "__main__":
    unittest.main()
