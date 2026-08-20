"""Light validation tests for the run_all pipeline's schema-validation step.

These import SchemaValidator directly (the same class run_all uses) and check it
against the real assessment-definition schema, using small inline YAML fixtures.
"""

from pathlib import Path

import yaml
from schema_validator import SchemaValidator

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCHEMA_PATH = REPO_ROOT / "schemas" / "assessment-definition.v2.schema.json"

VALID_SOURCE = {
    "name": "Mini DPIA",
    "description": "Een minimale geldige bron.",
    "urn": "urn:nl:dpia",
    "tasks": [
        {
            "id": "1",
            "task": "Eerste taak",
            "description": "Beschrijving",
            "type": ["open_text"],
            "repeatable": False,
        },
    ],
}


def _write_yaml(tmp_path: Path, data: dict) -> Path:
    yaml_path = tmp_path / "source.yaml"
    yaml_path.write_text(yaml.safe_dump(data, allow_unicode=True), encoding="utf-8")
    return yaml_path


def test_schema_file_exists():
    assert SCHEMA_PATH.exists(), f"Schema not found at {SCHEMA_PATH}"


def test_validator_accepts_valid_source(tmp_path):
    yaml_path = _write_yaml(tmp_path, VALID_SOURCE)

    validator = SchemaValidator(REPO_ROOT)
    is_valid, errors, data = validator.validate_yaml(yaml_path, SCHEMA_PATH)

    assert is_valid is True, errors
    assert errors == []
    assert data["name"] == "Mini DPIA"


def test_validator_rejects_missing_required_field(tmp_path):
    broken = dict(VALID_SOURCE)
    del broken["tasks"]  # 'tasks' is required at the top level
    yaml_path = _write_yaml(tmp_path, broken)

    validator = SchemaValidator(REPO_ROOT)
    is_valid, errors, data = validator.validate_yaml(yaml_path, SCHEMA_PATH)

    assert is_valid is False
    assert errors
    assert data == {}


def test_validator_rejects_urn_violating_pattern(tmp_path):
    broken = dict(VALID_SOURCE)
    broken["urn"] = "not-a-valid-urn"  # violates ^urn:nl:[a-z]+$
    yaml_path = _write_yaml(tmp_path, broken)

    validator = SchemaValidator(REPO_ROOT)
    is_valid, errors, _ = validator.validate_yaml(yaml_path, SCHEMA_PATH)

    assert is_valid is False
    assert errors


def _validate_with_version(tmp_path: Path, version: str):
    source = dict(VALID_SOURCE)
    source["version"] = version
    yaml_path = _write_yaml(tmp_path, source)
    validator = SchemaValidator(REPO_ROOT)
    return validator.validate_yaml(yaml_path, SCHEMA_PATH)


def test_validator_accepts_concept_prerelease_version(tmp_path):
    # The continuous concept file declares 'X.Y.Z-concept'; the build stamps the
    # iteration. Both forms must validate or run_all aborts before generation.
    is_valid, errors, _ = _validate_with_version(tmp_path, "3.1.0-concept")
    assert is_valid is True, errors


def test_validator_accepts_concept_iteration_version(tmp_path):
    is_valid, errors, _ = _validate_with_version(tmp_path, "3.1.0-concept.4")
    assert is_valid is True, errors


def test_validator_still_accepts_release_versions(tmp_path):
    for version in ("2", "3.0", "3.1.0"):
        is_valid, errors, _ = _validate_with_version(tmp_path, version)
        assert is_valid is True, f"{version}: {errors}"


def test_validator_rejects_garbage_version(tmp_path):
    is_valid, errors, _ = _validate_with_version(tmp_path, "v3-bogus!")
    assert is_valid is False
    assert errors


def test_validator_rejects_non_concept_prerelease(tmp_path):
    # -concept is the only authoring-allowed prerelease channel; -alpha/-rc must fail.
    for version in ("3.1.0-alpha", "3.1.0-rc.1", "3.1.0-beta.2"):
        is_valid, _, _ = _validate_with_version(tmp_path, version)
        assert is_valid is False, f"{version} should be rejected"
