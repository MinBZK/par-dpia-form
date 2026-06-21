"""Load and validate the source manifest (sources/manifest.yaml).

The manifest is the single source of truth for which questionnaire versions exist,
their channel, and which version is "latest official" per type. validate_manifest
performs the structural (JSON Schema) check plus a semantic consistency lint
(duplicate versions, latestOfficial sanity, referenced files exist). It runs in CI
via pytest; wiring it into the build pipeline as a hard gate is a later step.
"""

from __future__ import annotations

import json
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator


def load_manifest(path: Path) -> dict:
    with Path(path).open(encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def _highest_official(versions: list[dict]) -> str | None:
    # Official versions never carry a prerelease suffix, so a numeric tuple orders them.
    officials = [
        v["version"] for v in versions if v["channel"] == "official" and "-" not in v["version"]
    ]
    if not officials:
        return None
    return max(officials, key=lambda s: tuple(int(part) for part in s.split(".")))


def validate_manifest(manifest: dict, schema_path: Path, sources_dir: Path) -> list[str]:
    """Return a list of human-readable problems; empty means the manifest is valid."""
    schema = json.loads(Path(schema_path).read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)
    schema_errors = [
        f"schema: {error.message}" for error in sorted(validator.iter_errors(manifest), key=str)
    ]
    if schema_errors:
        # Semantic checks assume a structurally valid manifest.
        return schema_errors

    errors: list[str] = []
    for type_name, type_def in manifest["types"].items():
        version_list = type_def["versions"]

        seen: set[str] = set()
        for version in version_list:
            if version["version"] in seen:
                errors.append(f"{type_name}: duplicate version '{version['version']}'")
            seen.add(version["version"])

        versions = {version["version"]: version for version in version_list}
        latest = type_def["latestOfficial"]
        if latest not in versions:
            errors.append(f"{type_name}: latestOfficial '{latest}' is not in versions")
        elif versions[latest]["channel"] != "official":
            errors.append(f"{type_name}: latestOfficial '{latest}' is not an official version")
        else:
            highest = _highest_official(version_list)
            if highest is not None and highest != latest:
                errors.append(
                    f"{type_name}: latestOfficial '{latest}' is below highest official '{highest}'"
                )

        if not (sources_dir / type_def["begrippenkader"]).exists():
            errors.append(
                f"{type_name}: begrippenkader file '{type_def['begrippenkader']}' does not exist"
            )

        for version in version_list:
            if not (sources_dir / version["file"]).exists():
                errors.append(f"{type_name}: source file '{version['file']}' does not exist")
    return errors
