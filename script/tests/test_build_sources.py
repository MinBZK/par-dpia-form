"""Tests for the manifest-driven multi-version source build (build_sources.py)."""

import json
from pathlib import Path

import pytest
from build_sources import build_sources
from manifest import load_manifest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MANIFEST_PATH = REPO_ROOT / "sources" / "manifest.yaml"
SCHEMA_PATH = REPO_ROOT / "schemas" / "assessment-definition.v2.schema.json"
SOURCES_DIR = REPO_ROOT / "sources"


def test_builds_one_enriched_json_per_manifest_version(tmp_path):
    generated = tmp_path / "generated"
    build_sources(MANIFEST_PATH, SOURCES_DIR, SCHEMA_PATH, generated)

    manifest = load_manifest(MANIFEST_PATH)
    for type_name, type_def in manifest["types"].items():
        for version in type_def["versions"]:
            out = generated / type_name / f"{version['version']}.json"
            assert out.exists(), f"missing build output {out}"
            data = json.loads(out.read_text(encoding="utf-8"))
            assert data["version"] == version["version"]
            assert "tasks" in data


def test_emits_a_runtime_manifest_mirroring_the_source(tmp_path):
    generated = tmp_path / "generated"
    build_sources(MANIFEST_PATH, SOURCES_DIR, SCHEMA_PATH, generated)

    runtime = json.loads((generated / "manifest.json").read_text(encoding="utf-8"))
    source = load_manifest(MANIFEST_PATH)
    assert runtime["schemaVersion"] == source["schemaVersion"]
    assert set(runtime["types"]) == set(source["types"])
    for type_name, type_def in source["types"].items():
        assert runtime["types"][type_name]["latestOfficial"] == type_def["latestOfficial"]
        assert [v["version"] for v in runtime["types"][type_name]["versions"]] == [
            v["version"] for v in type_def["versions"]
        ]


def test_raises_when_a_source_fails_schema_validation(tmp_path):
    sources = tmp_path / "src"
    sources.mkdir()
    # Missing the required urn/version/tasks -> definition-schema validation fails.
    (sources / "bad.yaml").write_text("name: Broken\n", encoding="utf-8")
    (sources / "begrippen.yaml").write_text("begrippen: []\n", encoding="utf-8")
    manifest_file = sources / "manifest.yaml"
    manifest_file.write_text(
        "schemaVersion: 1\n"
        "types:\n"
        "  dpia:\n"
        "    latestOfficial: '1.0'\n"
        "    begrippenkader: begrippen.yaml\n"
        "    versions:\n"
        "      - version: '1.0'\n"
        "        channel: official\n"
        "        file: bad.yaml\n",
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="schema validation failed"):
        build_sources(manifest_file, sources, SCHEMA_PATH, tmp_path / "out")
