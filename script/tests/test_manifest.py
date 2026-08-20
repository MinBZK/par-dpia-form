"""Tests for the source-manifest loader and consistency lint."""

import copy
from pathlib import Path

from manifest import load_manifest, validate_manifest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MANIFEST_PATH = REPO_ROOT / "sources" / "manifest.yaml"
SCHEMA_PATH = REPO_ROOT / "schemas" / "source-manifest.v1.schema.json"
SOURCES_DIR = REPO_ROOT / "sources"


def test_real_manifest_loads_with_all_types():
    manifest = load_manifest(MANIFEST_PATH)
    assert set(manifest["types"]) == {"prescan", "dpia", "iama"}


def test_real_manifest_is_valid():
    manifest = load_manifest(MANIFEST_PATH)
    assert validate_manifest(manifest, SCHEMA_PATH, SOURCES_DIR) == []


def test_flags_missing_source_file():
    broken = copy.deepcopy(load_manifest(MANIFEST_PATH))
    broken["types"]["dpia"]["versions"][0]["file"] = "does-not-exist.yaml"
    errors = validate_manifest(broken, SCHEMA_PATH, SOURCES_DIR)
    assert any("does-not-exist.yaml" in e for e in errors)


def test_flags_latest_official_absent():
    broken = copy.deepcopy(load_manifest(MANIFEST_PATH))
    broken["types"]["dpia"]["latestOfficial"] = "9.9"
    errors = validate_manifest(broken, SCHEMA_PATH, SOURCES_DIR)
    assert any("latestOfficial '9.9'" in e for e in errors)


def test_flags_latest_official_pointing_at_concept():
    broken = copy.deepcopy(load_manifest(MANIFEST_PATH))
    broken["types"]["dpia"]["versions"].append(
        {"version": "3.1.0-concept.1", "channel": "concept", "file": "dpia.yaml"}
    )
    broken["types"]["dpia"]["latestOfficial"] = "3.1.0-concept.1"
    errors = validate_manifest(broken, SCHEMA_PATH, SOURCES_DIR)
    assert any("not an official version" in e for e in errors)


def test_schema_violation_short_circuits_semantic_checks():
    broken = copy.deepcopy(load_manifest(MANIFEST_PATH))
    broken["types"]["dpia"]["versions"][0]["version"] = "v3-bogus!"
    errors = validate_manifest(broken, SCHEMA_PATH, SOURCES_DIR)
    assert errors
    assert all(e.startswith("schema:") for e in errors)


def test_flags_duplicate_version():
    broken = copy.deepcopy(load_manifest(MANIFEST_PATH))
    broken["types"]["dpia"]["versions"].append(
        {"version": "3.0", "channel": "concept", "file": "dpia.yaml"}
    )
    errors = validate_manifest(broken, SCHEMA_PATH, SOURCES_DIR)
    assert any("duplicate" in e.lower() and "3.0" in e for e in errors)


def test_flags_missing_begrippenkader():
    broken = copy.deepcopy(load_manifest(MANIFEST_PATH))
    broken["types"]["dpia"]["begrippenkader"] = "begrippenkader_dpai.yaml"  # typo
    errors = validate_manifest(broken, SCHEMA_PATH, SOURCES_DIR)
    assert any("begrippenkader_dpai.yaml" in e for e in errors)


def test_flags_stale_latest_official():
    broken = copy.deepcopy(load_manifest(MANIFEST_PATH))
    broken["types"]["dpia"]["versions"].append(
        {"version": "3.1", "channel": "official", "file": "dpia.yaml"}
    )
    # latestOfficial stays 3.0 while a higher official 3.1 now exists.
    errors = validate_manifest(broken, SCHEMA_PATH, SOURCES_DIR)
    assert any("latestOfficial" in e and "3.1" in e for e in errors)
