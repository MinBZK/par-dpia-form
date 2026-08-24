#!/usr/bin/env python3
"""Generate docs/third-party-licenses.txt from pnpm production dependencies.

Usage:
    pnpm licenses list --prod --json | python script/generate_licenses.py
    pnpm licenses list --prod --json | python script/generate_licenses.py --check

--check writes nothing and exits non-zero when the file is out of date, so CI
can guard it.
"""

import argparse
import difflib
import json
import logging
import re
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = REPO_ROOT / "docs" / "third-party-licenses.txt"

# pnpm lists the prebuilt binaries of the platform it runs on; without this the
# output differs per machine and --check is useless.
PLATFORM_BINARY = re.compile(
    r"(^|[-/])(darwin|linux|win32|freebsd|openbsd|netbsd|android|sunos|openharmony)"
    r"(-|$)",
    re.IGNORECASE,
)

# macOS-only, and unlike the packages above its name gives no hint.
PLATFORM_ONLY = frozenset({"fsevents"})

HEADER = """\
MinBZK Assessments
===================
Licentie: EUPL-1.2 (European Union Public Licence v. 1.2)
Zie LICENSE voor de volledige licentietekst.

Licentiehouder: Ministerie van Binnenlandse Zaken en Koninkrijksrelaties (BZK)
Repository: https://github.com/MinBZK/par-dpia-form

Platformspecifieke binaries (bijvoorbeeld @esbuild/linux-x64) staan er niet in:
pnpm rapporteert die van het platform waarop de lijst gemaakt is.


Licenties van gebruikte bibliotheken
=====================================
"""


def render(data: dict) -> str:
    packages = []
    for license_type, entries in data.items():
        for pkg in entries:
            name = pkg.get("name", "unknown")
            if name in PLATFORM_ONLY or PLATFORM_BINARY.search(name):
                continue
            versions = pkg.get("versions", [])
            packages.append(
                {
                    "name": name,
                    "version": versions[0] if versions else "?",
                    "license": license_type,
                }
            )

    packages.sort(key=lambda p: p["name"].lower())

    lines = [HEADER]
    for pkg in packages:
        lines.append(f"{pkg['name']}@{pkg['version']} [license(s): {pkg['license']}]")
        lines.append(f"├── package.json:  {pkg['license']}")
        lines.append(f"└── license files: {pkg['license']}")
        lines.append("")

    license_types = sorted({p["license"] for p in packages})
    lines.append(f"LICENSES: {', '.join(license_types)}")

    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="vergelijk met het bestaande bestand in plaats van het te schrijven",
    )
    args = parser.parse_args()

    output = render(json.load(sys.stdin))
    try:
        relative = OUTPUT.relative_to(REPO_ROOT)
    except ValueError:
        relative = OUTPUT

    if args.check:
        current = OUTPUT.read_text() if OUTPUT.exists() else ""
        if current != output:
            diff = difflib.unified_diff(
                current.splitlines(),
                output.splitlines(),
                fromfile=f"{relative} (nu)",
                tofile=f"{relative} (verwacht)",
                lineterm="",
            )
            logger.error(
                "%s is niet actueel. Draai: pnpm licenses list --prod --json"
                " | python script/generate_licenses.py\n%s",
                relative,
                "\n".join(diff),
            )
            sys.exit(1)
        logger.info("%s is actueel.", relative)
        return

    OUTPUT.write_text(output)
    logger.info("%s gegenereerd.", relative)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
    main()
