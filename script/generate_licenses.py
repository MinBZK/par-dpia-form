#!/usr/bin/env python3
"""Generate LICENSES.txt from pnpm production dependencies.

Usage:
    pnpm licenses list --prod --json | python script/generate_licenses.py
"""

import json
import logging
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

HEADER = """\
MinBZK Assessments
===================
Licentie: EUPL-1.2 (European Union Public Licence v. 1.2)
Zie LICENSE voor de volledige licentietekst.

Licentiehouder: Ministerie van Binnenlandse Zaken en Koninkrijksrelaties (BZK)
Repository: https://github.com/MinBZK/par-dpia-form


Licenties van gebruikte bibliotheken
=====================================
"""


def main() -> None:
    data = json.load(sys.stdin)

    all_packages = []
    for license_type, packages in data.items():
        for pkg in packages:
            name = pkg.get("name", "unknown")
            versions = pkg.get("versions", [])
            version = versions[0] if versions else "?"
            all_packages.append(
                {
                    "name": name,
                    "version": version,
                    "license": license_type,
                }
            )

    all_packages.sort(key=lambda p: p["name"].lower())

    lines = [HEADER]
    for pkg in all_packages:
        lines.append(f"{pkg['name']}@{pkg['version']} [license(s): {pkg['license']}]")
        lines.append(f"├── package.json:  {pkg['license']}")
        lines.append(f"└── license files: {pkg['license']}")
        lines.append("")

    license_types = sorted({p["license"] for p in all_packages})
    lines.append(f"LICENSES: {', '.join(license_types)}")

    output = "\n".join(lines) + "\n"
    with Path("LICENSES.txt").open("w") as f:
        f.write(output)

    logger.info(
        "LICENSES.txt gegenereerd: %s packages, %s licentietypes",
        len(all_packages),
        len(license_types),
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
    main()
