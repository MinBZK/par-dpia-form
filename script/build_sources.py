#!/usr/bin/env python3
"""Manifest-driven multi-version source build.

Reads sources/manifest.yaml and, for every (type, version) entry, runs the same
validate -> enrich transform as run_all.py to produce
``sources/generated/<type>/<version>.json``, then writes
``sources/generated/manifest.json`` -- the runtime registry the apps consume
(mirrors schemas/source-manifest.v1.schema.json / the SourceManifest TS type).

The legacy flat output (PreScanDPIA.json/DPIA.json/IAMA.json) is produced separately
by run_all.py and is unchanged; wiring the build sites to this orchestrator is a
deliberate follow-up step (it touches CI and the container build).
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from definition_enricher import DefinitionEnricher
from manifest import load_manifest
from schema_validator import SchemaValidator

logger = logging.getLogger(__name__)

# Legacy flat output filenames the apps still import statically. build_sources mirrors the
# latest-official enrichment of each type to these names so it is a drop-in for run_all.py,
# alongside the per-version (nested) output. Removed once the apps load the nested output.
LEGACY_FLAT_OUTPUTS = {
    "prescan": "PreScanDPIA.json",
    "dpia": "DPIA.json",
    "iama": "IAMA.json",
}


def build_sources(
    manifest_path: Path,
    sources_dir: Path,
    schema_path: Path,
    generated_dir: Path,
    script_dir: Path | None = None,
) -> Path:
    """Build every (type, version) declared in the manifest into a nested enriched JSON,
    then write the runtime manifest. Returns the runtime manifest path.

    Raises ValueError when a source fails schema validation -- the build must not emit a
    registry pointing at half-valid artefacts.
    """
    script_dir = script_dir or Path(__file__).parent
    manifest = load_manifest(manifest_path)
    validator = SchemaValidator(script_dir)
    enricher = DefinitionEnricher(script_dir)

    for type_name, type_def in manifest["types"].items():
        begrippen_yaml = sources_dir / type_def["begrippenkader"]
        once_per_page = type_def.get("enrichOncePerPage", False)
        for version in type_def["versions"]:
            source = sources_dir / version["file"]
            is_valid, errors, _validated = validator.validate_yaml(source, schema_path)
            if not is_valid:
                raise ValueError(
                    f"{type_name} {version['version']}: schema validation failed: {errors}"
                )
            output = generated_dir / type_name / f"{version['version']}.json"
            enricher.enrich_and_export(source, begrippen_yaml, output, once_per_page=once_per_page)
            logger.info("Built %s %s -> %s", type_name, version["version"], output)

        # Mirror the latest-official build to the legacy flat filename (drop-in for run_all.py).
        flat_name = LEGACY_FLAT_OUTPUTS.get(type_name)
        if flat_name:
            latest_nested = generated_dir / type_name / f"{type_def['latestOfficial']}.json"
            (generated_dir / flat_name).write_bytes(latest_nested.read_bytes())
            logger.info("Mirrored %s latest-official -> %s", type_name, flat_name)

    runtime_path = generated_dir / "manifest.json"
    runtime_path.parent.mkdir(parents=True, exist_ok=True)
    runtime_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    logger.info("Wrote runtime manifest %s", runtime_path)
    return runtime_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Manifest-driven multi-version source build")
    parser.add_argument(
        "--manifest", type=Path, required=True, help="Path to sources/manifest.yaml"
    )
    parser.add_argument(
        "--sources-dir", type=Path, required=True, help="Directory holding the source YAMLs"
    )
    parser.add_argument(
        "--schema",
        type=Path,
        required=True,
        help="assessment-definition schema to validate every source against",
    )
    parser.add_argument(
        "--generated-dir", type=Path, required=True, help="Output directory for the generated JSONs"
    )
    args = parser.parse_args()
    build_sources(args.manifest, args.sources_dir, args.schema, args.generated_dir)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
    main()
